import type { PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps extends PropsWithChildren {
  session: Session | null;
  loading: boolean;
}

export function ProtectedRoute({ session, loading, children }: ProtectedRouteProps) {
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
