/**
 * Database query layer for Neon PostgreSQL
 * Provides high-level functions to replace Supabase client calls
 */

import { query, queryOne } from '@/lib/db';
import { Logger } from '@/lib/logger';

// ============================================================================
// USER OPERATIONS
// ============================================================================

export type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  image: string | null;
  created_at: string;
};

export async function getUserById(userId: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    'SELECT id, email, display_name, image, created_at FROM users WHERE id = $1',
    [userId]
  );
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    'SELECT id, email, display_name, image, created_at FROM users WHERE email = $1',
    [email.toLowerCase()]
  );
}

export async function getUsersByIds(userIds: string[]): Promise<UserRow[]> {
  if (userIds.length === 0) return [];
  const placeholders = userIds.map((_, i) => `$${i + 1}`).join(', ');
  return query<UserRow>(
    `SELECT id, email, display_name, image, created_at FROM users WHERE id IN (${placeholders})`,
    userIds
  );
}

// ============================================================================
// GROUP OPERATIONS
// ============================================================================

export type GroupRow = {
  id: string;
  name: string;
  base_currency: string;
  created_by: string;
  created_at: string | null;
  group_type: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
};

export async function getGroupById(groupId: string): Promise<GroupRow | null> {
  return queryOne<GroupRow>(
    'SELECT * FROM groups WHERE id = $1',
    [groupId]
  );
}

export async function getGroupsByIds(groupIds: string[]): Promise<GroupRow[]> {
  if (groupIds.length === 0) return [];
  const placeholders = groupIds.map((_, i) => `$${i + 1}`).join(', ');
  return query<GroupRow>(
    `SELECT * FROM groups WHERE id IN (${placeholders})`,
    groupIds
  );
}

export async function createGroup(data: {
  name: string;
  baseCurrency: string;
  createdBy: string;
  groupType?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}): Promise<GroupRow> {
  const rows = await query<GroupRow>(
    `INSERT INTO groups (name, base_currency, created_by, group_type, start_date, end_date, description, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     RETURNING *`,
    [
      data.name,
      data.baseCurrency,
      data.createdBy,
      data.groupType ?? null,
      data.startDate ?? null,
      data.endDate ?? null,
      data.description ?? null,
    ]
  );
  if (!rows[0]) throw new Error('Failed to create group');
  return rows[0];
}

// ============================================================================
// GROUP MEMBER OPERATIONS
// ============================================================================

export type GroupMemberRow = {
  id: string;
  group_id: string;
  user_id: string;
  is_active: boolean;
  role: string | null;
  joined_at: string | null;
};

export async function getGroupMembersByGroupId(groupId: string): Promise<GroupMemberRow[]> {
  return query<GroupMemberRow>(
    'SELECT * FROM group_members WHERE group_id = $1 AND is_active = true',
    [groupId]
  );
}

export async function getGroupMembersByUserId(userId: string): Promise<GroupMemberRow[]> {
  return query<GroupMemberRow>(
    'SELECT * FROM group_members WHERE user_id = $1 AND is_active = true',
    [userId]
  );
}

export async function isGroupMember(groupId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    'SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2 AND is_active = true',
    [groupId, userId]
  );
  return row !== null;
}

export async function isGroupOwner(groupId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    'SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2 AND role = $3 AND is_active = true',
    [groupId, userId, 'owner']
  );
  return row !== null;
}

export async function addGroupMember(data: {
  groupId: string;
  userId: string;
  role?: string;
}): Promise<GroupMemberRow> {
  const rows = await query<GroupMemberRow>(
    `INSERT INTO group_members (group_id, user_id, role, is_active, joined_at)
     VALUES ($1, $2, $3, true, NOW())
     ON CONFLICT (group_id, user_id) DO UPDATE SET is_active = true, role = COALESCE($3, group_members.role)
     RETURNING *`,
    [data.groupId, data.userId, data.role ?? 'member']
  );
  if (!rows[0]) throw new Error('Failed to add group member');
  return rows[0];
}

