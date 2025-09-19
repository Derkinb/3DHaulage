import type { SupabaseClient } from '@supabase/supabase-js';
import type { DriverAssignment } from '../types/driver';

interface FetchDriverAssignmentsOptions {
  fromDate?: string;
}

export async function fetchDriverAssignments(
  supabase: SupabaseClient,
  driverId: string,
  { fromDate }: FetchDriverAssignmentsOptions = {}
) {
  let query = supabase
    .from('driver_assignments_view')
    .select(
      `id, assignment_date, shift_start, shift_end, depot_name, destination_name, route_name,
       vehicle:vehicles(id, registration, make, model)`
    )
    .eq('driver_id', driverId)
    .order('assignment_date', { ascending: true });

  if (fromDate) {
    query = query.gte('assignment_date', fromDate);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data as DriverAssignment[]) ?? []).map(assignment => ({
    ...assignment,
    vehicle: assignment.vehicle ?? null
  }));
}
