import { serve } from "https://deno.land/std@0.202.0/http/server.ts";
import Mustache from "npm:mustache@4.2.0";
import {
  PDFDocument,
  PDFFont,
  StandardFonts,
} from "npm:pdf-lib@1.17.1";
import { encode as base64UrlEncode } from "https://deno.land/std@0.202.0/encoding/base64url.ts";
import { decode as base64Decode } from "https://deno.land/std@0.202.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.3?target=deno";

type JsonRecord = Record<string, unknown>;

type TemplateDataItem = {
  label: string;
  value: string;
};

type TemplateData = {
  driverName: string;
  vehicleRegistration: string;
  checklistDate: string;
  reportNumber: string;
  items: TemplateDataItem[];
  notes: string;
  generatedAt: string;
};

type TemplateResource =
  | { kind: "html"; content: string; id: string }
  | { kind: "pdf"; content: Uint8Array; id: string };

type SegmentType =
  | "heading1"
  | "heading2"
  | "heading3"
  | "paragraph"
  | "list"
  | "spacer";

type Segment = {
  type: SegmentType;
  text: string;
};

type DriveUploadResult = {
  id: string;
  webViewLink?: string;
  webContentLink?: string;
};

type GenerateChecklistReportRequest = {
  report_id?: string | number;
  reportId?: string | number;
  driver_daily_report_id?: string | number;
  checklist_template_id?: string;
  template_id?: string;
  template_data?: JsonRecord;
  data?: JsonRecord;
  file_name?: string;
  report_url_column?: string;
  report_file_id_column?: string;
  drive_folder_id?: string;
  share_publicly?: boolean;
  prefer_download_link?: boolean;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { success: false, error: "Method not allowed" },
      405,
    );
  }

  let body: GenerateChecklistReportRequest;
  try {
    body = await req.json();
  } catch (_error) {
    return jsonResponse(
      { success: false, error: "Nieprawidłowe JSON w żądaniu." },
      400,
    );
  }

  const reportId =
    body.report_id ?? body.reportId ?? body.driver_daily_report_id;

  if (reportId === undefined || reportId === null || reportId === "") {
    return jsonResponse(
      { success: false, error: "Brak wymaganego pola 'report_id'." },
      400,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse(
      {
        success: false,
        error:
          "Brak konfiguracji Supabase. Ustaw SUPABASE_URL oraz SUPABASE_SERVICE_ROLE_KEY w zmiennych środowiskowych.",
      },
      500,
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const { data: report, error: reportError } = await supabase
    .from("driver_daily_reports")
    .select("*")
    .eq("id", reportId)
    .maybeSingle();

  if (reportError) {
    console.error("Błąd Supabase podczas pobierania raportu:", reportError);
    return jsonResponse(
      {
        success: false,
        error: `Nie udało się pobrać rekordu driver_daily_reports (${reportError.message}).`,
      },
      500,
    );
  }

  if (!report) {
    return jsonResponse(
      {
        success: false,
        error: `Raport o identyfikatorze ${reportId} nie istnieje w driver_daily_reports.`,
      },
      404,
    );
  }

  let templateResource: TemplateResource;
  try {
    templateResource = await loadTemplateResource(
      supabase,
      body.checklist_template_id ?? body.template_id ?? undefined,
    );
  } catch (error) {
    console.error("Błąd ładowania szablonu checklisty:", error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error
          ? error.message
          : "Nie udało się załadować szablonu checklisty.",
      },
      500,
    );
  }

  const overrides = body.template_data ?? body.data ?? undefined;
  const templateData = buildTemplateData(report, overrides, reportId);

  const fallbackHtmlTemplate = await getDefaultHtmlTemplate();
  const templateHtmlForRendering =
    templateResource.kind === "html"
      ? templateResource.content
      : fallbackHtmlTemplate;

  const renderedHtml = Mustache.render(
    templateHtmlForRendering,
    templateData,
    undefined,
    { escape: (value) => value },
  );

  const segments = htmlToSegments(renderedHtml);

  let pdfBytes: Uint8Array;
  try {
    if (templateResource.kind === "html") {
      pdfBytes = await renderSegmentsToNewPdf(segments);
    } else {
      pdfBytes = await fillPdfTemplate(
        templateResource.content,
        templateData,
        segments,
      );
    }
  } catch (error) {
    console.error("Błąd podczas generowania PDF:", error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error
          ? error.message
          : "Nie udało się wygenerować pliku PDF.",
      },
      500,
    );
  }

  const fileNameCandidate = typeof body.file_name === "string"
    ? body.file_name
    : undefined;
  const fileName = sanitiseFileName(
    fileNameCandidate ?? createDefaultFileName(templateData, reportId),
  );

  const folderOverride = typeof body.drive_folder_id === "string" &&
      body.drive_folder_id.trim().length > 0
    ? body.drive_folder_id.trim()
    : undefined;

  const shouldShare = typeof body.share_publicly === "boolean"
    ? body.share_publicly
    : parseBooleanEnv(
      Deno.env.get("GOOGLE_DRIVE_SHARE_WITH_ANYONE"),
      true,
    );

  let uploadResult: DriveUploadResult;
  try {
    uploadResult = await uploadPdfToGoogleDrive(pdfBytes, fileName, {
      folderId: folderOverride,
      makePublic: shouldShare,
    });
  } catch (error) {
    console.error("Błąd przesyłania pliku na Google Drive:", error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error
          ? error.message
          : "Nie udało się zapisać pliku na Google Drive.",
      },
      500,
    );
  }

  const preferredLink = body.prefer_download_link === true
    ? uploadResult.webContentLink ?? uploadResult.webViewLink
    : uploadResult.webViewLink ?? uploadResult.webContentLink;

  const fileUrl = preferredLink ??
    `https://drive.google.com/file/d/${uploadResult.id}/view`;

  const urlColumn = determineColumnName(
    body.report_url_column ?? Deno.env.get("DRIVER_REPORT_URL_COLUMN") ??
      "checklist_report_url",
  );

  const fileIdColumnValue = body.report_file_id_column ??
    Deno.env.get("DRIVER_REPORT_FILE_ID_COLUMN") ??
    "checklist_report_file_id";
  const fileIdColumn = fileIdColumnValue && fileIdColumnValue.trim().length > 0
    ? determineColumnName(fileIdColumnValue)
    : undefined;

  const updatePayload: JsonRecord = {
    [urlColumn]: fileUrl,
  };

  if (fileIdColumn) {
    updatePayload[fileIdColumn] = uploadResult.id;
  }

  const { error: updateError } = await supabase
    .from("driver_daily_reports")
    .update(updatePayload)
    .eq("id", reportId);

  if (updateError) {
    console.error(
      "Błąd aktualizacji driver_daily_reports po zapisaniu pliku:",
      updateError,
    );
    return jsonResponse(
      {
        success: false,
        error: `Nie udało się zaktualizować driver_daily_reports (${updateError.message}).`,
      },
      500,
    );
  }

  return jsonResponse({
    success: true,
    reportId,
    fileId: uploadResult.id,
    fileUrl,
    templateId: templateResource.id,
  });
});

