'use client';

import { useAuth } from '@/components/AuthGate';
import { fetchUserGroups, GroupSummary } from '@/lib/groups';
import { fetchPendingInvitesForEmail } from '@/lib/invites';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo } from 'react';

const CARD_CLASS = 'rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl shadow-xl shadow-black/20';

function formatDate(input?: string | null) {
  if (!input) return '—';
  try {
    return new Date(input).toLocaleDateString();
  } catch {
    return '—';
  }
}

export default function DashboardPage() {
  const { user, profile } = useAuth();

  const groupsQuery = useQuery({
    queryKey: ['groups', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return [] as GroupSummary[];
      return fetchUserGroups(user.id);
    },
  });

  const invitesQuery = useQuery({
    queryKey: ['invites', profile?.email ?? user?.email],
    enabled: Boolean(profile?.email ?? user?.email),
    queryFn: async () => {
      const email = profile?.email ?? user?.email;
      if (!email) return [];
      return fetchPendingInvitesForEmail(email);
    },
  });

  const highlightedGroups = useMemo(() => {
    return (groupsQuery.data ?? []).slice(0, 4);
  }, [groupsQuery.data]);

  return (
    <div className="space-y-6">
      <section className={`${CARD_CLASS} grid gap-6 md:grid-cols-[3fr,2fr]`}>
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Bienvenido/a de nuevo</h2>
          <p className="text-sm text-slate-200/80">
            Accede rápido a tus grupos activos, revisa invitaciones pendientes o crea un nuevo espacio para coordinar gastos.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              className="rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-purple-500/30 transition hover:scale-105"
              href="/grupos"
            >
              Ir a mis grupos
            </Link>
            <Link
              className="rounded-full border border-white/20 px-5 py-2 text-sm font-medium text-white/90 transition hover:border-white/40 hover:text-white"
              href="/actividad"
            >
              Revisar actividad
            </Link>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm text-slate-200/80">
          <div className="rounded-2xl bg-white/5 p-4 shadow-inner shadow-black/40">
            <dt className="text-xs uppercase tracking-[0.25em] text-slate-300">Grupos</dt>
            <dd className="mt-2 text-3xl font-semibold text-white">{groupsQuery.data?.length ?? 0}</dd>
            <p className="mt-1 text-xs text-slate-300">Activos en tu cuenta</p>
          </div>
          <div className="rounded-2xl bg-white/5 p-4 shadow-inner shadow-black/40">
            <dt className="text-xs uppercase tracking-[0.25em] text-slate-300">Invitaciones</dt>
            <dd className="mt-2 text-3xl font-semibold text-white">{invitesQuery.data?.length ?? 0}</dd>
            <p className="mt-1 text-xs text-slate-300">Pendientes de respuesta</p>
          </div>
        </dl>
      </section>

      <section className={`${CARD_CLASS} space-y-5`}>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Tus grupos destacados</h2>
            <p className="text-sm text-slate-200/80">Accede a los más activos o crea uno nuevo.</p>
          </div>
          <Link className="text-sm font-medium text-white/80 underline-offset-4 hover:text-white hover:underline" href="/grupos">
            Ver todos
          </Link>
        </header>

        {groupsQuery.isLoading && <p className="text-sm text-slate-300">Cargando grupos...</p>}
        {groupsQuery.error && (
          <p className="text-sm text-red-300">
            {(groupsQuery.error as Error).message ?? 'No se pudieron cargar los grupos'}
          </p>
        )}

        {highlightedGroups.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {highlightedGroups.map((group) => (
                <Link
                  key={group.id}
                  className="group rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-white/30 hover:bg-white/10"
                  href={`/grupos/detalle?id=${group.id}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-white">{group.name}</h3>
                  <span className="text-xs text-slate-200/70">{group.memberCount} miembros</span>
                </div>
                <p className="mt-2 text-xs text-slate-300">Creado {formatDate(group.createdAt)}</p>
                <p className="mt-1 text-xs text-slate-200/70">
                  Último movimiento {formatDate(group.lastExpenseAt)} · Base {group.baseCurrency}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          !groupsQuery.isLoading && (
            <div className="rounded-2xl border border-dashed border-white/20 p-6 text-center text-sm text-slate-200/70">
              Aún no perteneces a ningún grupo. Usa el botón flotante para crear uno al instante.
            </div>
          )
        )}
      </section>

      <section className={`${CARD_CLASS} space-y-4`}>
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Invitaciones recientes</h2>
          <span className="text-xs text-slate-300">{invitesQuery.data?.length ?? 0} activas</span>
        </header>

        {invitesQuery.isLoading && <p className="text-sm text-slate-300">Buscando invitaciones...</p>}
        {!invitesQuery.isLoading && (invitesQuery.data?.length ?? 0) === 0 && (
          <p className="text-sm text-slate-200/70">No tienes invitaciones pendientes por ahora.</p>
        )}

        {invitesQuery.data && invitesQuery.data.length > 0 && (
          <ul className="space-y-3 text-sm text-slate-100">
            {invitesQuery.data.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-white">Invitación para {invite.email}</p>
                  <p className="text-xs text-slate-300">Expira {formatDate(invite.expiresAt)}</p>
                </div>
                <Link className="text-xs font-semibold text-indigo-200 underline-offset-2 hover:text-white hover:underline" href={`/invite?token=${invite.token}`}>
                  Ver enlace
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
