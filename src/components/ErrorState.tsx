import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

export function ErrorState({
  title = 'Nie udało się pobrać danych',
  description = 'Sprawdź konfigurację tabel w Supabase lub uprawnienia użytkownika.',
  action
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-rose-200 bg-rose-50/80 px-6 py-12 text-center text-rose-600">
      <AlertTriangle className="h-8 w-8" />
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-rose-500">{description}</p>
      </div>
      {action}
    </div>
  );
}
