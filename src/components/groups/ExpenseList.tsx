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
  onSelect?: (expense: GroupExpense) => void;
};

export function ExpenseList({ expenses, baseCurrency, onSelect }: Props) {
  if (expenses.length === 0) {
    return <p className="text-sm text-text-secondary">No hay gastos registrados todavía.</p>;
  }

  return (
    <ul className="space-y-3">
      {expenses.map((expense) => (
        <li key={expense.id}>
          <button
            type="button"
            className="glass-list-item w-full space-y-2 border border-white/40 bg-white/30 p-4 text-left transition hover:bg-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
            onClick={() => onSelect?.(expense)}
          >
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <p className="text-sm text-text-secondary">
                  {expense.date ? new Date(expense.date).toLocaleDateString() : 'Sin fecha'}
                </p>
                {expense.note && <p className="text-sm font-semibold text-text-primary">{expense.note}</p>}
              </div>
              <p className="text-base font-semibold text-text-primary">
                {formatCurrency(expense.amountMinor, expense.currency || baseCurrency)}
              </p>
            </div>

            <p className="text-xs text-text-secondary">
              Pagado por {expense.payerName ?? 'Alguien'}
            </p>

            <div className="text-xs text-text-secondary">
              <span className="font-semibold text-text-primary/90">Participantes:</span>{' '}
              {expense.participants.length > 0
                ? expense.participants
                    .map((participant) => participant.displayName ?? participant.email ?? 'Miembro')
                    .join(', ')
                : '—'}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
