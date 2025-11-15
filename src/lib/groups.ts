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

  const [{ data: groupRows, error: groupsError }, { data: memberRows, error: membersError }, { data: expenseRows, error: expensesError }] = await Promise.all([
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
      .select('group_id, date, created_at')
      .in('group_id', groupIds)
      .order('date', { ascending: false })
      .limit(groupIds.length * 5),
  ]);

  if (groupsError) throw groupsError;
  if (membersError) throw membersError;
  if (expensesError) throw expensesError;

  const memberCountMap = new Map<string, number>();
  (memberRows ?? []).forEach((row) => {
    memberCountMap.set(row.group_id, (memberCountMap.get(row.group_id) ?? 0) + 1);
  });

  const lastExpenseMap = new Map<string, string | null>();
  for (const expense of expensesError ? [] : expenseRows ?? []) {
    if (!lastExpenseMap.has(expense.group_id)) {
      lastExpenseMap.set(expense.group_id, expense.date ?? expense.created_at ?? null);
    }
  }

  return (groupRows ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    baseCurrency: group.base_currency,
    createdAt: group.created_at,
    memberCount: memberCountMap.get(group.id) ?? 0,
    lastExpenseAt: lastExpenseMap.get(group.id) ?? null,
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

  const profileIds = Array.from(new Set([...memberUserIds, ...payerIds, ...participantUserIds]));

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
