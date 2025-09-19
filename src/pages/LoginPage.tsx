import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Lock, Mail } from 'lucide-react';
import { useSupabase } from '../contexts/SupabaseContext';

export function LoginPage() {
  const { signIn } = useSupabase();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await signIn(email, password);
      navigate('/', { replace: true });
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Nie udało się zalogować.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4">
      <div className="absolute inset-0 -z-10 opacity-50">
        <div className="absolute -top-32 left-1/3 h-72 w-72 rounded-full bg-brand-500/40 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-sky-500/30 blur-3xl" />
      </div>
      <div className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-10 shadow-2xl backdrop-blur-xl">
        <div className="mb-8 text-center text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-white/80">3D Haulage</p>
          <h1 className="mt-3 text-3xl font-semibold">Panel logowania</h1>
          <p className="mt-2 text-sm text-white/70">
            Zaloguj się, aby zarządzać flotą i zleceniami w czasie rzeczywistym.
          </p>
        </div>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block text-left text-sm font-medium text-white/80">
            <span>Email</span>
            <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-white/90 focus-within:border-brand-300 focus-within:bg-white/10">
              <Mail className="h-4 w-4 text-brand-200" />
              <input
                className="flex-1 border-none bg-transparent text-sm font-medium text-white outline-none placeholder:text-white/40"
                placeholder="adres@firma.pl"
                autoComplete="email"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                required
              />
            </div>
          </label>

          <label className="block text-left text-sm font-medium text-white/80">
            <span>Hasło</span>
            <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-white/90 focus-within:border-brand-300 focus-within:bg-white/10">
              <Lock className="h-4 w-4 text-brand-200" />
              <input
                className="flex-1 border-none bg-transparent text-sm font-medium text-white outline-none placeholder:text-white/40"
                placeholder="••••••••"
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                required
              />
            </div>
          </label>

          {error && (
            <div className="rounded-2xl border border-rose-300/60 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:bg-brand-500/60"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isLoading ? 'Logowanie...' : 'Zaloguj się'}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-white/60">
          Korzystaj z tych samych danych logowania, co w aplikacji KierowcaApp.
        </p>
      </div>
    </div>
  );
}