// ============================================================================
// EXPENSE OPERATIONS
// ============================================================================

export type ExpenseRow = {
  id: string;
  group_id: string;
  payer_id: string;
  created_by: string;
  amount_minor: number;
  currency: string;
  fx_rate: number;
  amount_base_minor: number;
  category: string | null;
  note: string | null;
  date: string | null;
  created_at: string | null;
};

export async function getExpensesByGroupId(groupId: string): Promise<ExpenseRow[]> {
  return query<ExpenseRow>(
    'SELECT * FROM expenses WHERE group_id = $1 ORDER BY date DESC, created_at DESC',
    [groupId]
  );
}

export async function getExpenseById(expenseId: string): Promise<ExpenseRow | null> {
  return queryOne<ExpenseRow>(
    'SELECT * FROM expenses WHERE id = $1',
    [expenseId]
  );
}

export async function createExpense(data: {
  groupId: string;
  payerId: string;
  createdBy: string;
  amountMinor: number;
  currency: string;
  fxRate?: number;
  amountBaseMinor: number;
  category?: string;
  note?: string;
  date?: string;
}): Promise<ExpenseRow> {
  const rows = await query<ExpenseRow>(
    `INSERT INTO expenses (group_id, payer_id, created_by, amount_minor, currency, fx_rate, amount_base_minor, category, note, date, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     RETURNING *`,
    [
      data.groupId,
      data.payerId,
      data.createdBy,
      data.amountMinor,
      data.currency,
      data.fxRate ?? 1,
      data.amountBaseMinor,
      data.category ?? null,
      data.note ?? null,
      data.date ?? null,
    ]
  );
  if (!rows[0]) throw new Error('Failed to create expense');
  return rows[0];
}

export async function deleteExpense(expenseId: string): Promise<void> {
  await query('DELETE FROM expenses WHERE id = $1', [expenseId]);
}

// ============================================================================
// EXPENSE PARTICIPANT OPERATIONS
// ============================================================================

export type ExpenseParticipantRow = {
  id: string;
  expense_id: string;
  user_id: string;
  share_minor: number;
  is_included: boolean;
};

export async function getExpenseParticipants(expenseId: string): Promise<ExpenseParticipantRow[]> {
  return query<ExpenseParticipantRow>(
    'SELECT * FROM expense_participants WHERE expense_id = $1',
    [expenseId]
  );
}

export async function getExpenseParticipantsByExpenseIds(expenseIds: string[]): Promise<ExpenseParticipantRow[]> {
  if (expenseIds.length === 0) return [];
  const placeholders = expenseIds.map((_, i) => `$${i + 1}`).join(', ');
  return query<ExpenseParticipantRow>(
    `SELECT * FROM expense_participants WHERE expense_id IN (${placeholders})`,
    expenseIds
  );
}

export async function setExpenseParticipants(
  expenseId: string,
  participants: { userId: string; shareMinor: number }[]
): Promise<void> {
  // Delete existing
  await query('DELETE FROM expense_participants WHERE expense_id = $1', [expenseId]);
  
  // Insert new
  if (participants.length === 0) return;
  
  const values = participants.map((p, i) => 
    `($1, $${i * 2 + 2}, $${i * 2 + 3}, true)`
  ).join(', ');
  
  const params: unknown[] = [expenseId];
  participants.forEach(p => {
    params.push(p.userId, p.shareMinor);
  });
  
  await query(
    `INSERT INTO expense_participants (expense_id, user_id, share_minor, is_included)
     VALUES ${values}`,
    params
  );
}

// ============================================================================
// SETTLEMENT OPERATIONS
// ============================================================================

export type SettlementRow = {
  id: string;
  group_id: string | null;
  from_user_id: string;
  to_user_id: string;
  amount_minor: number;
  created_at: string | null;
  settled_at: string | null;
};

