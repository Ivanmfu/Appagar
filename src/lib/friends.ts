import { getSupabaseClient } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type FriendInvitationRow = Database['public']['Tables']['friend_invitations']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

type Nullable<T> = T | null;

export type ReceivedFriendInvitation = {
  id: string;
  senderId: string;
  senderName: Nullable<string>;
  senderEmail: Nullable<string>;
  createdAt: Nullable<string>;
};

export type AcceptedFriend = {
  userId: string;
  displayName: Nullable<string>;
  email: Nullable<string>;
  since: Nullable<string>;
};

export async function fetchReceivedFriendInvitations(userId: string): Promise<ReceivedFriendInvitation[]> {
  if (!userId) return [];

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('friend_invitations')
    .select('id, sender_id, created_at, status, sender:profiles!friend_invitations_sender_id_fkey(id, display_name, email)')
    .eq('receiver_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as Array<FriendInvitationRow & { sender?: ProfileRow | null }>;

  return rows.map((row) => {
    const senderProfile = row.sender ?? null;
    return {
      id: row.id,
      senderId: row.sender_id ?? '',
      senderName: senderProfile?.display_name ?? null,
      senderEmail: senderProfile?.email ?? null,
      createdAt: row.created_at ?? null,
    } satisfies ReceivedFriendInvitation;
  });
}

export async function respondToFriendInvitation({
  invitationId,
  receiverId,
  action,
}: {
  invitationId: string;
  receiverId: string;
  action: 'accept' | 'reject';
}): Promise<void> {
  if (!invitationId || !receiverId) {
    throw new Error('Faltan datos para gestionar la invitación.');
  }

  const supabase = getSupabaseClient();
  const status = action === 'accept' ? 'accepted' : 'rejected';
  const { error } = await supabase
    .from('friend_invitations')
    .update({ status })
    .eq('id', invitationId)
    .eq('receiver_id', receiverId);

  if (error) throw error;
}

export async function fetchAcceptedFriends(userId: string): Promise<AcceptedFriend[]> {
  if (!userId) return [];

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('friend_invitations')
    .select('sender_id, receiver_id, created_at, status, sender:profiles!friend_invitations_sender_id_fkey(id, display_name, email), receiver:profiles!friend_invitations_receiver_id_fkey(id, display_name, email)')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .eq('status', 'accepted');

  if (error) throw error;

  const rows = (data ?? []) as Array<FriendInvitationRow & { sender?: ProfileRow | null; receiver?: ProfileRow | null }>;

  return rows.map((row) => {
    const senderProfile = row.sender ?? null;
    const receiverProfile = row.receiver ?? null;
    const otherProfile = row.sender_id === userId ? receiverProfile : senderProfile;

    return {
      userId: otherProfile?.id ?? (row.sender_id === userId ? row.receiver_id ?? '' : row.sender_id ?? ''),
      displayName: otherProfile?.display_name ?? null,
      email: otherProfile?.email ?? null,
      since: row.created_at ?? null,
    } satisfies AcceptedFriend;
  });
}
