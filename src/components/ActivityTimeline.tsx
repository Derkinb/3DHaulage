import type { ReactNode } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/pl';

dayjs.extend(relativeTime);
dayjs.locale('pl');

interface ActivityItem {
  id: string | number;
  title: string;
  description?: string;
  timestamp: string | Date;
  icon?: ReactNode;
  accentColor?: string;
}

interface ActivityTimelineProps {
  items: ActivityItem[];
}

export function ActivityTimeline({ items }: ActivityTimelineProps) {
  if (!items.length) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-sm text-slate-500">
        Brak ostatnich zdarzeń.
      </div>
    );
  }

  return (
    <ol className="relative space-y-6">
      {items.map(item => (
        <li key={item.id} className="flex items-start gap-4 rounded-3xl bg-white/70 p-5 shadow-sm">
          <div className={`mt-1 inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${item.accentColor ?? 'bg-brand-100 text-brand-600'}`}>
            {item.icon}
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-base font-semibold text-slate-900">{item.title}</h4>
              <time className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {dayjs(item.timestamp).fromNow()}
              </time>
            </div>
            {item.description && <p className="text-sm text-slate-600">{item.description}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
