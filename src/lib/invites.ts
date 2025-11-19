import { getSupabaseClient } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

const INVITE_EXPIRATION_HOURS = 48;

type GroupInviteRow = Database['public']['Tables']['group_invites']['Row'];
type Nullable<T> = T | null;

type ProfileSummary = {
  id: string;
  email: string | null;
  display_name: string | null;
};

export type CreateGroupInviteResult = {
  invite: GroupInviteRow;
  alreadyRegistered: boolean;
  receiverProfile: ProfileSummary | null;
};

export type SentInvite = {
  id: string;
  groupId: string;
  groupName: Nullable<string>;
  receiverEmail: Nullable<string>;
  receiverId: Nullable<string>;
  status: string;
  token: string;
  expiresAt: Nullable<string>;
  createdAt: Nullable<string>;
};

export type PendingInvite = {
  id: string;
  groupId: string;
  receiverEmail: Nullable<string>;
  status: string;
  token: string;
  expiresAt: Nullable<string>;
  createdAt: Nullable<string>;
};

export type ReceivedGroupInvite = {
  id: string;
  groupId: string;
  groupName: Nullable<string>;
  senderId: Nullable<string>;
  senderName: Nullable<string>;
  senderEmail: Nullable<string>;
  status: string;
  createdAt: Nullable<string>;
  token: string;
};

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

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
}): Promise<CreateGroupInviteResult> {
  if (!email.trim()) {
    throw new Error('Introduce un email para invitar');
  }

  const supabase = getSupabaseClient();
  const normalizedEmail = normalizeEmail(email)!;

  const { data: existingProfile, error: profileLookupError } = await supabase
    .from('profiles')
    .select('id, email, display_name')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (profileLookupError) {
    throw profileLookupError;
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('group_invites')
    .insert({
      group_id: groupId,
      email: normalizedEmail,
      receiver_email: normalizedEmail,
      receiver_id: existingProfile?.id ?? null,
      token,
      status: 'pending',
      expires_at: expiresAt,
      created_by: createdBy,
      sender_id: createdBy,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return {
    invite: data as GroupInviteRow,
    alreadyRegistered: Boolean(existingProfile),
    receiverProfile: (existingProfile as ProfileSummary | null) ?? null,
  } satisfies CreateGroupInviteResult;
}

export async function fetchInviteByToken(token: string) {
  if (!token.trim()) {
    return null;
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('group_invites')
    .select('id, group_id, email, receiver_email, receiver_id, token, status, expires_at, created_at, created_by, sender_id')
    .eq('token', token)
    .maybeSingle();

  if (error) throw error;
  return data as GroupInviteRow | null;
}

export async function fetchPendingInvitesForEmail(email: string): Promise<PendingInvite[]> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return [];
  }

  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('group_invites')
    .select('id, group_id, receiver_email, email, status, token, expires_at, created_at')
    .or(`receiver_email.eq.${normalized},email.eq.${normalized}`)
    .eq('status', 'pending')
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    groupId: row.group_id,
    receiverEmail: row.receiver_email ?? row.email ?? null,
    status: row.status,
    token: row.token,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at ?? null,
  } satisfies PendingInvite));
}

