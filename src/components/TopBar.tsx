import { useMemo } from 'react';
import { Bell, Search, Menu } from 'lucide-react';
import dayjs from 'dayjs';
import { useSupabase } from '../contexts/SupabaseContext';

interface TopBarProps {
  onToggleSidebar: () => void;
}

export function TopBar({ onToggleSidebar }: TopBarProps) {
  const { session } = useSupabase();
  const initials = useMemo(() => {
    const email = session?.user.email ?? '';
    const name = session?.user.user_metadata?.full_name ?? email;
    return name
      .split(' ')
      .map(part => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  }, [session]);

  return (
    <header className="sticky top-0 z-20 flex flex-col border-b border-slate-200/70 bg-white/75 backdrop-blur-xl">
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 lg:px-10 lg:py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onToggleSidebar}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-brand-200 hover:text-brand-600 lg:hidden"
              aria-label="Otwórz menu boczne"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-brand-600">3D Haulage</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-900">Witamy ponownie!</h2>
              <p className="text-sm text-slate-500">{dayjs().format('dddd, D MMMM YYYY')}</p>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-end gap-3 sm:gap-4">
            <div className="relative hidden max-w-md flex-1 sm:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                className="w-full rounded-full border border-slate-200 bg-white/60 py-2 pl-10 pr-4 text-sm text-slate-700 shadow-sm outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                placeholder="Szukaj w zleceniach, kierowcach lub trasach..."
              />
            </div>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-brand-200 hover:text-brand-600"
              aria-label="Powiadomienia"
            >
              <Bell className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3 rounded-full border border-transparent bg-white/60 px-2 py-1 pr-4 shadow-sm">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold uppercase text-white">
                {initials || '??'}
              </span>
              <div className="hidden text-left sm:block">
                <p className="text-sm font-medium text-slate-900">{session?.user.user_metadata?.full_name ?? 'Nieznany użytkownik'}</p>
                <p className="text-xs text-slate-500">{session?.user.email}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="sm:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              className="w-full rounded-full border border-slate-200 bg-white/60 py-2 pl-10 pr-4 text-sm text-slate-700 shadow-sm outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
              placeholder="Szukaj w zleceniach, kierowcach lub trasach..."
            />
          </div>
        </div>
      </div>
    </header>
  );
}