function jsonResponse(payload: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

async function loadTemplateResource(
  supabase: ReturnType<typeof createClient>,
  templateIdRaw?: string,
): Promise<TemplateResource> {
  const fallbackId = Deno.env.get("VITE_CHECKLIST_TEMPLATE_ID") ?? "default";

  const templateId = sanitizeTemplateIdentifier(
    templateIdRaw ?? fallbackId,
  );

  if (templateId.startsWith("storage://")) {
    const [, bucket, ...pathParts] = templateId.split("/");
    const path = pathParts.join("/");
    if (!bucket || !path) {
      throw new Error(
        `Nieprawidłowy identyfikator szablonu Storage (${templateId}). Oczekiwano formatu storage://bucket/nazwa-pliku`,
      );
    }
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data) {
      throw new Error(
        `Nie udało się pobrać szablonu z Supabase Storage (${error?.message ?? "brak danych"}).`,
      );
    }
    const arrayBuffer = await data.arrayBuffer();
    const isPdf = data.type?.includes("pdf") || path.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      return {
        kind: "pdf",
        content: new Uint8Array(arrayBuffer),
        id: templateId,
      };
    }
    const decoder = new TextDecoder("utf-8");
    return {
      kind: "html",
      content: decoder.decode(arrayBuffer),
      id: templateId,
    };
  }

  if (templateId.startsWith("drive://")) {
    const fileId = templateId.slice("drive://".length);
    const accessToken = await getGoogleAccessToken();
    const driveResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!driveResponse.ok) {
      throw new Error(
        `Nie udało się pobrać szablonu z Google Drive (${driveResponse.status}).`,
      );
    }
    const contentType = driveResponse.headers.get("content-type") ?? "";
    if (contentType.includes("pdf")) {
      const bytes = new Uint8Array(await driveResponse.arrayBuffer());
      return { kind: "pdf", content: bytes, id: templateId };
    }
    const text = await driveResponse.text();
    return { kind: "html", content: text, id: templateId };
  }

  if (templateId.startsWith("http://") || templateId.startsWith("https://")) {
    const response = await fetch(templateId);
    if (!response.ok) {
      throw new Error(
        `Nie udało się pobrać szablonu z adresu ${templateId} (${response.status}).`,
      );
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("pdf") || templateId.toLowerCase().endsWith(".pdf")) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { kind: "pdf", content: bytes, id: templateId };
    }
    const text = await response.text();
    return { kind: "html", content: text, id: templateId };
  }

  const fileName = resolveTemplateFileName(templateId);
  try {
    const templateUrl = new URL(`./templates/${fileName}`, import.meta.url);
    if (fileName.toLowerCase().endsWith(".pdf")) {
      const bytes = await Deno.readFile(templateUrl);
      return { kind: "pdf", content: bytes, id: fileName };
    }
    const content = await Deno.readTextFile(templateUrl);
    return { kind: "html", content, id: fileName };
  } catch (_error) {
    const defaultUrl = new URL(
      "./templates/default-checklist-template.html",
      import.meta.url,
    );
    const content = await Deno.readTextFile(defaultUrl);
    return { kind: "html", content, id: "default-checklist-template.html" };
  }
}

