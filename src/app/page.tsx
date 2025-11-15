'use client';

import AuthGate, { useAuth } from '@/components/AuthGate';
import { fetchUserGroups, GroupSummary } from '@/lib/groups';
import { fetchPendingInvitesForEmail } from '@/lib/invites';
import { getSupabaseClient } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

function formatDate(input?: string | null) {
  if (!input) return '—';
  try {
    return new Date(input).toLocaleDateString();
  } catch {
    return '—';
  }
}

function useGroups(userId?: string | null) {
  return useQuery({
    queryKey: ['groups', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      if (!userId) return [] as GroupSummary[];
      return fetchUserGroups(userId);
    },
  });
}

function useInvites(email?: string | null) {
  return useQuery({
    queryKey: ['invites', email],
    enabled: Boolean(email),
    queryFn: async () => {
      if (!email) return [];
      return fetchPendingInvitesForEmail(email);
    },
  });
}

export default function HomePage() {
  const { profile, user, loading } = useAuth();
  const router = useRouter();
  const groupsQuery = useGroups(user?.id);
  const invitesQuery = useInvites(profile?.email ?? user?.email ?? null);

  async function handleLogout() {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (loading) {
    return <main className="p-6 text-sm text-gray-500">Comprobando sesión...</main>;
  }

  return (
    <AuthGate>
      <main className="p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              Hola, {profile?.display_name ?? user?.email ?? 'compañero/a'}
            </h1>
            <p className="text-gray-600 mt-1">
              Gestiona tus grupos, controla gastos recientes y acepta invitaciones pendientes.
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-3 py-1.5 rounded transition-colors"
          >
            Cerrar sesión
          </button>
        </div>

        <section className="border rounded-lg p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Acciones rápidas</h2>
            <div className="flex gap-3">
              <Link
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
                href="/groups"
              >
                Ver grupos
              </Link>
              <Link
                className="border border-blue-600 text-blue-600 hover:bg-blue-50 px-4 py-2 rounded transition-colors"
                href="/groups?new=1"
              >
                Crear grupo
              </Link>
            </div>
          </div>
          {invitesQuery.data && invitesQuery.data.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-2">
              <p className="text-sm text-blue-900 font-medium">Tienes invitaciones pendientes:</p>
              <ul className="space-y-2">
                {invitesQuery.data.map((invite) => (
                  <li key={invite.id} className="flex items-center justify-between text-sm">
                    <span>
                      Invitación a unirte a un grupo (expira {formatDate(invite.expiresAt)})
                    </span>
                    <Link className="text-blue-600 hover:underline" href={`/invite?token=${invite.token}`}>
                      Ver invitación
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Tus grupos</h2>
            {groupsQuery.isLoading && <span className="text-xs text-gray-500">Cargando...</span>}
          </div>

          {groupsQuery.error && (
            <p className="text-sm text-red-600">
              {(groupsQuery.error as Error).message ?? 'No se pudieron cargar los grupos'}
            </p>
          )}

          {groupsQuery.data && groupsQuery.data.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {groupsQuery.data.map((group) => (
                <article key={group.id} className="border rounded-lg p-4 space-y-2">
                  <header>
                    <h3 className="text-base font-semibold">{group.name}</h3>
                    <p className="text-xs text-gray-500">
                      {group.memberCount} miembros · Último gasto {formatDate(group.lastExpenseAt)}
                    </p>
                  </header>
                  <footer className="flex justify-between items-center">
                    <span className="text-xs text-gray-400">Creado {formatDate(group.createdAt)}</span>
                    <Link className="text-sm text-blue-600 hover:underline" href={`/groups?selected=${group.id}`}>
                      Abrir
                    </Link>
                  </footer>
                </article>
              ))}
            </div>
          ) : (
            !groupsQuery.isLoading && (
              <div className="rounded border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600">
                Todavía no tienes grupos. Crea uno nuevo para empezar a repartir gastos.
              </div>
            )
          )}
        </section>
      </main>
    </AuthGate>
  );
}
