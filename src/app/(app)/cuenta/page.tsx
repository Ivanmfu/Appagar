'use client';

import { useAuth } from '@/components/AuthGate';
import { useMutation } from '@tanstack/react-query';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';

// Función para actualizar perfil via API
async function updateProfile(data: { displayName?: string; email?: string; password?: string }) {
  const res = await fetch('/api/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Error al actualizar perfil');
  }
  return res.json();
}

const CARD_CLASS = 'glass-card p-6';

type Feedback = { status: 'success' | 'error'; message: string } | null;

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    if ('error_description' in error && typeof (error as { error_description?: unknown }).error_description === 'string') {
      return (error as { error_description?: string }).error_description ?? fallback;
    }
    if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
      return (error as { message?: string }).message ?? fallback;
    }
  }
  return fallback;
}

function StatusMessage({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  const tone = feedback.status === 'success' ? 'text-success' : 'text-danger';
  return (
    <p aria-live="polite" className={`text-xs font-medium ${tone}`}>
      {feedback.message}
    </p>
  );
}

export default function AccountPage() {
  const { profile, user, refresh } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nameFeedback, setNameFeedback] = useState<Feedback>(null);
  const [emailFeedback, setEmailFeedback] = useState<Feedback>(null);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null);

  useEffect(() => {
    setDisplayName(profile?.display_name ?? '');
  }, [profile?.display_name]);

  useEffect(() => {
    setEmailInput(profile?.email ?? user?.email ?? '');
  }, [profile?.email, user?.email]);

  const currentEmail = profile?.email ?? user?.email ?? '';
  const normalizedCurrentEmail = currentEmail ? currentEmail.trim().toLowerCase() : '';
  const normalizedEmailInput = emailInput ? emailInput.trim().toLowerCase() : '';
  const nameCandidate = displayName.trim();
  const originalName = profile?.display_name?.trim() ?? '';
  const isNameDirty = nameCandidate !== originalName;
  const canSubmitName = isNameDirty && (nameCandidate.length > 0 || originalName.length > 0);
  const emailDirty = normalizedEmailInput !== normalizedCurrentEmail;
  const validEmail = normalizedEmailInput.length > 3 && normalizedEmailInput.includes('@');
  const canSubmitEmail = emailDirty && validEmail;
  const passwordValid = password.length >= 8 && password === confirmPassword;

  const updateNameMutation = useMutation({
    mutationFn: async (nextDisplayName: string) => {
      if (!user?.id) {
        throw new Error('Necesitas iniciar sesión para actualizar tu nombre.');
      }
      const value = nextDisplayName.trim();
      return updateProfile({ displayName: value || undefined });
    },
    onSuccess: async (_, variables) => {
      setDisplayName(variables);
      setNameFeedback({ status: 'success', message: 'Tu nombre se ha actualizado correctamente.' });
      await refresh();
    },
    onError: (error: unknown) => {
      setNameFeedback({
        status: 'error',
        message: getErrorMessage(error, 'No se pudo actualizar tu nombre.'),
      });
    },
  });

  const updateEmailMutation = useMutation({
    mutationFn: async (nextEmail: string) => {
      if (!user?.id) {
        throw new Error('Necesitas iniciar sesión para actualizar tu correo.');
      }
      const value = nextEmail.trim().toLowerCase();
      await updateProfile({ email: value });
      return { requiresConfirmation: value !== normalizedCurrentEmail } as const;
    },
    onSuccess: async ({ requiresConfirmation }, variables) => {
      setEmailInput(variables);
      await refresh();
      setEmailFeedback({
        status: 'success',
        message: requiresConfirmation
          ? 'Tu correo se ha actualizado correctamente.'
          : 'Tu correo se ha actualizado correctamente.',
      });
    },
    onError: (error: unknown) => {
      setEmailFeedback({
        status: 'error',
        message: getErrorMessage(error, 'No se pudo actualizar tu correo.'),
      });
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: async (nextPassword: string) => {
      if (!user?.id) {
        throw new Error('Necesitas iniciar sesión para actualizar tu contraseña.');
      }
      return updateProfile({ password: nextPassword });
    },
    onSuccess: async () => {
      setPassword('');
      setConfirmPassword('');
      setPasswordFeedback({
        status: 'success',
        message: 'Tu contraseña se ha actualizado. La próxima vez que inicies sesión necesitarás la nueva.',
      });
      await refresh();
    },
    onError: (error: unknown) => {
      setPasswordFeedback({
        status: 'error',
        message: getErrorMessage(error, 'No se pudo actualizar tu contraseña.'),
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await signOut({ redirect: false });
    },
    onSuccess: () => {
      refresh();
      router.push('/login');
    },
  });

  function handleNameSubmit(event: FormEvent) {
    event.preventDefault();
    setNameFeedback(null);
    if (!canSubmitName) return;
    updateNameMutation.mutate(nameCandidate);
  }

  function handleEmailSubmit(event: FormEvent) {
    event.preventDefault();
    setEmailFeedback(null);
    if (!canSubmitEmail) return;
    updateEmailMutation.mutate(normalizedEmailInput);
  }

  function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setPasswordFeedback(null);
    if (!passwordValid) return;
    updatePasswordMutation.mutate(password);
  }

  return (
    <div className="space-y-6">
      <section className={`${CARD_CLASS} space-y-4`}>
        <h2 className="text-lg font-semibold text-text-primary">Información de la cuenta</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="glass-card p-4">
            <dt className="text-xs uppercase tracking-[0.25em] text-text-secondary">Nombre</dt>
            <dd className="mt-2 text-sm text-text-primary/90">{profile?.display_name ?? '—'}</dd>
          </div>
          <div className="glass-card p-4">
            <dt className="text-xs uppercase tracking-[0.25em] text-text-secondary">Correo</dt>
            <dd className="mt-2 text-sm text-text-primary/90">{currentEmail || '—'}</dd>
          </div>
          <div className="glass-card p-4">
            <dt className="text-xs uppercase tracking-[0.25em] text-text-secondary">Identificador</dt>
            <dd className="mt-2 text-sm text-text-primary/90 break-all">{user?.id ?? '—'}</dd>
          </div>
          <div className="glass-card p-4">
            <dt className="text-xs uppercase tracking-[0.25em] text-text-secondary">Estado</dt>
            <dd className="mt-2 text-sm text-success">{user ? 'Sesión activa' : 'Sesión cerrada'}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-full border border-white/20 px-5 py-2 text-sm font-medium text-text-primary/80 transition hover:border-white/40 hover:text-text-primary"
            onClick={() => refresh()}
            type="button"
          >
            Refrescar sesión
          </button>
        </div>
      </section>

      <section className={`${CARD_CLASS} space-y-5`}>
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-text-primary">Actualizar nombre</h2>
          <p className="text-sm text-text-secondary">
            Este nombre aparecerá en los grupos y en la cabecera de la aplicación.
          </p>
        </header>
        <form className="space-y-4" onSubmit={handleNameSubmit}>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-text-secondary">Nombre para mostrar</span>
            <input
              autoComplete="name"
              className="input-field"
              maxLength={80}
              onChange={(event) => {
                setDisplayName(event.target.value);
                if (nameFeedback) {
                  setNameFeedback(null);
                }
              }}
              placeholder="Tu nombre"
              value={displayName}
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              className="btn-primary px-5 py-2 text-sm font-semibold disabled:opacity-60"
              disabled={updateNameMutation.isPending || !canSubmitName}
              type="submit"
            >
              {updateNameMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <StatusMessage feedback={nameFeedback} />
          </div>
        </form>
      </section>

      <section className={`${CARD_CLASS} space-y-5`}>
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-text-primary">Actualizar correo</h2>
          <p className="text-sm text-text-secondary">
            Usaremos este correo para notificaciones y acceso. Necesitarás confirmarlo si lo cambias.
          </p>
        </header>
        <form className="space-y-4" onSubmit={handleEmailSubmit}>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-text-secondary">Correo electrónico</span>
            <input
              autoComplete="email"
              className="input-field"
              inputMode="email"
              onChange={(event) => {
                setEmailInput(event.target.value);
                if (emailFeedback) {
                  setEmailFeedback(null);
                }
              }}
              placeholder="correo@ejemplo.com"
              type="email"
              value={emailInput}
            />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <button
              className="btn-primary px-5 py-2 text-sm font-semibold disabled:opacity-60"
              disabled={updateEmailMutation.isPending || !canSubmitEmail}
              type="submit"
            >
              {updateEmailMutation.isPending ? 'Enviando...' : 'Actualizar correo'}
            </button>
            <StatusMessage feedback={emailFeedback} />
          </div>
        </form>
      </section>

      <section className={`${CARD_CLASS} space-y-5`}>
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-text-primary">Cambiar contraseña</h2>
          <p className="text-sm text-text-secondary">
            Elige una contraseña con al menos 8 caracteres. Si la cambias, cerraremos tus otras sesiones.
          </p>
        </header>
        <form className="space-y-4" onSubmit={handlePasswordSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.15em] text-text-secondary">Nueva contraseña</span>
              <input
                autoComplete="new-password"
                className="input-field"
                minLength={8}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (passwordFeedback) {
                    setPasswordFeedback(null);
                  }
                }}
                type="password"
                value={password}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.15em] text-text-secondary">Confirmar contraseña</span>
              <input
                autoComplete="new-password"
                className="input-field"
                minLength={8}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  if (passwordFeedback) {
                    setPasswordFeedback(null);
                  }
                }}
                type="password"
                value={confirmPassword}
              />
            </label>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <button
              className="btn-primary px-5 py-2 text-sm font-semibold disabled:opacity-60"
              disabled={updatePasswordMutation.isPending || !passwordValid}
              type="submit"
            >
              {updatePasswordMutation.isPending ? 'Actualizando...' : 'Guardar contraseña'}
            </button>
            {password && confirmPassword && password !== confirmPassword && (
              <p className="text-xs font-medium text-danger">Las contraseñas no coinciden.</p>
            )}
            <StatusMessage feedback={passwordFeedback} />
          </div>
        </form>
      </section>

      <section className={`${CARD_CLASS} space-y-4 border-red-500/40 bg-red-500/10 text-red-100`}>
        <h2 className="text-lg font-semibold">Cerrar sesión</h2>
        <p className="text-sm">
          Cierra tu sesión actual en este dispositivo. Podrás volver a iniciar sesión en cualquier momento.
        </p>
        <button
          className="rounded-full bg-red-500 px-5 py-2 text-sm font-semibold text-text-primary shadow-lg shadow-red-500/30 transition hover:bg-red-400 disabled:opacity-60"
          disabled={logoutMutation.isPending}
          onClick={() => logoutMutation.mutate()}
          type="button"
        >
          {logoutMutation.isPending ? 'Cerrando...' : 'Cerrar sesión'}
        </button>
      </section>
    </div>
  );
}
