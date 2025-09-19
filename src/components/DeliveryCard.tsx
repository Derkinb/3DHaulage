import type { ReactNode } from 'react';
import dayjs from 'dayjs';
import { MapPin, Clock3, Truck } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

export interface DeliveryCardProps {
  id: string | number;
  origin?: string | null;
  destination?: string | null;
  pickupTime?: string | null;
  deliveryTime?: string | null;
  driver?: string | null;
  vehicle?: string | null;
  status?: string | null;
  footer?: ReactNode;
}

export function DeliveryCard({
  id,
  origin,
  destination,
  pickupTime,
  deliveryTime,
  driver,
  vehicle,
  status,
  footer
}: DeliveryCardProps) {
  return (
    <article className="group flex h-full flex-col justify-between rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-white to-brand-50/30 p-6 shadow-sm transition hover:-translate-y-1 hover:border-brand-200 hover:shadow-xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Zlecenie #{id}</p>
          <StatusBadge status={status ?? 'planned'} />
        </div>
        <div className="space-y-3 text-sm text-slate-600">
          <div className="flex items-center gap-3">
            <MapPin className="h-4 w-4 text-brand-500" />
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-slate-900">Start:</span>
              <span>{origin ?? '—'}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <MapPin className="h-4 w-4 rotate-180 text-brand-500" />
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-slate-900">Cel:</span>
              <span>{destination ?? '—'}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Clock3 className="h-4 w-4 text-brand-500" />
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-slate-900">Czas:</span>
              <span>
                {pickupTime ? dayjs(pickupTime).format('DD.MM, HH:mm') : '—'} –{' '}
                {deliveryTime ? dayjs(deliveryTime).format('DD.MM, HH:mm') : '—'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Truck className="h-4 w-4 text-brand-500" />
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-slate-900">Zespół:</span>
              <span>{driver ?? 'Brak przypisanego kierowcy'}</span>
              <span className="text-xs text-slate-400">{vehicle ?? 'Brak pojazdu'}</span>
            </div>
          </div>
        </div>
      </div>
      {footer && <div className="mt-4 pt-4 text-sm text-slate-500">{footer}</div>}
    </article>
  );
}