function sanitizeTemplateIdentifier(templateId: string): string {
  const trimmed = templateId.trim();
  if (
    trimmed.startsWith("storage://") ||
    trimmed.startsWith("drive://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  ) {
    return trimmed;
  }
  return trimmed.replace(/[^a-zA-Z0-9._\-/]/g, "");
}

function resolveTemplateFileName(templateId: string): string {
  if (templateId.endsWith(".html") || templateId.endsWith(".pdf")) {
    return templateId;
  }
  if (templateId === "default") {
    return "default-checklist-template.html";
  }
  return `${templateId}.html`;
}

let cachedDefaultHtmlTemplate: string | null = null;
async function getDefaultHtmlTemplate(): Promise<string> {
  if (cachedDefaultHtmlTemplate) {
    return cachedDefaultHtmlTemplate;
  }
  const url = new URL(
    "./templates/default-checklist-template.html",
    import.meta.url,
  );
  cachedDefaultHtmlTemplate = await Deno.readTextFile(url);
  return cachedDefaultHtmlTemplate;
}

function htmlToSegments(html: string): Segment[] {
  const markerised = html
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, content) =>
      `\n<<H1>>${content}<<END>>\n`
    )
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, content) =>
      `\n<<H2>>${content}<<END>>\n`
    )
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, content) =>
      `\n<<H3>>${content}<<END>>\n`
    )
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, content) =>
      `\n<<LI>>${content}<<END>>`
    )
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|section|header|footer)>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  const cleaned = decodeHtmlEntities(markerised);
  const segments: Segment[] = [];
  const markerRegex = /<<([A-Z0-9]+)>>([\s\S]*?)<<END>>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushParagraph = (text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    for (const line of lines) {
      segments.push({ type: "paragraph", text: line });
    }
  };

  while ((match = markerRegex.exec(cleaned)) !== null) {
    const between = cleaned.slice(lastIndex, match.index);
    pushParagraph(between);
    const markerType = match[1];
    const content = match[2].trim();
    if (!content) {
      lastIndex = markerRegex.lastIndex;
      continue;
    }
    switch (markerType) {
      case "H1":
        segments.push({ type: "heading1", text: content });
        break;
      case "H2":
        segments.push({ type: "heading2", text: content });
        break;
      case "H3":
        segments.push({ type: "heading3", text: content });
        break;
      case "LI":
        segments.push({ type: "list", text: content });
        break;
      default:
        segments.push({ type: "paragraph", text: content });
        break;
    }
    lastIndex = markerRegex.lastIndex;
  }

  const tail = cleaned.slice(lastIndex);
  pushParagraph(tail);

  const normalised: Segment[] = [];
  for (const segment of segments) {
    if (segment.type === "paragraph" && segment.text === "") {
      continue;
    }
    if (segment.type === "paragraph" && normalised.length > 0) {
      const previous = normalised[normalised.length - 1];
      if (previous.type === "paragraph") {
        normalised.push({ type: "spacer", text: "" });
      }
    }
    if (
      segment.type === "list" &&
      normalised.length > 0 &&
      normalised[normalised.length - 1].type !== "list"
    ) {
      normalised.push({ type: "spacer", text: "" });
    }
    normalised.push(segment);
  }

  return normalised;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function renderSegmentsToNewPdf(segments: Segment[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  await appendSegmentsToPdfDoc(pdfDoc, segments);
  const bytes = await pdfDoc.save();
  return new Uint8Array(bytes);
}

async function appendSegmentsToPdfDoc(
  pdfDoc: PDFDocument,
  segments: Segment[],
): Promise<void> {
  if (!segments.length) {
    return;
  }

  const pageSize: [number, number] = [595.28, 841.89];
  let page = pdfDoc.addPage(pageSize);
  let { width, height } = page.getSize();
  const margin = 48;
  const contentWidth = width - margin * 2;
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let cursorY = height - margin;

  const ensureSpace = (lineHeight: number) => {
    if (cursorY - lineHeight < margin) {
      page = pdfDoc.addPage(pageSize);
      width = page.getWidth();
      height = page.getHeight();
      cursorY = height - margin;
    }
  };

  const drawLines = (
    lines: string[],
    font: PDFFont,
    fontSize: number,
    indent = margin,
  ) => {
    for (const line of lines) {
      ensureSpace(fontSize + 4);
      page.drawText(line, {
        x: indent,
        y: cursorY,
        size: fontSize,
        font,
      });
      cursorY -= fontSize + 4;
    }
  };

  const drawParagraph = (text: string, fontSize = 12) => {
    const lines = wrapText(text, regularFont, fontSize, contentWidth);
    drawLines(lines, regularFont, fontSize);
    cursorY -= 4;
  };

  const drawListItem = (text: string, fontSize = 12) => {
    const bullet = "•";
    const bulletIndent = margin + 8;
    const textIndent = margin + 20;
    const maxWidth = width - textIndent - margin;
    const lines = wrapText(text, regularFont, fontSize, maxWidth);
    ensureSpace(fontSize + 4);
    page.drawText(bullet, {
      x: bulletIndent,
      y: cursorY,
      size: fontSize,
      font: regularFont,
    });
    page.drawText(lines[0], {
      x: textIndent,
      y: cursorY,
      size: fontSize,
      font: regularFont,
    });
    cursorY -= fontSize + 4;
    if (lines.length > 1) {
      drawLines(lines.slice(1), regularFont, fontSize, textIndent);
    }
    cursorY -= 2;
  };

  for (const segment of segments) {
    switch (segment.type) {
      case "heading1": {
        ensureSpace(26);
        page.drawText(segment.text, {
          x: margin,
          y: cursorY,
          size: 20,
          font: boldFont,
        });
        cursorY -= 28;
        break;
      }
      case "heading2": {
        ensureSpace(20);
        page.drawText(segment.text, {
          x: margin,
          y: cursorY,
          size: 16,
          font: boldFont,
        });
        cursorY -= 22;
        break;
      }
      case "heading3": {
        ensureSpace(18);
        page.drawText(segment.text, {
          x: margin,
          y: cursorY,
          size: 14,
          font: boldFont,
        });
        cursorY -= 20;
        break;
      }
      case "list":
        drawListItem(segment.text);
        break;
      case "paragraph":
        drawParagraph(segment.text);
        break;
      case "spacer":
        cursorY -= 8;
        break;
    }
  }
}

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!word) continue;
    const candidate = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, fontSize);
    if (width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = word;
      continue;
    }
    lines.push(word);
    current = "";
  }
  if (current) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}

