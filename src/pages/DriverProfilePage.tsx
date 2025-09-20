import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import dayjs from 'dayjs';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  FileText,
  Fuel,
  Gauge,
  Loader2,
  MapPin,
  Package2,
  Route,
  ShieldCheck,
  Truck,
  User
} from 'lucide-react';
import { useSupabase } from '../contexts/SupabaseContext';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { useDriverProfile } from '../hooks/useDriverProfile';
import { fetchDriverAssignments } from '../lib/driverAssignments';
import type {
  ChecklistPdfResponse,
  ChecklistState,
  DriverAssignment,
  DriverDailyReport,
  DriverProfile
} from '../types/driver';

type ChecklistStatus = 'ok' | 'attention' | 'na';

type ChecklistFormValues = {
  startOdometer: number | '';
  fuelLevel: number | '';
  notes: string;
  checklist: ChecklistState;
};

const checklistSections = [
  {
    id: 'documents_cabin',
    title: 'Dokumenty i kabina kierowcy',
    icon: ClipboardList,
    items: [
      { id: 'documents_available', label: 'Dokumenty pojazdu i ładunku kompletne' },
      { id: 'tachograph_set', label: 'Tachograf ustawiony / karta kierowcy obecna' },
      { id: 'seatbelts_clean', label: 'Pasy bezpieczeństwa, fotel, wycieraczki i spryskiwacze' },
      { id: 'mirrors_windows', label: 'Lusterka i szyby czyste, bez pęknięć' },
      { id: 'dashboard_warning', label: 'Brak kontrolek ostrzegawczych na desce' }
    ]
  },
  {
    id: 'vehicle_walkaround',
    title: 'Obchód pojazdu',
    icon: Truck,
    items: [
      { id: 'lights_external', label: 'Oświetlenie zewnętrzne i kierunkowskazy' },
      { id: 'tyres_wheels', label: 'Opony, koła, nakrętki' },
      { id: 'bodywork_damage', label: 'Poszycie, zderzaki, błotniki bez uszkodzeń' },
      { id: 'fluid_leaks', label: 'Brak wycieków pod pojazdem' },
      { id: 'number_plates', label: 'Tablice rejestracyjne / oznakowanie czytelne' }
    ]
  },
  {
    id: 'safety_equipment',
    title: 'Wyposażenie bezpieczeństwa',
    icon: ShieldCheck,
    items: [
      { id: 'fire_extinguisher', label: 'Gaśnica naładowana i plomba nienaruszona' },
      { id: 'first_aid', label: 'Apteczka oraz kamizelka odblaskowa' },
      { id: 'warning_triangle', label: 'Trójkąt ostrzegawczy i kliny pod koła' },
      { id: 'load_security', label: 'Zabezpieczenia ładunku i pasy / listwy' }
    ]
  },
  {
    id: 'cargo_area',
    title: 'Przestrzeń ładunkowa / naczepa',
    icon: Package2,
    items: [
      { id: 'doors_locks', label: 'Drzwi / rolety, zamki i uszczelki sprawne' },
      { id: 'interior_clean', label: 'Podłoga i wnętrze czyste, bez luźnych elementów' },
      { id: 'interior_lighting', label: 'Oświetlenie przestrzeni ładunkowej' }
    ]
  }
] as const;

type ChecklistSections = typeof checklistSections;
type ChecklistItemDefinition = ChecklistSections[number]['items'][number];
type ChecklistItemId = ChecklistItemDefinition['id'];

const googleDriveFolderId = import.meta.env.VITE_GOOGLE_DRIVE_PARENT_FOLDER_ID;
const checklistTemplateId = import.meta.env.VITE_CHECKLIST_TEMPLATE_ID;

const checklistStatusLabels: Record<ChecklistStatus, string> = {
  ok: 'OK',
  attention: 'Wymaga uwagi',
  na: 'Nie dotyczy'
};

const checklistStatusSymbols: Record<ChecklistStatus, string> = {
  ok: '✔',
  attention: '⚠',
  na: '—'
};

const checklistOptions: { value: ChecklistStatus; label: string; description: string }[] = [
  { value: 'ok', label: 'OK', description: 'Potwierdzam sprawność elementu' },
  { value: 'attention', label: 'Usterka', description: 'Wymaga zgłoszenia dyspozytorowi' },
  { value: 'na', label: 'N/D', description: 'Pozycja nie dotyczy pojazdu' }
];

