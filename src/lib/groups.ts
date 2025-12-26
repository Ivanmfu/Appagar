/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Legacy file with Supabase shim; type errors suppressed
import { getSupabaseClient } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { getGroupBalance } from '@/lib/balance';
import { logActivity } from '@/lib/activity';
import type { Database } from '@/lib/database.types';

type GroupRow = Database['public']['Tables']['groups']['Row'];
type GroupSummaryRow = Pick<GroupRow, 'id' | 'name' | 'base_currency' | 'created_at'>;
type GroupMemberRow = Database['public']['Tables']['group_members']['Row'];
type MemberSummaryRow = Pick<GroupMemberRow, 'group_id' | 'user_id'>;
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type ProfileSummaryRow = Pick<ProfileRow, 'id' | 'email' | 'display_name'>;
type ExpenseRow = Database['public']['Tables']['expenses']['Row'];
type ExpenseIdRow = Pick<ExpenseRow, 'id'>;
type ExpenseSummaryRow = Pick<
  ExpenseRow,
  'id' | 'group_id' | 'payer_id' | 'date' | 'created_at' | 'amount_base_minor' | 'amount_minor'
>;
type ExpenseParticipantRow = Database['public']['Tables']['expense_participants']['Row'];
type SettlementRow = Database['public']['Tables']['settlements']['Row'];
type SettlementSummaryRow = Pick<SettlementRow, 'group_id' | 'from_user_id' | 'to_user_id' | 'amount_minor'>;
type GroupInviteRow = Database['public']['Tables']['group_invites']['Row'];

type Nullable<T> = T | null;

export type GroupTypeValue = 'trip' | 'home' | 'couple' | 'other';

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
  groupId: string;
  receiverEmail: Nullable<string>;
  receiverId: Nullable<string>;
  senderId: Nullable<string>;
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

export type UserDebtRelation = {
  groupId: string;
  groupName: string;
  baseCurrency: string;
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  counterpartyId: string;
  counterpartyName: string;
  amountCents: number;
  direction: 'incoming' | 'outgoing';
};

