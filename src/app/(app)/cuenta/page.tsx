'use client';

import { useAuth } from '@/components/AuthGate';
import { getSupabaseClient } from '@/lib/supabase';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

const CARD_CLASS = 'glass-card p-6';

export default function AccountPage() {
  const { profile, user, refresh } = useAuth();
  const router = useRouter();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
    },
    onSuccess: () => {
      refresh();
      router.push('/login');
    },
  });

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
            <dd className="mt-2 text-sm text-text-primary/90">{profile?.email ?? user?.email ?? '—'}</dd>
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