function createChecklistState(initial?: ChecklistState | null): ChecklistState {
  return checklistSections.reduce<ChecklistState>((state, section) => {
    section.items.forEach(item => {
      const value = initial?.[item.id];
      state[item.id] = normaliseChecklistValue(value);
    });
    return state;
  }, {} as ChecklistState);
}

function normaliseChecklistValue(value: unknown): ChecklistStatus {
  if (value === 'ok' || value === 'attention' || value === 'na') {
    return value;
  }
  if (value === true) {
    return 'ok';
  }
  if (value === false) {
    return 'attention';
  }
  return 'na';
}

function sanitiseChecklistState(state: ChecklistState): Record<ChecklistItemId, ChecklistStatus> {
  return checklistSections.reduce<Record<ChecklistItemId, ChecklistStatus>>((acc, section) => {
    section.items.forEach(item => {
      acc[item.id] = normaliseChecklistValue(state[item.id]);
    });
    return acc;
  }, {} as Record<ChecklistItemId, ChecklistStatus>);
}

interface TemplateSectionItem {
  label: string;
  status: ChecklistStatus;
  statusLabel: string;
  symbol: string;
  ok: boolean;
  attention: boolean;
  na: boolean;
}

interface TemplateSection {
  title: string;
  items: TemplateSectionItem[];
}

function buildTemplateSections(state: Record<ChecklistItemId, ChecklistStatus>): TemplateSection[] {
  return checklistSections.map(section => ({
    title: section.title,
    items: section.items.map(item => {
      const status = state[item.id] ?? 'na';
      return {
        label: item.label,
        status,
        statusLabel: checklistStatusLabels[status],
        symbol: checklistStatusSymbols[status],
        ok: status === 'ok',
        attention: status === 'attention',
        na: status === 'na'
      } satisfies TemplateSectionItem;
    })
  }));
}

function formatNumeric(value: number | '' | null | undefined, suffix = '') {
  if (value === '' || value === null || value === undefined) {
    return '—';
  }
  return `${value}${suffix}`;
}

function formatPercentage(value: number | '' | null | undefined) {
  if (value === '' || value === null || value === undefined) {
    return '—';
  }
  return `${value}%`;
}

function buildChecklistTemplatePayload({
  profile,
  assignment,
  report,
  checklist,
  notes,
  session
}: {
  profile: DriverProfile | null | undefined;
  assignment: DriverAssignment | null | undefined;
  report: DriverDailyReport;
  checklist: Record<ChecklistItemId, ChecklistStatus>;
  notes: string;
  session: Session | null;
}) {
  const sections = buildTemplateSections(checklist);
  const defects = sections
    .flatMap(section => section.items.filter(item => item.attention))
    .map(item => ({ label: item.label, value: item.statusLabel, status: item.status }));

  const assignmentDate = assignment?.assignment_date ?? report.completed_at ?? new Date().toISOString();
  const shiftWindow = [assignment?.shift_start, assignment?.shift_end].filter(Boolean).join(' – ');

  return {
    driverName: profile?.full_name ?? session?.user?.email ?? 'Kierowca',
    driverEmail: session?.user?.email ?? null,
    vehicleRegistration: assignment?.vehicle?.registration ?? 'Brak danych',
    vehicleDescription: [assignment?.vehicle?.make, assignment?.vehicle?.model].filter(Boolean).join(' '),
    depotName: assignment?.depot_name ?? '—',
    destinationName: assignment?.destination_name ?? '—',
    checklistDate: dayjs(assignmentDate).format('DD.MM.YYYY'),
    reportNumber: report.id,
    odometerStart: formatNumeric(report.start_odometer, ' km'),
    fuelLevel: formatPercentage(report.fuel_level),
    shiftWindow: shiftWindow.length ? shiftWindow : '—',
    sections,
    items: sections.flatMap(section =>
      section.items.map(item => ({
        label: item.label,
        value: item.statusLabel,
        status: item.status,
        ok: item.ok,
        attention: item.attention,
        na: item.na,
        symbol: item.symbol
      }))
    ),
    defectsCount: defects.length,
    defectItems: defects,
    notes,
    generatedAt: new Date().toISOString()
  };
}

