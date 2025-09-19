import { serve } from "https://deno.land/std@0.210.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.3?target=deno";
import Mustache from "https://esm.sh/mustache@4.2.0";
import {
  PDFDocument,
  PDFFont,
  StandardFonts,
} from "https://esm.sh/pdf-lib@1.17.1?target=deno";
import { fromFileUrl } from "https://deno.land/std@0.210.0/path/from_file_url.ts";
import { encode as base64UrlEncode } from "https://deno.land/std@0.210.0/encoding/base64url.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JsonRecord = Record<string, unknown>;

type TemplateResource =
  | { id: string; kind: "html"; content: string }
  | { id: string; kind: "pdf"; content: Uint8Array };

type TemplateDataItem = { label: string; value: string };

type TemplateData = {
  driverName: string;
  vehicleRegistration: string;
  checklistDate: string;
  reportNumber: string;
  items: TemplateDataItem[];
  notes: string;
  generatedAt: string;
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

type DriveUploadResult = {
  id: string;
  webViewLink?: string;
  webContentLink?: string;
};

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  let body: GenerateChecklistReportRequest;
  try {
    body = await req.json();
  } catch (_error) {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  const reportId =
    body.report_id ?? body.reportId ?? body.driver_daily_report_id;
  if (reportId === undefined || reportId === null || reportId === "") {
    return jsonResponse({ success: false, error: "Missing report_id" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({
      success: false,
      error:
        "Supabase credentials are not configured. Provide SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    }, 500);
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
    console.error("Supabase error while fetching driver_daily_reports:", reportError);
    return jsonResponse({
      success: false,
      error: `Failed to fetch driver_daily_reports record (${reportError.message}).`,
    }, 500);
  }

  if (!report) {
    return jsonResponse({
      success: false,
      error: `driver_daily_reports record ${reportId} was not found`,
    }, 404);
  }

  let template: TemplateResource;
  try {
    template = await loadTemplateResource(
      supabase,
      body.checklist_template_id ?? body.template_id,
    );
  } catch (error) {
    console.error("Template resolution error:", error);
    return jsonResponse({
      success: false,
      error: error instanceof Error
        ? error.message
        : "Unable to load checklist template",
    }, 500);
  }

  const overrides = body.template_data ?? body.data ?? undefined;
  const templateData = buildTemplateData(report, overrides, reportId);

  let pdfBytes: Uint8Array;
  try {
    if (template.kind === "html") {
      const renderedHtml = Mustache.render(template.content, templateData, undefined, {
        escape: (value) => value,
      });
      const segments = htmlToSegments(renderedHtml);
      pdfBytes = await renderSegmentsToPdf(segments);
    } else {
      const renderedHtml = Mustache.render(
        await getDefaultHtmlTemplate(),
        templateData,
        undefined,
        { escape: (value) => value },
      );
      const segments = htmlToSegments(renderedHtml);
      pdfBytes = await appendSegmentsToExistingPdf(template.content, segments);
    }
  } catch (error) {
    console.error("PDF rendering error:", error);
    return jsonResponse({
      success: false,
      error: "Failed to generate checklist PDF",
    }, 500);
  }

  const fileNameCandidate =
    typeof body.file_name === "string" && body.file_name.trim().length > 0
      ? body.file_name.trim()
      : undefined;
  const fileName = sanitiseFileName(
    fileNameCandidate ?? createDefaultFileName(templateData, reportId),
  );

  const driveFolderId =
    typeof body.drive_folder_id === "string" && body.drive_folder_id.trim()
      ? body.drive_folder_id.trim()
      : undefined;
  const shouldShare =
    typeof body.share_publicly === "boolean"
      ? body.share_publicly
      : parseBooleanEnv(Deno.env.get("GOOGLE_DRIVE_SHARE_WITH_ANYONE"), true);

  let uploadResult: DriveUploadResult;
  try {
    uploadResult = await uploadPdfToGoogleDrive(pdfBytes, fileName, {
      folderId: driveFolderId,
      makePublic: shouldShare,
    });
  } catch (error) {
    console.error("Google Drive upload error:", error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : "Failed to upload PDF",
    }, 500);
  }

  const preferDownload = body.prefer_download_link === true;
  const preferredUrl = preferDownload
    ? uploadResult.webContentLink ?? uploadResult.webViewLink
    : uploadResult.webViewLink ?? uploadResult.webContentLink;
  const fileUrl = preferredUrl ??
    `https://drive.google.com/file/d/${uploadResult.id}/view`;

  let urlColumn: string;
  let fileIdColumn: string | undefined;
  try {
    urlColumn = determineColumnName(
      body.report_url_column ?? Deno.env.get("DRIVER_REPORT_URL_COLUMN") ??
        "checklist_report_url",
    );
    const fileIdColumnRaw =
      body.report_file_id_column ??
        Deno.env.get("DRIVER_REPORT_FILE_ID_COLUMN") ??
        "checklist_report_file_id";
    fileIdColumn = fileIdColumnRaw
      ? determineColumnName(fileIdColumnRaw)
      : undefined;
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : "Invalid column name",
    }, 400);
  }

  const updatePayload: JsonRecord = { [urlColumn]: fileUrl };
  if (fileIdColumn) {
    updatePayload[fileIdColumn] = uploadResult.id;
  }

  const { error: updateError } = await supabase
    .from("driver_daily_reports")
    .update(updatePayload)
    .eq("id", reportId);

  if (updateError) {
    console.error("Supabase update error:", updateError);
    return jsonResponse({
      success: false,
      error: `Failed to update driver_daily_reports (${updateError.message}).`,
    }, 500);
  }

  return jsonResponse({
    success: true,
    reportId,
    fileId: uploadResult.id,
    fileUrl,
    templateId: template.id,
  });
});

// ---------------------------------------------------------------------------
// Template loading helpers
// ---------------------------------------------------------------------------

async function loadTemplateResource(
  supabase: ReturnType<typeof createClient>,
  templateIdRaw?: string,
): Promise<TemplateResource> {
  const fallbackId = Deno.env.get("VITE_CHECKLIST_TEMPLATE_ID") ?? "default";
  const templateId = (templateIdRaw?.trim() ?? fallbackId).trim();

  if (templateId.startsWith("storage://")) {
    const [, bucket, ...pathParts] = templateId.split("/");
    const path = pathParts.join("/");
    if (!bucket || !path) {
      throw new Error(
        `Invalid Supabase Storage template identifier (${templateId}). Use storage://bucket/path/to/file`,
      );
    }

    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data) {
      throw new Error(
        `Unable to download template from Supabase Storage (${error?.message ?? "no data"}).`,
      );
    }

    const fileName = path.toLowerCase();
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (fileName.endsWith(".pdf")) {
      return { id: templateId, kind: "pdf", content: bytes };
    }
    const decoder = new TextDecoder("utf-8");
    return { id: templateId, kind: "html", content: decoder.decode(bytes) };
  }

  if (/^https?:\/\//i.test(templateId)) {
    const response = await fetch(templateId);
    if (!response.ok) {
      throw new Error(
        `Unable to fetch template from ${templateId} (${response.status}).`,
      );
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("pdf")) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { id: templateId, kind: "pdf", content: bytes };
    }
    const text = await response.text();
    return { id: templateId, kind: "html", content: text };
  }

  const localFile = resolveLocalTemplatePath(templateId);
  if (localFile.endsWith(".pdf")) {
    const bytes = await Deno.readFile(localFile);
    return { id: localFile, kind: "pdf", content: bytes };
  }
  const html = await Deno.readTextFile(localFile);
  return { id: localFile, kind: "html", content: html };
}

