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
  settlementsPaidCents: number;
  settlementsReceivedCents: number;
  netBalanceCents: number;
};

type GroupBalanceViewRow = Database['public']['Views']['group_balance']['Row'];

type ExpenseRowLite = Pick<
  Database['public']['Tables']['expenses']['Row'],
  'id' | 'group_id' | 'payer_id' | 'amount_minor' | 'amount_base_minor'
>;

type ExpenseParticipantRowLite = Pick<
  Database['public']['Tables']['expense_participants']['Row'],
  'expense_id' | 'user_id' | 'share_minor' | 'is_included'
>;

type GroupMemberRowLite = Pick<
  Database['public']['Tables']['group_members']['Row'],
  'user_id' | 'is_active'
>;

type SettlementRowLite = Pick<
  Database['public']['Tables']['settlements']['Row'],
  'group_id' | 'from_user_id' | 'to_user_id' | 'amount_minor'
>;

type SeedData = {
  expenses?: ExpenseRowLite[];
  shares?: ExpenseParticipantRowLite[];
  members?: GroupMemberRowLite[];
  settlements?: SettlementRowLite[];
};

export function summarizeUserTotalsFromData(
  expenses: ExpenseRecord[],
  shares: ExpenseShareRecord[],
  memberIds: string[] = [],
  settlements: SettlementRowLite[] = []
): UserTotals[] {
  const totals = new Map<string, { paid: number; owed: number }>();
  const ensureEntry = (userId: string) => {
    if (!totals.has(userId)) {
      totals.set(userId, { paid: 0, owed: 0 });
    }
    return totals.get(userId)!;
  };

  const settlementTotals = new Map<string, { paid: number; received: number }>();
  const ensureSettlementEntry = (userId: string) => {
    if (!settlementTotals.has(userId)) {
      settlementTotals.set(userId, { paid: 0, received: 0 });
    }
    return settlementTotals.get(userId)!;
  };

  memberIds.forEach((memberId) => {
    if (memberId) {
      ensureEntry(memberId);
      ensureSettlementEntry(memberId);
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

  settlements.forEach((settlement) => {
    if (!settlement) return;
    const amount = settlement.amount_minor ?? 0;
    if (amount <= 0) return;
    const fromUserId = settlement.from_user_id;
    const toUserId = settlement.to_user_id;
    if (fromUserId) {
      ensureEntry(fromUserId);
      const record = ensureSettlementEntry(fromUserId);
      record.paid += amount;
    }
    if (toUserId) {
      ensureEntry(toUserId);
      const record = ensureSettlementEntry(toUserId);
      record.received += amount;
    }
  });

  return Array.from(totals.entries())
    .map(([userId, { paid, owed }]) => {
      const settlement = settlementTotals.get(userId) ?? { paid: 0, received: 0 };
      const netBalanceCents = paid - owed + settlement.paid - settlement.received;
      return {
        userId,
        totalPaidCents: paid,
        totalOwedCents: owed,
        settlementsPaidCents: settlement.paid,
        settlementsReceivedCents: settlement.received,
        netBalanceCents,
      } satisfies UserTotals;
    })
    .sort((a, b) => a.userId.localeCompare(b.userId));
}

async function computeUserTotalsFromView(groupId: string): Promise<UserTotals[] | null> {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('group_balance')
      .select(
        'user_id, total_paid_minor, total_owed_minor, settlements_paid_minor, settlements_received_minor, net_minor',
      )
      .eq('group_id', groupId);

    if (error) {
      console.warn('[Finance] group_balance view error, fallback to manual aggregation', error);
      return null;
    }

    if (!data) return [];

    const rows = data as GroupBalanceViewRow[];

    return rows
      .map((row) => ({
        userId: row.user_id,
        totalPaidCents: row.total_paid_minor ?? 0,
        totalOwedCents: row.total_owed_minor ?? 0,
        settlementsPaidCents: row.settlements_paid_minor ?? 0,
        settlementsReceivedCents: row.settlements_received_minor ?? 0,
        netBalanceCents: row.net_minor ?? 0,
      }))
      .sort((a, b) => a.userId.localeCompare(b.userId));
  } catch (viewError) {
    console.warn('[Finance] group_balance view unavailable, fallback to manual aggregation', viewError);
    return null;
  }
}

export async function computeUserTotals(groupId: string, seed?: SeedData): Promise<UserTotals[]> {
  if (!groupId) throw new Error('groupId es obligatorio');

  if (!seed) {
    const viewTotals = await computeUserTotalsFromView(groupId);
    if (viewTotals !== null) {
      return viewTotals;
    }
  }

  let supabase = seed ? null : getSupabaseClient();

  let expenseRows = seed?.expenses;
  if (!expenseRows) {
    supabase ??= getSupabaseClient();
    const { data, error } = await supabase
      .from('expenses')
      .select('id, group_id, amount_minor, amount_base_minor, payer_id')
      .eq('group_id', groupId);
    if (error) throw error;
    expenseRows = (data ?? []) as ExpenseRowLite[];
  }

  let memberRows = seed?.members;
  if (!memberRows) {
    supabase ??= getSupabaseClient();
    const { data, error } = await supabase
      .from('group_members')
      .select('user_id, is_active')
      .eq('group_id', groupId);
    if (error) throw error;
    memberRows = (data ?? []) as GroupMemberRowLite[];
  }

  const memberIds = (memberRows ?? [])
    .filter((row) => row.is_active)
    .map((row) => row.user_id)
    .filter((id): id is string => Boolean(id));

  const activeMemberIds = new Set(memberIds);

  const expenseRecords: ExpenseRecord[] = (expenseRows ?? [])
    .filter((row) => activeMemberIds.has(row.payer_id))
    .map((row) => ({
      id: row.id,
      groupId: row.group_id,
      amountCents: typeof row.amount_base_minor === 'number' ? row.amount_base_minor : row.amount_minor ?? 0,
      paidByUserId: row.payer_id,
    }));

  const expenseIds = expenseRecords.map((expense) => expense.id);

  let shareRows = seed?.shares;
  if (!shareRows) {
    if (expenseIds.length > 0) {
      supabase ??= getSupabaseClient();
      const { data, error } = await supabase
        .from('expense_participants')
        .select('expense_id, user_id, share_minor, is_included')
        .in('expense_id', expenseIds);
      if (error) throw error;
      shareRows = (data ?? []) as ExpenseParticipantRowLite[];
    } else {
      shareRows = [];
    }
  }

  const shareRecords: ExpenseShareRecord[] = (shareRows ?? [])
    .filter((row) => row.is_included !== false)
    .filter((row) => activeMemberIds.has(row.user_id))
    .map((row) => ({
      expenseId: row.expense_id,
      userId: row.user_id,
      shareCents: row.share_minor ?? 0,
    }));

  let settlementRows = seed?.settlements;
  if (!settlementRows) {
    supabase ??= getSupabaseClient();
    const { data, error } = await supabase
      .from('settlements')
      .select('group_id, from_user_id, to_user_id, amount_minor')
      .eq('group_id', groupId);
    if (error) throw error;
    settlementRows = (data ?? []) as SettlementRowLite[];
  }

  const filteredSettlements = (settlementRows ?? [])
    .filter(
      (settlement) =>
        activeMemberIds.has(settlement.from_user_id ?? '') && activeMemberIds.has(settlement.to_user_id ?? ''),
    )
    .map((settlement) => ({
      ...settlement,
      from_user_id: settlement.from_user_id ?? '',
      to_user_id: settlement.to_user_id ?? '',
    }));

  return summarizeUserTotalsFromData(expenseRecords, shareRecords, memberIds, filteredSettlements);
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
    const totals = summarizeUserTotalsFromData(
      scenario.expenses,
      scenario.shares,
      Object.keys(scenario.expectedNet),
      []
    );

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
