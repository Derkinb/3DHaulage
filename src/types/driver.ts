export interface DriverProfile {
  id: string;
  user_id: string;
  driver_id?: string | null;
  full_name: string;
  phone?: string | null;
  license_number?: string | null;
  avatar_url?: string | null;
  home_depot?: string | null;
}

export interface VehicleSummary {
  id: string;
  registration?: string | null;
  make?: string | null;
  model?: string | null;
}

export interface DriverAssignment {
  id: string;
  assignment_date: string;
  shift_start?: string | null;
  shift_end?: string | null;
  depot_name?: string | null;
  destination_name?: string | null;
  route_name?: string | null;
  vehicle?: VehicleSummary | null;
}

export type ChecklistState = Record<string, boolean>;

export interface DriverDailyReport {
  id: string;
  assignment_id: string;
  driver_id?: string | null;
  start_odometer?: number | null;
  fuel_level?: number | null;
  notes?: string | null;
  checklist_state?: ChecklistState | null;
  completed_at?: string | null;
  drive_file_url?: string | null;
  drive_file_id?: string | null;
}

export interface ChecklistPdfResponse {
  drive_file_id?: string | null;
  drive_file_url?: string | null;
  file_name?: string | null;
}
