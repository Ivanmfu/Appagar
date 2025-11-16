import { getSupabaseClient } from '@/lib/supabase';
import { getGroupBalance } from '@/lib/balance';
import type { Database } from '@/lib/database.types';

type GroupRow = Database['public']['Tables']['groups']['Row'];
type GroupMemberRow = Database['public']['Tables']['group_members']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type ExpenseRow = Database['public']['Tables']['expenses']['Row'];
type ExpenseParticipantRow = Database['public']['Tables']['expense_participants']['Row'];

type Nullable<T> = T | null;

export type GroupSummary = {
  id: string;
  name: string;
  baseCurrency: string;
  createdAt: Nullable<string>;
  memberCount: number;
  lastExpenseAt: Nullable<string>;
  totalSpendMinor: number;
  userNetBalanceMinor: number;
};

export type GroupMember = {
  userId: string;
  displayName: Nullable<string>;
  email: Nullable<string>;
  joinedAt: Nullable<string>;
  role: Nullable<string>;
  isActive: boolean;
};

export type GroupExpenseParticipant = {
  userId: string;
  shareMinor: number;
  displayName: Nullable<string>;
  email: Nullable<string>;
};

export type GroupExpense = {
  id: string;
  groupId: string;
  payerId: string;
  payerName: Nullable<string>;
  amountMinor: number;
  amountBaseMinor: number;
  currency: string;
  date: Nullable<string>;
  note: Nullable<string>;
  createdAt: Nullable<string>;
  category: Nullable<string>;
  participants: GroupExpenseParticipant[];
};

export type GroupInvite = {
  id: string;
  email: string;
  status: string;
  token: string;
  expiresAt: Nullable<string>;
  createdAt: Nullable<string>;
  createdBy: string;
};

export type GroupDetail = {
  group: GroupRow;
  members: GroupMember[];
  expenses: GroupExpense[];
  invites: GroupInvite[];
  balances: Awaited<ReturnType<typeof getGroupBalance>>;
};

export async function fetchUserGroups(userId: string): Promise<GroupSummary[]> {
  const supabase = getSupabaseClient();

  const { data: membershipRows, error: membershipError } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (membershipError) {
    throw membershipError;
  }

  const groupIds = (membershipRows ?? []).map((row) => row.group_id);
  if (groupIds.length === 0) {
    return [];
  }

  const [
    { data: groupRows, error: groupsError },
    { data: memberRows, error: membersError },
    { data: expenseRows, error: expensesError },
  ] = await Promise.all([
    supabase
      .from('groups')
      .select('id, name, base_currency, created_at')
      .in('id', groupIds),
    supabase
      .from('group_members')
      .select('group_id, user_id')
      .in('group_id', groupIds)
      .eq('is_active', true),
    supabase
      .from('expenses')
      .select('id, group_id, payer_id, date, created_at, amount_base_minor, amount_minor')
      .in('group_id', groupIds),
  ]);

  if (groupsError) throw groupsError;
  if (membersError) throw membersError;
  if (expensesError) throw expensesError;

  const expenseIds = (expenseRows ?? []).map((row) => row.id);

  const { data: participantRows, error: participantError } = expenseIds.length
    ? await supabase
        .from('expense_participants')
        .select('expense_id, user_id, share_minor, is_included')
        .in('expense_id', expenseIds)
    : { data: [] as ExpenseParticipantRow[], error: null };

  if (participantError) throw participantError;

  const memberCountMap = new Map<string, number>();
  (memberRows ?? []).forEach((row) => {
    memberCountMap.set(row.group_id, (memberCountMap.get(row.group_id) ?? 0) + 1);
  });

  const lastExpenseMap = new Map<string, string | null>();
  const totalSpendMap = new Map<string, number>();
  for (const expense of expenseRows ?? []) {
    const amountMinor = expense.amount_base_minor ?? expense.amount_minor ?? 0;
    if (!lastExpenseMap.has(expense.group_id)) {
      lastExpenseMap.set(expense.group_id, expense.date ?? expense.created_at ?? null);
    }
    const currentTotal = totalSpendMap.get(expense.group_id) ?? 0;
    totalSpendMap.set(expense.group_id, currentTotal + amountMinor);

    const previousLast = lastExpenseMap.get(expense.group_id);
    const candidate = expense.date ?? expense.created_at ?? null;
    if (candidate) {
      if (!previousLast) {
        lastExpenseMap.set(expense.group_id, candidate);
      } else if (new Date(candidate).getTime() > new Date(previousLast).getTime()) {
        lastExpenseMap.set(expense.group_id, candidate);
      }
    }
  }

  const perGroupUserTotals = new Map<string, Map<string, { paid: number; owed: number }>>();
  const ensureUserEntry = (groupId: string, memberId: string | null) => {
    if (!memberId) return null;
    if (!perGroupUserTotals.has(groupId)) {
      perGroupUserTotals.set(groupId, new Map());
    }
    const groupMap = perGroupUserTotals.get(groupId)!;
    if (!groupMap.has(memberId)) {
      groupMap.set(memberId, { paid: 0, owed: 0 });
    }
    return groupMap.get(memberId)!;
  };

  (groupIds ?? []).forEach((groupId) => {
    ensureUserEntry(groupId, userId) ?? undefined;
  });

  const expenseById = new Map((expenseRows ?? []).map((expense) => [expense.id, expense] as const));

  (expenseRows ?? []).forEach((expense) => {
    const amountMinor = expense.amount_base_minor ?? expense.amount_minor ?? 0;
    const paidEntry = ensureUserEntry(expense.group_id, expense.payer_id);
    if (paidEntry) {
      paidEntry.paid += amountMinor;
    }
  });

  const participantList = (participantRows ?? []) as ExpenseParticipantRow[];
  participantList.forEach((participant) => {
    if (participant.is_included === false) return;
    const expense = expenseById.get(participant.expense_id);
    if (!expense) return;
    const owedEntry = ensureUserEntry(expense.group_id, participant.user_id);
    if (owedEntry) {
      owedEntry.owed += participant.share_minor ?? 0;
    }
  });

  const userNetMap = new Map<string, number>();
  perGroupUserTotals.forEach((userTotals, groupId) => {
    const stats = userTotals.get(userId ?? '');
    if (stats) {
      userNetMap.set(groupId, stats.paid - stats.owed);
    }
  });

  return (groupRows ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    baseCurrency: group.base_currency,
    createdAt: group.created_at,
    memberCount: memberCountMap.get(group.id) ?? 0,
    lastExpenseAt: lastExpenseMap.get(group.id) ?? null,
    totalSpendMinor: totalSpendMap.get(group.id) ?? 0,
    userNetBalanceMinor: userNetMap.get(group.id) ?? 0,
  }));
}

