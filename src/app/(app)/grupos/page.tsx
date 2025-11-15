'use client';

import { useAuth } from '@/components/AuthGate';
import { createGroup, fetchUserGroups, GroupSummary } from '@/lib/groups';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';

const CARD_CLASS = 'rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl shadow-xl shadow-black/20';

function formatDate(input?: string | null) {
  if (!input) return '—';
  try {
    return new Date(input).toLocaleDateString();
  } catch {
    return '—';
  }
}

export default function GroupsPage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const shouldStartCreating = useMemo(() => searchParams?.get('crear') === '1', [searchParams]);
  const [createOpen, setCreateOpen] = useState(shouldStartCreating);
  const [groupName, setGroupName] = useState('');

  useEffect(() => {
    setCreateOpen(shouldStartCreating);
  }, [shouldStartCreating]);

  const groupsQuery = useQuery({
    queryKey: ['groups', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return [] as GroupSummary[];
      return fetchUserGroups(user.id);
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!user?.id) {
        throw new Error('Necesitas iniciar sesión para crear un grupo');
      }
      return createGroup({
        name,
        userId: user.id,
        email: profile?.email ?? user.email ?? null,
        displayName:
          profile?.display_name ??
          (user.user_metadata as Record<string, unknown>)?.['display_name']?.toString() ??
          (user.user_metadata as Record<string, unknown>)?.['full_name']?.toString() ??
          null,
      });
    },
    onSuccess: async (group) => {
      await queryClient.invalidateQueries({ queryKey: ['groups', user?.id] });
      setGroupName('');
      setCreateOpen(false);
      router.replace(`/grupos/detalle?id=${group.id}`);
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!groupName.trim()) return;
    createGroupMutation.mutate(groupName.trim());
  }

  function closeCreate() {
    setCreateOpen(false);
    router.replace('/grupos');
  }

  return (
    <div className="space-y-6">
      <section className={`${CARD_CLASS} space-y-6`}>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Gestiona tus grupos</h2>
            <p className="text-sm text-slate-200/80">
              Crea un nuevo espacio o entra en uno existente para registrar gastos compartidos.
            </p>
          </div>
          <button
            className="rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 transition hover:scale-105"
            onClick={() => setCreateOpen(true)}
            type="button"
          >
            Nuevo grupo
          </button>
        </header>

        {createOpen && (
          <form className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-inner shadow-black/30" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2 text-sm">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-200/80" htmlFor="group-name">
                Nombre del grupo
              </label>
              <input
                id="group-name"
                className="rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-white/40 focus:outline-none"
                placeholder="Viaje a la Sierra"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                required
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-full bg-white/90 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white"
                disabled={createGroupMutation.isPending}
                type="submit"
              >
                {createGroupMutation.isPending ? 'Creando...' : 'Crear y entrar'}
              </button>
              <button
                className="rounded-full border border-white/20 px-5 py-2 text-sm font-medium text-white/80 transition hover:text-white"
                onClick={closeCreate}
                type="button"
              >
                Cancelar
              </button>
            </div>
            {createGroupMutation.error && (
              <p className="text-sm text-red-300">
                {(createGroupMutation.error as Error).message ?? 'No se pudo crear el grupo'}
              </p>
            )}
          </form>
        )}
      </section>

      <section className={`${CARD_CLASS} space-y-4`}>
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Grupos activos</h2>
          <span className="text-xs text-slate-300">{groupsQuery.data?.length ?? 0} en total</span>
        </header>

        {groupsQuery.isLoading && <p className="text-sm text-slate-300">Cargando grupos...</p>}
        {groupsQuery.error && (
          <p className="text-sm text-red-300">
            {(groupsQuery.error as Error).message ?? 'No se pudieron cargar los grupos'}
          </p>
        )}

        {groupsQuery.data && groupsQuery.data.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {groupsQuery.data.map((group) => (
              <Link
                key={group.id}
                className="group rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-white/30 hover:bg-white/10"
                href={`/grupos/detalle?id=${group.id}`}
              >
                <header className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-white">{group.name}</h3>
                  <span className="text-xs text-white/70">{group.memberCount} miembros</span>
                </header>
                <p className="mt-3 text-xs text-slate-200/70">Creado {formatDate(group.createdAt)}</p>
                <p className="mt-1 text-xs text-slate-200/70">
                  Último gasto {formatDate(group.lastExpenseAt)} · Base {group.baseCurrency}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          !groupsQuery.isLoading && (
            <div className="rounded-2xl border border-dashed border-white/20 p-6 text-center text-sm text-slate-200/80">
              Todavía no perteneces a ningún grupo. Crea uno nuevo y comparte el enlace con tus amigos.
            </div>
          )
        )}
      </section>
    </div>
  );
}
