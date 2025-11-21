'use client';
import { getSupabaseClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ChangeEvent, useEffect, useState } from 'react';

type AuthMode = 'login' | 'signup' | 'magic-link';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [processingOAuth, setProcessingOAuth] = useState(false);

  // Detectar si estamos procesando un callback OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    
    if (params.has('code') || hashParams.has('access_token')) {
      console.log('[Login] OAuth callback detectado, procesando...');
      setProcessingOAuth(true);
    }
  }, []);

  async function handleEmailPassword() {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    const loginRedirect = `${window.location.origin}${basePath}/login`;

    if (!email || !password) {
      setError('Por favor ingresa tu email y contraseña');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    try {
      setError('');
      setLoading(true);
      const supabase = getSupabaseClient();

      if (mode === 'signup') {
        const { error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: loginRedirect,
          }
        });
        if (authError) throw authError;
        setSent(true);
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) throw authError;
        const homePath = basePath || '/';
        router.replace(homePath);
      }
    } catch (error: unknown) {
      console.error(error);
      setError(error instanceof Error ? error.message : 'Error al procesar la solicitud');
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    const loginRedirect = `${window.location.origin}${basePath}/login`;

    if (!email) {
      setError('Por favor ingresa tu email');
      return;
    }

    try {
      setError('');
      setLoading(true);
      const supabase = getSupabaseClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: loginRedirect,
        }
      });

      if (authError) throw authError;
      setSent(true);
    } catch (error: unknown) {
      console.error(error);
      setError(error instanceof Error ? error.message : 'Error al enviar enlace');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    const loginRedirect = `${window.location.origin}${basePath}/login`;

    try {
      setError('');
      setLoading(true);
      const supabase = getSupabaseClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // Volvemos siempre a la pantalla de login para procesar el callback PKCE
          redirectTo: loginRedirect,
        },
      });

      if (authError) throw authError;
    } catch (error: unknown) {
      console.error(error);
      setError(error instanceof Error ? error.message : 'Error al iniciar sesión con Google');
      setLoading(false);
    }
  }

  if (processingOAuth) {
    return (
      <main className="relative flex min-h-screen items-center justify-center px-4 py-16 text-text-primary">
        <div className="glass-card w-full max-w-md space-y-4 p-6 text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          <h1 className="text-2xl font-semibold">Completando inicio de sesión...</h1>
          <p className="text-sm text-text-secondary">Estamos procesando tu autenticación con Google.</p>
        </div>
      </main>
    );
  }

  if (sent) {
    return (
      <main className="relative flex min-h-screen items-center justify-center px-4 py-16 text-text-primary">
        <div className="glass-card w-full max-w-md space-y-4 p-6 text-center">
          <div className="text-5xl">📧</div>
          <h1 className="text-2xl font-semibold text-text-primary">¡Revisa tu correo!</h1>
          <p className="text-sm text-text-secondary">
            Hemos enviado {mode === 'signup' ? 'un enlace de confirmación' : 'un enlace mágico'} a{' '}
            <strong>{email}</strong>
          </p>
          <p className="text-sm text-text-secondary">
            {mode === 'signup'
              ? 'Haz clic en el enlace del email para confirmar tu cuenta.'
              : 'Haz clic en el enlace del email para acceder a tu cuenta.'}
            <br />El enlace es válido por 1 hora.
          </p>
          <button
            className="btn-secondary justify-center"
            onClick={() => {
              setSent(false);
              setEmail('');
              setPassword('');
            }}
            type="button"
          >
            Volver
          </button>
        </div>
      </main>
    );
  }

  const modeDescriptions: Record<AuthMode, string> = {
    login: 'Inicia sesión en tu cuenta para continuar con tus grupos y gastos.',
    signup: 'Crea tu cuenta y empieza a compartir gastos con tu equipo.',
    'magic-link': 'Te enviaremos un enlace mágico para que accedas sin contraseña.',
  };

  const tabOptions: { value: AuthMode; label: string }[] = [
    { value: 'login', label: 'Iniciar sesión' },
    { value: 'signup', label: 'Registrarse' },
    { value: 'magic-link', label: 'Enlace mágico' },
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
              className={`flex-1 rounded-full px-4 py-2 transition ${
                mode === option.value
                  ? 'bg-white/80 text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              onClick={() => {
                setMode(option.value);
                setError('');
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

          {mode !== 'magic-link' ? (
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
                    setError('');
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
                    setError('');
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

              {error && (
                <div className="glass-danger px-4 py-3 text-sm text-danger">
                  {error}
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
          ) : (
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
                    setError('');
                  }}
                  onKeyDown={(event) => event.key === 'Enter' && handleMagicLink()}
                  type="email"
                  required
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="glass-danger px-4 py-3 text-sm text-danger">
                  {error}
                </div>
              )}

              <button
                className="btn-primary w-full disabled:pointer-events-none disabled:opacity-60"
                onClick={handleMagicLink}
                disabled={loading}
                type="button"
              >
                {loading ? 'Enviando...' : 'Enviar enlace mágico'}
              </button>

              <div className="text-center text-xs text-text-secondary">
                Te enviaremos un enlace mágico para acceder sin contraseña.
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
