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
}: GroupBalanceCardProps) {
  const [totalsOpen, setTotalsOpen] = useState(false);

  const {
    totalGroupSpendMinor,
    totalUserPaidMinor,
    totalUserShareMinor,
    userNetMinor,
    memberSnapshots,
  } = useMemo(() => {
    const totals = {
      totalGroupSpendMinor: 0,
      totalUserPaidMinor: 0,
      totalUserShareMinor: 0,
      userNetMinor: 0,
      memberSnapshots: [] as {
        userId: string;
        name: string;
        netMinor: number;
        paidMinor: number;
        shareMinor: number;
      }[],
    };

    const perMember = new Map<string, { paid: number; share: number }>();

    expenses.forEach((expense) => {
      const baseAmount = expense.amountBaseMinor ?? expense.amountMinor;
      totals.totalGroupSpendMinor += baseAmount;

      const payerEntry = perMember.get(expense.payerId) ?? { paid: 0, share: 0 };
      payerEntry.paid += baseAmount;
      perMember.set(expense.payerId, payerEntry);

      if (expense.payerId === currentUserId) {
        totals.totalUserPaidMinor += baseAmount;
      }

      expense.participants.forEach((participant) => {
        const entry = perMember.get(participant.userId) ?? { paid: 0, share: 0 };
        entry.share += participant.shareMinor;
        perMember.set(participant.userId, entry);

        if (participant.userId === currentUserId) {
          totals.totalUserShareMinor += participant.shareMinor;
        }
      });
    });

    const balanceMap = new Map(balance.balances.map((entry) => [entry.user_id, entry.net_minor] as const));
    if (currentUserId) {
      totals.userNetMinor = balanceMap.get(currentUserId) ?? 0;
    }

    members.forEach((member) => {
      const identity = member.displayName ?? member.email ?? 'Integrante';
      const aggregates = perMember.get(member.userId) ?? { paid: 0, share: 0 };
      const net = balanceMap.get(member.userId) ?? 0;
      totals.memberSnapshots.push({
        userId: member.userId,
        name: identity,
        netMinor: net,
        paidMinor: aggregates.paid,
        shareMinor: aggregates.share,
      });
    });

    return totals;
  }, [balance.balances, currentUserId, expenses, members]);

  const debtRelations = useMemo(() => {
    if (balance.transactions.length === 0) {
      return [] as string[];
    }
    const nameMap = new Map<string, string>();
    members.forEach((member) => {
      nameMap.set(member.userId, member.displayName ?? member.email ?? 'Integrante');
    });
    return balance.transactions.map((tx) => {
      const from = nameMap.get(tx.from) ?? 'Alguien';
      const to = nameMap.get(tx.to) ?? 'Alguien';
      return `${from} debe ${formatCurrency(tx.amount, baseCurrency)} a ${to}`;
    });
  }, [balance.transactions, members, baseCurrency]);

  const memberBalances = useMemo(() => {
    const nameMap = new Map<string, string>();
    members.forEach((member) => {
      nameMap.set(member.userId, member.displayName ?? member.email ?? 'Integrante');
    });
    return balance.balances.map((entry) => {
      const tone = entry.net_minor > 0 ? 'text-emerald-200' : entry.net_minor < 0 ? 'text-rose-200' : 'text-slate-200/80';
      return {
        id: entry.user_id,
        tone,
        label: nameMap.get(entry.user_id) ?? 'Integrante',
        net: entry.net_minor,
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
          <h3 className="text-lg font-semibold text-white">Balance del grupo</h3>
          <p className="text-xs text-slate-200/70">
            Resumen financiero de {groupName} usando la vista balance y simplificación automática.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setTotalsOpen(true)}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/80 transition hover:border-white/40 hover:text-white"
          >
            Totales
          </button>
          <button
            type="button"
            onClick={handleSimplify}
            disabled={simplifyLoading}
            className="rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-purple-500/30 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {simplifyLoading ? 'Simplificando...' : 'Simplificar deudas'}
          </button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/30">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-300">Gasto total del grupo</p>
          <p className="mt-2 text-lg font-semibold text-white">{formatCurrency(totalGroupSpendMinor, baseCurrency)}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/30">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-300">Has pagado</p>
          <p className="mt-2 text-lg font-semibold text-white">{formatCurrency(totalUserPaidMinor, baseCurrency)}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/30">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-300">Tu parte</p>
          <p className="mt-2 text-lg font-semibold text-white">{formatCurrency(totalUserShareMinor, baseCurrency)}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/30">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-300">Saldo neto</p>
          <p className="mt-2 text-lg font-semibold text-white">{describeBalance(userNetMinor, baseCurrency)}</p>
        </article>
      </div>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-white">Relaciones de deuda</h4>
        {debtRelations.length > 0 ? (
          <ul className="space-y-2 text-sm text-slate-200/80">
            {debtRelations.map((relation, index) => (
              <li key={`${relation}-${index}`} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                {relation}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-emerald-200/80">En este grupo, todo está en orden ✨</p>
        )}
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-white">Saldo por miembro</h4>
        {memberBalances.length === 0 ? (
          <p className="text-sm text-slate-200/70">Todavía no hay movimientos registrados.</p>
        ) : (
          <ul className="space-y-2 text-sm text-slate-200/80">
            {memberBalances.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span className="font-semibold text-white">{entry.label}</span>
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
