import { getSupabaseClient } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

const INVITE_EXPIRATION_HOURS = 48;

type GroupInviteRow = Database['public']['Tables']['group_invites']['Row'];
type Nullable<T> = T | null;

export type PendingInvite = {
  id: string;
  groupId: string;
  email: string;
  status: string;
  token: string;
  expiresAt: Nullable<string>;
  createdAt: Nullable<string>;
};

export type SentInvite = {
  id: string;
  groupId: string;
  groupName: string | null;
  email: string;
  status: string;
  token: string;
  expiresAt: Nullable<string>;
  createdAt: Nullable<string>;
};

export async function createGroupInvite({
  groupId,
  email,
  createdBy,
  expiresInHours = INVITE_EXPIRATION_HOURS,
}: {
  groupId: string;
  email: string;
  createdBy: string;
  expiresInHours?: number;
}): Promise<GroupInviteRow> {
  if (!email.trim()) {
    throw new Error('Introduce un email para invitar');
  }

  const supabase = getSupabaseClient();
  const normalizedEmail = email.trim().toLowerCase();
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('group_invites')
    .insert({
      group_id: groupId,
      email: normalizedEmail,
      token,
      status: 'pending',
      expires_at: expiresAt,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as GroupInviteRow;
}

export async function fetchInviteByToken(token: string) {
  if (!token.trim()) {
    return null;
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('group_invites')
    .select('id, group_id, email, status, token, expires_at, created_at')
    .eq('token', token)
    .maybeSingle();

  if (error) throw error;
  return data as GroupInviteRow | null;
}

export async function fetchPendingInvitesForEmail(email: string): Promise<PendingInvite[]> {
  if (!email) {
    return [];
  }

  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('group_invites')
    .select('id, group_id, email, status, token, expires_at, created_at')
    .eq('email', email.toLowerCase())
    .eq('status', 'pending')
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    groupId: row.group_id,
    email: row.email,
    status: row.status,
    token: row.token,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at ?? null,
  }));
}

export async function fetchInvitesCreatedBy(userId: string): Promise<SentInvite[]> {
  if (!userId) {
    return [];
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('group_invites')
    .select('id, group_id, email, status, token, expires_at, created_at, groups(name)')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  const rows = (data ?? []) as Array<GroupInviteRow & { groups?: { name?: string | null } | null }>;

  return rows.map((row) => ({
    id: row.id,
    groupId: row.group_id,
    groupName: row.groups?.name ?? null,
    email: row.email,
    status: row.status,
    token: row.token,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at ?? null,
  }));
}

export async function acceptInvite({ token, userId }: { token: string; userId: string }) {
  const supabase = getSupabaseClient();

  const invite = await fetchInviteByToken(token);
  if (!invite) {
    throw new Error('La invitación no existe o ya fue utilizada');
  }

  if (invite.status !== 'pending') {
    throw new Error('Esta invitación ya no está disponible');
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    throw new Error('La invitación ha expirado');
  }

  const { data: existingMember, error: memberFetchError } = await supabase
    .from('group_members')
    .select('group_id, user_id, is_active')
    .eq('group_id', invite.group_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (memberFetchError) throw memberFetchError;

  if (!existingMember) {
    const { error: insertMemberError } = await supabase
      .from('group_members')
      .insert({
        group_id: invite.group_id,
        user_id: userId,
        is_active: true,
      });

    if (insertMemberError) throw insertMemberError;
  } else if (!existingMember.is_active) {
    const { error: reactivateError } = await supabase
      .from('group_members')
      .update({ is_active: true })
      .eq('group_id', invite.group_id)
      .eq('user_id', userId);

    if (reactivateError) throw reactivateError;
  }

  const { error: updateInviteError } = await supabase
    .from('group_invites')
    .update({ status: 'accepted' })
    .eq('id', invite.id);

  if (updateInviteError) throw updateInviteError;

  return invite.group_id;
}

export async function revokeInvite(inviteId: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('group_invites')
    .update({ status: 'revoked' })
    .eq('id', inviteId);

  if (error) throw error;
}