export async function getSettlementsByGroupId(groupId: string): Promise<SettlementRow[]> {
  return query<SettlementRow>(
    'SELECT * FROM settlements WHERE group_id = $1 ORDER BY created_at DESC',
    [groupId]
  );
}

export async function createSettlement(data: {
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
}): Promise<SettlementRow> {
  const rows = await query<SettlementRow>(
    `INSERT INTO settlements (group_id, from_user_id, to_user_id, amount_minor, created_at, settled_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     RETURNING *`,
    [data.groupId, data.fromUserId, data.toUserId, data.amountMinor]
  );
  if (!rows[0]) throw new Error('Failed to create settlement');
  return rows[0];
}

// ============================================================================
// GROUP INVITE OPERATIONS
// ============================================================================

export type GroupInviteRow = {
  id: string;
  group_id: string;
  email: string;
  token: string;
  status: string;
  expires_at: string | null;
  created_at: string | null;
  created_by: string;
  sender_id: string | null;
  receiver_email: string | null;
  receiver_id: string | null;
};

export async function getGroupInvitesByGroupId(groupId: string): Promise<GroupInviteRow[]> {
  return query<GroupInviteRow>(
    "SELECT * FROM group_invites WHERE group_id = $1 AND status = 'pending' ORDER BY created_at DESC",
    [groupId]
  );
}

export async function getGroupInviteByToken(token: string): Promise<GroupInviteRow | null> {
  return queryOne<GroupInviteRow>(
    'SELECT * FROM group_invites WHERE token = $1',
    [token]
  );
}

export async function getPendingInvitesByEmail(email: string): Promise<GroupInviteRow[]> {
  return query<GroupInviteRow>(
    "SELECT * FROM group_invites WHERE (email = $1 OR receiver_email = $1) AND status = 'pending'",
    [email.toLowerCase()]
  );
}

export async function createGroupInvite(data: {
  groupId: string;
  email: string;
  token: string;
  createdBy: string;
  senderId?: string;
  expiresAt?: string;
}): Promise<GroupInviteRow> {
  const rows = await query<GroupInviteRow>(
    `INSERT INTO group_invites (group_id, email, token, status, created_by, sender_id, receiver_email, expires_at, created_at)
     VALUES ($1, $2, $3, 'pending', $4, $5, $2, $6, NOW())
     RETURNING *`,
    [
      data.groupId,
      data.email.toLowerCase(),
      data.token,
      data.createdBy,
      data.senderId ?? data.createdBy,
      data.expiresAt ?? null,
    ]
  );
  if (!rows[0]) throw new Error('Failed to create invite');
  return rows[0];
}

export async function updateGroupInviteStatus(inviteId: string, status: string): Promise<void> {
  await query(
    'UPDATE group_invites SET status = $1 WHERE id = $2',
    [status, inviteId]
  );
}

// ============================================================================
// ACTIVITY OPERATIONS
// ============================================================================

export type ActivityEventRow = {
  id: string;
  group_id: string | null;
  actor_id: string | null;
  action: string;
  payload: Record<string, unknown> | null;
  created_at: string | null;
};

export async function getActivityByGroupIds(groupIds: string[], limit = 60): Promise<ActivityEventRow[]> {
  if (groupIds.length === 0) return [];
  const placeholders = groupIds.map((_, i) => `$${i + 1}`).join(', ');
  return query<ActivityEventRow>(
    `SELECT * FROM activity_events WHERE group_id IN (${placeholders}) ORDER BY created_at DESC LIMIT $${groupIds.length + 1}`,
    [...groupIds, limit]
  );
}

export async function logActivityEvent(data: {
  groupId?: string | null;
  actorId: string;
  action: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO activity_events (group_id, actor_id, action, payload, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        data.groupId ?? null,
        data.actorId,
        data.action,
        data.payload ? JSON.stringify(data.payload) : null,
      ]
    );
  } catch (error) {
    Logger.warn('Activity', 'Failed to log activity', { error });
  }
}
