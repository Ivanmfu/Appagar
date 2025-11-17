import type { GroupMember } from '@/lib/groups';
import type { getGroupBalance } from '@/lib/balance';

function formatCurrency(minor: number, currency: string) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
  }).format(minor / 100);
}

type Props = {
  baseCurrency: string;
  members: GroupMember[];
  balance: Awaited<ReturnType<typeof getGroupBalance>>;
};

export function BalanceSummary({ baseCurrency, members, balance }: Props) {
  const memberMap = new Map(members.map((member) => [member.userId, member] as const));

  return (
    <section className="space-y-4">
      <header>
        <h3 className="text-base font-semibold text-text-primary">Balance del grupo</h3>
        <p className="text-xs text-text-secondary">Cálculo con la vista group_balance y simplificación de deudas.</p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {balance.balances.length === 0 && (
          <p className="col-span-full text-sm text-text-secondary">
            No hay movimientos registrados todavía.
          </p>
        )}
        {balance.balances.map((entry) => {
          const profile = memberMap.get(entry.userId);
          const name = profile?.displayName ?? profile?.email ?? 'Miembro';
          const amount = formatCurrency(entry.netBalanceCents, baseCurrency);
          const positive = entry.netBalanceCents >= 0;
          return (
            <div
              key={entry.userId}
              className={`glass-list-item p-4 text-sm ${
                positive ? 'border-green-200/70 bg-success-soft/70' : 'border-red-200/70 bg-danger-soft/70'
              }`}
            >
              <p className="font-medium text-text-primary">{name}</p>
              <p className={positive ? 'text-success' : 'text-danger'}>
                {positive ? 'Recibe' : 'Debe'} {amount}
              </p>
            </div>
          );
        })}
      </div>

      {balance.transfers.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-text-primary">Liquidaciones sugeridas</h4>
          <ul className="space-y-2 text-sm text-text-secondary">
            {balance.transfers.map((tx, index) => {
              const from = memberMap.get(tx.fromUserId)?.displayName ?? memberMap.get(tx.fromUserId)?.email ?? 'Alguien';
              const to = memberMap.get(tx.toUserId)?.displayName ?? memberMap.get(tx.toUserId)?.email ?? 'Alguien';
              return (
                <li key={`${tx.fromUserId}-${tx.toUserId}-${index}`} className="glass-list-item px-4 py-3">
                  <span className="font-medium text-text-primary">{from}</span> → {to}:{' '}
                  <span className="font-semibold text-primary">
                    {formatCurrency(tx.amountCents, baseCurrency)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
