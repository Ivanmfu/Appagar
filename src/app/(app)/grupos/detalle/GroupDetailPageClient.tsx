'use client';

import { useAuth } from '@/components/AuthGate';
import { GroupBalanceCard } from '@/components/groups/GroupBalanceCard';
import { ExpenseList } from '@/components/groups/ExpenseList';
import { InviteMemberForm } from '@/components/groups/InviteMemberForm';
import { EditExpenseModal } from '@/components/groups/EditExpenseModal';
import { deleteGroup, fetchGroupDetail, updateGroupName } from '@/lib/groups';
import { simplifyGroupDebts } from '@/lib/balance';
import { settleGroupDebt } from '@/lib/settlements';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { GroupExpense } from '@/lib/groups';

const CARD_CLASS = 'glass-card p-6';

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
  const [nameInput, setNameInput] = useState('');
  const [nameFeedback, setNameFeedback] = useState<{ status: 'success' | 'error'; message: string } | null>(null);

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
    mutationFn: async (targetGroupId: string) => {
      if (!user?.id) {
        throw new Error('Necesitas iniciar sesión para eliminar el grupo');
      }
      return deleteGroup({ groupId: targetGroupId, actorId: user.id });
    },
    onSuccess: async (_data, targetGroupId) => {
      setShowDeleteConfirm(false);
      setExpenseToEdit(null);
      setIsEditOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['groups', user?.id] }),
        queryClient.invalidateQueries({ queryKey: ['group-detail', targetGroupId] }),
        queryClient.invalidateQueries({ queryKey: ['activity', user?.id] }),
      ]);
      router.replace('/grupos');
    },
  });

  const updateNameMutation = useMutation({
    mutationFn: async (nextName: string) => {
      if (!groupId) {
        throw new Error('Grupo no disponible');
      }
      return updateGroupName(groupId, nextName);
    },
    onSuccess: async (updatedGroup) => {
      setNameFeedback({ status: 'success', message: 'Nombre actualizado correctamente.' });
      setNameInput(updatedGroup.name);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['group-detail', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['groups', user?.id] }),
      ]);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el nombre del grupo.';
      setNameFeedback({ status: 'error', message });
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

  useEffect(() => {
    if (detailQuery.data?.group.name) {
      setNameInput(detailQuery.data.group.name);
    }
  }, [detailQuery.data?.group.name]);

  if (!groupId) {
    return (
      <div className={CARD_CLASS}>
        <p className="text-sm text-text-secondary">Redirigiendo a tus grupos...</p>
      </div>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <div className={CARD_CLASS}>
        <p className="text-sm text-text-secondary">Cargando detalles del grupo...</p>
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <div className={`${CARD_CLASS} space-y-4`}>
        <p className="text-sm text-danger">
          {(detailQuery.error as Error).message ?? 'No se pudieron obtener los detalles del grupo'}
        </p>
        <Link className="inline-flex items-center text-sm text-primary underline-offset-2 hover:text-text-primary hover:underline" href="/grupos">
          Volver a grupos
        </Link>
      </div>
    );
  }

  const detail = detailQuery.data;
  if (!detail) {
    return (
      <div className={CARD_CLASS}>
        <p className="text-sm text-danger">El grupo no existe o no tienes acceso.</p>
        <Link className="mt-4 inline-block text-sm text-primary underline-offset-2 hover:text-text-primary hover:underline" href="/grupos">
          Volver a grupos
        </Link>
      </div>
    );
  }

  const movementCount = detail.expenses.length;
  const activeMembersCount = detail.members.length;
  const canDeleteGroup = currentMemberRole === 'owner' || user?.id === detail.group.created_by;
  const isOwner = canDeleteGroup;
  const trimmedGroupName = nameInput.trim();
  const canSubmitGroupName = isOwner && Boolean(trimmedGroupName) && trimmedGroupName !== detail.group.name;

  return (
    <div className="space-y-6">
      <Link className="inline-flex items-center gap-2 text-sm text-primary underline-offset-2 hover:text-text-primary hover:underline" href="/grupos">
        ← Volver a mis grupos
      </Link>

      <section className={`${CARD_CLASS} space-y-4`}>
        <header className="space-y-1">
          <h2 className="text-2xl font-semibold text-text-primary">{detail.group.name}</h2>
          <p className="text-sm text-text-secondary">
            Base {detail.group.base_currency} · {detail.members.length} miembros · Creado {formatDate(detail.group.created_at)}
          </p>
        </header>
        {isOwner && (
          <form
            className="space-y-3 rounded-2xl border border-white/30 bg-white/60 p-4 text-sm text-text-secondary shadow-[0_6px_18px_rgba(0,0,0,0.05)] backdrop-blur-xl"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSubmitGroupName) return;
              setNameFeedback(null);
              updateNameMutation.mutate(trimmedGroupName);
            }}
          >
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">Nombre del grupo</label>
              <input
                className="input-field"
                maxLength={120}
                onChange={(event) => {
                  setNameInput(event.target.value);
                  if (nameFeedback) {
                    setNameFeedback(null);
                  }
                }}
                value={nameInput}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="btn-primary px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                disabled={updateNameMutation.isPending || !canSubmitGroupName}
              >
                {updateNameMutation.isPending ? 'Guardando...' : 'Guardar nombre'}
              </button>
              {nameFeedback && (
                <p className={`text-xs font-medium ${nameFeedback.status === 'success' ? 'text-success' : 'text-danger'}`}>
                  {nameFeedback.message}
                </p>
              )}
            </div>
          </form>
        )}
        <div className="grid gap-3 text-xs text-text-secondary sm:grid-cols-3">
          <div className="glass-card p-4">
            <p className="uppercase tracking-[0.2em] text-text-secondary">Creado por</p>
            <p className="mt-1 text-sm text-text-primary/90">{creatorDisplayName}</p>
          </div>
          <div className="glass-card p-4">
            <p className="uppercase tracking-[0.2em] text-text-secondary">Movimientos</p>
            <p className="mt-1 text-sm text-text-primary/90">{movementCount}</p>
          </div>
          <div className="glass-card p-4">
            <p className="uppercase tracking-[0.2em] text-text-secondary">Miembros activos</p>
            <p className="mt-1 text-sm text-text-primary/90">{activeMembersCount}</p>
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
          <p className="mt-4 text-sm text-danger">
            {(simplifyMutation.error as Error).message ?? 'No se pudo simplificar las deudas en este momento.'}
          </p>
        )}
        {settlementMutation.error && (
          <p className="mt-4 text-sm text-danger">
            {(settlementMutation.error as Error).message ?? 'No se pudo registrar la liquidación.'}
          </p>
        )}
      </section>

      <section className={`${CARD_CLASS} space-y-4`}>
        <h3 className="text-lg font-semibold text-text-primary">Gastos recientes</h3>
        <ExpenseList
          baseCurrency={detail.group.base_currency}
          expenses={detail.expenses}
          onSelect={handleExpenseSelect}
        />
      </section>

      <section className={`${CARD_CLASS} space-y-4`}>
        <h3 className="text-lg font-semibold text-text-primary">Miembros activos</h3>
        {detail.members.length === 0 ? (
          <p className="text-sm text-text-secondary">Todavía no hay miembros activos en el grupo.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {detail.members.map((member) => (
              <li key={member.userId} className="glass-card p-4">
                <p className="text-sm font-semibold text-text-primary">{member.displayName ?? member.email ?? 'Miembro'}</p>
                {member.email && <p className="text-xs text-text-secondary">{member.email}</p>}
                {member.role && <p className="text-xs text-text-secondary">Rol: {member.role}</p>}
                <p className="mt-2 text-xs text-text-secondary">Desde {formatDate(member.joinedAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${CARD_CLASS} space-y-6`}>
        {user?.id ? (
          <InviteMemberForm createdBy={user.id} groupId={detail.group.id} />
        ) : (
          <p className="text-sm text-text-secondary">Necesitas iniciar sesión para enviar invitaciones.</p>
        )}
        {pendingInvites.length > 0 && (
          <div className="space-y-3 text-sm text-text-secondary">
            <h4 className="font-semibold text-text-primary">Invitaciones pendientes</h4>
            <ul className="grid gap-3 md:grid-cols-2">
              {pendingInvites.map((invite) => (
                <li key={invite.id} className="glass-card p-4">
                  <p className="font-medium text-text-primary">{invite.email}</p>
                  <p className="text-xs text-text-secondary">Expira {formatDate(invite.expiresAt)}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {canDeleteGroup && (
        <section className={`${CARD_CLASS} space-y-4`}>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Zona peligrosa</h3>
            <p className="text-sm text-text-secondary">
              Eliminar este grupo borrará todos los gastos, participantes y liquidaciones asociadas. Esta acción no se puede deshacer.
            </p>
          </div>
          {deleteMutation.error && (
            <p className="text-sm text-danger">
              {(deleteMutation.error as Error).message ?? 'No se pudo eliminar el grupo en este momento.'}
            </p>
          )}
          <button
            type="button"
            className="btn-danger w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-10">
          <div className="absolute inset-0" onClick={() => (deleteMutation.isPending ? null : setShowDeleteConfirm(false))} />
          <div className="relative z-10 w-full max-w-lg">
            <div className="space-y-5 rounded-2xl border border-white/40 bg-white/70 p-6 shadow-xl backdrop-blur-2xl max-h-[80vh] overflow-y-auto">
              <h2 className="text-xl font-semibold text-text-primary">¿Eliminar el grupo?</h2>
              <p className="text-sm text-text-secondary">
                Esta operación eliminará permanentemente todos los gastos, miembros y asentamientos asociados a este grupo. No podrás recuperarlos más adelante.
              </p>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleteMutation.isPending}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-danger disabled:cursor-not-allowed disabled:opacity-60"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-10">
          <div className="absolute inset-0" onClick={settlementMutation.isPending ? undefined : cancelSettlement} />
          <div className="relative z-10 w-full max-w-lg">
            <div className="space-y-5 rounded-2xl border border-white/40 bg-white/70 p-6 shadow-xl backdrop-blur-2xl max-h-[80vh] overflow-y-auto">
              <h2 className="text-xl font-semibold text-text-primary">¿Registrar liquidación?</h2>
              <p className="text-sm text-text-secondary">
                {currentUserId === pendingSettlement.fromUserId
                  ? `Confirmarás que pagas ${formatCurrency(pendingSettlement.amountCents, detail.group.base_currency)} a ${pendingSettlement.toName}.`
                  : currentUserId === pendingSettlement.toUserId
                    ? `Confirmarás que recibes ${formatCurrency(pendingSettlement.amountCents, detail.group.base_currency)} de ${pendingSettlement.fromName}.`
                    : `Registrarás que ${pendingSettlement.fromName} paga ${formatCurrency(pendingSettlement.amountCents, detail.group.base_currency)} a ${pendingSettlement.toName}.`}
              </p>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={cancelSettlement}
                  disabled={settlementMutation.isPending}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-success px-5 py-2 text-sm font-semibold text-white shadow-md transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
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
