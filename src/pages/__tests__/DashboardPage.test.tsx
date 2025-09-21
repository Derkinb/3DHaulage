import { render, screen, within } from '@testing-library/react';
import dayjs from 'dayjs';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { DashboardPage } from '../DashboardPage';

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn()
  })
}));

const mockUseSupabaseData = vi.fn();

vi.mock('../../hooks/useSupabaseData', () => ({
  useSupabaseData: (table: string, ...rest: unknown[]) => mockUseSupabaseData(table, ...rest)
}));

vi.mock('../../hooks/useRealtimeSubscription', () => ({
  useRealtimeSubscription: vi.fn()
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    mockUseSupabaseData.mockReset();
  });

  test('renders dashboard sections when some delivery statuses are missing', () => {
    const deliveriesData = [
      {
        id: 1,
        status: 'In Progress',
        origin: 'Warszawa',
        destination: 'Gdańsk',
        pickup_time: dayjs().add(1, 'hour').toISOString(),
        delivery_time: dayjs().add(2, 'hour').toISOString(),
        driver_name: 'Jan Kowalski',
        vehicle_label: 'Ciężarówka 12',
        updated_at: dayjs().subtract(1, 'hour').toISOString(),
        notes: null
      },
      {
        id: 2,
        status: 'Completed',
        origin: 'Łódź',
        destination: 'Kraków',
        pickup_time: dayjs().subtract(2, 'hour').toISOString(),
        delivery_time: dayjs().toISOString(),
        driver_name: 'Anna Nowak',
        vehicle_label: 'Bus 8',
        updated_at: dayjs().subtract(2, 'hour').toISOString(),
        notes: 'Dostarczono bez opóźnień'
      },
      {
        id: 3,
        status: 'Delayed',
        origin: 'Wrocław',
        destination: 'Poznań',
        pickup_time: dayjs().add(3, 'hour').toISOString(),
        delivery_time: dayjs().add(5, 'hour').toISOString(),
        driver_name: 'Piotr Zieliński',
        vehicle_label: 'Van 5',
        updated_at: dayjs().subtract(30, 'minute').toISOString(),
        notes: null
      },
      {
        id: 4,
        status: null,
        origin: null,
        destination: null,
        pickup_time: null,
        delivery_time: dayjs().add(6, 'hour').toISOString(),
        driver_name: null,
        vehicle_label: null,
        updated_at: dayjs().subtract(10, 'minute').toISOString(),
        notes: null
      },
      {
        id: 5,
        status: undefined,
        origin: null,
        destination: null,
        pickup_time: null,
        delivery_time: null,
        driver_name: null,
        vehicle_label: null,
        updated_at: dayjs().subtract(5, 'minute').toISOString(),
        notes: null
      }
    ];

    const vehiclesData = [
      { id: 1, registration_number: 'XYZ 123', status: 'available', last_service_at: null },
      { id: 2, registration_number: 'ABC 987', status: 'maintenance', last_service_at: null }
    ];

    mockUseSupabaseData.mockImplementation((table: string) => {
      if (table === 'deliveries') {
        return { data: deliveriesData, isLoading: false, error: null };
      }

      if (table === 'vehicles') {
        return { data: vehiclesData, isLoading: false, error: null };
      }

      return { data: [], isLoading: false, error: null };
    });

    render(<DashboardPage />);

    const activeMetric = screen.getByText('Aktywne zlecenia').closest('article');
    expect(activeMetric).not.toBeNull();
    expect(within(activeMetric as HTMLElement).getByText('1', { selector: 'p' })).toBeInTheDocument();

    const completedMetric = screen.getByText('Dostarczone dziś').closest('article');
    expect(completedMetric).not.toBeNull();
    expect(within(completedMetric as HTMLElement).getByText('1', { selector: 'p' })).toBeInTheDocument();

    const delayedMetric = screen.getByText('Opóźnienia').closest('article');
    expect(delayedMetric).not.toBeNull();
    expect(within(delayedMetric as HTMLElement).getByText('1', { selector: 'p' })).toBeInTheDocument();

    const vehiclesMetric = screen.getByText('Aktywne pojazdy').closest('article');
    expect(vehiclesMetric).not.toBeNull();
    expect(within(vehiclesMetric as HTMLElement).getByText('2', { selector: 'p' })).toBeInTheDocument();

    expect(screen.getByText('Priorytetowe zlecenia')).toBeInTheDocument();
    expect(screen.getByText('Zlecenie #1')).toBeInTheDocument();

    expect(screen.getAllByText(/Status: brak informacji/i).length).toBeGreaterThan(0);
  });
});
