import { useQuery, type QueryKey } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { useSupabase } from '../contexts/SupabaseContext';

interface UseSupabaseDataOptions<T> {
  enabled?: boolean;
  select?: string;
  queryKey?: QueryKey;
  transform?: (rows: T[]) => T[];
}

export function useSupabaseData<T = Record<string, unknown>>(
  table: string,
  { enabled = true, select = '*', queryKey, transform }: UseSupabaseDataOptions<T> = {}
) {
  const { supabase } = useSupabase();

  return useQuery<T[], PostgrestError>({
    enabled: enabled && Boolean(supabase),
    queryKey: queryKey ?? [table, select],
    queryFn: async () => {
      if (!supabase) {
        return [] as T[];
      }
      const { data, error } = await supabase.from(table).select(select);
      if (error) {
        throw error;
      }

      return (transform ? transform((data as T[]) ?? []) : ((data as T[]) ?? []));
    },
    retry: (failureCount, error) => {
      if (error?.message?.includes('permission denied')) {
        return false;
      }
      return failureCount < 2;
    }
  });
}
