import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  label?: string;
  height?: 'compact' | 'comfortable';
}

export function LoadingState({ label = 'Ładowanie danych...', height = 'comfortable' }: LoadingStateProps) {
  const sizing = height === 'compact' ? 'py-8' : 'py-16';
  return (
    <div className={`flex flex-col items-center justify-center gap-3 text-slate-500 ${sizing}`}>
      <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}