export function DriverProfilePage() {
  const { supabase, session } = useSupabase();
  const queryClient = useQueryClient();
  const [submitStatus, setSubmitStatus] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
    driveLink?: string | null;
  } | null>(null);

  const today = useMemo(() => dayjs().format('YYYY-MM-DD'), []);

  const form = useForm<ChecklistFormValues>({
    defaultValues: {
      startOdometer: '',
      fuelLevel: '',
      notes: '',
      checklist: createChecklistState()
    }
  });

  const { register, handleSubmit, reset, control } = form;

  const {
    data: profile,
    isLoading: isProfileLoading,
    error: profileError
  } = useDriverProfile();

  const driverId = profile?.driver_id ?? profile?.id ?? null;

  const assignmentsListQuery = useQuery<DriverAssignment[]>({
    enabled: Boolean(supabase && driverId),
    queryKey: ['driver-assignments-list', driverId],
    queryFn: async () => {
      if (!supabase || !driverId) {
        return [];
      }

      return fetchDriverAssignments(supabase, driverId, {
        fromDate: dayjs().subtract(7, 'day').format('YYYY-MM-DD')
      });
    }
  });

  const {
    data: assignment,
    isLoading: isAssignmentLoading,
    error: assignmentError
  } = useQuery<DriverAssignment | null>({
    enabled: Boolean(supabase && driverId),
    queryKey: ['driver-assignment', driverId, today],
    queryFn: async () => {
      if (!supabase || !driverId) {
        return null;
      }

      const { data, error } = await supabase
        .from('driver_assignments_view')
        .select(
          `id, assignment_date, shift_start, shift_end, depot_name, destination_name, route_name,
           vehicle:vehicles(id, registration, make, model)`
        )
        .eq('driver_id', driverId)
        .eq('assignment_date', today)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return (data as DriverAssignment | null) ?? null;
    }
  });

  const {
    data: report,
    isLoading: isReportLoading
  } = useQuery<DriverDailyReport | null>({
    enabled: Boolean(supabase && assignment?.id),
    queryKey: ['driver-daily-report', assignment?.id],
    queryFn: async () => {
      if (!supabase || !assignment?.id) {
        return null;
      }

      const { data, error } = await supabase
        .from('driver_daily_reports')
        .select(
          'id, assignment_id, driver_id, start_odometer, fuel_level, notes, checklist_state, completed_at, drive_file_url, drive_file_id'
        )
        .eq('assignment_id', assignment.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return (data as DriverDailyReport | null) ?? null;
    }
  });

  const upcomingAssignments = useMemo(() => {
    const assignments = assignmentsListQuery.data ?? [];
    const startOfToday = dayjs().startOf('day');

    return assignments
      .filter(item => !dayjs(item.assignment_date).isBefore(startOfToday, 'day'))
      .slice(0, 3);
  }, [assignmentsListQuery.data]);

  useEffect(() => {
    if (!report) {
      reset({
        startOdometer: '',
        fuelLevel: '',
        notes: '',
        checklist: createChecklistState()
      });
      return;
    }

    reset({
      startOdometer: report.start_odometer ?? '',
      fuelLevel: report.fuel_level ?? '',
      notes: report.notes ?? '',
      checklist: createChecklistState(report.checklist_state ?? null)
    });
  }, [report, reset]);

  const resolvedTemplateId =
    checklistTemplateId && checklistTemplateId.trim().length
      ? checklistTemplateId.trim()
      : 'best-food-checklist';

  const checklistMutation = useMutation({
    mutationFn: async (values: ChecklistFormValues) => {
      if (!supabase || !assignment?.id || !driverId) {
        throw new Error('Brak danych Supabase lub aktywnego przydziału.');
      }

      const sanitisedChecklist = sanitiseChecklistState(values.checklist);
      const payload = {
        assignment_id: assignment.id,
        driver_id: driverId,
        start_odometer: values.startOdometer === '' ? null : Number(values.startOdometer),
        fuel_level: values.fuelLevel === '' ? null : Number(values.fuelLevel),
        notes: values.notes,
        checklist_state: sanitisedChecklist,
        completed_at: new Date().toISOString()
      };

      const { data: upsertedReport, error: upsertError } = await supabase
        .from('driver_daily_reports')
        .upsert(payload, { onConflict: 'assignment_id' })
        .select(
          'id, assignment_id, driver_id, start_odometer, fuel_level, notes, checklist_state, completed_at, drive_file_url, drive_file_id'
        )
        .single();

      if (upsertError) {
        throw upsertError;
      }

      let finalReport: DriverDailyReport = {
        ...(upsertedReport as DriverDailyReport),
        checklist_state: sanitisedChecklist
      };
      let pdfResult: ChecklistPdfResponse | null = null;
      let pdfErrorMessage: string | null = null;

      try {
        const templateData = buildChecklistTemplatePayload({
          profile,
          assignment,
          report: finalReport,
          checklist: sanitisedChecklist,
          notes: values.notes,
          session
        });

        const { data: pdfData, error: pdfError } = await supabase.functions.invoke<ChecklistPdfResponse>(
          'generate-checklist-report',
          {
            body: {
              report_id: finalReport.id,
              template_id: resolvedTemplateId,
              template_data: templateData,
              drive_folder_id: googleDriveFolderId || undefined,
              prefer_download_link: false
            }
          }
        );

        if (pdfError) {
          pdfErrorMessage = pdfError.message;
        } else {
          pdfResult = pdfData ?? null;
        }
      } catch (invokeError) {
        pdfErrorMessage =
          invokeError instanceof Error
            ? invokeError.message
            : 'Nie udało się wywołać funkcji generującej PDF.';
      }

      if (pdfResult?.drive_file_id || pdfResult?.drive_file_url) {
        const { data: updatedReport } = await supabase
          .from('driver_daily_reports')
          .update({
            drive_file_id: pdfResult.drive_file_id ?? null,
            drive_file_url: pdfResult.drive_file_url ?? null
          })
          .eq('id', finalReport.id)
          .select(
            'id, assignment_id, driver_id, start_odometer, fuel_level, notes, checklist_state, completed_at, drive_file_url, drive_file_id'
          )
          .single();

        if (updatedReport) {
          finalReport = {
            ...(updatedReport as DriverDailyReport),
            checklist_state: sanitisedChecklist
          };
        }
      }

      return {
        report: finalReport,
        pdf: pdfResult,
        pdfErrorMessage
      };
    },
    onSuccess: result => {
      if (assignment?.id) {
        queryClient.invalidateQueries({ queryKey: ['driver-daily-report', assignment.id] });
      }

      if (result.pdfErrorMessage) {
        setSubmitStatus({
          type: 'warning',
          message: `Raport zapisany, ale nie udało się wygenerować PDF: ${result.pdfErrorMessage}`,
          driveLink: result.report.drive_file_url
        });
        return;
      }

      setSubmitStatus({
        type: 'success',
        message: 'Checklistę zapisano, a PDF został wysłany do Google Drive.',
        driveLink: result.report.drive_file_url
      });
    },
    onError: error => {
      const message =
        error instanceof Error ? error.message : 'Nie udało się zapisać checklisty. Spróbuj ponownie.';
      setSubmitStatus({ type: 'error', message });
    }
  });

  const onSubmit = (values: ChecklistFormValues) => {
    setSubmitStatus(null);
    checklistMutation.mutate(values);
  };

  const lastDefectCount = useMemo(() => {
    if (!report?.checklist_state) {
      return 0;
    }
    const normalised = sanitiseChecklistState(report.checklist_state);
    return Object.values(normalised).filter(status => status === 'attention').length;
  }, [report?.checklist_state]);

  const isLoading = isProfileLoading || isAssignmentLoading || isReportLoading;

  if (isLoading) {
    return <LoadingState label="Ładowanie danych profilu kierowcy..." />;
  }

  if (profileError) {
    return (
      <ErrorState
        title="Nie udało się pobrać profilu kierowcy"
        description={profileError instanceof Error ? profileError.message : undefined}
      />
    );
  }

  if (!profile) {
    return (
      <ErrorState
        title="Brak profilu kierowcy"
        description="Utwórz rekord w widoku lub tabeli driver_profiles_view powiązany z bieżącym użytkownikiem."
      />
    );
  }

  if (assignmentError) {
    return (
      <ErrorState
        title="Nie udało się pobrać dzisiejszego przydziału"
        description={assignmentError instanceof Error ? assignmentError.message : undefined}
      />
    );
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-soft sm:grid-cols-3 sm:gap-6">
        <div className="flex items-start gap-4 sm:col-span-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
            <User className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-slate-900">{profile.full_name}</h1>
            <p className="text-sm text-slate-500">{session?.user.email}</p>
            <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-500">
              {profile.license_number ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Licencja {profile.license_number}
                </span>
              ) : null}
              {profile.phone ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">Telefon {profile.phone}</span>
              ) : null}
              {profile.home_depot ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
                  <MapPin className="h-3.5 w-3.5" />
                  Baza {profile.home_depot}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-dashed border-brand-200 bg-brand-50/70 p-4 text-sm text-brand-700">
          <p className="font-semibold">Status PDF</p>
          {report?.drive_file_url ? (
            <p className="mt-2 leading-relaxed">
              Ostatnia checklista została wyeksportowana.
              <br />
              <a
                href={report.drive_file_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-brand-700 underline decoration-dotted"
              >
                Otwórz plik w Google Drive
              </a>
            </p>
          ) : (
            <p className="mt-2 leading-relaxed">
              Brak wygenerowanego PDF dla dzisiejszej checklisty. Uzupełnij formularz poniżej, aby utworzyć raport.
            </p>
          )}
          <div className="mt-3 flex items-center gap-2 text-xs">
            {lastDefectCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 font-semibold text-rose-600">
                <FileWarning className="h-3.5 w-3.5" /> {lastDefectCount} pozycji wymaga uwagi
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> Brak zgłoszonych usterek
              </span>
            )}
          </div>
          {submitStatus?.type === 'warning' && submitStatus.driveLink ? (
            <p className="mt-2 text-xs text-brand-600">
              Zapisany raport:
              <a
                href={submitStatus.driveLink}
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline decoration-dotted"
              >
                otwórz w Google Drive
              </a>
            </p>
          ) : null}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-soft">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Checklista rozpoczęcia zmiany</h2>
                <p className="text-sm text-slate-500">Uzupełnij stan pojazdu przed wyjazdem.</p>
              </div>
              {checklistMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
              ) : null}
            </div>

            {submitStatus ? (
              <div
                className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                  submitStatus.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : submitStatus.type === 'warning'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}
              >
                <div className="flex items-start gap-2">
                  {submitStatus.type === 'success' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4" />
                  ) : submitStatus.type === 'warning' ? (
                    <AlertCircle className="mt-0.5 h-4 w-4" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4" />
                  )}
                  <p className="leading-snug">{submitStatus.message}</p>
                </div>
              </div>
            ) : null}

            <form className="mt-6 space-y-6" onSubmit={handleSubmit(onSubmit)}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-slate-600">Stan licznika (km)</span>
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
                    <Gauge className="h-4 w-4 text-brand-500" />
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      className="w-full border-none bg-transparent text-sm font-semibold text-slate-900 outline-none"
                      placeholder="np. 152340"
                      {...register('startOdometer')}
                    />
                  </div>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-slate-600">Poziom paliwa (%)</span>
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
                    <Fuel className="h-4 w-4 text-brand-500" />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      inputMode="numeric"
                      className="w-full border-none bg-transparent text-sm font-semibold text-slate-900 outline-none"
                      placeholder="np. 75"
                      {...register('fuelLevel')}
                    />
                  </div>
                </label>
              </div>

              <ChecklistLegend />

              <div className="space-y-5">
                {checklistSections.map(section => (
                  <fieldset
                    key={section.id}
                    className="space-y-4 rounded-3xl border border-slate-200 bg-white/70 p-4 shadow-sm"
                  >
                    <legend className="flex items-center gap-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                      <section.icon className="h-4 w-4 text-brand-500" />
                      {section.title}
                    </legend>
                    <div className="space-y-3">
                      {section.items.map(item => (
                        <Controller
                          key={item.id}
                          name={`checklist.${item.id}` as const}
                          control={control}
                          render={({ field }) => (
                            <ChecklistRow
                              name={item.id}
                              label={item.label}
                              value={normaliseChecklistValue(field.value)}
                              onChange={field.onChange}
                              disabled={checklistMutation.isPending}
                            />
                          )}
                        />
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-600">Uwagi dodatkowe</span>
                <textarea
                  rows={4}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-100"
                  placeholder="Zanotuj ewentualne uszkodzenia, braki lub dodatkowe obserwacje"
                  {...register('notes')}
                />
              </label>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  Raport zostanie zapisany w Supabase i wysłany jako PDF do Google Drive powiązanego z firmą.
                </p>
                <button
                  type="submit"
                  disabled={checklistMutation.isPending || !assignment}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:bg-brand-500/60"
                >
                  {checklistMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  {report ? 'Zaktualizuj raport' : 'Zapisz raport startowy'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-soft">
            <div className="flex items-center gap-3">
              <Truck className="h-6 w-6 text-brand-500" />
              <h2 className="text-lg font-semibold text-slate-900">Dzisiejszy przydział</h2>
            </div>
            {assignment ? (
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <p className="flex items-center gap-2">
                  <Route className="h-4 w-4 text-brand-500" />
                  {assignment.route_name ?? 'Trasa nieprzypisana'}
                </p>
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-brand-500" />
                  Start: {assignment.depot_name ?? '—'}
                </p>
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 rotate-180 text-brand-500" />
                  Cel: {assignment.destination_name ?? '—'}
                </p>
                <p className="flex items-center gap-2">
                  <ClockIcon />
                  Godziny: {assignment.shift_start ?? '—'} - {assignment.shift_end ?? '—'}
                </p>
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pojazd</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {assignment.vehicle?.registration ?? 'Nie przypisano'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {[assignment.vehicle?.make, assignment.vehicle?.model].filter(Boolean).join(' ')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-700">
                <p className="font-medium">Brak przydzielonej trasy na dziś.</p>
                <p className="mt-1 text-amber-600">
                  Poproś dyspozytora o przypisanie zadania w tabeli <code>driver_assignments_view</code>.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-soft">
            <div className="flex items-center gap-3">
              <Package2 className="h-6 w-6 text-brand-500" />
              <h2 className="text-lg font-semibold text-slate-900">Najbliższe zlecenia</h2>
            </div>
            {assignmentsListQuery.isLoading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
                Ładowanie listy zleceń...
              </div>
            ) : assignmentsListQuery.error ? (
              <div className="mt-4 rounded-2xl border border-dashed border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-600">
                Nie udało się pobrać zleceń: {' '}
                {assignmentsListQuery.error instanceof Error
                  ? assignmentsListQuery.error.message
                  : 'spróbuj ponownie później.'}
              </div>
            ) : upcomingAssignments.length ? (
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                {upcomingAssignments.map(assignment => (
                  <li key={assignment.id} className="rounded-2xl border border-slate-200 bg-white/60 p-3">
                    <p className="text-sm font-semibold text-slate-800">
                      {dayjs(assignment.assignment_date).format('DD.MM.YYYY')} •{' '}
                      {assignment.route_name ?? 'Trasa bez nazwy'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Start: {assignment.depot_name ?? '—'} • Cel: {assignment.destination_name ?? '—'}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      Pojazd: {assignment.vehicle?.registration ?? 'Nie przypisano'}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500">
                Brak zaplanowanych zleceń na najbliższe dni.
              </div>
            )}
            <p className="mt-4 text-xs text-slate-400">Pełną listę znajdziesz w zakładce „Moje zlecenia”.</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 text-sm text-slate-600 shadow-soft">
            <h2 className="text-lg font-semibold text-slate-900">Jak działa eksport do Google Drive?</h2>
            <ol className="mt-3 space-y-2 text-sm leading-relaxed">
              <li>1. Po zapisaniu checklisty wywoływana jest funkcja Edge <code>generate-checklist-report</code>.</li>
              <li>
                2. Funkcja tworzy PDF na podstawie przesłanych danych i umieszcza go w folderze Google Drive
                {googleDriveFolderId ? ` (${googleDriveFolderId})` : ''}.
              </li>
              <li>
                3. Identyfikator pliku jest zapisywany w tabeli <code>driver_daily_reports</code>, dzięki czemu masz bezpośredni link do dokumentu.
              </li>
            </ol>
          </div>
        </aside>
      </section>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg className="h-4 w-4 text-brand-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-12.5a.75.75 0 00-1.5 0v4.25c0 .199.079.39.22.53l2.5 2.5a.75.75 0 101.06-1.06l-2.28-2.28V5.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ChecklistLegend() {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-xs text-slate-600">
      <p className="text-sm font-semibold text-slate-500">Legenda kontroli</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {checklistOptions.map(option => (
          <div key={option.value} className="flex items-start gap-2">
            <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700">
              {checklistStatusSymbols[option.value]}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-700">{option.label}</p>
              <p className="text-xs leading-snug text-slate-500">{option.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ChecklistRowProps {
  name: string;
  label: string;
  value: ChecklistStatus;
  onChange: (value: ChecklistStatus) => void;
  disabled?: boolean;
}

function ChecklistRow({ name, label, value, onChange, disabled }: ChecklistRowProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <div className="flex flex-wrap items-center gap-2">
          {checklistOptions.map(option => {
            const isActive = value === option.value;
            return (
              <label
                key={option.value}
                className={`group relative inline-flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                  isActive
                    ? 'border-brand-500 bg-brand-500 text-white shadow'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:bg-brand-50'
                } ${disabled ? 'opacity-70' : ''}`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name={name}
                  value={option.value}
                  checked={isActive}
                  onChange={() => onChange(option.value)}
                  disabled={disabled}
                />
                <span className="text-base">{checklistStatusSymbols[option.value]}</span>
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
