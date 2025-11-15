import { getSupabaseClient } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import { simplifyDebts, type SimplifiedTransfer, type UserBalance } from '@/lib/money';

export type ExpenseShare = {
  userId: string;
  shareCents: number;
};

export type ComputeSharesInput = {
  amountCents: number;
  paidByUserId: string;
  shares: ExpenseShare[];
};

export function computeShares({ amountCents, paidByUserId, shares }: ComputeSharesInput): ExpenseShare[] {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error('El importe del gasto debe ser un entero positivo en céntimos.');
  }

  if (!paidByUserId) {
    throw new Error('El gasto debe tener un usuario pagador.');
  }

  if (!Array.isArray(shares) || shares.length === 0) {
    throw new Error('Debes proporcionar al menos una participación para el gasto.');
  }

  const sanitizedShares = shares.map((share) => {
    if (!share.userId) {
      throw new Error('Cada participación debe incluir un usuario.');
    }
    if (!Number.isInteger(share.shareCents) || share.shareCents < 0) {
      throw new Error('Cada participación debe ser un entero positivo en céntimos.');
    }
    return {
      userId: share.userId,
      shareCents: share.shareCents,
    } satisfies ExpenseShare;
  });

  const hasPayerShare = sanitizedShares.some((share) => share.userId === paidByUserId);
  if (!hasPayerShare) {
    throw new Error('El usuario que paga el gasto debe aparecer en las participaciones.');
  }

  const shareSum = sanitizedShares.reduce((total, share) => total + share.shareCents, 0);
  if (shareSum !== amountCents) {
    throw new Error('La suma de las participaciones no coincide con el importe total del gasto.');
  }

  return sanitizedShares;
}

export type ExpenseRecord = {
  id: string;
  groupId: string;
  amountCents: number;
  paidByUserId: string;
};

export type ExpenseShareRecord = {
  expenseId: string;
  userId: string;
  shareCents: number;
};

export type UserTotals = {
  userId: string;
  totalPaidCents: number;
  totalOwedCents: number;
  netBalanceCents: number;
};

type SeedData = {
  expenses?: Database['public']['Tables']['expenses']['Row'][];
  shares?: Database['public']['Tables']['expense_participants']['Row'][];
  members?: Database['public']['Tables']['group_members']['Row'][];
};

export function summarizeUserTotalsFromData(
  expenses: ExpenseRecord[],
  shares: ExpenseShareRecord[],
  memberIds: string[] = []
): UserTotals[] {
  const totals = new Map<string, { paid: number; owed: number }>();
  const ensureEntry = (userId: string) => {
    if (!totals.has(userId)) {
      totals.set(userId, { paid: 0, owed: 0 });
    }
    return totals.get(userId)!;
  };

  memberIds.forEach((memberId) => {
    if (memberId) {
      ensureEntry(memberId);
    }
  });

  const expenseById = new Map(expenses.map((expense) => [expense.id, expense] as const));

  expenses.forEach((expense) => {
    if (!expense.paidByUserId) return;
    const entry = ensureEntry(expense.paidByUserId);
    entry.paid += expense.amountCents;
  });

  shares.forEach((share) => {
    if (!share.userId) return;
    if (!Number.isInteger(share.shareCents) || share.shareCents < 0) return;
    const expense = expenseById.get(share.expenseId);
    if (!expense) return;
    const entry = ensureEntry(share.userId);
    entry.owed += share.shareCents;
  });

  return Array.from(totals.entries())
    .map(([userId, { paid, owed }]) => ({
      userId,
      totalPaidCents: paid,
      totalOwedCents: owed,
      netBalanceCents: paid - owed,
    }))
    .sort((a, b) => a.userId.localeCompare(b.userId));
}

export async function computeUserTotals(groupId: string, seed?: SeedData): Promise<UserTotals[]> {
  if (!groupId) throw new Error('groupId es obligatorio');

  const supabase = getSupabaseClient();

  let expenseRows = seed?.expenses;
  if (!expenseRows) {
    const { data, error } = await supabase
      .from('expenses')
      .select('id, group_id, amount_minor, amount_base_minor, payer_id, currency, fx_rate, category, note, date, created_at')
      .eq('group_id', groupId);
    if (error) throw error;
    expenseRows = (data ?? []) as Database['public']['Tables']['expenses']['Row'][];
  }

  const expenseRecords: ExpenseRecord[] = (expenseRows ?? []).map((row) => ({
    id: row.id,
    groupId: row.group_id,
    amountCents: typeof row.amount_base_minor === 'number' ? row.amount_base_minor : row.amount_minor ?? 0,
    paidByUserId: row.payer_id,
  }));

  const expenseIds = expenseRecords.map((expense) => expense.id);

  let shareRows = seed?.shares;
  if (!shareRows) {
    if (expenseIds.length > 0) {
      const { data, error } = await supabase
        .from('expense_participants')
        .select('id, expense_id, user_id, share_minor, is_included')
        .in('expense_id', expenseIds);
      if (error) throw error;
      shareRows = (data ?? []) as Database['public']['Tables']['expense_participants']['Row'][];
    } else {
      shareRows = [];
    }
  }

  const shareRecords: ExpenseShareRecord[] = (shareRows ?? [])
    .filter((row) => row.is_included !== false)
    .map((row) => ({
      expenseId: row.expense_id,
      userId: row.user_id,
      shareCents: row.share_minor ?? 0,
    }));

  let memberRows = seed?.members;
  if (!memberRows) {
    const { data, error } = await supabase
      .from('group_members')
      .select('id, group_id, user_id, is_active, role, joined_at')
      .eq('group_id', groupId);
    if (error) throw error;
    memberRows = (data ?? []) as Database['public']['Tables']['group_members']['Row'][];
  }

  const memberIds = (memberRows ?? [])
    .filter((row) => row.is_active)
    .map((row) => row.user_id)
    .filter((id): id is string => Boolean(id));

  return summarizeUserTotalsFromData(expenseRecords, shareRecords, memberIds);
}

