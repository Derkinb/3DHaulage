import { useEffect } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useSupabase } from '../contexts/SupabaseContext';

interface UseRealtimeSubscriptionOptions<T> {
  table: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  onPayload: (payload: RealtimePostgresChangesPayload<T>) => void;
  filter?: string;
}

export function useRealtimeSubscription<T>({ table, event = '*', onPayload, filter }: UseRealtimeSubscriptionOptions<T>) {
  const { supabase } = useSupabase();

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel(`realtime:${table}:${event}`)
      .on(
        'postgres_changes',
        {
          event,
          schema: 'public',
          table,
          filter
        },
        payload => {
          onPayload(payload as RealtimePostgresChangesPayload<T>);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, table, event, filter, onPayload]);
}
