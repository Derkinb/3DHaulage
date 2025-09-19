import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient } from '../lib/supabaseClient';

type UserRole = 'admin' | 'driver' | 'unknown';

interface SupabaseContextValue {
  supabase: SupabaseClient | null;
  session: Session | null;
  loading: boolean;
  isConfigured: boolean;
  userRole: UserRole;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SupabaseContext = createContext<SupabaseContextValue | undefined>(undefined);

function resolveUserRole(session: Session | null): UserRole {
  const metadataCandidates: unknown[] = [
    session?.user?.app_metadata?.role,
    session?.user?.app_metadata?.roles,
    session?.user?.user_metadata?.role,
    session?.user?.user_metadata?.account_type
  ];

  for (const candidate of metadataCandidates) {
    if (!candidate) {
      continue;
    }

    if (Array.isArray(candidate)) {
      const normalized = candidate.map(value => String(value).toLowerCase());
      if (normalized.includes('admin')) {
        return 'admin';
      }
      if (normalized.includes('driver')) {
        return 'driver';
      }
      continue;
    }

    const normalized = String(candidate).toLowerCase();
    if (normalized.includes('admin')) {
      return 'admin';
    }
    if (normalized.includes('driver')) {
      return 'driver';
    }
  }

  return 'admin';
}

export function SupabaseProvider({ children }: PropsWithChildren) {
  const [supabase] = useState(() => createSupabaseClient());
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const isConfigured = Boolean(supabase);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const load = async () => {
      const {
        data: { session: initialSession }
      } = await supabase.auth.getSession();
      setSession(initialSession);
      setLoading(false);
    };

    load();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const value = useMemo(() => {
    const signIn = async (email: string, password: string) => {
      if (!supabase) {
        throw new Error('Supabase client not configured');
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw error;
      }
    };

    const signOut = async () => {
      if (!supabase) {
        return;
      }
      await supabase.auth.signOut();
    };

    const userRole = resolveUserRole(session);

    return {
      supabase,
      session,
      loading,
      isConfigured,
      userRole,
      isAdmin: userRole === 'admin',
      signIn,
      signOut
    } satisfies SupabaseContextValue;
  }, [supabase, session, loading, isConfigured]);

  return <SupabaseContext.Provider value={value}>{children}</SupabaseContext.Provider>;
}

export function useSupabase() {
  const context = useContext(SupabaseContext);
  if (!context) {
    throw new Error('useSupabase must be used within SupabaseProvider');
  }
  return context;
}
