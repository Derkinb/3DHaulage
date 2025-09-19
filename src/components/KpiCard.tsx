import type { ReactNode } from 'react';

interface KpiCardProps {
  title: string;
  value: string;
  trendLabel?: string;
  trendValue?: string;
  icon?: ReactNode;
}

export function KpiCard({ title, value, trendLabel, trendValue, icon }: KpiCardProps) {
  return (
    <article className="group flex flex-col justify-between rounded-3xl border border-slate-200/80 bg-white/70 p-6 shadow-sm ring-1 ring-transparent transition duration-200 hover:-translate-y-1 hover:shadow-xl hover:ring-brand-100">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-400">{title}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
        </div>
        {icon}
      </div>
      {(trendLabel || trendValue) && (
        <p className="mt-6 text-sm text-slate-500">
          <span className="font-semibold text-emerald-600">{trendValue}</span> {trendLabel}
        </p>
      )}
    </article>
  );
}
