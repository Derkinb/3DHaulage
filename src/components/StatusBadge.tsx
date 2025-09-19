import clsx from 'clsx';

type Status =
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'delayed'
  | 'cancelled'
  | 'available'
  | 'on_route'
  | 'maintenance'
  | 'in_service'
  | 'reserved';

const statusMap: Record<Status, { label: string; className: string }> = {
  planned: { label: 'Zaplanowane', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  in_progress: { label: 'W realizacji', className: 'bg-blue-100 text-blue-700 ring-blue-200' },
  completed: { label: 'Zrealizowane', className: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  delayed: { label: 'Opóźnione', className: 'bg-amber-100 text-amber-700 ring-amber-200' },
  cancelled: { label: 'Anulowane', className: 'bg-rose-100 text-rose-700 ring-rose-200' },
  available: { label: 'Dostępne', className: 'bg-emerald-50 text-emerald-600 ring-emerald-200' },
  on_route: { label: 'W trasie', className: 'bg-blue-50 text-blue-600 ring-blue-200' },
  maintenance: { label: 'Przegląd', className: 'bg-amber-50 text-amber-600 ring-amber-200' },
  in_service: { label: 'Serwis', className: 'bg-purple-50 text-purple-600 ring-purple-200' },
  reserved: { label: 'Zarezerwowane', className: 'bg-slate-50 text-slate-600 ring-slate-200' }
};

interface StatusBadgeProps {
  status: string | null | undefined;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalizedStatus = (status?.toLowerCase().replace(/\s+/g, '_') as Status) ?? 'planned';
  const fallback = statusMap.planned;
  const { label, className } = statusMap[normalizedStatus] ?? fallback;

  return (
    <span className={clsx('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset', className)}>
      {label}
    </span>
  );
}
