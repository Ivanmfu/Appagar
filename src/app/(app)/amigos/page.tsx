'use client';

import { useAuth } from '@/components/AuthGate';
import { fetchGroupDetail, fetchUserGroups, GroupSummary } from '@/lib/groups';
import { fetchPendingInvitesForEmail } from '@/lib/invites';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo } from 'react';

const CARD_CLASS = 'rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl shadow-xl shadow-black/20';

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

export default function FriendsPage() {
  const { user, profile } = useAuth();

  const groupsQuery = useQuery({
    queryKey: ['groups', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return [] as GroupSummary[];
      return fetchUserGroups(user.id);
    },
  });

  const invitesQuery = useQuery({
    queryKey: ['invites', profile?.email ?? user?.email],
    enabled: Boolean(profile?.email ?? user?.email),
    queryFn: async () => {
      const email = profile?.email ?? user?.email;
      if (!email) return [];
      return fetchPendingInvitesForEmail(email);
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
          <h2 className="text-lg font-semibold text-white">Personas con las que compartes gastos</h2>
          <p className="text-sm text-slate-200/80">
            La lista se genera automáticamente a partir de los miembros de tus grupos activos.
          </p>
        </header>

        {friendsQuery.isFetching && <p className="text-sm text-slate-300">Actualizando contactos...</p>}

        {friendsQuery.data && friendsQuery.data.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {friendsQuery.data.map((friend) => (
              <li key={friend.userId} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold text-white">{friend.displayName ?? friend.email ?? 'Integrante'}</p>
                {friend.email && <p className="text-xs text-slate-300">{friend.email}</p>}
              </li>
            ))}
          </ul>
        ) : (
          !friendsQuery.isFetching && (
            <div className="rounded-2xl border border-dashed border-white/20 p-6 text-center text-sm text-slate-200/80">
              Todavía no has compartido gastos con nadie. Crea un grupo e invita a tus amigos para empezar.
            </div>
          )
        )}
      </section>

      <section className={`${CARD_CLASS} space-y-4`}>
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Invitaciones enviadas</h2>
          <span className="text-xs text-slate-300">{invitesQuery.data?.length ?? 0} en curso</span>
        </header>

        {invitesQuery.isLoading && <p className="text-sm text-slate-300">Buscando invitaciones...</p>}

        {invitesQuery.data && invitesQuery.data.length > 0 ? (
          <ul className="space-y-3 text-sm text-slate-100">
            {invitesQuery.data.map((invite) => (
              <li key={invite.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div>
                  <p className="font-medium text-white">{invite.email}</p>
                  <p className="text-xs text-slate-300">Expira {formatDate(invite.expiresAt)}</p>
                </div>
                <Link className="text-xs font-semibold text-indigo-200 underline-offset-2 hover:text-white hover:underline" href={`/invite?token=${invite.token}`}>
                  Detalles
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          !invitesQuery.isLoading && (
            <p className="text-sm text-slate-200/80">No tienes invitaciones enviadas desde tu correo.</p>
          )
        )}
      </section>
    </div>
  );
}
