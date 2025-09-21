import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ActivityTimeline } from '../components/ActivityTimeline';
import { DeliveryCard } from '../components/DeliveryCard';
import { ErrorState } from '../components/ErrorState';
import { KpiCard } from '../components/KpiCard';
import { LoadingState } from '../components/LoadingState';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { Truck, CheckCircle2, AlertTriangle, Route } from 'lucide-react';
import dayjs from 'dayjs';

interface DeliveryRow {
  id: number;
  status?: string | null;
  origin?: string | null;
  destination?: string | null;
  pickup_time?: string | null;
  delivery_time?: string | null;
  driver_name?: string | null;
  vehicle_label?: string | null;
  updated_at?: string | null;
  notes?: string | null;
}

interface VehicleRow {
  id: number;
  registration_number?: string | null;
  status?: string | null;
  last_service_at?: string | null;
}

export function DashboardPage() {
  const deliveriesQuery = useSupabaseData<DeliveryRow>('deliveries');
  const vehiclesQuery = useSupabaseData<VehicleRow>('vehicles');
  const queryClient = useQueryClient();

  const handleDeliveriesRealtime = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['deliveries'] });
  }, [queryClient]);

  const handleVehiclesRealtime = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['vehicles'] });
  }, [queryClient]);

  useRealtimeSubscription<DeliveryRow>({
    table: 'deliveries',
    event: '*',
    onPayload: handleDeliveriesRealtime
  });

  useRealtimeSubscription<VehicleRow>({
    table: 'vehicles',
    event: '*',
    onPayload: handleVehiclesRealtime
  });

  const { metrics, highlightedDeliveries, activityItems } = useMemo(() => {
    const deliveries = deliveriesQuery.data ?? [];
    const vehicles = vehiclesQuery.data ?? [];

    const activeDeliveries = deliveries.filter(delivery => {
      const status = (delivery.status ?? '').toLowerCase();
      return status.includes('progress');
    }).length;
    const completedToday = deliveries.filter(delivery => {
      const status = (delivery.status ?? '').toLowerCase();
      return status.includes('complete') && dayjs(delivery.delivery_time).isSame(dayjs(), 'day');
    }).length;
    const delayedDeliveries = deliveries.filter(delivery => {
      const status = (delivery.status ?? '').toLowerCase();
      return status.includes('delay');
    }).length;

    const metricsData = [
      {
        title: 'Aktywne zlecenia',
        value: String(activeDeliveries),
        trendLabel: 'w realizacji teraz',
        trendValue: `+${activeDeliveries}`,
        icon: <Route className="h-9 w-9 text-brand-500" />
      },
      {
        title: 'Dostarczone dziś',
        value: String(completedToday),
        trendLabel: 'zakończone w ciągu ostatnich 24h',
        trendValue: `${completedToday}`,
        icon: <CheckCircle2 className="h-9 w-9 text-emerald-500" />
      },
      {
        title: 'Opóźnienia',
        value: String(delayedDeliveries),
        trendLabel: 'wymagają pilnej reakcji',
        trendValue: delayedDeliveries ? `-${delayedDeliveries}` : '0',
        icon: <AlertTriangle className="h-9 w-9 text-amber-500" />
      },
      {
        title: 'Aktywne pojazdy',
        value: String(vehicles.length),
        trendLabel: 'pojazdy gotowe do wyjazdu',
        trendValue: `${vehicles.length}`,
        icon: <Truck className="h-9 w-9 text-slate-500" />
      }
    ];

    const sorted = [...deliveries]
      .filter(delivery => {
        const status = (delivery.status ?? '').toLowerCase();
        return status.includes('progress');
      })
      .sort((a, b) => dayjs(a.delivery_time).diff(dayjs(b.delivery_time)))
      .slice(0, 3);

    const timeline = [...deliveries]
      .sort((a, b) => dayjs(b.updated_at).valueOf() - dayjs(a.updated_at).valueOf())
      .slice(0, 6)
      .map(delivery => ({
        id: delivery.id,
        title: `${delivery.driver_name ?? 'Nieznany kierowca'} • ${delivery.destination ?? 'Trasa'}`,
        description: delivery.notes ?? `Status: ${delivery.status ?? 'brak informacji'}`,
        timestamp: delivery.updated_at ?? delivery.delivery_time ?? new Date().toISOString()
      }));

    return {
      metrics: metricsData,
      highlightedDeliveries: sorted,
      activityItems: timeline
    };
  }, [deliveriesQuery.data, vehiclesQuery.data]);

  if (deliveriesQuery.isLoading || vehiclesQuery.isLoading) {
    return <LoadingState />;
  }

  if (deliveriesQuery.error || vehiclesQuery.error) {
    return (
      <ErrorState
        description="Upewnij się, że w Supabase istnieją tabele deliveries i vehicles z odpowiednimi uprawnieniami RLS."
        action={
          <a
            href="https://supabase.com/docs/guides/database"
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-rose-600 shadow-sm transition hover:bg-rose-50"
          >
            Sprawdź dokumentację Supabase
          </a>
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(metric => (
          <KpiCard key={metric.title} {...metric} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Priorytetowe zlecenia</h3>
            <span className="text-sm text-slate-500">Wyświetlane są 3 najszybsze trasy</span>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {highlightedDeliveries.length ? (
              highlightedDeliveries.map(delivery => (
                <DeliveryCard
                  key={delivery.id}
                  id={delivery.id}
                  origin={delivery.origin}
                  destination={delivery.destination}
                  pickupTime={delivery.pickup_time}
                  deliveryTime={delivery.delivery_time}
                  driver={delivery.driver_name}
                  vehicle={delivery.vehicle_label}
                  status={delivery.status}
                  footer={delivery.notes}
                />
              ))
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-slate-500 md:col-span-2 xl:col-span-3">
                Brak aktywnych zleceń w realizacji.
              </div>
            )}
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">Aktywność na trasach</h3>
          <ActivityTimeline items={activityItems} />
        </div>
      </section>
    </div>
  );
}
