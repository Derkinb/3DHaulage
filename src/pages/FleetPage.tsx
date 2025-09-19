import { useMemo, useState, useCallback } from 'react';
import dayjs from 'dayjs';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { DataGrid } from '../components/DataGrid';
import { StatusBadge } from '../components/StatusBadge';
import { Fuel, Wrench, Gauge } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface VehicleRow {
  id: number;
  registration_number?: string | null;
  brand?: string | null;
  model?: string | null;
  status?: string | null;
  driver_name?: string | null;
  last_service_at?: string | null;
  mileage?: number | null;
  fuel_level?: number | null;
}

export function FleetPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useSupabaseData<VehicleRow>('vehicles');

  const invalidateVehicles = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['vehicles'] });
  }, [queryClient]);

  useRealtimeSubscription<VehicleRow>({
    table: 'vehicles',
    event: '*',
    onPayload: invalidateVehicles
  });

  const filteredData = useMemo(() => {
    if (!data) {
      return [];
    }
    return data.filter(vehicle => {
      if (statusFilter === 'all') {
        return true;
      }
      return (vehicle.status ?? '').toLowerCase().includes(statusFilter);
    });
  }, [data, statusFilter]);

  const columns = useMemo(
    () => [
      {
        header: 'Pojazd',
        accessor: (row: VehicleRow) => (
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-slate-900">{row.registration_number ?? `#${row.id}`}</span>
            <span className="text-xs text-slate-400">{`${row.brand ?? 'Marka'} ${row.model ?? ''}`.trim()}</span>
          </div>
        )
      },
      {
        header: 'Status',
        accessor: (row: VehicleRow) => <StatusBadge status={row.status} />
      },
      {
        header: 'Przypisany kierowca',
        accessor: (row: VehicleRow) => row.driver_name ?? 'Brak'
      },
      {
        header: 'Przebieg',
        accessor: (row: VehicleRow) => (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Gauge className="h-4 w-4 text-brand-500" />
            <span>{row.mileage ? `${row.mileage.toLocaleString('pl-PL')} km` : '—'}</span>
          </div>
        )
      },
      {
        header: 'Poziom paliwa',
        accessor: (row: VehicleRow) => (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Fuel className="h-4 w-4 text-brand-500" />
            <span>{typeof row.fuel_level === 'number' ? `${row.fuel_level}%` : '—'}</span>
          </div>
        )
      },
      {
        header: 'Ostatni serwis',
        accessor: (row: VehicleRow) => (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Wrench className="h-4 w-4 text-brand-500" />
            <span>{row.last_service_at ? dayjs(row.last_service_at).format('DD.MM.YYYY') : 'Brak danych'}</span>
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
    return <ErrorState description="Nie udało się pobrać floty. Upewnij się, że tabela vehicles istnieje i ma odpowiednie kolumny." />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 bg-white/70 p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Flota pojazdów</h1>
          <p className="text-sm text-slate-500">Monitoruj stan techniczny, przebieg i planuj serwisowanie pojazdów.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/60 px-3 py-2 text-sm text-slate-600 shadow-sm focus-within:ring-2 focus-within:ring-brand-200">
            <span>Filtruj status</span>
            <select
              className="border-none bg-transparent text-sm font-medium text-slate-700 outline-none"
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
            >
              <option value="all">Wszystkie</option>
              <option value="available">Dostępne</option>
              <option value="on_route">W trasie</option>
              <option value="maintenance">Przegląd</option>
              <option value="in_service">Serwis</option>
            </select>
          </label>
        </div>
      </header>

      <DataGrid data={filteredData} columns={columns} emptyState={<p>Brak pojazdów do wyświetlenia.</p>} keyExtractor={row => row.id} />
    </div>
  );
}