async function fillPdfTemplate(
  templateBytes: Uint8Array,
  data: TemplateData,
  fallbackSegments: Segment[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(templateBytes);
  let filled = false;
  try {
    filled = fillPdfFormFields(pdfDoc, data);
  } catch (error) {
    console.warn("Wypełnianie pól formularza PDF nie powiodło się:", error);
  }

  if (!filled) {
    await appendSegmentsToPdfDoc(pdfDoc, fallbackSegments);
  }

  const bytes = await pdfDoc.save();
  return new Uint8Array(bytes);
}

function fillPdfFormFields(pdfDoc: PDFDocument, data: TemplateData): boolean {
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  if (!fields.length) {
    return false;
  }

  const fieldMap = new Map<string, unknown>();
  for (const field of fields) {
    fieldMap.set(field.getName(), field);
  }

  const valueMap: Record<string, string> = {
    driverName: data.driverName,
    vehicleRegistration: data.vehicleRegistration,
    checklistDate: data.checklistDate,
    reportNumber: data.reportNumber,
    notes: data.notes,
    items: data.items.map((item) => `${item.label}: ${item.value}`).join("\n"),
    generatedAt: data.generatedAt,
  };

  const directMappings: Record<string, string[]> = {
    driverName: [
      "driver",
      "driver_name",
      "driverName",
      "kierowca",
      "driver-fullname",
    ],
    vehicleRegistration: [
      "vehicle",
      "vehicle_registration",
      "vehicleNumber",
      "pojazd",
      "vehicle-reg",
    ],
    checklistDate: ["date", "checklist_date", "data", "inspection_date"],
    reportNumber: ["report_number", "report", "numer", "document_no"],
    notes: ["notes", "uwagi", "comments"],
    items: ["items", "checklist", "lista", "checklist_items"],
    generatedAt: ["generated_at", "generatedAt", "data_generacji"],
  };

  let updated = false;

  for (const [key, aliases] of Object.entries(directMappings)) {
    const value = valueMap[key];
    if (!value) continue;
    for (const alias of aliases) {
      const field = fieldMap.get(alias);
      if (!field) continue;
      if (setFieldValue(field, value)) {
        updated = true;
        break;
      }
    }
  }

  if (!updated) {
    for (const [fieldName, field] of fieldMap.entries()) {
      const normalised = fieldName.toLowerCase().replace(/[^a-z0-9]/g, "");
      for (const [key, value] of Object.entries(valueMap)) {
        if (!value) continue;
        const normalisedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (normalised.includes(normalisedKey)) {
          if (setFieldValue(field, value)) {
            updated = true;
            break;
          }
        }
      }
    }
  }

  if (updated) {
    try {
      form.updateFieldAppearances();
    } catch (error) {
      console.warn("Aktualizacja wyglądu pól formularza nie powiodła się:", error);
    }
  }

  return updated;
}

function setFieldValue(field: unknown, value: string): boolean {
  if (!value) return false;
  const anyField = field as { setText?: (text: string) => void; setValue?: (val: unknown) => void };
  if (typeof anyField.setText === "function") {
    anyField.setText(value);
    return true;
  }
  if (typeof anyField.setValue === "function") {
    anyField.setValue(value);
    return true;
  }
  return false;
}

function buildTemplateData(
  report: JsonRecord,
  overrides: JsonRecord | undefined,
  reportId: string | number,
): TemplateData {
  const normalisedReport = normalizeRecord(report);
  const normalisedOverrides = overrides ? normalizeRecord(overrides) : undefined;

  const driverName = pickString([
    normalisedOverrides?.driverName,
    normalisedOverrides?.driver_name,
    normalisedOverrides?.driver?.name,
    normalisedOverrides?.driver?.full_name,
    normalisedReport.driver_name,
    normalisedReport.driver?.name,
    normalisedReport.driver?.full_name,
    normalisedReport.user?.full_name,
  ], "Nieznany kierowca");

  const vehicleRegistration = pickString([
    normalisedOverrides?.vehicleRegistration,
    normalisedOverrides?.vehicle_registration,
    normalisedOverrides?.vehicle?.registration,
    normalisedOverrides?.vehicle?.registration_number,
    normalisedReport.vehicle_registration,
    normalisedReport.vehicle?.registration,
    normalisedReport.vehicle?.registration_number,
    normalisedReport.vehicle_plate,
  ], "Brak danych");

  const checklistDate = pickDate([
    normalisedOverrides?.checklistDate,
    normalisedOverrides?.date,
    normalisedOverrides?.check_date,
    normalisedReport.checklist_date,
    normalisedReport.report_date,
    normalisedReport.date,
    normalisedReport.created_at,
    normalisedReport.inserted_at,
  ]) ?? new Date().toLocaleDateString("pl-PL");

  const reportNumber = pickString([
    normalisedOverrides?.reportNumber,
    normalisedOverrides?.report_number,
    normalisedReport.report_number,
    normalisedReport.reference,
    normalisedReport.serial,
    normalisedReport.number,
    normalisedReport.id,
    reportId,
  ], `Raport-${reportId}`);

  const items = chooseItems([
    normalisedOverrides?.items,
    normalisedOverrides?.checklist?.items,
    normalisedOverrides?.checklist,
    normalisedOverrides?.answers,
    normalisedReport.checklist_items,
    normalisedReport.items,
    normalisedReport.answers,
    normalisedReport.checklist?.items,
    normalisedReport.checklist,
    normalisedReport.checklist_payload?.items,
    normalisedReport.checklist_payload?.rows,
    normalisedReport.checklist_payload,
  ]);

  const notes = pickString([
    normalisedOverrides?.notes,
    normalisedOverrides?.comments,
    normalisedOverrides?.driver_notes,
    normalisedReport.notes,
    normalisedReport.comments,
    normalisedReport.driver_notes,
    normalisedReport.checklist_payload?.notes,
  ], "Brak dodatkowych uwag.");

  const generatedAt = new Date().toLocaleString("pl-PL");

  return {
    driverName,
    vehicleRegistration,
    checklistDate,
    reportNumber,
    items: items.length ? items : [
      { label: "Status checklisty", value: "Brak danych" },
    ],
    notes,
    generatedAt,
  };
}

function normalizeRecord<T>(value: T): any {
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeRecord(item));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = normalizeRecord(parseMaybeJson(entry));
    }
    return result;
  }
  return value;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        return JSON.parse(trimmed);
      } catch (_error) {
        return value;
      }
    }
  }
  return value;
}

