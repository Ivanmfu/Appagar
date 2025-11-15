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
        <h3 className="text-base font-semibold">Balance del grupo</h3>
        <p className="text-xs text-gray-500">Cálculo con la vista group_balance y simplificación de deudas.</p>
      </header>

      <div className="grid gap-2 md:grid-cols-2">
        {balance.balances.length === 0 && (
          <p className="text-sm text-gray-500 col-span-full">
            No hay movimientos registrados todavía.
          </p>
        )}
        {balance.balances.map((entry) => {
          const profile = memberMap.get(entry.user_id);
          const name = profile?.displayName ?? profile?.email ?? 'Miembro';
          const amount = formatCurrency(entry.net_minor, baseCurrency);
          const positive = entry.net_minor >= 0;
          return (
            <div
              key={entry.user_id}
              className={`border rounded p-3 text-sm ${positive ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
            >
              <p className="font-medium">{name}</p>
              <p className={positive ? 'text-green-700' : 'text-red-700'}>
                {positive ? 'Recibe' : 'Debe'} {amount}
              </p>
            </div>
          );
        })}
      </div>

      {balance.transactions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Liquidaciones sugeridas</h4>
          <ul className="space-y-1 text-sm">
            {balance.transactions.map((tx, index) => {
              const from = memberMap.get(tx.from)?.displayName ?? memberMap.get(tx.from)?.email ?? 'Alguien';
              const to = memberMap.get(tx.to)?.displayName ?? memberMap.get(tx.to)?.email ?? 'Alguien';
              return (
                <li key={`${tx.from}-${tx.to}-${index}`}>
                  {from} → {to}: {formatCurrency(tx.amount, baseCurrency)}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
