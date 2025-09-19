import { useMemo, useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Check, MapPin, Filter, RefreshCw } from 'lucide-react';
import dayjs from 'dayjs';
import { useSupabase } from '../contexts/SupabaseContext';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { DataGrid } from '../components/DataGrid';
import { StatusBadge } from '../components/StatusBadge';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';

interface DeliveryRow {
  id: number;
  reference_number?: string | null;
  status?: string | null;
  origin?: string | null;
  destination?: string | null;
  pickup_time?: string | null;
  delivery_time?: string | null;
  driver_name?: string | null;
  vehicle_label?: string | null;
  customer_name?: string | null;
  notes?: string | null;
}

const statusFilters = [
  { value: 'all', label: 'Wszystkie' },
  { value: 'planned', label: 'Zaplanowane' },
  { value: 'in_progress', label: 'W realizacji' },
  { value: 'completed', label: 'Zrealizowane' },
  { value: 'delayed', label: 'Opóźnione' }
];

export function DeliveriesPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { supabase } = useSupabase();
  const queryClient = useQueryClient();

  const deliveriesQuery = useSupabaseData<DeliveryRow>('deliveries');

  const invalidateDeliveries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['deliveries'] });
  }, [queryClient]);

  useRealtimeSubscription<DeliveryRow>({
    table: 'deliveries',
    event: '*',
    onPayload: invalidateDeliveries
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      if (!supabase) {
        throw new Error('Supabase nie został skonfigurowany');
      }
      const { error } = await supabase.from('deliveries').update({ status }).eq('id', id);
      if (error) {
        throw error;
      }
    },
    onSuccess: invalidateDeliveries
  });

  const data = useMemo(() => {
    const deliveries = deliveriesQuery.data ?? [];
    const filtered = deliveries.filter(delivery => {
      const matchesStatus =
        statusFilter === 'all' || (delivery.status ?? '').toLowerCase().includes(statusFilter.replace('_', ' '));
      const haystack = `${delivery.reference_number ?? ''} ${delivery.origin ?? ''} ${delivery.destination ?? ''} ${delivery.driver_name ?? ''} ${delivery.customer_name ?? ''}`.toLowerCase();
      const matchesSearch = haystack.includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
    return filtered.sort(
      (a, b) => dayjs(a.delivery_time ?? a.pickup_time).valueOf() - dayjs(b.delivery_time ?? b.pickup_time).valueOf()
    );
  }, [deliveriesQuery.data, statusFilter, searchQuery]);

  const columns = useMemo(
    () => [
      {
        header: 'Numer referencyjny',
        accessor: (row: DeliveryRow) => (
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-slate-900">{row.reference_number ?? `#${row.id}`}</span>
            <span className="text-xs text-slate-400">{row.customer_name ?? 'Klient nieznany'}</span>
          </div>
        )
      },
      {
        header: 'Trasa',
        accessor: (row: DeliveryRow) => (
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-brand-500" />
            <div className="flex flex-col">
              <span className="font-semibold text-slate-900">{row.origin ?? '—'}</span>
              <span className="text-xs text-slate-400">{row.destination ?? '—'}</span>
            </div>
          </div>
        )
      },
      {
        header: 'Czas',
        accessor: (row: DeliveryRow) => (
          <div className="text-sm text-slate-600">
            <p>Start: {row.pickup_time ? dayjs(row.pickup_time).format('DD.MM HH:mm') : '—'}</p>
            <p>Dostawa: {row.delivery_time ? dayjs(row.delivery_time).format('DD.MM HH:mm') : '—'}</p>
          </div>
        )
      },
      {
        header: 'Kierowca i pojazd',
        accessor: (row: DeliveryRow) => (
          <div className="text-sm text-slate-600">
            <p className="font-semibold text-slate-900">{row.driver_name ?? 'Brak kierowcy'}</p>
            <p className="text-xs text-slate-400">{row.vehicle_label ?? 'Brak pojazdu'}</p>
          </div>
        )
      },
      {
        header: 'Status',
        accessor: (row: DeliveryRow) => <StatusBadge status={row.status} />
      },
      {
        header: 'Akcje',
        accessor: (row: DeliveryRow) => (
          <div className="flex flex-wrap items-center gap-2">
            {['planned', 'in_progress', 'completed', 'delayed'].map(status => (
              <button
                type="button"
                key={status}
                onClick={() => updateStatusMutation.mutate({ id: row.id, status })}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:border-brand-200 hover:text-brand-600"
                disabled={updateStatusMutation.isPending}
              >
                {updateStatusMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                {status.replace('_', ' ')}
              </button>
            ))}
          </div>
        )
      }
    ],
    [updateStatusMutation]
  );

  if (deliveriesQuery.isLoading) {
    return <LoadingState />;
  }

  if (deliveriesQuery.error) {
    return <ErrorState description="Zlecenia nie mogły zostać wczytane. Potwierdź nazwę tabeli deliveries w Supabase." />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 bg-white/70 p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Zarządzanie zleceniami</h1>
          <p className="text-sm text-slate-500">Filtruj trasy, aktualizuj statusy i monitoruj dostawy w czasie rzeczywistym.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/60 px-3 py-2 text-sm text-slate-600 shadow-sm focus-within:ring-2 focus-within:ring-brand-200">
            <Filter className="h-4 w-4 text-brand-400" />
            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
              className="border-none bg-transparent text-sm font-medium text-slate-700 outline-none"
            >
              {statusFilters.map(filter => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </label>
          <input
            type="search"
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="Szukaj po kliencie, trasie lub numerze..."
            className="w-full min-w-[220px] flex-1 rounded-full border border-slate-200 bg-white/60 px-4 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-100"
          />
          <button
            type="button"
            onClick={invalidateDeliveries}
            className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-600 shadow-sm transition hover:bg-brand-100"
          >
            <RefreshCw className="h-4 w-4" /> Odśwież
          </button>
        </div>
      </header>

      <DataGrid
        data={data}
        columns={columns}
        emptyState={<p>Nie znaleziono zleceń spełniających kryteria.</p>}
        keyExtractor={row => row.id}
      />

      {updateStatusMutation.isError && (
        <ErrorState
          description="Aktualizacja statusu nie powiodła się. Sprawdź reguły RLS lub uprawnienia Supabase."
          action={
            <button
              type="button"
              onClick={() => updateStatusMutation.reset()}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-rose-600 shadow-sm transition hover:bg-rose-50"
            >
              Ukryj komunikat
            </button>
          }
        />
      )}
    </div>
  );
}
