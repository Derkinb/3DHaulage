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

function matchRoleFromString(value: string): UserRole | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.includes('admin')) {
    return 'admin';
  }

  if (normalized.includes('driver')) {
    return 'driver';
  }

  return null;
}

function detectRoleFromValue(value: unknown, visited: WeakSet<object> = new WeakSet()): UserRole | null {
  if (value == null) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return matchRoleFromString(String(value));
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const role = detectRoleFromValue(entry, visited);
      if (role) {
        return role;
      }
    }
    return null;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (visited.has(record)) {
      return null;
    }
    visited.add(record);

    for (const [key, nestedValue] of Object.entries(record)) {
      const keyLower = key.toLowerCase();

      if (typeof nestedValue === 'boolean' && nestedValue) {
        if (keyLower.includes('admin')) {
          return 'admin';
        }
        if (keyLower.includes('driver')) {
          return 'driver';
        }
      }

      if (
        keyLower.includes('role') ||
        keyLower.includes('account_type') ||
        keyLower.includes('accounttype') ||
        keyLower.includes('user_role') ||
        keyLower.includes('userrole')
      ) {
        const nestedRole = detectRoleFromValue(nestedValue, visited);
        if (nestedRole) {
          return nestedRole;
        }
      }
    }

    for (const nestedValue of Object.values(record)) {
      const nestedRole = detectRoleFromValue(nestedValue, visited);
      if (nestedRole) {
        return nestedRole;
      }
    }
  }

  return null;
}

function resolveUserRole(session: Session | null): UserRole {
  if (!session?.user) {
    return 'unknown';
  }

  const appMetadata = (session.user.app_metadata ?? {}) as Record<string, unknown>;
  const userMetadata = (session.user.user_metadata ?? {}) as Record<string, unknown>;

  const metadataCandidates: unknown[] = [
    appMetadata['role'],
    appMetadata['roles'],
    appMetadata['user_role'],
    appMetadata['userRole'],
    userMetadata['role'],
    userMetadata['roles'],
    userMetadata['account_type'],
    userMetadata['accountType']
  ];

  for (const candidate of metadataCandidates) {
    const resolved = detectRoleFromValue(candidate);
    if (resolved) {
      return resolved;
    }
  }

  const metadataSources: unknown[] = [appMetadata, userMetadata];

  for (const source of metadataSources) {
    const resolved = detectRoleFromValue(source);
    if (resolved) {
      return resolved;
    }
  }

  return 'unknown';
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
