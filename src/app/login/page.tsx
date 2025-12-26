'use client';

import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChangeEvent, Suspense, useState } from 'react';

type AuthMode = 'login' | 'signup';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get('callbackUrl') ?? '/';
  const error = searchParams?.get('error');

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState(error ? 'Error de autenticación' : '');
  const [loading, setLoading] = useState(false);

  async function handleEmailPassword() {
    if (!email || !password) {
      setErrorMsg('Por favor ingresa tu email y contraseña');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    try {
      setErrorMsg('');
      setLoading(true);

      if (mode === 'signup') {
        // Para signup, primero registramos y luego hacemos login
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Error al registrar');
        }
      }

      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setErrorMsg('Email o contraseña incorrectos');
      } else {
        router.replace(callbackUrl);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : 'Error al procesar la solicitud');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    try {
      setErrorMsg('');
      setLoading(true);
      await signIn('google', { callbackUrl });
    } catch (err) {
      console.error(err);
      setErrorMsg('Error al iniciar sesión con Google');
      setLoading(false);
    }
  }

  const modeDescriptions: Record<AuthMode, string> = {
    login: 'Inicia sesión en tu cuenta para continuar con tus grupos y gastos.',
    signup: 'Crea tu cuenta y empieza a compartir gastos con tu equipo.',
  };

  const tabOptions: { value: AuthMode; label: string }[] = [
    { value: 'login', label: 'Iniciar sesión' },
    { value: 'signup', label: 'Registrarse' },
  ];

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-16 text-text-primary">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-24 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute right-12 bottom-16 h-64 w-64 rounded-full bg-success-soft opacity-60 blur-3xl" />
      </div>

      <div className="glass-card w-full max-w-lg space-y-8 p-8 shadow-xl">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold">Bienvenido a Appagar</h1>
          <p className="text-sm text-text-secondary">{modeDescriptions[mode]}</p>
        </div>

        <div className="flex items-center gap-2 rounded-full bg-white/30 p-1 text-sm font-medium backdrop-blur">
          {tabOptions.map((option) => (
            <button
              key={option.value}
              className={`flex-1 rounded-full px-4 py-2 transition ${mode === option.value
                  ? 'bg-white/80 text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
                }`}
              onClick={() => {
                setMode(option.value);
                setErrorMsg('');
              }}
              disabled={loading}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="space-y-5">
          <button
            className="glass-list-item flex w-full items-center justify-center gap-3 px-4 py-3 text-sm font-medium transition hover:bg-white/40 disabled:pointer-events-none disabled:opacity-60"
            onClick={handleGoogleLogin}
            disabled={loading}
            type="button"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continuar con Google
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/40" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wide text-text-secondary">
              <span className="bg-white/70 px-3 py-1 rounded-full">o continúa con tu email</span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-text-primary">
                Email
              </label>
              <input
                id="email"
                className="input-field disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="tu@email.com"
                value={email}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setEmail(event.target.value);
                  setErrorMsg('');
                }}
                type="email"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-text-primary">
                Contraseña
              </label>
              <input
                id="password"
                className="input-field disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="••••••••"
                value={password}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setPassword(event.target.value);
                  setErrorMsg('');
                }}
                onKeyDown={(event) => event.key === 'Enter' && handleEmailPassword()}
                type="password"
                required
                disabled={loading}
              />
              {mode === 'signup' && (
                <p className="text-xs text-text-secondary">Mínimo 6 caracteres</p>
              )}
            </div>

            {errorMsg && (
              <div className="glass-danger px-4 py-3 text-sm text-danger">
                {errorMsg}
              </div>
            )}

            <button
              className="btn-primary w-full disabled:pointer-events-none disabled:opacity-60"
              onClick={handleEmailPassword}
              disabled={loading}
              type="button"
            >
              {loading ? 'Procesando...' : mode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </main>
    }>
      <LoginForm />
    </Suspense>
  );
}