export async function fetchUserGroups(userId: string): Promise<GroupSummary[]> {
  const supabase = getSupabaseClient();
  Logger.debug('GroupsData', 'fetchUserGroups start', { userId });

  const { data: membershipRows, error: membershipError, status: membershipStatus } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (membershipError) {
    Logger.error('GroupsData', 'Membership query failed', { membershipError, membershipStatus });
    throw membershipError;
  }

  Logger.debug('GroupsData', 'Membership query success', {
    count: (membershipRows ?? []).length,
    groupIds: (membershipRows as { group_id: string }[] ?? []).map((row) => row.group_id),
  });

  const groupIds = (membershipRows as { group_id: string }[] ?? []).map((row) => row.group_id);
  if (groupIds.length === 0) {
    return [];
  }

  const groupsPromise = supabase
    .from('groups')
    .select('id, name, base_currency, created_at')
    .in('id', groupIds);
  const membersPromise = supabase
    .from('group_members')
    .select('group_id, user_id')
    .in('group_id', groupIds)
    .eq('is_active', true);
  const expensesPromise = supabase
    .from('expenses')
    .select('id, group_id, payer_id, date, created_at, amount_base_minor, amount_minor')
    .in('group_id', groupIds);

  const [{ data: groupRows, error: groupsError }, { data: memberRows, error: membersError }, { data: expenseRows, error: expensesError }] = await Promise.all([
    groupsPromise,
    membersPromise,
    expensesPromise,
  ]);

  if (groupsError) {
    Logger.error('GroupsData', 'Groups query failed', { groupsError });
    throw groupsError;
  }
  if (membersError) {
    Logger.error('GroupsData', 'Group members query failed', { membersError });
    throw membersError;
  }
  if (expensesError) {
    Logger.error('GroupsData', 'Expenses query failed', { expensesError });
    throw expensesError;
  }

  const expenseIds = (expenseRows ?? []).map((row: ExpenseSummaryRow) => row.id);

  const { data: participantRows, error: participantError } = expenseIds.length
    ? await supabase
        .from('expense_participants')
        .select('expense_id, user_id, share_minor, is_included')
        .in('expense_id', expenseIds)
    : { data: [] as ExpenseParticipantRow[], error: null };

  if (participantError) {
    Logger.error('GroupsData', 'Participants query failed', { participantError });
    throw participantError;
  }

  const memberCountMap = new Map<string, number>();
  (memberRows ?? []).forEach((row: MemberSummaryRow) => {
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
  const perGroupSettlements = new Map<string, Map<string, { paid: number; received: number }>>();

  const ensureSettlementEntry = (groupId: string, memberId: string | null) => {
    if (!memberId) return null;
    if (!perGroupSettlements.has(groupId)) {
      perGroupSettlements.set(groupId, new Map());
    }
    const groupMap = perGroupSettlements.get(groupId)!;
    if (!groupMap.has(memberId)) {
      groupMap.set(memberId, { paid: 0, received: 0 });
    }
    return groupMap.get(memberId)!;
  };

  const ensureUserEntry = (groupId: string, memberId: string | null) => {
    if (!memberId) return null;
    if (!perGroupUserTotals.has(groupId)) {
      perGroupUserTotals.set(groupId, new Map());
    }
    const groupMap = perGroupUserTotals.get(groupId)!;
    if (!groupMap.has(memberId)) {
      groupMap.set(memberId, { paid: 0, owed: 0 });
    }
    ensureSettlementEntry(groupId, memberId);
    return groupMap.get(memberId)!;
  };

  (groupIds ?? []).forEach((groupId: string) => {
    ensureUserEntry(groupId, userId) ?? undefined;
  });

  const expenseById = new Map<string, ExpenseSummaryRow>(
    (expenseRows ?? []).map((expense: ExpenseSummaryRow) => [expense.id, expense] as const)
  );

  (expenseRows ?? []).forEach((expense: ExpenseSummaryRow) => {
    const amountMinor = expense.amount_base_minor ?? expense.amount_minor ?? 0;
    const paidEntry = ensureUserEntry(expense.group_id, expense.payer_id);
    if (paidEntry) {
      paidEntry.paid += amountMinor;
    }
  });

  const participantList = (participantRows ?? []) as ExpenseParticipantRow[];
  participantList.forEach((participant: ExpenseParticipantRow) => {
    if (participant.is_included === false) return;
    const expense = expenseById.get(participant.expense_id);
    if (!expense) return;
    const owedEntry = ensureUserEntry(expense.group_id, participant.user_id);
    if (owedEntry) {
      owedEntry.owed += participant.share_minor ?? 0;
    }
  });

  const { data: settlementRows, error: settlementError } = groupIds.length
    ? await supabase
        .from('settlements')
        .select('group_id, from_user_id, to_user_id, amount_minor')
        .in('group_id', groupIds)
    : { data: [] as SettlementSummaryRow[], error: null };

  if (settlementError) {
    Logger.error('GroupsData', 'Settlements query failed', { settlementError });
    throw settlementError;
  }

  (settlementRows ?? []).forEach((settlement: SettlementSummaryRow) => {
    if (!settlement.group_id) return;
    const amount = settlement.amount_minor ?? 0;
    if (amount <= 0) return;
    const payerEntry = ensureSettlementEntry(settlement.group_id, settlement.from_user_id);
    if (payerEntry) {
      payerEntry.paid += amount;
    }
    const receiverEntry = ensureSettlementEntry(settlement.group_id, settlement.to_user_id);
    if (receiverEntry) {
      receiverEntry.received += amount;
    }
  });

  const userNetMap = new Map<string, number>();
  perGroupUserTotals.forEach((userTotals, groupId) => {
    const stats = userTotals.get(userId ?? '');
    if (stats) {
      const settlementStats = perGroupSettlements.get(groupId)?.get(userId ?? '') ?? { paid: 0, received: 0 };
      userNetMap.set(groupId, stats.paid - stats.owed + settlementStats.paid - settlementStats.received);
    }
  });

  const result = (groupRows ?? []).map((group: GroupSummaryRow) => ({
    id: group.id,
    name: group.name,
    baseCurrency: group.base_currency,
    createdAt: group.created_at,
    memberCount: memberCountMap.get(group.id) ?? 0,
    lastExpenseAt: lastExpenseMap.get(group.id) ?? null,
    totalSpendMinor: totalSpendMap.get(group.id) ?? 0,
    userNetBalanceMinor: userNetMap.get(group.id) ?? 0,
  }));
  Logger.debug('GroupsData', 'fetchUserGroups complete', {
    count: result.length,
    ids: result.map((item: GroupSummary) => item.id),
  });
  return result;
}

export async function fetchGroupDetail(groupId: string): Promise<GroupDetail> {
  const supabase = getSupabaseClient();

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, name, base_currency, created_at, created_by, group_type, start_date, end_date, description')
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
      .select('id, group_id, email, receiver_email, receiver_id, status, token, expires_at, created_at, created_by, sender_id')
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

  const profileMap = new Map<string, ProfileSummaryRow>();
  (profilesRes.data ?? []).forEach((profile: ProfileSummaryRow) => {
    profileMap.set(profile.id, profile as ProfileSummaryRow);
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

  const invites: GroupInvite[] = (invitesRes.data ?? []).map((row: GroupInviteRow) => ({
    id: row.id,
    groupId: row.group_id,
    receiverEmail: row.receiver_email ?? row.email ?? null,
    receiverId: row.receiver_id ?? null,
    senderId: row.sender_id ?? row.created_by ?? null,
    status: row.status,
    token: row.token,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at ?? null,
    createdBy: row.created_by,
  } satisfies GroupInvite));

  const balances = await getGroupBalance(groupId);

  return {
    group,
    members,
    expenses,
    invites,
    balances,
  } satisfies GroupDetail;
}

export async function fetchUserDebtRelations(userId: string): Promise<UserDebtRelation[]> {
  if (!userId) return [];

  const supabase = getSupabaseClient();
  Logger.debug('GroupsData', 'fetchUserDebtRelations start', { userId });
  const groupSummaries = await fetchUserGroups(userId);

  if (groupSummaries.length === 0) {
    return [];
  }

  const metaByGroup = new Map(groupSummaries.map((summary) => [summary.id, summary] as const));

  const balanceResults = await Promise.all(
    groupSummaries.map(async (summary) => ({
      groupId: summary.id,
      balance: await getGroupBalance(summary.id),
    })),
  );

  const profileIds = new Set<string>();
  const rawRelations: Array<{
    groupId: string;
    fromUserId: string;
    toUserId: string;
    amountCents: number;
  }> = [];

  balanceResults.forEach(({ groupId, balance }) => {
    balance.transfers.forEach((transfer) => {
      if (transfer.fromUserId !== userId && transfer.toUserId !== userId) {
        return;
      }
      rawRelations.push({
        groupId,
        fromUserId: transfer.fromUserId,
        toUserId: transfer.toUserId,
        amountCents: transfer.amountCents,
      });
      profileIds.add(transfer.fromUserId);
      profileIds.add(transfer.toUserId);
    });
  });

  if (rawRelations.length === 0) {
    return [];
  }

  const profileRes = profileIds.size
    ? await supabase
        .from('profiles')
        .select('id, display_name, email')
        .in('id', Array.from(profileIds))
    : { data: [] as ProfileSummaryRow[], error: null };

  if (profileRes.error) {
    throw profileRes.error;
  }

  const profileMap = new Map<string, ProfileSummaryRow>();
  (profileRes.data ?? []).forEach((profile: ProfileSummaryRow) => {
    profileMap.set(profile.id, profile as ProfileSummaryRow);
  });

  const fallbackName = (profile: ProfileSummaryRow | undefined) =>
    profile?.display_name ?? profile?.email ?? 'Integrante';

  const relations = rawRelations.map((relation) => {
    const summary = metaByGroup.get(relation.groupId);

    const fromProfile = profileMap.get(relation.fromUserId);
    const toProfile = profileMap.get(relation.toUserId);
    const fromName = fallbackName(fromProfile);
    const toName = fallbackName(toProfile);

    const direction = relation.fromUserId === userId ? 'outgoing' : 'incoming';
    const counterpartyId = direction === 'outgoing' ? relation.toUserId : relation.fromUserId;
    const counterpartyName = direction === 'outgoing' ? toName : fromName;

    const rel = {
      groupId: relation.groupId,
      groupName: summary?.name ?? 'Grupo desconocido',
      baseCurrency: summary?.baseCurrency ?? 'EUR',
      fromUserId: relation.fromUserId,
      fromName,
      toUserId: relation.toUserId,
      toName,
      counterpartyId,
      counterpartyName,
      amountCents: relation.amountCents,
      direction,
    } satisfies UserDebtRelation;
    return rel;
  });
  Logger.debug('GroupsData', 'fetchUserDebtRelations complete', { count: relations.length });
  return relations;
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

  await logActivity({
    groupId: group.id,
    actorId: userId,
    action: 'group_created',
    payload: {
      groupName: group.name,
      groupId: group.id,
    },
  });

  return group as GroupRow;
}

export async function updateGroupName(groupId: string, newName: string) {
  if (!groupId) {
    throw new Error('Falta el identificador del grupo');
  }

  const normalizedName = newName.trim();
  if (!normalizedName) {
    throw new Error('Introduce un nombre para el grupo');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('groups')
    .update({ name: normalizedName })
    .eq('id', groupId)
    .select('id, name, base_currency, created_at, created_by')
    .single();

  if (error) throw error;

  return data as GroupRow;
}

export async function updateGroupDetails(groupId: string, details: {
  name: string;
  groupType: GroupTypeValue | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
}) {
  if (!groupId) {
    throw new Error('Falta el identificador del grupo');
  }

  const normalizedName = details.name.trim();
  if (!normalizedName) {
    throw new Error('Introduce un nombre para el grupo');
  }

  const supabase = getSupabaseClient();
  const payload = {
    name: normalizedName,
    group_type: details.groupType ?? null,
    start_date: details.startDate ?? null,
    end_date: details.endDate ?? null,
    description: details.description?.trim() ? details.description.trim() : null,
  } satisfies Partial<GroupRow>;

  const { data, error } = await supabase
    .from('groups')
    .update(payload)
    .eq('id', groupId)
    .select('id, name, base_currency, created_at, created_by, group_type, start_date, end_date, description')
    .single();

  if (error) throw error;

  return data as GroupRow;
}

export async function deleteGroup({ groupId, actorId }: { groupId: string; actorId: string }): Promise<void> {
  const supabase = getSupabaseClient();

  const { data: groupDetails, error: groupFetchError } = await supabase
    .from('groups')
    .select('id, name')
    .eq('id', groupId)
    .maybeSingle();

  if (groupFetchError) throw groupFetchError;

  const { data: expenseRows, error: expensesError } = await supabase
    .from('expenses')
    .select('id')
    .eq('group_id', groupId);

  if (expensesError) throw expensesError;

  const expenseIds = (expenseRows ?? []).map((row: ExpenseIdRow) => row.id);

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

  await logActivity({
    groupId,
    actorId,
    action: 'group_deleted',
    payload: {
      groupName: groupDetails?.name ?? null,
      groupId,
    },
  });

  const { error: groupError } = await supabase
    .from('groups')
    .delete()
    .eq('id', groupId);

  if (groupError) throw groupError;
}