export async function fetchGroupDetail(groupId: string): Promise<GroupDetail> {
  const supabase = getSupabaseClient();

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, name, base_currency, created_at, created_by')
    .eq('id', groupId)
    .maybeSingle();

  if (groupError) throw groupError;
  if (!group) throw new Error('El grupo no existe o no tienes acceso');

  const [membersRes, invitesRes, expensesRes] = await Promise.all([
    supabase
      .from('group_members')
      .select('user_id, joined_at, role, is_active')
      .eq('group_id', groupId),
    supabase
      .from('group_invites')
      .select('id, email, status, token, expires_at, created_at, created_by')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('expenses')
      .select('id, group_id, payer_id, amount_minor, amount_base_minor, currency, note, date, category, created_at')
      .eq('group_id', groupId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  if (membersRes.error) throw membersRes.error;
  if (invitesRes.error) throw invitesRes.error;
  if (expensesRes.error) throw expensesRes.error;

  const memberRows = (membersRes.data ?? []) as GroupMemberRow[];
  const expenseRows = (expensesRes.data ?? []) as ExpenseRow[];

  const expenseIds = expenseRows.map((row) => row.id);
  const memberUserIds = memberRows.map((row) => row.user_id);
  const payerIds = expenseRows.map((row) => row.payer_id);

  const participantRes = expenseIds.length
    ? await supabase
        .from('expense_participants')
        .select('expense_id, user_id, share_minor')
        .in('expense_id', expenseIds)
    : { data: [] as ExpenseParticipantRow[], error: null };

  if (participantRes.error) throw participantRes.error;

  const participantRows = (participantRes.data ?? []) as ExpenseParticipantRow[];
  const participantUserIds = participantRows.map((row) => row.user_id);

  const profileIds = Array.from(
    new Set([
      ...memberUserIds,
      ...payerIds,
      ...participantUserIds,
      group.created_by,
    ].filter((value): value is string => Boolean(value)))
  );

  const profilesRes = profileIds.length
    ? await supabase
        .from('profiles')
        .select('id, email, display_name')
        .in('id', profileIds)
    : { data: [] as ProfileRow[], error: null };

  if (profilesRes.error) throw profilesRes.error;

  const profileMap = new Map<string, ProfileRow>();
  (profilesRes.data ?? []).forEach((profile) => {
    profileMap.set(profile.id, profile as ProfileRow);
  });

  const members: GroupMember[] = memberRows
    .filter((row) => row.is_active)
    .map((row) => {
      const profile = profileMap.get(row.user_id) ?? null;
      return {
        userId: row.user_id,
        displayName: profile?.display_name ?? null,
        email: profile?.email ?? null,
        joinedAt: row.joined_at,
        role: row.role ?? null,
        isActive: row.is_active,
      } satisfies GroupMember;
    });

  const participantsByExpense = participantRows.reduce<Record<string, GroupExpenseParticipant[]>>((acc, row) => {
    const profile = profileMap.get(row.user_id) ?? null;
    const entry: GroupExpenseParticipant = {
      userId: row.user_id,
      shareMinor: row.share_minor,
      displayName: profile?.display_name ?? null,
      email: profile?.email ?? null,
    };
    acc[row.expense_id] = acc[row.expense_id] ? [...acc[row.expense_id], entry] : [entry];
    return acc;
  }, {});

  const expenses: GroupExpense[] = expenseRows.map((row) => {
    const payerProfile = profileMap.get(row.payer_id) ?? null;
    return {
      id: row.id,
      groupId: row.group_id,
      payerId: row.payer_id,
      payerName: payerProfile?.display_name ?? payerProfile?.email ?? null,
      amountMinor: row.amount_minor,
      amountBaseMinor: row.amount_base_minor,
      currency: row.currency,
      date: row.date ?? null,
      note: row.note ?? null,
      createdAt: row.created_at ?? null,
      category: row.category ?? null,
      participants: participantsByExpense[row.id] ?? [],
    } satisfies GroupExpense;
  });

  const invites: GroupInvite[] = (invitesRes.data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    status: row.status,
    token: row.token,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at ?? null,
    createdBy: row.created_by,
  }));

  const balances = await getGroupBalance(groupId);

  return {
    group,
    members,
    expenses,
    invites,
    balances,
  } satisfies GroupDetail;
}

export type CreateGroupInput = {
  name: string;
  userId: string;
  baseCurrency?: string;
  email?: Nullable<string>;
  displayName?: Nullable<string>;
};

export async function createGroup({
  name,
  userId,
  baseCurrency = 'EUR',
  email = null,
  displayName = null,
}: CreateGroupInput): Promise<GroupRow> {
  const supabase = getSupabaseClient();

  if (!name.trim()) {
    throw new Error('Introduce un nombre de grupo');
  }

  const profilePayload: ProfileRow = {
    id: userId,
    email,
    display_name: displayName,
    created_at: null,
  } as ProfileRow;

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'id' })
    .select('id')
    .single();

  if (profileError) {
    throw profileError;
  }

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .insert({
      name: name.trim(),
      base_currency: baseCurrency,
      created_by: userId,
    })
    .select('id, name, base_currency, created_at, created_by')
    .single();

  if (groupError) {
    throw groupError;
  }

  const { error: memberError } = await supabase
    .from('group_members')
    .insert({
      group_id: group.id,
      user_id: userId,
      is_active: true,
      role: 'owner',
    });

  if (memberError) {
    throw memberError;
  }

  return group as GroupRow;
}

export async function deleteGroup(groupId: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { data: expenseRows, error: expensesError } = await supabase
    .from('expenses')
    .select('id')
    .eq('group_id', groupId);

  if (expensesError) throw expensesError;

  const expenseIds = (expenseRows ?? []).map((row) => row.id);

  if (expenseIds.length > 0) {
    const { error: participantsError } = await supabase
      .from('expense_participants')
      .delete()
      .in('expense_id', expenseIds);

    if (participantsError) throw participantsError;
  }

  const { error: settlementsError } = await supabase
    .from('settlements')
    .delete()
    .eq('group_id', groupId);

  if (settlementsError) throw settlementsError;

  if (expenseIds.length > 0) {
    const { error: deleteExpensesError } = await supabase
      .from('expenses')
      .delete()
      .in('id', expenseIds);

    if (deleteExpensesError) throw deleteExpensesError;
  }

  const { error: invitesError } = await supabase
    .from('group_invites')
    .delete()
    .eq('group_id', groupId);

  if (invitesError) throw invitesError;

  const { error: membersError } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId);

  if (membersError) throw membersError;

  const { error: groupError } = await supabase
    .from('groups')
    .delete()
    .eq('id', groupId);

  if (groupError) throw groupError;
}