export async function computeNetBalances(groupId: string, seed?: SeedData): Promise<UserBalance[]> {
  const totals = await computeUserTotals(groupId, seed);
  return totals.map(({ userId, netBalanceCents }) => ({ userId, netBalanceCents }));
}

export async function computeDebtSettlements(groupId: string, seed?: SeedData): Promise<SimplifiedTransfer[]> {
  const balances = await computeNetBalances(groupId, seed);
  return simplifyDebts(balances);
}

export function computeDebtSettlementsFromBalances(balances: UserBalance[]): SimplifiedTransfer[] {
  return simplifyDebts(balances);
}

let assertionsExecuted = false;

function runFinanceAssertions() {
  if (assertionsExecuted) return;
  assertionsExecuted = true;

  const assert = (condition: boolean, message: string) => {
    if (!condition) {
      throw new Error(message);
    }
  };

  type Scenario = {
    name: string;
    expenses: ExpenseRecord[];
    shares: ExpenseShareRecord[];
    expectedNet: Record<string, number>;
    expectedTransfers: SimplifiedTransfer[];
  };

  const scenarios: Scenario[] = [
    {
      name: 'Test 1 - 2 users, 1 expense',
      expenses: [
        { id: 'e1', groupId: 'g', amountCents: 2000, paidByUserId: 'ivan' },
      ],
      shares: computeShares({
        amountCents: 2000,
        paidByUserId: 'ivan',
        shares: [
          { userId: 'ivan', shareCents: 1000 },
          { userId: 'ana', shareCents: 1000 },
        ],
      }).map((share) => ({ expenseId: 'e1', userId: share.userId, shareCents: share.shareCents })),
      expectedNet: {
        ivan: 1000,
        ana: -1000,
      },
      expectedTransfers: [
        { fromUserId: 'ana', toUserId: 'ivan', amountCents: 1000 },
      ],
    },
    {
      name: 'Test 2 - 3 users, 1 expense',
      expenses: [
        { id: 'e2', groupId: 'g', amountCents: 3000, paidByUserId: 'ivan' },
      ],
      shares: computeShares({
        amountCents: 3000,
        paidByUserId: 'ivan',
        shares: [
          { userId: 'ivan', shareCents: 1000 },
          { userId: 'ana', shareCents: 1000 },
          { userId: 'luis', shareCents: 1000 },
        ],
      }).map((share) => ({ expenseId: 'e2', userId: share.userId, shareCents: share.shareCents })),
      expectedNet: {
        ivan: 2000,
        ana: -1000,
        luis: -1000,
      },
      expectedTransfers: [
        { fromUserId: 'ana', toUserId: 'ivan', amountCents: 1000 },
        { fromUserId: 'luis', toUserId: 'ivan', amountCents: 1000 },
      ],
    },
    {
      name: 'Test 3 - cross expenses',
      expenses: [
        { id: 'e3', groupId: 'g', amountCents: 2000, paidByUserId: 'ivan' },
        { id: 'e4', groupId: 'g', amountCents: 1000, paidByUserId: 'ana' },
      ],
      shares: [
        ...computeShares({
          amountCents: 2000,
          paidByUserId: 'ivan',
          shares: [
            { userId: 'ivan', shareCents: 1000 },
            { userId: 'ana', shareCents: 1000 },
          ],
        }).map((share) => ({ expenseId: 'e3', userId: share.userId, shareCents: share.shareCents })),
        ...computeShares({
          amountCents: 1000,
          paidByUserId: 'ana',
          shares: [
            { userId: 'ivan', shareCents: 500 },
            { userId: 'ana', shareCents: 500 },
          ],
        }).map((share) => ({ expenseId: 'e4', userId: share.userId, shareCents: share.shareCents })),
      ],
      expectedNet: {
        ivan: 500,
        ana: -500,
      },
      expectedTransfers: [
        { fromUserId: 'ana', toUserId: 'ivan', amountCents: 500 },
      ],
    },
  ];

  scenarios.forEach((scenario) => {
    const totals = summarizeUserTotalsFromData(scenario.expenses, scenario.shares, Object.keys(scenario.expectedNet));

    Object.entries(scenario.expectedNet).forEach(([userId, expectedNet]) => {
      const total = totals.find((entry) => entry.userId === userId);
      assert(Boolean(total), `${scenario.name}: falta el usuario ${userId}`);
      assert(total!.netBalanceCents === expectedNet, `${scenario.name}: saldo incorrecto para ${userId}`);
    });

    const transfers = simplifyDebts(totals.map(({ userId, netBalanceCents }) => ({ userId, netBalanceCents })));
    assert(transfers.length === scenario.expectedTransfers.length, `${scenario.name}: número de transferencias inesperado`);

    scenario.expectedTransfers.forEach((expectedTransfer) => {
      const match = transfers.find(
        (tx) =>
          tx.fromUserId === expectedTransfer.fromUserId &&
          tx.toUserId === expectedTransfer.toUserId &&
          tx.amountCents === expectedTransfer.amountCents,
      );
      assert(Boolean(match), `${scenario.name}: falta la transferencia esperada ${expectedTransfer.fromUserId} -> ${expectedTransfer.toUserId}`);
    });
  });
}

if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
  try {
    runFinanceAssertions();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Finance] Validación de ejemplos falló', error);
  }
}
