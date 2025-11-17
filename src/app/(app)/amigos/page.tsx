'use client';

import { useAuth } from '@/components/AuthGate';
import { fetchGroupDetail, fetchUserGroups, GroupSummary } from '@/lib/groups';
import { fetchInvitesCreatedBy, SentInvite } from '@/lib/invites';
import { useQuery } from '@tanstack/react-query';
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
      return { label: 'Aceptada', className: 'bg-emerald-400/20 text-success border-emerald-300/30' };
    case 'revoked':
      return { label: 'Revocada', className: 'bg-slate-500/20 text-slate-200 border-slate-300/20' };
    case 'expired':
    case 'caducada':
      return { label: 'Caducada', className: 'bg-rose-500/15 text-danger border-rose-300/30' };
    case 'pending':
    default:
      return { label: 'Pendiente', className: 'bg-amber-500/20 text-amber-100 border-amber-300/30' };
  }
}

export default function FriendsPage() {
  const { user } = useAuth();

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

  return (
    <div className="space-y-6">
      <section className={`${CARD_CLASS} space-y-4`}>
        <header className="space-y-2">
          <h2 className="text-lg font-semibold text-text-primary">Personas con las que compartes gastos</h2>
          <p className="text-sm text-text-secondary">
            La lista se genera automáticamente a partir de los miembros de tus grupos activos.
          </p>
        </header>

        {friendsQuery.isFetching && <p className="text-sm text-text-secondary">Actualizando contactos...</p>}

        {friendsQuery.data && friendsQuery.data.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {friendsQuery.data.map((friend) => (
              <li key={friend.userId} className="glass-card p-4">
                <p className="text-sm font-semibold text-text-primary">{friend.displayName ?? friend.email ?? 'Integrante'}</p>
                {friend.email && <p className="text-xs text-text-secondary">{friend.email}</p>}
              </li>
            ))}
          </ul>
        ) : (
          !friendsQuery.isFetching && (
            <div className="rounded-2xl border border-dashed border-white/20 p-6 text-center text-sm text-text-secondary">
              Todavía no has compartido gastos con nadie. Crea un grupo e invita a tus amigos para empezar.
            </div>
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
          <ul className="space-y-3 text-sm text-slate-100">
            {sentInvitesQuery.data.map((invite) => {
              const badge = getStatusBadge(invite.status);
              return (
                <li
                  key={invite.id}
                  className="glass-card p-4 shadow-inner shadow-black/20"
                >
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
