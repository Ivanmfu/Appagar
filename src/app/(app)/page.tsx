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

function formatCurrency(minor: number, currency: string) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
  }).format(minor / 100);
}

function describeBalance(minor: number, currency: string) {
  if (minor > 0) {
    return `Te deben ${formatCurrency(minor, currency)}`;
  }
  if (minor < 0) {
    return `Debes ${formatCurrency(Math.abs(minor), currency)}`;
  }
  return 'Todo en orden ✨';
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

  const baseCurrency = useMemo(() => groupsQuery.data?.[0]?.baseCurrency ?? 'EUR', [groupsQuery.data]);

  const highlightedGroups = useMemo(() => {
    const entries = groupsQuery.data ?? [];
    return [...entries]
      .sort((a, b) => {
        const aTime = a.lastExpenseAt ? new Date(a.lastExpenseAt).getTime() : 0;
        const bTime = b.lastExpenseAt ? new Date(b.lastExpenseAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 4);
  }, [groupsQuery.data]);

  const globalBalance = useMemo(() => {
    const accumulator = { positive: 0, negative: 0 };
    (groupsQuery.data ?? []).forEach((group) => {
      if (group.userNetBalanceMinor > 0) {
        accumulator.positive += group.userNetBalanceMinor;
      } else if (group.userNetBalanceMinor < 0) {
        accumulator.negative += Math.abs(group.userNetBalanceMinor);
      }
    });
    return accumulator;
  }, [groupsQuery.data]);

  const pendingInvites = invitesQuery.data ?? [];
  const isEverythingSettled = globalBalance.positive === 0 && globalBalance.negative === 0;

  return (
    <div className="space-y-6">
      <section className={`${CARD_CLASS} grid gap-6 md:grid-cols-[3fr,2fr]`}>
        <div className="space-y-5">
          <header className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-300">Resumen general</p>
            <h2 className="text-xl font-semibold text-white">Hola de nuevo</h2>
            <p className="text-sm text-slate-200/80">
              Consulta cómo van tus cuentas globales antes de moverte por los grupos o registrar un nuevo gasto.
            </p>
          </header>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 shadow-inner shadow-emerald-900/30">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">Te deben</p>
              <p className="mt-2 text-3xl font-semibold text-emerald-200">
                {formatCurrency(globalBalance.positive, baseCurrency)}
              </p>
              <p className="text-xs text-emerald-100/70">Suma de saldos a tu favor</p>
            </div>
            <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4 shadow-inner shadow-rose-900/30">
              <p className="text-xs uppercase tracking-[0.2em] text-rose-200/80">Debes</p>
              <p className="mt-2 text-3xl font-semibold text-rose-200">
                {formatCurrency(globalBalance.negative, baseCurrency)}
              </p>
              <p className="text-xs text-rose-100/70">Importe pendiente de liquidar</p>
            </div>
            {isEverythingSettled && (
              <div className="sm:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-medium text-white/90 shadow-inner shadow-black/30">
                Todo en orden ✨
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-300">
            <Link className="text-indigo-200 underline-offset-2 hover:text-white hover:underline" href="/grupos">
              Ver todos los grupos
            </Link>
            <Link className="text-indigo-200 underline-offset-2 hover:text-white hover:underline" href="/actividad">
              Revisar actividad reciente
            </Link>
          </div>
        </div>
        <dl className="grid gap-4 text-sm text-slate-200/80">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/40">
            <dt className="text-xs uppercase tracking-[0.25em] text-slate-300">Grupos</dt>
            <dd className="mt-2 text-3xl font-semibold text-white">{groupsQuery.data?.length ?? 0}</dd>
            <p className="mt-1 text-xs text-slate-300">Activos en tu cuenta</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/40">
            <dt className="text-xs uppercase tracking-[0.25em] text-slate-300">Invitaciones</dt>
            <dd className="mt-2 text-3xl font-semibold text-white">{pendingInvites.length}</dd>
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
            {highlightedGroups.map((group) => {
              const balanceCopy = describeBalance(group.userNetBalanceMinor, group.baseCurrency);
              const balanceTone =
                group.userNetBalanceMinor > 0
                  ? 'text-emerald-200'
                  : group.userNetBalanceMinor < 0
                    ? 'text-rose-200'
                    : 'text-slate-200/80';
              return (
                <Link
                  key={group.id}
                  className="group rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-white/30 hover:bg-white/10"
                  href={`/grupos/detalle?id=${group.id}`}
                >
                  <header className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-white">{group.name}</h3>
                    <span className="text-xs text-slate-200/70">{group.memberCount} miembros</span>
                  </header>
                  <div className="mt-3 space-y-1 text-xs text-slate-200/70">
                    <p>Creado {formatDate(group.createdAt)}</p>
                    <p>Último movimiento {formatDate(group.lastExpenseAt)} · Base {group.baseCurrency}</p>
                    <p>Total del grupo {formatCurrency(group.totalSpendMinor, group.baseCurrency)}</p>
                    <p className={`font-semibold ${balanceTone}`}>Balance personal: {balanceCopy}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          !groupsQuery.isLoading && (
            <div className="rounded-2xl border border-dashed border-white/20 p-6 text-center text-sm text-slate-200/70">
              Aún no perteneces a ningún grupo. Usa el botón flotante para registrar tu primer gasto una vez que formes uno.
            </div>
          )
        )}
      </section>

      {pendingInvites.length > 0 ? (
        <section className={`${CARD_CLASS} space-y-4`}>
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Invitaciones recientes</h2>
            <span className="text-xs text-slate-300">{pendingInvites.length} activas</span>
          </header>

          {invitesQuery.isLoading && <p className="text-sm text-slate-300">Buscando invitaciones...</p>}

          {!invitesQuery.isLoading && (
            <ul className="space-y-3 text-sm text-slate-100">
              {pendingInvites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-white">Invitación para {invite.email}</p>
                    <p className="text-xs text-slate-300">Expira {formatDate(invite.expiresAt)}</p>
                  </div>
                  <Link
                    className="text-xs font-semibold text-indigo-200 underline-offset-2 hover:text-white hover:underline"
                    href={`/invite?token=${invite.token}`}
                  >
                    Ver enlace
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className={`${CARD_CLASS} space-y-4`}>
          <h2 className="text-lg font-semibold text-white">Invita a tus amigos</h2>
          <p className="text-sm text-slate-200/80">
            No tienes invitaciones pendientes. Usa el botón flotante o entra en un grupo para invitar a nuevas personas y repartir gastos.
          </p>
          <div className="flex flex-wrap gap-3 text-xs text-indigo-200">
            <Link className="underline-offset-2 hover:text-white hover:underline" href="/grupos">
              Crear o abrir un grupo
            </Link>
            <Link className="underline-offset-2 hover:text-white hover:underline" href="/amigos">
              Ver personas con las que compartes gastos
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
