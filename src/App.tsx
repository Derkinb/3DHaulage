import { Navigate, Route, Routes } from 'react-router-dom';
import { useSupabase } from './contexts/SupabaseContext';
import { AppLayout } from './components/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { DeliveriesPage } from './pages/DeliveriesPage';
import { FleetPage } from './pages/FleetPage';
import { DriversPage } from './pages/DriversPage';
import { DriverProfilePage } from './pages/DriverProfilePage';
import { LoginPage } from './pages/LoginPage';
import { ProtectedRoute } from './components/ProtectedRoute';

function App() {
  const { session, loading, isConfigured } = useSupabase();

  if (!isConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-center text-slate-100">
        <div className="mx-auto max-w-xl space-y-4">
          <h1 className="text-3xl font-semibold">Konfiguracja Supabase wymagana</h1>
          <p className="text-base leading-relaxed text-slate-300">
            Uzupełnij zmienne środowiskowe <code className="rounded bg-slate-900 px-1 py-0.5">VITE_SUPABASE_URL</code> oraz
            <code className="rounded bg-slate-900 px-1 py-0.5">VITE_SUPABASE_ANON_KEY</code> w pliku <code>.env</code>.
          </p>
          <p className="text-sm text-slate-400">
            Znajdziesz je w projekcie Supabase, z którego korzysta aplikacja KierowcaApp. Następnie uruchom aplikację ponownie.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute loading={loading} session={session}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="deliveries" element={<DeliveriesPage />} />
        <Route path="fleet" element={<FleetPage />} />
        <Route path="drivers" element={<DriversPage />} />
        <Route path="profile" element={<DriverProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to={session ? '/' : '/login'} replace />} />
    </Routes>
  );
}

export default App;
