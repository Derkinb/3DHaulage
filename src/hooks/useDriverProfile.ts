import { useQuery } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { useSupabase } from '../contexts/SupabaseContext';
import type { Session } from '@supabase/supabase-js';
import type { DriverProfile } from '../types/driver';

function isMissingRelation(error: PostgrestError) {
  return error.code === '42P01' || /relation .+ does not exist/i.test(error.message);
}

function isPermissionDenied(error: PostgrestError) {
  return error.code === '42501' || /permission denied/i.test(error.message);
}

function isMissingColumn(error: PostgrestError) {
  return error.code === '42703' || /column .+ does not exist/i.test(error.message);
}

function pickString(values: unknown[], fallback: string | null = null): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length) {
      return value.trim();
    }
  }
  return fallback;
}

function createProfileFromSession(session: Session | null): DriverProfile | null {
  if (!session?.user) {
    return null;
  }

  const metadata = (session.user.user_metadata ?? {}) as Record<string, unknown>;
  const nestedDriver = metadata.driver as Record<string, unknown> | undefined;

  const fullName =
    pickString([
      metadata.full_name,
      metadata.fullName,
      metadata.name,
      nestedDriver?.full_name,
      nestedDriver?.name
    ]) ?? session.user.email ?? 'Kierowca';

  const driverId = pickString([
    metadata.driver_id,
    metadata.driverId,
    nestedDriver?.id
  ]);

  return {
    id:
      pickString([
        metadata.profile_id,
        metadata.profileId,
        nestedDriver?.profile_id,
        nestedDriver?.id
      ]) ?? session.user.id,
    user_id: session.user.id,
    driver_id: driverId ?? null,
    full_name: fullName,
    phone:
      pickString([
        metadata.phone,
        metadata.phone_number,
        metadata.phoneNumber,
        nestedDriver?.phone
      ]) ?? null,
    license_number:
      pickString([
        metadata.license_number,
        metadata.licenseNumber,
        nestedDriver?.license_number
      ]) ?? null,
    avatar_url:
      pickString([
        metadata.avatar_url,
        metadata.avatar,
        nestedDriver?.avatar_url
      ]) ?? null,
    home_depot:
      pickString([
        metadata.home_depot,
        metadata.depot,
        nestedDriver?.home_depot
      ]) ?? null
  };
}

function normaliseProfileRecord(
  record: Record<string, unknown>,
  fallback: DriverProfile | null,
  session: Session | null
): DriverProfile {
  const nestedDriver = record.driver as Record<string, unknown> | undefined;

  const fullName =
    pickString(
      [
        record.full_name,
        record.fullName,
        record.name,
        nestedDriver?.full_name,
        nestedDriver?.name,
        fallback?.full_name
      ],
      session?.user?.email ?? 'Kierowca'
    ) ?? 'Kierowca';

  return {
    id:
      pickString(
        [
          record.id,
          record.profile_id,
          record.profileId,
          nestedDriver?.id,
          fallback?.id,
          session?.user?.id ?? null
        ],
        session?.user?.id ?? undefined
      ) ?? (session?.user?.id ?? ''),
    user_id:
      pickString([record.user_id, record.userId, fallback?.user_id, session?.user?.id]) ??
      (session?.user?.id ?? ''),
    driver_id:
      pickString([
        record.driver_id,
        record.driverId,
        nestedDriver?.id,
        fallback?.driver_id
      ]) ?? null,
    full_name: fullName,
    phone:
      pickString([
        record.phone,
        record.phone_number,
        record.phoneNumber,
        nestedDriver?.phone,
        fallback?.phone
      ]) ?? null,
    license_number:
      pickString([
        record.license_number,
        record.licenseNumber,
        record.licence_number,
        nestedDriver?.license_number,
        fallback?.license_number
      ]) ?? null,
    avatar_url:
      pickString([
        record.avatar_url,
        record.avatar,
        nestedDriver?.avatar_url,
        fallback?.avatar_url
      ]) ?? null,
    home_depot:
      pickString([
        record.home_depot,
        record.depot,
        record.base,
        nestedDriver?.home_depot,
        fallback?.home_depot
      ]) ?? null
  };
}

export function useDriverProfile() {
  const { supabase, session } = useSupabase();

  return useQuery<DriverProfile | null>({
    enabled: Boolean(supabase && session?.user?.id),
    queryKey: ['driver-profile', session?.user?.id],
    queryFn: async () => {
      if (!supabase || !session?.user?.id) {
        return null;
      }

      const sessionFallback = createProfileFromSession(session);

      const candidateSources = [
        { table: 'driver_profiles_view', columns: 'id, user_id, driver_id, full_name, phone, license_number, avatar_url, home_depot' },
        { table: 'driver_profiles', columns: '*' },
        { table: 'profiles', columns: '*' }
      ] as const;

      for (const source of candidateSources) {
        const { data, error } = await supabase
          .from(source.table)
          .select(source.columns)
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (error) {
          if (isMissingRelation(error) || isMissingColumn(error) || isPermissionDenied(error)) {
            continue;
          }
          throw error;
        }

        if (data) {
          return normaliseProfileRecord(data as Record<string, unknown>, sessionFallback, session);
        }
      }

      return sessionFallback;
    }
  });
}