function pickString(values: unknown[], fallback: string): string {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  for (const value of values) {
    if (typeof value === "number" && !Number.isNaN(value)) {
      return String(value);
    }
  }
  return fallback;
}

function pickDate(values: unknown[]): string | null {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toLocaleDateString("pl-PL");
    }
    if (typeof value === "number") {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString("pl-PL");
      }
    }
    if (typeof value === "string") {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString("pl-PL");
      }
    }
  }
  return null;
}

function chooseItems(sources: unknown[]): TemplateDataItem[] {
  for (const source of sources) {
    const items = normaliseItems(source);
    if (items.length) {
      return items;
    }
  }
  return [];
}

function normaliseItems(source: unknown): TemplateDataItem[] {
  if (!source) {
    return [];
  }
  if (Array.isArray(source)) {
    const items: TemplateDataItem[] = [];
    for (const entry of source) {
      if (!entry) continue;
      if (typeof entry === "string") {
        items.push({
          label: `Pozycja ${items.length + 1}`,
          value: entry,
        });
        continue;
      }
      if (typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        const label = pickString([
          record.label,
          record.name,
          record.title,
          record.question,
        ], `Pozycja ${items.length + 1}`);
        const valueCandidate = record.value ?? record.answer ?? record.status ?? record.result;
        let value: string;
        if (typeof valueCandidate === "string") {
          value = valueCandidate;
        } else if (typeof valueCandidate === "number") {
          value = String(valueCandidate);
        } else if (typeof valueCandidate === "boolean") {
          value = valueCandidate ? "Tak" : "Nie";
        } else if (record.checked !== undefined) {
          value = record.checked ? "Tak" : "Nie";
        } else {
          value = valueCandidate !== undefined && valueCandidate !== null
            ? String(valueCandidate)
            : "-";
        }
        items.push({ label, value });
      }
    }
    return items;
  }
  if (typeof source === "object") {
    const record = source as Record<string, unknown>;
    const entries: TemplateDataItem[] = [];
    for (const [key, value] of Object.entries(record)) {
      if (value === undefined || value === null) continue;
      if (typeof value === "object") continue;
      const normalisedValue = typeof value === "boolean"
        ? value ? "Tak" : "Nie"
        : String(value);
      entries.push({ label: key, value: normalisedValue });
    }
    return entries;
  }
  return [];
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "raport";
}