export async function fetchInvitesCreatedBy(userId: string): Promise<SentInvite[]> {
  if (!userId) {
    return [];
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('group_invites')
    .select('id, group_id, receiver_email, receiver_id, status, token, expires_at, created_at, groups(name)')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  const rows = (data ?? []) as Array<GroupInviteRow & { groups?: { name?: string | null } | null }>;

  return rows.map((row) => ({
    id: row.id,
    groupId: row.group_id,
    groupName: row.groups?.name ?? null,
    receiverEmail: row.receiver_email ?? row.email ?? null,
    receiverId: row.receiver_id ?? null,
    status: row.status,
    token: row.token,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at ?? null,
  } satisfies SentInvite));
}

export async function fetchGroupInvitationsForUser(userId: string): Promise<ReceivedGroupInvite[]> {
  if (!userId) {
    return [];
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('group_invites')
    .select('id, group_id, status, token, created_at, sender:profiles!group_invites_sender_id_fkey(id, display_name, email), groups(name)')
    .eq('receiver_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as Array<
    GroupInviteRow & { sender?: { id?: string | null; display_name?: string | null; email?: string | null } | null; groups?: { name?: string | null } | null }
  >;

  return rows.map((row) => ({
    id: row.id,
    groupId: row.group_id,
    groupName: row.groups?.name ?? null,
    senderId: row.sender?.id ?? row.sender_id ?? null,
    senderName: row.sender?.display_name ?? null,
    senderEmail: row.sender?.email ?? null,
    status: row.status,
    createdAt: row.created_at ?? null,
    token: row.token,
  } satisfies ReceivedGroupInvite));
}

export async function respondToGroupInvite({
  inviteId,
  userId,
  action,
}: {
  inviteId: string;
  userId: string;
  action: 'accept' | 'decline';
}): Promise<void> {
  if (!inviteId || !userId) {
    throw new Error('Faltan datos para gestionar la invitación.');
  }

  const supabase = getSupabaseClient();
  const { data: invite, error: inviteError } = await supabase
    .from('group_invites')
    .select('id, group_id, receiver_id, status')
    .eq('id', inviteId)
    .maybeSingle();

  if (inviteError) throw inviteError;
  if (!invite) {
    throw new Error('La invitación ya no está disponible.');
  }
  if (invite.receiver_id && invite.receiver_id !== userId) {
    throw new Error('Esta invitación pertenece a otra persona.');
  }

  if (action === 'accept') {
    if (invite.status !== 'pending') {
      throw new Error('Esta invitación ya fue gestionada.');
    }

    const { data: member, error: memberFetchError } = await supabase
      .from('group_members')
      .select('group_id, user_id, is_active')
      .eq('group_id', invite.group_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (memberFetchError) throw memberFetchError;

    if (!member) {
      const { error: insertMemberError } = await supabase
        .from('group_members')
        .insert({
          group_id: invite.group_id,
          user_id: userId,
          is_active: true,
        });
      if (insertMemberError) throw insertMemberError;
    } else if (!member.is_active) {
      const { error: reactivateError } = await supabase
        .from('group_members')
        .update({ is_active: true })
        .eq('group_id', invite.group_id)
        .eq('user_id', userId);
      if (reactivateError) throw reactivateError;
    }

    const { error: updateError } = await supabase
      .from('group_invites')
      .update({ status: 'accepted', receiver_id: userId })
      .eq('id', inviteId);

    if (updateError) throw updateError;
    return;
  }

  const { error: declineError } = await supabase
    .from('group_invites')
    .update({ status: 'declined', receiver_id: userId })
    .eq('id', inviteId);

  if (declineError) throw declineError;
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

  if (invite.receiver_id && invite.receiver_id !== userId) {
    throw new Error('Esta invitación pertenece a otra cuenta');
  }

  const { data: member, error: memberFetchError } = await supabase
    .from('group_members')
    .select('group_id, user_id, is_active')
    .eq('group_id', invite.group_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (memberFetchError) throw memberFetchError;

  if (!member) {
    const { error: insertMemberError } = await supabase
      .from('group_members')
      .insert({
        group_id: invite.group_id,
        user_id: userId,
        is_active: true,
      });
    if (insertMemberError) throw insertMemberError;
  } else if (!member.is_active) {
    const { error: reactivateError } = await supabase
      .from('group_members')
      .update({ is_active: true })
      .eq('group_id', invite.group_id)
      .eq('user_id', userId);
    if (reactivateError) throw reactivateError;
  }

  const { error: updateInviteError } = await supabase
    .from('group_invites')
    .update({ status: 'accepted', receiver_id: userId })
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

export async function linkPendingGroupInvitesToUser({
  userId,
  email,
}: {
  userId: string;
  email?: string | null;
}): Promise<void> {
  const normalizedEmail = normalizeEmail(email ?? null);
  if (!userId || !normalizedEmail) {
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('group_invites')
    .update({
      receiver_id: userId,
      receiver_email: normalizedEmail,
      email: normalizedEmail,
    })
    .is('receiver_id', null)
    .eq('status', 'pending')
    .or(`receiver_email.eq.${normalizedEmail},email.eq.${normalizedEmail}`);

  if (error) {
    console.warn('No se pudieron vincular invitaciones pendientes al usuario', error);
  }
}
