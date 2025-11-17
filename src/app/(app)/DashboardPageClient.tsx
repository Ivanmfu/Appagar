'use client';

import { useAuth } from '@/components/AuthGate';
import {
  fetchUserDebtRelations,
  fetchUserGroups,
  GroupSummary,
  UserDebtRelation,
} from '@/lib/groups';
import { settleGroupDebt } from '@/lib/settlements';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';

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

function describeBalance(minor: number, currency: string) {
  if (minor > 0) {
    return `Te deben ${formatCurrency(minor, currency)}`;
  }
  if (minor < 0) {
    return `Debes ${formatCurrency(Math.abs(minor), currency)}`;
  }
  return 'Todo en orden ✨';
}

export default function DashboardPageClient() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showIncomingModal, setShowIncomingModal] = useState(false);
  const [showOutgoingModal, setShowOutgoingModal] = useState(false);
  const [pendingSettlement, setPendingSettlement] = useState<UserDebtRelation | null>(null);

  const groupsQuery = useQuery({
    queryKey: ['groups', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return [] as GroupSummary[];
      return fetchUserGroups(user.id);
    },
  });

  const debtRelationsQuery = useQuery({
    queryKey: ['debt-relations', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return [] as UserDebtRelation[];
      return fetchUserDebtRelations(user.id);
    },
    staleTime: 15_000,
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

  const isEverythingSettled = globalBalance.positive === 0 && globalBalance.negative === 0;

  const incomingRelations = useMemo(
    () => (debtRelationsQuery.data ?? []).filter((relation) => relation.direction === 'incoming'),
    [debtRelationsQuery.data],
  );

  const outgoingRelations = useMemo(
    () => (debtRelationsQuery.data ?? []).filter((relation) => relation.direction === 'outgoing'),
    [debtRelationsQuery.data],
  );

  const settlementMutation = useMutation({
    mutationFn: async ({
      groupId,
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
        groupId,
        fromUserId,
        toUserId,
        amountMinor: amountCents,
      }),
    onSuccess: async (_result, variables) => {
      setPendingSettlement(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['debt-relations', user?.id] }),
        queryClient.invalidateQueries({ queryKey: ['groups', user?.id] }),
        queryClient.invalidateQueries({ queryKey: ['group-detail', variables.groupId] }),
      ]);
    },
  });

  const closeIncomingModal = () => {
    if (settlementMutation.isPending) return;
    setShowIncomingModal(false);
  };

  const closeOutgoingModal = () => {
    if (settlementMutation.isPending) return;
    setShowOutgoingModal(false);
  };

  return (
    <div className="space-y-6">
      <section className={`${CARD_CLASS} grid gap-6 md:grid-cols-[3fr,2fr]`}>
        <div className="space-y-5">
          <header className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-text-secondary">Resumen general</p>
            <h2 className="text-xl font-semibold text-text-primary">Hola de nuevo</h2>
            <p className="text-sm text-text-secondary">
              Consulta cómo van tus cuentas globales antes de moverte por los grupos o registrar un nuevo gasto.
            </p>
          </header>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setShowIncomingModal(true)}
              className="glass-success p-4 text-left transition hover:-translate-y-[1px] hover:shadow-md"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-success/70">Te deben</p>
              <p className="mt-2 text-3xl font-semibold text-success">
                {formatCurrency(globalBalance.positive, baseCurrency)}
              </p>
              <p className="text-xs text-success/60">Suma de saldos a tu favor</p>
            </button>
            <button
              type="button"
              onClick={() => setShowOutgoingModal(true)}
              className="glass-danger p-4 text-left transition hover:-translate-y-[1px] hover:shadow-md"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-danger/70">Debes</p>
              <p className="mt-2 text-3xl font-semibold text-danger">
                {formatCurrency(globalBalance.negative, baseCurrency)}
              </p>
              <p className="text-xs text-danger/60">Importe pendiente de liquidar</p>
            </button>
            {isEverythingSettled && (
              <div className="glass-card sm:col-span-2 p-4 text-sm font-medium text-text-primary">
                Todo en orden ✨
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
            <Link className="text-primary underline-offset-2 hover:text-primary-hover hover:underline" href="/grupos">
              Ver todos los grupos
            </Link>
            <Link className="text-primary underline-offset-2 hover:text-primary-hover hover:underline" href="/actividad">
              Revisar actividad reciente
            </Link>
          </div>
        </div>
        <dl className="grid gap-4 text-sm text-text-secondary">
          <div className="glass-primary p-4">
            <dt className="text-xs uppercase tracking-[0.25em] text-primary/70">Grupos</dt>
            <dd className="mt-2 text-3xl font-semibold text-primary">{groupsQuery.data?.length ?? 0}</dd>
            <p className="mt-1 text-xs text-primary/60">Activos en tu cuenta</p>
          </div>
        </dl>
      </section>

      <section className={`${CARD_CLASS} space-y-5`}>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Tus grupos destacados</h2>
            <p className="text-sm text-text-secondary">Accede a los más activos o crea uno nuevo.</p>
          </div>
          <Link className="text-sm font-medium text-primary underline-offset-4 hover:text-primary-hover hover:underline" href="/grupos">
            Ver todos
          </Link>
        </header>

        {groupsQuery.isLoading && <p className="text-sm text-text-secondary">Cargando grupos...</p>}
        {groupsQuery.error && (
          <p className="text-sm text-danger">
            {(groupsQuery.error as Error).message ?? 'No se pudieron cargar los grupos'}
          </p>
        )}

        {highlightedGroups.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {highlightedGroups.map((group) => {
              const balanceCopy = describeBalance(group.userNetBalanceMinor, group.baseCurrency);
              const balanceTone =
                group.userNetBalanceMinor > 0
                  ? 'text-success'
                  : group.userNetBalanceMinor < 0
                    ? 'text-danger'
                    : 'text-text-secondary';
              return (
                <Link
                  key={group.id}
                  className="glass-card group p-5 transition hover:-translate-y-[1px] hover:shadow-md"
                  href={`/grupos/detalle?id=${group.id}`}
                >
                  <header className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-text-primary">{group.name}</h3>
                    <span className="text-xs text-text-secondary">{group.memberCount} miembros</span>
                  </header>
                  <div className="mt-3 space-y-1 text-xs text-text-secondary">
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
            <div className="rounded-2xl border border-dashed border-border-subtle bg-muted-bg/30 p-6 text-center text-sm text-text-secondary">
              Aún no perteneces a ningún grupo. Usa el botón flotante para registrar tu primer gasto una vez que formes uno.
            </div>
          )
        )}
      </section>

      {showIncomingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4 py-10 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={settlementMutation.isPending ? undefined : closeIncomingModal}
          />
          <div className="relative z-10 w-full max-w-2xl">
            <div className="space-y-5 glass-card p-6 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">Personas que te deben</h2>
                  <p className="text-sm text-text-secondary">
                    Revisa cuánto deberías recibir en cada grupo y registra la liquidación cuando llegue el pago.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={closeIncomingModal}
                  disabled={settlementMutation.isPending}
                >
                  Cerrar
                </button>
              </div>
              {debtRelationsQuery.isLoading ? (
                <p className="text-sm text-text-secondary">Cargando movimientos...</p>
              ) : debtRelationsQuery.error ? (
                <p className="text-sm text-danger">
                  {(debtRelationsQuery.error as Error).message ?? 'No se pudieron obtener las deudas.'}
                </p>
              ) : incomingRelations.length > 0 ? (
                <ul className="space-y-3 text-sm text-text-primary">
                  {incomingRelations.map((relation) => (
                    <li
                      key={`${relation.groupId}-${relation.fromUserId}-${relation.toUserId}`}
                      className="glass-card flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{relation.counterpartyName}</p>
                        <p className="text-xs text-text-secondary">Grupo: {relation.groupName}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-sm font-semibold text-success">
                          {formatCurrency(relation.amountCents, relation.baseCurrency)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPendingSettlement(relation)}
                          disabled={settlementMutation.isPending}
                          className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Liquidar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-secondary">No hay saldos pendientes a tu favor.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showOutgoingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4 py-10 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={settlementMutation.isPending ? undefined : closeOutgoingModal}
          />
          <div className="relative z-10 w-full max-w-2xl">
            <div className="space-y-5 glass-card p-6 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">Personas a las que debes</h2>
                  <p className="text-sm text-text-secondary">
                    Mira los importes pendientes y marca la liquidación cuando hagas el pago correspondiente.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={closeOutgoingModal}
                  disabled={settlementMutation.isPending}
                >
                  Cerrar
                </button>
              </div>
              {debtRelationsQuery.isLoading ? (
                <p className="text-sm text-text-secondary">Cargando movimientos...</p>
              ) : debtRelationsQuery.error ? (
                <p className="text-sm text-danger">
                  {(debtRelationsQuery.error as Error).message ?? 'No se pudieron obtener las deudas.'}
                </p>
              ) : outgoingRelations.length > 0 ? (
                <ul className="space-y-3 text-sm text-text-primary">
                  {outgoingRelations.map((relation) => (
                    <li
                      key={`${relation.groupId}-${relation.fromUserId}-${relation.toUserId}`}
                      className="glass-card flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{relation.counterpartyName}</p>
                        <p className="text-xs text-text-secondary">Grupo: {relation.groupName}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-sm font-semibold text-danger">
                          {formatCurrency(relation.amountCents, relation.baseCurrency)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPendingSettlement(relation)}
                          disabled={settlementMutation.isPending}
                          className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Liquidar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-secondary">No tienes deudas pendientes ahora mismo.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {pendingSettlement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4 py-10 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={settlementMutation.isPending ? undefined : () => setPendingSettlement(null)}
          />
          <div className="relative z-10 w-full max-w-lg">
            <div className="space-y-5 glass-card p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-text-primary">¿Registrar liquidación?</h2>
              <p className="text-sm text-text-secondary">
                {pendingSettlement.fromUserId === user?.id
                  ? `Confirmarás que pagas ${formatCurrency(pendingSettlement.amountCents, pendingSettlement.baseCurrency)} a ${pendingSettlement.toName} en el grupo ${pendingSettlement.groupName}.`
                  : `Confirmarás que recibes ${formatCurrency(pendingSettlement.amountCents, pendingSettlement.baseCurrency)} de ${pendingSettlement.fromName} en el grupo ${pendingSettlement.groupName}.`}
              </p>
              {settlementMutation.error && (
                <p className="text-sm text-danger">
                  {(settlementMutation.error as Error).message ?? 'No se pudo registrar la liquidación.'}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => setPendingSettlement(null)}
                  disabled={settlementMutation.isPending}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="bg-success hover:bg-success/90 px-5 py-2 text-sm font-semibold text-white rounded-full shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() =>
                    settlementMutation.mutate({
                      groupId: pendingSettlement.groupId,
                      fromUserId: pendingSettlement.fromUserId,
                      toUserId: pendingSettlement.toUserId,
                      amountCents: pendingSettlement.amountCents,
                    })
                  }
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
