import { useMemo, useState, useCallback } from 'react';
import dayjs from 'dayjs';
import { Phone, Mail, Award, Map, Shield } from 'lucide-react';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { DataGrid } from '../components/DataGrid';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { useQueryClient } from '@tanstack/react-query';

interface DriverRow {
  id: number;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  seniority_level?: string | null;
  current_route?: string | null;
  last_training_at?: string | null;
  licences?: string | null;
}

export function DriversPage() {
  const [seniorityFilter, setSeniorityFilter] = useState('all');
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useSupabaseData<DriverRow>('drivers');

  const invalidateDrivers = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['drivers'] });
  }, [queryClient]);

  useRealtimeSubscription<DriverRow>({
    table: 'drivers',
    event: '*',
    onPayload: invalidateDrivers
  });

  const filteredData = useMemo(() => {
    if (!data) {
      return [];
    }
    return data.filter(driver => {
      if (seniorityFilter === 'all') {
        return true;
      }
      return driver.seniority_level?.toLowerCase() === seniorityFilter;
    });
  }, [data, seniorityFilter]);

  const columns = useMemo(
    () => [
      {
        header: 'Kierowca',
        accessor: (row: DriverRow) => (
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-slate-900">{row.full_name ?? 'Nieznany kierowca'}</span>
            <span className="text-xs text-slate-400">{row.seniority_level ?? 'brak danych'}</span>
          </div>
        )
      },
      {
        header: 'Kontakt',
        accessor: (row: DriverRow) => (
          <div className="space-y-1 text-sm text-slate-600">
            <p className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-brand-500" />
              {row.phone ?? '—'}
            </p>
            <p className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-brand-500" />
              {row.email ?? '—'}
            </p>
          </div>
        )
      },
      {
        header: 'Obecna trasa',
        accessor: (row: DriverRow) => (
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <Map className="h-4 w-4 text-brand-500" />
            {row.current_route ?? 'Brak przypisania'}
          </p>
        )
      },
      {
        header: 'Szkolenia i uprawnienia',
        accessor: (row: DriverRow) => (
          <div className="space-y-1 text-sm text-slate-600">
            <p className="flex items-center gap-2">
              <Award className="h-4 w-4 text-brand-500" /> Ostatnie szkolenie:{' '}
              {row.last_training_at ? dayjs(row.last_training_at).format('DD.MM.YYYY') : 'Brak informacji'}
            </p>
            <p className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-brand-500" /> {row.licences ?? 'Brak licencji'}
            </p>
          </div>
        )
      }
    ],
    []
  );

  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState description="Nie udało się pobrać danych kierowców. Sprawdź tabelę drivers w Supabase." />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 bg-white/70 p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Zespół kierowców</h1>
          <p className="text-sm text-slate-500">Sprawdzaj dostępność kierowców, kontakty i historię szkoleń.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/60 px-3 py-2 text-sm text-slate-600 shadow-sm focus-within:ring-2 focus-within:ring-brand-200">
            <span>Poziom doświadczenia</span>
            <select
              className="border-none bg-transparent text-sm font-medium text-slate-700 outline-none"
              value={seniorityFilter}
              onChange={event => setSeniorityFilter(event.target.value)}
            >
              <option value="all">Wszyscy</option>
              <option value="junior">Junior</option>
              <option value="mid">Mid</option>
              <option value="senior">Senior</option>
            </select>
          </label>
        </div>
      </header>

      <DataGrid data={filteredData} columns={columns} emptyState={<p>Brak kierowców do wyświetlenia.</p>} keyExtractor={row => row.id} />
    </div>
  );
}