function resolveLocalTemplatePath(templateId: string): string {
  const trimmed = templateId.trim() || "default";
  let fileName: string;
  if (trimmed.toLowerCase().endsWith(".pdf")) {
    fileName = trimmed;
  } else if (trimmed.toLowerCase().endsWith(".html")) {
    fileName = trimmed;
  } else if (trimmed === "default") {
    fileName = "default-checklist-template.html";
  } else {
    fileName = `${trimmed}.html`;
  }
  const url = new URL(`./templates/${fileName}`, import.meta.url);
  return fromFileUrl(url);
}

let cachedDefaultHtmlTemplate: string | null = null;
async function getDefaultHtmlTemplate(): Promise<string> {
  if (cachedDefaultHtmlTemplate) return cachedDefaultHtmlTemplate;
  const url = new URL("./templates/default-checklist-template.html", import.meta.url);
  cachedDefaultHtmlTemplate = await Deno.readTextFile(fromFileUrl(url));
  return cachedDefaultHtmlTemplate;
}

// ---------------------------------------------------------------------------
// Template data preparation
// ---------------------------------------------------------------------------

function buildTemplateData(
  report: JsonRecord,
  overrides: JsonRecord | undefined,
  reportId: string | number,
): TemplateData {
  const normalisedReport = normaliseRecord(report);
  const normalisedOverrides = overrides ? normaliseRecord(overrides) : undefined;

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
    normalisedOverrides?.vehicle?.plate,
    normalisedReport.vehicle_registration,
    normalisedReport.vehicle_plate,
    normalisedReport.vehicle?.registration,
    normalisedReport.vehicle?.plate,
  ], "Brak danych");

  const checklistDate = pickDate([
    normalisedOverrides?.checklistDate,
    normalisedOverrides?.date,
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

  return {
    driverName,
    vehicleRegistration,
    checklistDate,
    reportNumber,
    items: items.length ? items : [{ label: "Status", value: "Brak danych" }],
    notes,
    generatedAt: new Date().toLocaleString("pl-PL"),
  };
}

function normaliseRecord(value: unknown): any {
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((entry) => normaliseRecord(entry));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = normaliseRecord(parseMaybeJson(entry));
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
    if (typeof value === "string" && value.trim().length) {
      return value.trim();
    }
  }
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return fallback;
}

