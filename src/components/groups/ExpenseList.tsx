import type { GroupExpense } from '@/lib/groups';

function formatCurrency(minor: number, currency: string) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
  }).format(minor / 100);
}

type Props = {
  expenses: GroupExpense[];
  baseCurrency: string;
};

export function ExpenseList({ expenses, baseCurrency }: Props) {
  if (expenses.length === 0) {
    return <p className="text-sm text-gray-500">No hay gastos registrados todavía.</p>;
  }

  return (
    <ul className="space-y-3">
      {expenses.map((expense) => (
        <li key={expense.id} className="border rounded-lg p-4 space-y-2">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <p className="text-sm text-gray-500">
                {expense.date ? new Date(expense.date).toLocaleDateString() : 'Sin fecha'}
              </p>
              {expense.note && <p className="font-medium">{expense.note}</p>}
            </div>
            <p className="text-base font-semibold">
              {formatCurrency(expense.amountMinor, expense.currency || baseCurrency)}
            </p>
          </div>

          <p className="text-xs text-gray-500">
            Pagado por {expense.payerName ?? 'Alguien'}
          </p>

          <div className="text-xs text-gray-500">
            <span className="font-medium">Participantes:</span>{' '}
            {expense.participants.length > 0
              ? expense.participants
                  .map((participant) => participant.displayName ?? participant.email ?? 'Miembro')
                  .join(', ')
              : '—'}
          </div>
        </li>
      ))}
    </ul>
  );
}
