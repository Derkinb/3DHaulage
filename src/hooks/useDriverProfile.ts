import { useQuery } from '@tanstack/react-query';
import { useSupabase } from '../contexts/SupabaseContext';
import type { DriverProfile } from '../types/driver';

export function useDriverProfile() {
  const { supabase, session } = useSupabase();

  return useQuery<DriverProfile | null>({
    enabled: Boolean(supabase && session?.user?.id),
    queryKey: ['driver-profile', session?.user?.id],
    queryFn: async () => {
      if (!supabase || !session?.user?.id) {
        return null;
      }

      const { data, error } = await supabase
        .from('driver_profiles_view')
        .select(
          `id, user_id, driver_id, full_name, phone, license_number, avatar_url, home_depot`
        )
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return (data as DriverProfile | null) ?? null;
    }
  });
}