function pickDate(values: unknown[]): string | null {
  for (const value of values) {
    if (!value) continue;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toLocaleDateString("pl-PL");
    }
    if (typeof value === "number") {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString("pl-PL");
      }
    }
    if (typeof value === "string" && value.trim().length) {
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
    if (items.length) return items;
  }
  return [];
}

function normaliseItems(source: unknown): TemplateDataItem[] {
  if (!source) return [];

  if (Array.isArray(source)) {
    const items: TemplateDataItem[] = [];
    for (const entry of source) {
      if (!entry) continue;
      if (typeof entry === "string") {
        items.push({ label: `Pozycja ${items.length + 1}`, value: entry });
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
        const valueCandidate =
          record.value ?? record.answer ?? record.status ?? record.result ??
            record.checked;
        let value: string;
        if (typeof valueCandidate === "boolean") {
          value = valueCandidate ? "Tak" : "Nie";
        } else if (
          typeof valueCandidate === "string" || typeof valueCandidate === "number"
        ) {
          value = String(valueCandidate);
        } else if (record.checked !== undefined) {
          value = record.checked ? "Tak" : "Nie";
        } else {
          value = "-";
        }
        items.push({ label, value });
      }
    }
    return items;
  }

  if (typeof source === "object") {
    const record = source as Record<string, unknown>;
    const items: TemplateDataItem[] = [];
    if (Array.isArray(record.items)) {
      return normaliseItems(record.items);
    }
    for (const [key, value] of Object.entries(record)) {
      if (value === undefined || value === null) continue;
      if (typeof value === "object") continue;
      const valueText = typeof value === "boolean"
        ? value ? "Tak" : "Nie"
        : String(value);
      items.push({ label: key, value: valueText });
    }
    return items;
  }

  if (typeof source === "string") {
    try {
      const parsed = JSON.parse(source);
      return normaliseItems(parsed);
    } catch (_error) {
      return [{ label: "Pozycja", value: source }];
    }
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

function createDefaultFileName(data: TemplateData, reportId: string | number): string {
  const driverPart = slugify(data.driverName);
  const datePart = data.checklistDate.replace(/[^0-9]/g, "");
  return `raport-${driverPart}-${datePart || reportId}-${reportId}.pdf`;
}

function sanitiseFileName(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return cleaned.endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

function determineColumnName(input: string): string {
  const trimmed = input.trim();
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
    throw new Error(`Invalid column name: ${input}`);
  }
  return trimmed;
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalised = value.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalised)) return true;
  if (["0", "false", "no", "n"].includes(normalised)) return false;
  return fallback;
}

// ---------------------------------------------------------------------------
// HTML rendering helpers
// ---------------------------------------------------------------------------

type SegmentType = "heading1" | "heading2" | "heading3" | "paragraph" | "list";

type Segment = { type: SegmentType; text: string };

