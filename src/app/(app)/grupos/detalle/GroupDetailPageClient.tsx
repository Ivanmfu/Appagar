'use client';

import { useAuth } from '@/components/AuthGate';
import { GroupBalanceCard } from '@/components/groups/GroupBalanceCard';
import { ExpenseList } from '@/components/groups/ExpenseList';
import { InviteMemberForm } from '@/components/groups/InviteMemberForm';
import { EditExpenseModal } from '@/components/groups/EditExpenseModal';
import { deleteGroup, fetchGroupDetail } from '@/lib/groups';
import { simplifyGroupDebts } from '@/lib/balance';
import { settleGroupDebt } from '@/lib/settlements';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { GroupExpense } from '@/lib/groups';

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

type SettlementPrompt = {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  fromName: string;
  toName: string;
};

export default function GroupDetailPageClient() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [groupId, setGroupId] = useState<string | null>(null);
  const [expenseToEdit, setExpenseToEdit] = useState<GroupExpense | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingSettlement, setPendingSettlement] = useState<SettlementPrompt | null>(null);

  useEffect(() => {
    const id = searchParams?.get('id');
    if (id) {
      setGroupId(id);
    } else {
      router.replace('/grupos');
    }
  }, [searchParams, router]);

  const detailQuery = useQuery({
    queryKey: ['group-detail', groupId],
    enabled: Boolean(groupId),
    queryFn: async () => {
      if (!groupId) throw new Error('Grupo no encontrado');
      return fetchGroupDetail(groupId);
    },
    staleTime: 30_000,
  });

  const simplifyMutation = useMutation({
    mutationFn: async (targetGroupId: string) => simplifyGroupDebts(targetGroupId),
    onSuccess: async (_data, targetGroupId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['group-detail', targetGroupId] }),
        queryClient.invalidateQueries({ queryKey: ['groups', user?.id] }),
      ]);
    },
  });

  const handleSimplify = useCallback(() => {
    if (!groupId) return;
    simplifyMutation.mutate(groupId);
  }, [groupId, simplifyMutation]);

  const currentUserId = user?.id ?? null;

  const settlementMutation = useMutation({
    mutationFn: async ({
      groupId: targetGroupId,
      fromUserId,
      toUserId,
      amountCents,
    }: {
      groupId: string;
      fromUserId: string;
      toUserId: string;
      amountCents: number;
    }) =>
      settleGroupDebt({
        groupId: targetGroupId,
        fromUserId,
        toUserId,
        amountMinor: amountCents,
      }),
    onSuccess: async (_result, variables) => {
      setPendingSettlement(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['group-detail', variables.groupId] }),
        queryClient.invalidateQueries({ queryKey: ['groups', user?.id] }),
      ]);
    },
    onError: () => {
      // `pendingSettlement` se mantiene para permitir reintentar tras mostrar el error.
    },
  });

  const handleSettleRequest = useCallback(
    (payload: {
      fromUserId: string;
      toUserId: string;
      amountCents: number;
      fromName: string;
      toName: string;
    }) => {
      setPendingSettlement(payload);
    },
    []
  );

  const confirmSettlement = useCallback(() => {
    if (!groupId || !pendingSettlement) return;
    settlementMutation.mutate({
      groupId,
      fromUserId: pendingSettlement.fromUserId,
      toUserId: pendingSettlement.toUserId,
      amountCents: pendingSettlement.amountCents,
    });
  }, [groupId, pendingSettlement, settlementMutation]);

  const cancelSettlement = useCallback(() => {
    if (settlementMutation.isPending) return;
    setPendingSettlement(null);
  }, [settlementMutation]);

  const handleExpenseSelect = useCallback((expense: GroupExpense) => {
    setExpenseToEdit(expense);
    setIsEditOpen(true);
  }, []);

  const closeExpenseEditor = useCallback(() => {
    setIsEditOpen(false);
    setExpenseToEdit(null);
  }, []);

  const deleteMutation = useMutation({
    mutationFn: async (targetGroupId: string) => deleteGroup(targetGroupId),
    onSuccess: async (_data, targetGroupId) => {
      setShowDeleteConfirm(false);
      setExpenseToEdit(null);
      setIsEditOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['groups', user?.id] }),
        queryClient.invalidateQueries({ queryKey: ['group-detail', targetGroupId] }),
      ]);
      router.replace('/grupos');
    },
  });

  const creatorDisplayName = useMemo(() => {
    const detail = detailQuery.data;
    if (!detail) return null;
    const owner = detail.members.find((member) => member.userId === detail.group.created_by);
    return owner?.displayName ?? owner?.email ?? detail.group.created_by;
  }, [detailQuery.data]);

  const currentMemberRole = useMemo(() => {
    const detail = detailQuery.data;
    if (!detail || !user?.id) return null;
    return detail.members.find((member) => member.userId === user.id)?.role ?? null;
  }, [detailQuery.data, user?.id]);

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
        <p className="text-sm text-slate-200/80">Redirigiendo a tus grupos...</p>
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

  const movementCount = detail.expenses.length;
  const activeMembersCount = detail.members.length;
  const canDeleteGroup = currentMemberRole === 'owner' || user?.id === detail.group.created_by;

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
            <p className="uppercase tracking-[0.2em] text-slate-300">Creado por</p>
            <p className="mt-1 text-sm text-white/90">{creatorDisplayName}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/30">
            <p className="uppercase tracking-[0.2em] text-slate-300">Movimientos</p>
            <p className="mt-1 text-sm text-white/90">{movementCount}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/30">
            <p className="uppercase tracking-[0.2em] text-slate-300">Miembros activos</p>
            <p className="mt-1 text-sm text-white/90">{activeMembersCount}</p>
          </div>
        </div>
      </section>

      <section className={`${CARD_CLASS}`}>
        <GroupBalanceCard
          groupName={detail.group.name}
          baseCurrency={detail.group.base_currency}
          expenses={detail.expenses}
          members={detail.members}
          balance={detail.balances}
          currentUserId={currentUserId ?? undefined}
          onSimplify={handleSimplify}
          simplifyLoading={simplifyMutation.isPending}
          onSettleRequest={handleSettleRequest}
          settlementLoading={settlementMutation.isPending}
        />
        {simplifyMutation.error && (
          <p className="mt-4 text-sm text-red-300">
            {(simplifyMutation.error as Error).message ?? 'No se pudo simplificar las deudas en este momento.'}
          </p>
        )}
        {settlementMutation.error && (
          <p className="mt-4 text-sm text-red-300">
            {(settlementMutation.error as Error).message ?? 'No se pudo registrar la liquidación.'}
          </p>
        )}
      </section>

      <section className={`${CARD_CLASS} space-y-4`}>
        <h3 className="text-lg font-semibold text-white">Gastos recientes</h3>
        <ExpenseList
          baseCurrency={detail.group.base_currency}
          expenses={detail.expenses}
          onSelect={handleExpenseSelect}
        />
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

      {canDeleteGroup && (
        <section className={`${CARD_CLASS} space-y-4`}>
          <div>
            <h3 className="text-lg font-semibold text-white">Zona peligrosa</h3>
            <p className="text-sm text-slate-200/80">
              Eliminar este grupo borrará todos los gastos, participantes y liquidaciones asociadas. Esta acción no se puede deshacer.
            </p>
          </div>
          {deleteMutation.error && (
            <p className="text-sm text-red-300">
              {(deleteMutation.error as Error).message ?? 'No se pudo eliminar el grupo en este momento.'}
            </p>
          )}
          <button
            type="button"
            className="w-full rounded-full border border-red-400/40 bg-red-500/20 px-6 py-3 text-sm font-semibold text-red-200 transition hover:border-red-300 hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleteMutation.isPending}
          >
            Eliminar grupo
          </button>
        </section>
      )}

      <EditExpenseModal
        baseCurrency={detail.group.base_currency}
        expense={expenseToEdit}
        groupId={detail.group.id}
        isOpen={isEditOpen && Boolean(expenseToEdit)}
        members={detail.members}
        onClose={closeExpenseEditor}
      />

      {showDeleteConfirm && groupId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-10 backdrop-blur">
          <div className="absolute inset-0" onClick={() => (deleteMutation.isPending ? null : setShowDeleteConfirm(false))} />
          <div className="relative z-10 w-full max-w-lg">
            <div className="space-y-5 rounded-3xl border border-white/10 bg-slate-950/70 p-6 backdrop-blur-xl shadow-2xl shadow-black/30">
              <h2 className="text-xl font-semibold text-white">¿Eliminar el grupo?</h2>
              <p className="text-sm text-slate-200/80">
                Esta operación eliminará permanentemente todos los gastos, miembros y asentamientos asociados a este grupo. No podrás recuperarlos más adelante.
              </p>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleteMutation.isPending}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="rounded-full bg-red-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => deleteMutation.mutate(groupId)}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar definitivamente'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingSettlement && groupId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-10 backdrop-blur">
          <div className="absolute inset-0" onClick={settlementMutation.isPending ? undefined : cancelSettlement} />
          <div className="relative z-10 w-full max-w-lg">
            <div className="space-y-5 rounded-3xl border border-white/10 bg-slate-950/70 p-6 backdrop-blur-xl shadow-2xl shadow-black/30">
              <h2 className="text-xl font-semibold text-white">¿Registrar liquidación?</h2>
              <p className="text-sm text-slate-200/80">
                {currentUserId === pendingSettlement.fromUserId
                  ? `Confirmarás que pagas ${formatCurrency(pendingSettlement.amountCents, detail.group.base_currency)} a ${pendingSettlement.toName}.`
                  : currentUserId === pendingSettlement.toUserId
                    ? `Confirmarás que recibes ${formatCurrency(pendingSettlement.amountCents, detail.group.base_currency)} de ${pendingSettlement.fromName}.`
                    : `Registrarás que ${pendingSettlement.fromName} paga ${formatCurrency(pendingSettlement.amountCents, detail.group.base_currency)} a ${pendingSettlement.toName}.`}
              </p>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={cancelSettlement}
                  disabled={settlementMutation.isPending}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={confirmSettlement}
                  disabled={settlementMutation.isPending}
                >
                  {settlementMutation.isPending ? 'Registrando...' : 'Confirmar liquidación'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
