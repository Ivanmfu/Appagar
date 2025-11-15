'use client';

import { useAuth } from '@/components/AuthGate';
import { getSupabaseClient } from '@/lib/supabase';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

const CARD_CLASS = 'rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl shadow-xl shadow-black/20';

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
        <h2 className="text-lg font-semibold text-white">Información de la cuenta</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <dt className="text-xs uppercase tracking-[0.25em] text-slate-300">Nombre</dt>
            <dd className="mt-2 text-sm text-white/90">{profile?.display_name ?? '—'}</dd>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <dt className="text-xs uppercase tracking-[0.25em] text-slate-300">Correo</dt>
            <dd className="mt-2 text-sm text-white/90">{profile?.email ?? user?.email ?? '—'}</dd>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <dt className="text-xs uppercase tracking-[0.25em] text-slate-300">Identificador</dt>
            <dd className="mt-2 text-sm text-white/90 break-all">{user?.id ?? '—'}</dd>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <dt className="text-xs uppercase tracking-[0.25em] text-slate-300">Estado</dt>
            <dd className="mt-2 text-sm text-emerald-200">{user ? 'Sesión activa' : 'Sesión cerrada'}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-full border border-white/20 px-5 py-2 text-sm font-medium text-white/80 transition hover:border-white/40 hover:text-white"
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
          className="rounded-full bg-red-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition hover:bg-red-400 disabled:opacity-60"
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
