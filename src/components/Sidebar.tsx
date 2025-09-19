import { NavLink } from 'react-router-dom';
import { Truck, Users, Package2, LogOut, ChartLine, X } from 'lucide-react';
import { useSupabase } from '../contexts/SupabaseContext';

const navigation = [
  { name: 'Panel główny', to: '/', icon: ChartLine },
  { name: 'Zlecenia', to: '/deliveries', icon: Package2 },
  { name: 'Flota', to: '/fleet', icon: Truck },
  { name: 'Kierowcy', to: '/drivers', icon: Users }
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { signOut } = useSupabase();

  const navLinks = navigation.map(item => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
          isActive ? 'bg-brand-50 text-brand-600 shadow-soft' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
        }`
      }
      onClick={onClose}
    >
      <item.icon className="h-5 w-5" />
      {item.name}
    </NavLink>
  ));

  const signOutButton = (
    <button
      type="button"
      onClick={signOut}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
    >
      <LogOut className="h-4 w-4" /> Wyloguj
    </button>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-72 flex-col border-r border-slate-200/70 bg-white/70 backdrop-blur-xl lg:flex">
        <div className="px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">3D haulage</p>
          <h1 className="text-xl font-semibold text-slate-900">Panel kierowców</h1>
        </div>
        <nav className="flex-1 space-y-1 px-4">{navLinks}</nav>
        <div className="border-t border-slate-200/70 px-4 py-5">{signOutButton}</div>
      </aside>

      <div
        className={`fixed inset-y-0 left-0 z-40 w-72 transform border-r border-slate-200/70 bg-white/95 p-6 shadow-xl transition duration-300 ease-in-out lg:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">3D haulage</p>
            <h1 className="text-xl font-semibold text-slate-900">Panel kierowców</h1>
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full border border-slate-200 p-2 text-slate-400 transition hover:border-slate-300 hover:text-slate-600"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="mt-8 space-y-1">{navLinks}</nav>
        <div className="mt-10">{signOutButton}</div>
      </div>

      {isOpen && <div className="fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-sm lg:hidden" onClick={onClose} aria-hidden />}
    </>
  );
}
