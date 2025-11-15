export function splitEvenlyInCents(totalCents: number, n: number): number[] {
  if (!Number.isInteger(totalCents)) {
    throw new Error('totalCents debe ser un número entero');
  }

  if (!Number.isInteger(n) || n <= 0) {
    throw new Error('n debe ser un entero positivo');
  }

  const base = Math.floor(totalCents / n);
  const resto = totalCents % n;
  const res = Array(n).fill(base);
  for (let i = 0; i < resto; i++) res[i] += 1;
  return res;
}

export type UserBalance = {
  userId: string;
  netBalanceCents: number; // positivo recibe, negativo debe
};

export type SimplifiedTransfer = {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
};

export function simplifyDebts(balances: UserBalance[]): SimplifiedTransfer[] {
  const debtors = balances
    .filter((balance) => balance.netBalanceCents < 0)
    .map((balance) => ({ userId: balance.userId, remaining: -balance.netBalanceCents }))
    .sort((a, b) => b.remaining - a.remaining);

  const creditors = balances
    .filter((balance) => balance.netBalanceCents > 0)
    .map((balance) => ({ userId: balance.userId, remaining: balance.netBalanceCents }))
    .sort((a, b) => b.remaining - a.remaining);

  const transfers: SimplifiedTransfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.remaining, creditor.remaining);

    if (amount > 0) {
      transfers.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amountCents: amount });
      debtor.remaining -= amount;
      creditor.remaining -= amount;
    }

    if (debtor.remaining === 0) i += 1;
    if (creditor.remaining === 0) j += 1;
  }

  return transfers;
}
