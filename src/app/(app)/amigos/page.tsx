'use client';

import { useAuth } from '@/components/AuthGate';
import { fetchGroupDetail, fetchUserGroups, GroupSummary } from '@/lib/groups';
import { fetchInvitesCreatedBy, SentInvite } from '@/lib/invites';
import { fetchAcceptedFriends, fetchReceivedFriendInvitations, ReceivedFriendInvitation, AcceptedFriend, respondToFriendInvitation } from '@/lib/friends';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo } from 'react';

const CARD_CLASS = 'glass-card p-6';

type Friend = {
  userId: string;
  displayName: string | null;
  email: string | null;
};

function formatDate(input?: string | null) {
  if (!input) return '—';
  try {
    return new Date(input).toLocaleDateString();
  } catch {
    return '—';
  }
}

function getStatusBadge(status: string) {
  const normalized = status.toLowerCase();
  switch (normalized) {
    case 'accepted':
      return { label: 'Aceptada', className: 'bg-success-soft/70 text-success border-success/40' };
    case 'revoked':
      return { label: 'Revocada', className: 'bg-white/30 text-text-secondary border-white/40' };
    case 'expired':
    case 'caducada':
      return { label: 'Caducada', className: 'bg-danger-soft/70 text-danger border-danger/40' };
    case 'pending':
    default:
      return { label: 'Pendiente', className: 'bg-primary-soft/70 text-primary border-primary/40' };
  }
}

