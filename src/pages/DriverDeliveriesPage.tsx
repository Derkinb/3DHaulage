import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { CalendarDays, Clock, MapPin, Package2, Route, Truck } from 'lucide-react';
import { useSupabase } from '../contexts/SupabaseContext';
import { useDriverProfile } from '../hooks/useDriverProfile';
import { fetchDriverAssignments } from '../lib/driverAssignments';
import type { DriverAssignment } from '../types/driver';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

export function DriverDeliveriesPage() {
  const { supabase } = useSupabase();
  const {
    data: profile,
    isLoading: isProfileLoading,
    error: profileError
  } = useDriverProfile();

  const driverId = profile?.driver_id ?? profile?.id ?? null;

  const assignmentsQuery = useQuery<DriverAssignment[]>({
    enabled: Boolean(supabase && driverId),
    queryKey: ['driver-assignments-list', driverId],
    queryFn: async () => {
      if (!supabase || !driverId) {
        return [];
      }
      return fetchDriverAssignments(supabase, driverId);
    }
  });

  const today = useMemo(() => dayjs().startOf('day'), []);

  const { upcomingAssignments, pastAssignments } = useMemo(() => {
    const assignments = assignmentsQuery.data ?? [];
    const upcoming: DriverAssignment[] = [];
    const past: DriverAssignment[] = [];

    assignments.forEach(assignment => {
      const assignmentDate = dayjs(assignment.assignment_date);
      if (assignmentDate.isBefore(today, 'day')) {
        past.push(assignment);
      } else {
        upcoming.push(assignment);
      }
    });

    return {
      upcomingAssignments: upcoming,
      pastAssignments: past.reverse()
    };
  }, [assignmentsQuery.data, today]);

  if (isProfileLoading || assignmentsQuery.isLoading) {
    return <LoadingState label="Ładowanie zleceń kierowcy..." />;
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
        description="Utwórz rekord w widoku driver_profiles_view powiązany z bieżącym użytkownikiem."
      />
    );
  }

  if (assignmentsQuery.error) {
    return (
      <ErrorState
        title="Nie udało się pobrać listy zleceń"
        description={assignmentsQuery.error instanceof Error ? assignmentsQuery.error.message : undefined}
      />
    );
  }

  return (
    <div className="space-y-8">
      <header className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Moje zlecenia</h1>
            <p className="text-sm text-slate-500">
              Przeglądaj wszystkie przydzielone trasy od dyspozytora i śledź zaplanowane wyjazdy.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-flow-col sm:grid-cols-2">
            <SummaryBadge label="Planowane" value={upcomingAssignments.length} tone="brand" />
            <SummaryBadge label="Zrealizowane" value={pastAssignments.length} tone="slate" />
          </div>
        </div>
      </header>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Package2 className="h-5 w-5 text-brand-500" />
          <h2 className="text-lg font-semibold text-slate-900">Najbliższe zlecenia</h2>
        </div>
        {upcomingAssignments.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {upcomingAssignments.map(assignment => (
              <AssignmentCard key={assignment.id} assignment={assignment} />
            ))}
          </div>
        ) : (
          <EmptyState message="Brak zaplanowanych zleceń. Skontaktuj się z dyspozytorem." />
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900">Zrealizowane trasy</h2>
        </div>
        {pastAssignments.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {pastAssignments.map(assignment => (
              <AssignmentCard key={assignment.id} assignment={assignment} variant="past" />
            ))}
          </div>
        ) : (
          <EmptyState message="Brak zakończonych tras do wyświetlenia." subtle />
        )}
      </section>
    </div>
  );
}

interface SummaryBadgeProps {
  label: string;
  value: number;
  tone: 'brand' | 'slate';
}

function SummaryBadge({ label, value, tone }: SummaryBadgeProps) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-center text-sm font-semibold shadow-sm ${
        tone === 'brand'
          ? 'border-brand-200 bg-brand-50 text-brand-700'
          : 'border-slate-200 bg-white/70 text-slate-600'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-xl text-current">{value}</p>
    </div>
  );
}

interface EmptyStateProps {
  message: string;
  subtle?: boolean;
}

function EmptyState({ message, subtle = false }: EmptyStateProps) {
  return (
    <div
      className={`rounded-3xl border border-dashed p-6 text-sm ${
        subtle
          ? 'border-slate-200 bg-white/60 text-slate-500'
          : 'border-amber-200 bg-amber-50/80 text-amber-700'
      }`}
    >
      {message}
    </div>
  );
}

interface AssignmentCardProps {
  assignment: DriverAssignment;
  variant?: 'default' | 'past';
}

function AssignmentCard({ assignment, variant = 'default' }: AssignmentCardProps) {
  const assignmentDate = dayjs(assignment.assignment_date);

  return (
    <article
      className={`rounded-3xl border p-6 shadow-soft transition ${
        variant === 'past'
          ? 'border-slate-200 bg-white/70'
          : 'border-brand-200 bg-white/80 hover:border-brand-300 hover:shadow-lg'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <CalendarDays className="h-4 w-4 text-brand-500" />
            {assignmentDate.format('dddd, D MMMM YYYY')}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">
            {assignment.route_name ?? 'Trasa bez nazwy'}
          </h3>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
            variant === 'past'
              ? 'bg-slate-100 text-slate-500'
              : 'bg-brand-100 text-brand-700'
          }`}
        >
          {variant === 'past' ? 'Zakończono' : 'Zaplanowano'}
        </span>
      </div>

      <dl className="mt-5 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <Route className="h-4 w-4 text-brand-500" />
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Start</dt>
            <dd className="font-medium text-slate-700">{assignment.depot_name ?? '—'}</dd>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 rotate-180 text-brand-500" />
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cel</dt>
            <dd className="font-medium text-slate-700">{assignment.destination_name ?? '—'}</dd>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-brand-500" />
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Godziny</dt>
            <dd className="font-medium text-slate-700">
              {assignment.shift_start ?? '—'} - {assignment.shift_end ?? '—'}
            </dd>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-brand-500" />
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pojazd</dt>
            <dd className="font-medium text-slate-700">
              {assignment.vehicle?.registration ?? 'Nie przypisano'}
            </dd>
            <p className="text-xs text-slate-400">
              {[assignment.vehicle?.make, assignment.vehicle?.model].filter(Boolean).join(' ') || 'Dane pojazdu niedostępne'}
            </p>
          </div>
        </div>
      </dl>
    </article>
  );
}
