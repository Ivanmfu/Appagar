'use client';

import { useAuth } from '@/components/AuthGate';
import { BalanceSummary } from '@/components/groups/BalanceSummary';
import { CreateExpenseForm } from '@/components/groups/CreateExpenseForm';
import { ExpenseList } from '@/components/groups/ExpenseList';
import { InviteMemberForm } from '@/components/groups/InviteMemberForm';
import { fetchGroupDetail } from '@/lib/groups';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo } from 'react';

type DetailPageProps = {
  searchParams?: {
    id?: string | string[];
  };
};

const CARD_CLASS = 'rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl shadow-xl shadow-black/20';

function formatDate(input?: string | null) {
  if (!input) return '—';
  try {
    return new Date(input).toLocaleDateString();
  } catch {
    return '—';
  }
}

export default function GroupDetailPage({ searchParams }: DetailPageProps) {
  const { user } = useAuth();
  const rawGroupId = searchParams?.id;
  const groupId = useMemo(() => {
    if (!rawGroupId) return null;
    return Array.isArray(rawGroupId) ? rawGroupId[0] : rawGroupId;
  }, [rawGroupId]);

  const detailQuery = useQuery({
    queryKey: ['group-detail', groupId],
    enabled: Boolean(groupId),
    queryFn: async () => {
      if (!groupId) throw new Error('Grupo no encontrado');
      return fetchGroupDetail(groupId);
    },
    staleTime: 30_000,
  });

  const pendingInvites = useMemo(() => {
    const invites = detailQuery.data?.invites ?? [];
    return invites.filter((invite) => {
      if (invite.status !== 'pending') return false;
      if (!invite.expiresAt) return true;
      return new Date(invite.expiresAt) > new Date();
    });
  }, [detailQuery.data?.invites]);

  if (!groupId) {
    return (
      <div className={CARD_CLASS}>
        <p className="text-sm text-red-300">Debes indicar un identificador de grupo válido.</p>
        <Link className="mt-4 inline-block text-sm text-indigo-200 underline-offset-2 hover:text-white hover:underline" href="/grupos">
          Volver a grupos
        </Link>
      </div>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <div className={CARD_CLASS}>
        <p className="text-sm text-slate-200/80">Cargando detalles del grupo...</p>
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <div className={`${CARD_CLASS} space-y-4`}>
        <p className="text-sm text-red-300">
          {(detailQuery.error as Error).message ?? 'No se pudieron obtener los detalles del grupo'}
        </p>
        <Link className="inline-flex items-center text-sm text-indigo-200 underline-offset-2 hover:text-white hover:underline" href="/grupos">
          Volver a grupos
        </Link>
      </div>
    );
  }

  const detail = detailQuery.data;
  if (!detail) {
    return (
      <div className={CARD_CLASS}>
        <p className="text-sm text-red-300">El grupo no existe o no tienes acceso.</p>
        <Link className="mt-4 inline-block text-sm text-indigo-200 underline-offset-2 hover:text-white hover:underline" href="/grupos">
          Volver a grupos
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link className="inline-flex items-center gap-2 text-sm text-indigo-200 underline-offset-2 hover:text-white hover:underline" href="/grupos">
        ← Volver a mis grupos
      </Link>

      <section className={`${CARD_CLASS} space-y-4`}>
        <header className="space-y-1">
          <h2 className="text-2xl font-semibold text-white">{detail.group.name}</h2>
          <p className="text-sm text-slate-200/80">
            Base {detail.group.base_currency} · {detail.members.length} miembros · Creado {formatDate(detail.group.created_at)}
          </p>
        </header>
        <div className="grid gap-3 text-xs text-slate-200/70 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/30">
            <p className="uppercase tracking-[0.2em] text-slate-300">Propietario</p>
            <p className="mt-1 text-sm text-white/90">{detail.group.created_by}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/30">
            <p className="uppercase tracking-[0.2em] text-slate-300">Movimientos</p>
            <p className="mt-1 text-sm text-white/90">{detail.expenses.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/30">
            <p className="uppercase tracking-[0.2em] text-slate-300">Invitaciones</p>
            <p className="mt-1 text-sm text-white/90">{pendingInvites.length}</p>
          </div>
        </div>
      </section>

      <section className={`${CARD_CLASS} space-y-4`}>
        <h3 className="text-lg font-semibold text-white">Miembros activos</h3>
        {detail.members.length === 0 ? (
          <p className="text-sm text-slate-200/70">Todavía no hay miembros activos en el grupo.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {detail.members.map((member) => (
              <li key={member.userId} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold text-white">{member.displayName ?? member.email ?? 'Miembro'}</p>
                {member.email && <p className="text-xs text-slate-300">{member.email}</p>}
                {member.role && <p className="text-xs text-slate-400">Rol: {member.role}</p>}
                <p className="mt-2 text-xs text-slate-400">Desde {formatDate(member.joinedAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${CARD_CLASS} space-y-4`}>
        <h3 className="text-lg font-semibold text-white">Gastos recientes</h3>
        <ExpenseList baseCurrency={detail.group.base_currency} expenses={detail.expenses} />
      </section>

      <section className={`${CARD_CLASS} space-y-4`}>
        <h3 className="text-lg font-semibold text-white">Registrar gasto</h3>
        {detail.members.length > 0 && user?.id ? (
          <CreateExpenseForm
            baseCurrency={detail.group.base_currency}
            groupId={detail.group.id}
            members={detail.members}
          />
        ) : (
          <p className="text-sm text-slate-200/70">Añade miembros antes de registrar nuevos gastos.</p>
        )}
      </section>

      <section className={`${CARD_CLASS} space-y-4`}>
        <h3 className="text-lg font-semibold text-white">Balance del grupo</h3>
        <BalanceSummary
          balance={detail.balances}
          baseCurrency={detail.group.base_currency}
          members={detail.members}
        />
      </section>

      <section className={`${CARD_CLASS} space-y-6`}>
        {user?.id ? (
          <InviteMemberForm createdBy={user.id} groupId={detail.group.id} />
        ) : (
          <p className="text-sm text-slate-200/70">Necesitas iniciar sesión para enviar invitaciones.</p>
        )}
        {pendingInvites.length > 0 && (
          <div className="space-y-3 text-sm text-slate-100">
            <h4 className="font-semibold text-white">Invitaciones pendientes</h4>
            <ul className="grid gap-3 md:grid-cols-2">
              {pendingInvites.map((invite) => (
                <li key={invite.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="font-medium text-white">{invite.email}</p>
                  <p className="text-xs text-slate-300">Expira {formatDate(invite.expiresAt)}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