export default function FriendsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const groupsQuery = useQuery({
    queryKey: ['groups', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return [] as GroupSummary[];
      return fetchUserGroups(user.id);
    },
  });

  const sentInvitesQuery = useQuery({
    queryKey: ['sent-invites', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return [] as SentInvite[];
      return fetchInvitesCreatedBy(user.id);
    },
  });

  const receivedInvitesQuery = useQuery<ReceivedFriendInvitation[]>({
    queryKey: ['friend-invitations', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return [] as ReceivedFriendInvitation[];
      return fetchReceivedFriendInvitations(user.id);
    },
  });

  const acceptedFriendsQuery = useQuery<AcceptedFriend[]>({
    queryKey: ['friend-connections', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return [] as AcceptedFriend[];
      return fetchAcceptedFriends(user.id);
    },
  });

  const respondMutation = useMutation({
    mutationFn: async ({ invitationId, action }: { invitationId: string; action: 'accept' | 'reject' }) => {
      if (!user?.id) {
        throw new Error('Necesitas iniciar sesión para gestionar invitaciones.');
      }
      return respondToFriendInvitation({ invitationId, receiverId: user.id, action });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['friend-invitations', user?.id] }),
        queryClient.invalidateQueries({ queryKey: ['friend-connections', user?.id] }),
      ]);
    },
  });

  const membersKey = useMemo(() => {
    if (!groupsQuery.data || groupsQuery.data.length === 0) return null;
    const ids = groupsQuery.data.map((group) => group.id).sort().join('|');
    return ids;
  }, [groupsQuery.data]);

  const friendsQuery = useQuery({
    queryKey: ['friends', user?.id, membersKey],
    enabled: Boolean(user?.id && membersKey),
    queryFn: async () => {
      if (!user?.id || !groupsQuery.data) return [] as Friend[];
      const details = await Promise.all(groupsQuery.data.map((group) => fetchGroupDetail(group.id)));
      const catalog = new Map<string, Friend>();
      details.forEach((detail) => {
        detail.members.forEach((member) => {
          if (member.userId === user.id) return;
          if (!catalog.has(member.userId)) {
            catalog.set(member.userId, {
              userId: member.userId,
              displayName: member.displayName,
              email: member.email,
            });
          }
        });
      });
      return Array.from(catalog.values());
    },
  });

  const combinedFriends = useMemo(() => {
    const map = new Map<string, Friend>();
    (friendsQuery.data ?? []).forEach((friend) => {
      map.set(friend.userId, friend);
    });
    (acceptedFriendsQuery.data ?? []).forEach((friend) => {
      if (!friend.userId) return;
      if (!map.has(friend.userId)) {
        map.set(friend.userId, {
          userId: friend.userId,
          displayName: friend.displayName,
          email: friend.email,
        });
      }
    });
    return Array.from(map.values());
  }, [friendsQuery.data, acceptedFriendsQuery.data]);

  const isFriendsLoading = friendsQuery.isFetching || acceptedFriendsQuery.isFetching;

  return (
    <div className="space-y-6">
      <section className={`${CARD_CLASS} space-y-4`}>
        <header className="space-y-2">
          <h2 className="text-lg font-semibold text-text-primary">Personas con las que compartes gastos</h2>
          <p className="text-sm text-text-secondary">
            La lista se genera automáticamente a partir de los miembros de tus grupos activos.
          </p>
        </header>

        {isFriendsLoading && <p className="text-sm text-text-secondary">Actualizando contactos...</p>}

        {combinedFriends.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {combinedFriends.map((friend) => (
              <li key={friend.userId} className="glass-card p-4">
                <p className="text-sm font-semibold text-text-primary">{friend.displayName ?? friend.email ?? 'Integrante'}</p>
                {friend.email && <p className="text-xs text-text-secondary">{friend.email}</p>}
              </li>
            ))}
          </ul>
        ) : (
          !isFriendsLoading && (
            <div className="rounded-2xl border border-dashed border-border-subtle bg-white/60 p-6 text-center text-sm text-text-secondary shadow-[0_6px_18px_rgba(0,0,0,0.06)] backdrop-blur-lg">
              Todavía no has compartido gastos con nadie. Crea un grupo e invita a tus amigos para empezar.
            </div>
          )
        )}
      </section>

      <section className={`${CARD_CLASS} space-y-4`}>
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Invitaciones recibidas</h2>
            <p className="text-sm text-text-secondary">Responde para que la otra persona pueda verte como contacto.</p>
          </div>
          <span className="text-xs text-text-secondary">{receivedInvitesQuery.data?.length ?? 0} pendientes</span>
        </header>

        {receivedInvitesQuery.isLoading && <p className="text-sm text-text-secondary">Cargando invitaciones...</p>}
        {respondMutation.isError && (
          <p className="text-sm text-danger">No pudimos procesar la invitación. Inténtalo de nuevo.</p>
        )}

        {receivedInvitesQuery.data && receivedInvitesQuery.data.length > 0 ? (
          <ul className="space-y-3 text-sm text-text-secondary">
            {receivedInvitesQuery.data.map((invite) => (
              <li key={invite.id} className="glass-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{invite.senderName ?? invite.senderEmail ?? 'Persona desconocida'}</p>
                    {invite.senderEmail && <p className="text-xs text-text-secondary">{invite.senderEmail}</p>}
                    <p className="mt-1 text-xs text-text-secondary">Enviada {formatDate(invite.createdAt)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={respondMutation.isPending}
                      onClick={() => respondMutation.mutate({ invitationId: invite.id, action: 'accept' })}
                      className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/60"
                    >
                      Aceptar
                    </button>
                    <button
                      type="button"
                      disabled={respondMutation.isPending}
                      onClick={() => respondMutation.mutate({ invitationId: invite.id, action: 'reject' })}
                      className="rounded-full border border-border-subtle px-4 py-2 text-xs font-semibold text-text-secondary transition hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          !receivedInvitesQuery.isLoading && (
            <p className="text-sm text-text-secondary">No tienes invitaciones pendientes por ahora.</p>
          )
        )}
      </section>

      <section className={`${CARD_CLASS} space-y-4`}>
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Invitaciones enviadas</h2>
          <span className="text-xs text-text-secondary">{sentInvitesQuery.data?.length ?? 0} registradas</span>
        </header>

        {sentInvitesQuery.isLoading && <p className="text-sm text-text-secondary">Buscando invitaciones...</p>}

        {sentInvitesQuery.data && sentInvitesQuery.data.length > 0 ? (
          <ul className="space-y-3 text-sm text-text-secondary">
            {sentInvitesQuery.data.map((invite) => {
              const badge = getStatusBadge(invite.status);
              return (
                <li key={invite.id} className="glass-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{invite.email}</p>
                      <p className="text-xs text-text-secondary">
                        Grupo: {invite.groupName ?? 'Sin nombre'} · Enviada {formatDate(invite.createdAt)}
                      </p>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-text-secondary">
                    <p>Caduca {formatDate(invite.expiresAt)}</p>
                    <Link
                      className="font-semibold text-primary underline-offset-2 hover:text-text-primary hover:underline"
                      href={`/invite?token=${invite.token}`}
                    >
                      Ver invitación
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          !sentInvitesQuery.isLoading && (
            <p className="text-sm text-text-secondary">Todavía no has enviado invitaciones desde Appagar.</p>
          )
        )}
      </section>
    </div>
  );
}
