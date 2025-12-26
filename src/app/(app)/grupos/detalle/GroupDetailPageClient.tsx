'use client';

import { useAuth } from '@/components/AuthGate';
import { GroupBalanceCard } from '@/components/groups/GroupBalanceCard';
import { ExpenseList } from '@/components/groups/ExpenseList';
import { EditExpenseModal } from '@/components/groups/EditExpenseModal';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// Tipos locales
type GroupExpenseParticipant = {
  userId: string;
  shareMinor: number;
  displayName: string | null;
  email: string | null;
};

type GroupExpense = {
  id: string;
  groupId: string;
  payerId: string;
  payerName: string | null;
  amountMinor: number;
  amountBaseMinor: number;
  currency: string;
  date: string | null;
  note: string | null;
  createdAt: string | null;
  category: string | null;
  participants: GroupExpenseParticipant[];
};

type GroupMember = {
  userId: string;
  displayName: string | null;
  email: string | null;
  joinedAt: string | null;
  role: string | null;
  isActive: boolean;
};

type GroupDetail = {
  group: {
    id: string;
    name: string;
    base_currency: string;
    created_by: string | null;
    created_at: string;
    group_type: string | null;
    start_date: string | null;
    end_date: string | null;
    description: string | null;
  };
  members: GroupMember[];
  expenses: GroupExpense[];
  invites: unknown[];
  balances: {
    balances: {
      userId: string;
      netBalanceCents: number;
      totalPaidCents: number;
      totalOwedCents: number;
      settlementsPaidCents: number;
      settlementsReceivedCents: number;
    }[];
    transfers: { fromUserId: string; toUserId: string; amountCents: number }[];
  };
};

// Funciones de API
async function fetchGroupDetail(groupId: string): Promise<GroupDetail> {
  const res = await fetch(`/api/groups/${groupId}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Error al cargar grupo');
  }
  return res.json();
}

async function settleGroupDebt(params: {
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
}): Promise<void> {
  const res = await fetch('/api/settlements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Error al registrar liquidación');
}

async function simplifyGroupDebts(groupId: string): Promise<void> {
  // TODO: Implementar API para simplificar deudas
  console.log('Simplificar deudas para grupo:', groupId);
}

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

type SettlementMutationInput = {
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amountCents: number;
};

export default function GroupDetailPageClient() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [groupId, setGroupId] = useState<string | null>(null);
  const [expenseToEdit, setExpenseToEdit] = useState<GroupExpense | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
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
    mutationFn: (targetGroupId: string) => simplifyGroupDebts(targetGroupId),
    onSuccess: async () => {
      if (!groupId) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['group-detail', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['group-balance', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['groups', user?.id] }),
      ]);
    },
  });

  const settlementMutation = useMutation({
    mutationFn: ({
      groupId: targetGroupId,
      fromUserId,
      toUserId,
      amountCents,
    }: SettlementMutationInput) =>
      settleGroupDebt({
        groupId: targetGroupId,
        fromUserId,
        toUserId,
        amountMinor: amountCents,
      }),
    onSuccess: async () => {
      setPendingSettlement(null);
      if (!groupId) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['group-detail', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['group-balance', groupId] }),
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

  const handleSimplify = useCallback(() => {
    if (!groupId || simplifyMutation.isPending) return;
    simplifyMutation.mutate(groupId);
  }, [groupId, simplifyMutation]);

  const handleExpenseSelect = useCallback((expense: GroupExpense) => {
    setExpenseToEdit(expense);
    setIsEditOpen(true);
  }, []);

  const closeExpenseEditor = useCallback(() => {
    setIsEditOpen(false);
    setExpenseToEdit(null);
  }, []);

  const creatorDisplayName = useMemo(() => {
    const detail = detailQuery.data;
    if (!detail) return null;
    const owner = detail.members.find((member) => member.userId === detail.group.created_by);
    return owner?.displayName ?? owner?.email ?? detail.group.created_by;
  }, [detailQuery.data]);

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

  const currentUserId = user?.id ?? null;
  const movementCount = detail.expenses.length;
  const activeMembersCount = detail.members.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          className="inline-flex items-center gap-2 text-sm text-primary underline-offset-2 hover:text-text-primary hover:underline"
          href="/grupos"
        >
          ← Volver a mis grupos
        </Link>
        <Link
          aria-label="Configurar grupo"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-white/60 text-lg shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          href={`/grupos/configuracion?id=${detail.group.id}`}
        >
          ⚙️
        </Link>
      </div>

      <section className={`${CARD_CLASS} space-y-4`}>
        <header className="space-y-1">
          <h2 className="text-2xl font-semibold text-text-primary">{detail.group.name}</h2>
          <p className="text-sm text-text-secondary">
            Base {detail.group.base_currency} · {detail.members.length} miembros · Creado {formatDate(detail.group.created_at)}
          </p>
        </header>
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

      <EditExpenseModal
        baseCurrency={detail.group.base_currency}
        expense={expenseToEdit}
        groupId={detail.group.id}
        isOpen={isEditOpen && Boolean(expenseToEdit)}
        members={detail.members}
        onClose={closeExpenseEditor}
      />

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
