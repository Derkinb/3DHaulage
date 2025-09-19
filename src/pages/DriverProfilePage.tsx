import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  FileText,
  Fuel,
  Gauge,
  Loader2,
  MapPin,
  Route,
  Truck,
  User
} from 'lucide-react';
import { useSupabase } from '../contexts/SupabaseContext';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

interface DriverProfile {
  id: string;
  user_id: string;
  driver_id?: string | null;
  full_name: string;
  phone?: string | null;
  license_number?: string | null;
  avatar_url?: string | null;
  home_depot?: string | null;
}

interface VehicleSummary {
  id: string;
  registration?: string | null;
  make?: string | null;
  model?: string | null;
}

interface DriverAssignment {
  id: string;
  assignment_date: string;
  shift_start?: string | null;
  shift_end?: string | null;
  depot_name?: string | null;
  destination_name?: string | null;
  route_name?: string | null;
  vehicle?: VehicleSummary | null;
}

interface ChecklistState {
  [key: string]: boolean;
}

interface DriverDailyReport {
  id: string;
  assignment_id: string;
  driver_id?: string | null;
  start_odometer?: number | null;
  fuel_level?: number | null;
  notes?: string | null;
  checklist_state?: ChecklistState | null;
  completed_at?: string | null;
  drive_file_url?: string | null;
  drive_file_id?: string | null;
}

interface ChecklistPdfResponse {
  drive_file_id?: string | null;
  drive_file_url?: string | null;
  file_name?: string | null;
}

type ChecklistFormValues = {
  startOdometer: number | '';
  fuelLevel: number | '';
  notes: string;
  checklist: ChecklistState;
};

const checklistItems = [
  { id: 'tires', label: 'Opony i ciśnienie' },
  { id: 'lights', label: 'Oświetlenie zewnętrzne' },
  { id: 'fluids', label: 'Płyny eksploatacyjne' },
  { id: 'documents', label: 'Dokumenty pojazdu i tachograf' },
  { id: 'safety', label: 'Wyposażenie bezpieczeństwa' },
  { id: 'cargo_area', label: 'Stan przestrzeni ładunkowej' }
] as const;

const googleDriveFolderId = import.meta.env.VITE_GOOGLE_DRIVE_PARENT_FOLDER_ID;
const checklistTemplateId = import.meta.env.VITE_CHECKLIST_TEMPLATE_ID;

function createChecklistState(): ChecklistState {
  return checklistItems.reduce<ChecklistState>((state, item) => {
    state[item.id] = false;
    return state;
  }, {});
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

  const { register, handleSubmit, reset } = form;

  const {
    data: profile,
    isLoading: isProfileLoading,
    error: profileError
  } = useQuery<DriverProfile | null>({
    enabled: Boolean(supabase && session?.user?.id),
    queryKey: ['driver-profile', session?.user?.id],
    queryFn: async () => {
      if (!supabase || !session?.user?.id) {
        return null;
      }
      const { data, error } = await supabase
        .from('driver_profiles_view')
        .select(
          `id, user_id, driver_id, full_name, phone, license_number, avatar_url, home_depot`
        )
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return (data as DriverProfile | null) ?? null;
    }
  });

  const driverId = profile?.driver_id ?? profile?.id ?? null;

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
      checklist: {
        ...createChecklistState(),
        ...(report.checklist_state ?? {})
      }
    });
  }, [report, reset]);

  const checklistMutation = useMutation({
    mutationFn: async (values: ChecklistFormValues) => {
      if (!supabase || !assignment?.id || !driverId) {
        throw new Error('Brak danych Supabase lub aktywnego przydziału.');
      }

      const payload = {
        assignment_id: assignment.id,
        driver_id: driverId,
        start_odometer: values.startOdometer === '' ? null : Number(values.startOdometer),
        fuel_level: values.fuelLevel === '' ? null : Number(values.fuelLevel),
        notes: values.notes,
        checklist_state: values.checklist,
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

      let finalReport = upsertedReport as DriverDailyReport;
      let pdfResult: ChecklistPdfResponse | null = null;
      let pdfErrorMessage: string | null = null;

      try {
        const { data: pdfData, error: pdfError } = await supabase.functions.invoke<ChecklistPdfResponse>(
          'generate-checklist-report',
          {
            body: {
              report_id: upsertedReport.id,
              assignment_id: assignment.id,
              driver_id: driverId,
              google_drive_parent_id: googleDriveFolderId || undefined,
              checklist_template_id: checklistTemplateId || undefined
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
          .eq('id', upsertedReport.id)
          .select(
            'id, assignment_id, driver_id, start_odometer, fuel_level, notes, checklist_state, completed_at, drive_file_url, drive_file_id'
          )
          .single();

        if (updatedReport) {
          finalReport = updatedReport as DriverDailyReport;
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

              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-slate-600">Szybka kontrola pojazdu</legend>
                <div className="grid gap-3 md:grid-cols-2">
                  {checklistItems.map(item => (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm transition hover:border-brand-200"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
                        {...register(`checklist.${item.id}` as const)}
                      />
                      <span className="font-medium text-slate-700">{item.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

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