function htmlToSegments(html: string): Segment[] {
  let working = html.replace(/\r\n/g, "\n");
  working = working.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  working = working.replace(/<\s*li[^>]*>/gi, "\n- ");
  working = working.replace(/<\/(p|div|section|header|footer)>/gi, "\n\n");
  working = working.replace(/<\s*h1[^>]*>/gi, "\n# ");
  working = working.replace(/<\s*h2[^>]*>/gi, "\n## ");
  working = working.replace(/<\s*h3[^>]*>/gi, "\n### ");
  working = working.replace(/<[^>]+>/g, "");
  working = decodeHtmlEntities(working);

  const lines = working
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const segments: Segment[] = [];
  for (const line of lines) {
    if (line.startsWith("### ")) {
      segments.push({ type: "heading3", text: line.replace(/^###\s+/, "") });
    } else if (line.startsWith("## ")) {
      segments.push({ type: "heading2", text: line.replace(/^##\s+/, "") });
    } else if (line.startsWith("# ")) {
      segments.push({ type: "heading1", text: line.replace(/^#\s+/, "") });
    } else if (line.startsWith("- ")) {
      segments.push({ type: "list", text: line.replace(/^-\s+/, "") });
    } else {
      segments.push({ type: "paragraph", text: line });
    }
  }

  return segments;
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

async function renderSegmentsToPdf(segments: Segment[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  await drawSegments(pdfDoc, segments);
  return new Uint8Array(await pdfDoc.save());
}

async function appendSegmentsToExistingPdf(
  templateBytes: Uint8Array,
  segments: Segment[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(templateBytes);
  await drawSegments(pdfDoc, segments);
  return new Uint8Array(await pdfDoc.save());
}

async function drawSegments(pdfDoc: PDFDocument, segments: Segment[]): Promise<void> {
  if (!segments.length) return;

  const pageSize: [number, number] = [595.28, 841.89];
  let page = pdfDoc.addPage(pageSize);
  const margin = 48;
  let cursorY = page.getHeight() - margin;
  const contentWidth = page.getWidth() - margin * 2;
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const ensureSpace = (lineHeight: number) => {
    if (cursorY - lineHeight < margin) {
      page = pdfDoc.addPage(pageSize);
      cursorY = page.getHeight() - margin;
    }
  };

  const drawLines = (
    text: string,
    font: PDFFont,
    fontSize: number,
    indent = margin,
    width = contentWidth,
  ) => {
    const lines = wrapText(text, font, fontSize, width);
    for (const line of lines) {
      ensureSpace(fontSize + 4);
      page.drawText(line, { x: indent, y: cursorY, size: fontSize, font });
      cursorY -= fontSize + 4;
    }
  };

  for (const segment of segments) {
    switch (segment.type) {
      case "heading1":
        cursorY -= 4;
        drawLines(segment.text, boldFont, 20);
        cursorY -= 12;
        break;
      case "heading2":
        cursorY -= 2;
        drawLines(segment.text, boldFont, 16);
        cursorY -= 8;
        break;
      case "heading3":
        drawLines(segment.text, boldFont, 14);
        cursorY -= 6;
        break;
      case "list":
        ensureSpace(16);
        page.drawText("•", {
          x: margin,
          y: cursorY,
          size: 12,
          font: regularFont,
        });
        cursorY -= 2;
        drawLines(segment.text, regularFont, 12, margin + 14, contentWidth - 14);
        cursorY -= 6;
        break;
      case "paragraph":
        drawLines(segment.text, regularFont, 12);
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
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

// ---------------------------------------------------------------------------
// Google Drive helpers
// ---------------------------------------------------------------------------

async function uploadPdfToGoogleDrive(
  pdfBytes: Uint8Array,
  fileName: string,
  options: { folderId?: string; makePublic?: boolean },
): Promise<DriveUploadResult> {
  const accessToken = await getGoogleAccessToken();
  const boundary = `boundary-${crypto.randomUUID()}`;
  const metadata = {
    name: fileName,
    mimeType: "application/pdf",
    ...(options.folderId ? { parents: [options.folderId] } : {}),
  };

  const bodyBytes = concatUint8Arrays([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
    pdfBytes,
    `\r\n--${boundary}--\r\n`,
  ]);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: bodyBytes,
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Drive upload failed (${response.status}: ${text})`);
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
        `Unable to share Google Drive file ${fileId}: ${response.status} ${text}`,
      );
    }
  } catch (error) {
    console.warn("Error while sharing Google Drive file:", error);
  }
}

async function getGoogleAccessToken(): Promise<string> {
  const clientEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL") ??
    Deno.env.get("GOOGLE_CLIENT_EMAIL");
  const privateKeyRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") ??
    Deno.env.get("GOOGLE_PRIVATE_KEY");

  if (!clientEmail || !privateKeyRaw) {
    throw new Error(
      "Google Drive credentials are missing. Provide GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.",
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
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Unable to obtain Google access token (${response.status}: ${text})`,
    );
  }

  const json = await response.json() as { access_token: string };
  return json.access_token;
}

function base64UrlFromJson(payload: Record<string, unknown>): string {
  const encoder = new TextEncoder();
  return base64UrlEncode(encoder.encode(JSON.stringify(payload)));
}

async function signJwt(unsignedToken: string, privateKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(unsignedToken);
  const keyData = pemToUint8Array(privateKey);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, data);
  return base64UrlEncode(new Uint8Array(signature));
}

function pemToUint8Array(pem: string): Uint8Array {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function concatUint8Arrays(parts: (string | Uint8Array)[]): Uint8Array {
  const encoder = new TextEncoder();
  const arrays = parts.map((part) =>
    typeof part === "string" ? encoder.encode(part) : part
  );
  const length = arrays.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of arrays) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Response helper
// ---------------------------------------------------------------------------

function jsonResponse(payload: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