function createDefaultFileName(
  data: TemplateData,
  reportId: string | number,
): string {
  const driverPart = slugify(data.driverName);
  const datePart = data.checklistDate.replace(/[^0-9]/g, "") ||
    new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const base = `raport-${driverPart}-${datePart}-${reportId}`;
  return `${base}.pdf`;
}

function sanitiseFileName(name: string): string {
  const trimmed = name.trim();
  const safe = trimmed.replace(/[\\/?%*:|"<>]/g, "-");
  const base = safe.length ? safe : `raport-kierowcy-${Date.now()}`;
  if (base.toLowerCase().endsWith(".pdf")) {
    return base;
  }
  return `${base}.pdf`;
}

function determineColumnName(value: string): string {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9_]/g, "");
  return cleaned.length ? cleaned : "checklist_report_url";
}

function parseBooleanEnv(value: string | null | undefined, fallback: boolean): boolean {
  if (value === undefined || value === null || value.trim() === "") {
    return fallback;
  }
  const normalised = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalised)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalised)) {
    return false;
  }
  return fallback;
}

async function uploadPdfToGoogleDrive(
  bytes: Uint8Array,
  fileName: string,
  options: { folderId?: string; makePublic?: boolean },
): Promise<DriveUploadResult> {
  const accessToken = await getGoogleAccessToken();
  const folderSource = options.folderId ??
    Deno.env.get("GOOGLE_DRIVE_FOLDER_ID") ??
    undefined;
  const folderId = folderSource && folderSource.trim().length > 0
    ? folderSource.trim()
    : undefined;

  const metadata: Record<string, unknown> = {
    name: fileName,
    mimeType: "application/pdf",
  };

  if (folderId) {
    metadata.parents = [folderId];
  }

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );
  form.append("file", new Blob([bytes], { type: "application/pdf" }));

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Google Drive zwrócił błąd ${response.status}: ${errorText}`,
    );
  }

  const result = await response.json() as DriveUploadResult;

  if (options.makePublic !== false) {
    await ensureDriveFileIsShared(result.id, accessToken);
  }

  return result;
}

async function ensureDriveFileIsShared(
  fileId: string,
  accessToken: string,
): Promise<void> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: "reader", type: "anyone" }),
      },
    );
    if (!response.ok) {
      const text = await response.text();
      console.warn(
        `Nie udało się ustawić uprawnień dla pliku ${fileId}: ${response.status} ${text}`,
      );
    }
  } catch (error) {
    console.warn("Błąd podczas ustawiania uprawnień pliku Google Drive:", error);
  }
}

async function getGoogleAccessToken(): Promise<string> {
  const clientEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL") ??
    Deno.env.get("GOOGLE_CLIENT_EMAIL");
  const privateKeyRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") ??
    Deno.env.get("GOOGLE_PRIVATE_KEY");

  if (!clientEmail || !privateKeyRaw) {
    throw new Error(
      "Brak danych logowania do Google Drive. Ustaw GOOGLE_SERVICE_ACCOUNT_EMAIL oraz GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.",
    );
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlFromJson({ alg: "RS256", typ: "JWT" });
  const payload = base64UrlFromJson({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  });
  const unsignedToken = `${header}.${payload}`;
  const signature = await signJwt(unsignedToken, privateKey);
  const assertion = `${unsignedToken}.${signature}`;

  const params = new URLSearchParams();
  params.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  params.set("assertion", assertion);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Nie udało się uzyskać tokenu dostępu Google (${response.status} ${text}).`,
    );
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

function base64UrlFromJson(value: Record<string, unknown>): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(JSON.stringify(value));
  return base64UrlEncode(bytes);
}

async function signJwt(unsignedToken: string, privateKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(unsignedToken);
  const keyData = pemToArrayBuffer(privateKey);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, data);
  return base64UrlEncode(new Uint8Array(signature));
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const decoded = base64Decode(cleaned);
  return decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength);
}

