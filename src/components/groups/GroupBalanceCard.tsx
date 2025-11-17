import { useMemo, useState } from 'react';
import type { GroupMember, GroupExpense } from '@/lib/groups';
import type { getGroupBalance } from '@/lib/balance';
import { GroupTotalsModal } from '@/components/groups/GroupTotalsModal';

function formatCurrency(minor: number, currency: string) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
  }).format(minor / 100);
}

function describeBalance(minor: number, currency: string) {
  if (minor > 0) return `Te deben ${formatCurrency(minor, currency)}`;
  if (minor < 0) return `Debes ${formatCurrency(Math.abs(minor), currency)}`;
  return 'Todo en orden ✨';
}

type GroupBalanceCardProps = {
  groupName: string;
  baseCurrency: string;
  expenses: GroupExpense[];
  members: GroupMember[];
  balance: Awaited<ReturnType<typeof getGroupBalance>>;
  currentUserId?: string;
  onSimplify: () => Promise<void> | void;
  simplifyLoading?: boolean;
  onSettleRequest?: (payload: {
    fromUserId: string;
    toUserId: string;
    amountCents: number;
    fromName: string;
    toName: string;
  }) => void;
  settlementLoading?: boolean;
};

export function GroupBalanceCard({
  groupName,
  baseCurrency,
  expenses,
  members,
  balance,
  currentUserId,
  onSimplify,
  simplifyLoading = false,
  onSettleRequest,
  settlementLoading = false,
}: GroupBalanceCardProps) {
  const [totalsOpen, setTotalsOpen] = useState(false);

  const {
    totalGroupSpendMinor,
    totalUserPaidMinor,
    totalUserShareMinor,
    userNetMinor,
    memberSnapshots,
  } = useMemo(() => {
    const totalGroupSpendMinor = expenses.reduce((sum, expense) => {
      const baseAmount = expense.amountBaseMinor ?? expense.amountMinor;
      return sum + baseAmount;
    }, 0);

    const balanceByUser = new Map(
      balance.balances.map((entry) => [entry.userId, entry] as const),
    );

    const totalUserPaidMinor = currentUserId
      ? balanceByUser.get(currentUserId)?.totalPaidCents ?? 0
      : 0;
    const totalUserShareMinor = currentUserId
      ? balanceByUser.get(currentUserId)?.totalOwedCents ?? 0
      : 0;
    const userNetMinor = currentUserId
      ? balanceByUser.get(currentUserId)?.netBalanceCents ?? 0
      : 0;

    const memberSnapshots = members.map((member) => {
      const identity = member.displayName ?? member.email ?? 'Integrante';
      const metrics = balanceByUser.get(member.userId);
      return {
        userId: member.userId,
        name: identity,
        netMinor: metrics?.netBalanceCents ?? 0,
        paidMinor: metrics?.totalPaidCents ?? 0,
        shareMinor: metrics?.totalOwedCents ?? 0,
      };
    });

    return {
      totalGroupSpendMinor,
      totalUserPaidMinor,
      totalUserShareMinor,
      userNetMinor,
      memberSnapshots,
    };
  }, [balance.balances, currentUserId, expenses, members]);

  const debtRelations = useMemo(() => {
    if (balance.transfers.length === 0) {
      return [] as Array<{
        fromUserId: string;
        toUserId: string;
        amountCents: number;
        fromName: string;
        toName: string;
      }>;
    }
    const nameMap = new Map<string, string>();
    members.forEach((member) => {
      nameMap.set(member.userId, member.displayName ?? member.email ?? 'Integrante');
    });
    return balance.transfers.map((tx) => ({
      fromUserId: tx.fromUserId,
      toUserId: tx.toUserId,
      amountCents: tx.amountCents,
      fromName: nameMap.get(tx.fromUserId) ?? 'Alguien',
      toName: nameMap.get(tx.toUserId) ?? 'Alguien',
    }));
  }, [balance.transfers, members]);

  const memberBalances = useMemo(() => {
    const nameMap = new Map<string, string>();
    members.forEach((member) => {
      nameMap.set(member.userId, member.displayName ?? member.email ?? 'Integrante');
    });
    return balance.balances.map((entry) => {
      const tone = entry.netBalanceCents > 0 ? 'text-success' : entry.netBalanceCents < 0 ? 'text-danger' : 'text-text-secondary';
      return {
        id: entry.userId,
        tone,
        label: nameMap.get(entry.userId) ?? 'Integrante',
        net: entry.netBalanceCents,
      };
    });
  }, [balance.balances, members]);

  const handleSimplify = () => {
    if (simplifyLoading) return;
    void onSimplify();
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Balance del grupo</h3>
          <p className="text-xs text-text-secondary">
            Resumen financiero de {groupName} usando la vista balance y simplificación automática.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setTotalsOpen(true)}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-text-primary/80 transition hover:border-white/40 hover:text-text-primary"
          >
            Totales
          </button>
          <button
            type="button"
            onClick={handleSimplify}
            disabled={simplifyLoading}
            className="rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-5 py-2 text-xs font-semibold text-text-primary shadow-lg shadow-purple-500/30 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {simplifyLoading ? 'Simplificando...' : 'Simplificar deudas'}
          </button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <article className="glass-card p-4 shadow-inner shadow-black/30">
          <p className="text-xs uppercase tracking-[0.25em] text-text-secondary">Gasto total del grupo</p>
          <p className="mt-2 text-lg font-semibold text-text-primary">{formatCurrency(totalGroupSpendMinor, baseCurrency)}</p>
        </article>
        <article className="glass-card p-4 shadow-inner shadow-black/30">
          <p className="text-xs uppercase tracking-[0.25em] text-text-secondary">Has pagado</p>
          <p className="mt-2 text-lg font-semibold text-text-primary">{formatCurrency(totalUserPaidMinor, baseCurrency)}</p>
        </article>
        <article className="glass-card p-4 shadow-inner shadow-black/30">
          <p className="text-xs uppercase tracking-[0.25em] text-text-secondary">Tu parte</p>
          <p className="mt-2 text-lg font-semibold text-text-primary">{formatCurrency(totalUserShareMinor, baseCurrency)}</p>
        </article>
        <article className="glass-card p-4 shadow-inner shadow-black/30">
          <p className="text-xs uppercase tracking-[0.25em] text-text-secondary">Saldo neto</p>
          <p className="mt-2 text-lg font-semibold text-text-primary">{describeBalance(userNetMinor, baseCurrency)}</p>
        </article>
      </div>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-text-primary">Relaciones de deuda</h4>
        {debtRelations.length > 0 ? (
          <ul className="space-y-2 text-sm text-text-secondary">
            {debtRelations.map((relation) => {
              const relationLabel = `${relation.fromName} debe ${formatCurrency(relation.amountCents, baseCurrency)} a ${relation.toName}`;
              const userInvolved = currentUserId && (currentUserId === relation.fromUserId || currentUserId === relation.toUserId);
              return (
                <li
                  key={`${relation.fromUserId}-${relation.toUserId}`}
                  className="flex flex-wrap items-center justify-between gap-3 glass-card px-4 py-3"
                >
                  <span>{relationLabel}</span>
                  {userInvolved && onSettleRequest && (
                    <button
                      type="button"
                      onClick={() =>
                        onSettleRequest?.({
                          fromUserId: relation.fromUserId,
                          toUserId: relation.toUserId,
                          amountCents: relation.amountCents,
                          fromName: relation.fromName,
                          toName: relation.toName,
                        })
                      }
                      disabled={settlementLoading}
                      className="rounded-full border border-white/20 px-4 py-1 text-xs font-semibold text-text-primary/80 transition hover:border-white/40 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Liquidar
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-success/80">En este grupo, todo está en orden ✨</p>
        )}
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-text-primary">Saldo por miembro</h4>
        {memberBalances.length === 0 ? (
          <p className="text-sm text-text-secondary">Todavía no hay movimientos registrados.</p>
        ) : (
          <ul className="space-y-2 text-sm text-text-secondary">
            {memberBalances.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between glass-card px-4 py-3">
                <span className="font-semibold text-text-primary">{entry.label}</span>
                <span className={`text-xs font-semibold ${entry.tone}`}>{describeBalance(entry.net, baseCurrency)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <GroupTotalsModal
        isOpen={totalsOpen}
        onClose={() => setTotalsOpen(false)}
        currency={baseCurrency}
        totals={{
          totalGroupSpendMinor,
          totalUserPaidMinor,
          totalUserShareMinor,
          userNetMinor,
        }}
        memberSnapshots={memberSnapshots}
      />
    </div>
  );
}
