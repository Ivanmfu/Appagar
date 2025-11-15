'use client';

import AuthGate, { useAuth } from '@/components/AuthGate';
import { BalanceSummary } from '@/components/groups/BalanceSummary';
import { CreateExpenseForm } from '@/components/groups/CreateExpenseForm';
import { ExpenseList } from '@/components/groups/ExpenseList';
import { InviteMemberForm } from '@/components/groups/InviteMemberForm';
import { createGroup, fetchGroupDetail, fetchUserGroups, GroupSummary } from '@/lib/groups';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useMemo, useState } from 'react';

function formatDate(input?: string | null) {
  if (!input) return '—';
  try {
    return new Date(input).toLocaleDateString();
  } catch {
    return '—';
  }
}

function GroupsContent() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const showNewGroup = searchParams?.get('new') === '1';
  const selectedGroupId = searchParams?.get('selected') ?? null;
  const [creating, setCreating] = useState(showNewGroup);
  const [groupName, setGroupName] = useState('');

  const groupsQuery = useQuery({
    queryKey: ['groups', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return [] as GroupSummary[];
      return fetchUserGroups(user.id);
    },
  });

  const detailQuery = useQuery({
    queryKey: ['group-detail', selectedGroupId],
    enabled: Boolean(user?.id && selectedGroupId),
    queryFn: async () => {
      if (!selectedGroupId) throw new Error('Grupo no seleccionado');
      return fetchGroupDetail(selectedGroupId);
    },
    staleTime: 30_000,
  });

  const pendingInvites = useMemo(() => {
    const invites = detailQuery.data?.invites ?? [];
    return invites.filter((invite) => invite.status === 'pending' && (!invite.expiresAt || new Date(invite.expiresAt) > new Date()));
  }, [detailQuery.data?.invites]);

  const createGroupMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!user?.id) {
        throw new Error('Debes iniciar sesión');
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
      setCreating(false);
      router.push(`/groups?selected=${group.id}`);
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    createGroupMutation.mutate(groupName);
  }

  if (loading) {
    return <main className="p-6 text-sm text-gray-500">Cargando grupos...</main>;
  }

  if (!user) {
    return null;
  }

  return (
    <AuthGate>
      <main className="p-6 space-y-6">
        <header className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Tus grupos</h1>
            <p className="text-gray-600 text-sm">
              Crea un grupo o abre uno existente para registrar gastos compartidos.
            </p>
          </div>
          <button
            className="bg-black text-white px-4 py-2 rounded"
            onClick={() => setCreating(true)}
            type="button"
          >
            Nuevo grupo
          </button>
        </header>

        {creating && (
          <form className="border p-4 rounded space-y-3" onSubmit={onSubmit}>
            <label className="flex flex-col gap-1 text-sm">
              Nombre del grupo
              <input
                className="border px-3 py-2 rounded"
                placeholder="Viaje a la sierra"
                required
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
              />
            </label>
            <div className="flex gap-3">
              <button
                className="bg-black text-white px-4 py-2 rounded disabled:opacity-60"
                disabled={createGroupMutation.isPending}
                type="submit"
              >
                {createGroupMutation.isPending ? 'Creando...' : 'Crear y entrar'}
              </button>
              <button
                className="text-sm text-gray-600"
                onClick={() => setCreating(false)}
                type="button"
              >
                Cancelar
              </button>
            </div>
            {createGroupMutation.error && (
              <p className="text-sm text-red-600">
                {(createGroupMutation.error as Error).message ?? 'No se pudo crear el grupo'}
              </p>
            )}
          </form>
        )}

        <section className="grid gap-6 lg:grid-cols-[1fr,2fr]">
          <article className="space-y-3">
            <h2 className="text-lg font-semibold">Grupos existentes</h2>
            <ul className="space-y-2">
              {groupsQuery.data?.map((group) => {
                const isSelected = group.id === selectedGroupId;
                return (
                  <li
                    key={group.id}
                    className={`border rounded p-4 flex flex-col gap-2 ${isSelected ? 'border-blue-500 bg-blue-50' : ''}`}
                  >
                    <div>
                      <p className="font-medium text-base">{group.name}</p>
                      <p className="text-xs text-gray-500">Creado {formatDate(group.createdAt)}</p>
                      <p className="text-xs text-gray-500">{group.memberCount} miembros · Último gasto {formatDate(group.lastExpenseAt)}</p>
                    </div>
                    <button
                      className="text-sm text-blue-600 hover:underline self-start"
                      type="button"
                      onClick={() => router.push(`/groups?selected=${group.id}`)}
                    >
                      {isSelected ? 'Viendo detalle' : 'Ver detalle'}
                    </button>
                  </li>
                );
              })}
            </ul>

            {groupsQuery.isLoading && <p className="text-sm text-gray-500">Cargando...</p>}
            {groupsQuery.error && (
              <p className="text-sm text-red-600">
                {(groupsQuery.error as Error).message ?? 'No se pudieron obtener los grupos'}
              </p>
            )}
            {groupsQuery.data?.length === 0 && !groupsQuery.isLoading && (
              <p className="text-sm text-gray-500">Todavía no perteneces a ningún grupo.</p>
            )}
          </article>

          <article className="space-y-6">
            {!selectedGroupId && (
              <div className="border border-dashed rounded-lg p-6 text-sm text-gray-500">
                Selecciona un grupo para ver sus detalles, gastos e invitaciones.
              </div>
            )}

            {selectedGroupId && detailQuery.isLoading && (
              <p className="text-sm text-gray-500">Cargando detalles del grupo...</p>
            )}

            {selectedGroupId && detailQuery.error && (
              <p className="text-sm text-red-600">
                {(detailQuery.error as Error).message ?? 'No se pudieron obtener los detalles del grupo'}
              </p>
            )}

            {selectedGroupId && detailQuery.data && (
              <>
                <header className="space-y-1">
                  <h2 className="text-2xl font-semibold">{detailQuery.data.group.name}</h2>
                  <p className="text-sm text-gray-500">
                    Base {detailQuery.data.group.base_currency} · {detailQuery.data.members.length} miembros · Creado {formatDate(detailQuery.data.group.created_at)}
                  </p>
                </header>

                <section className="border rounded-lg p-4 space-y-4">
                  <h3 className="text-lg font-semibold">Miembros activos</h3>
                  {detailQuery.data.members.length === 0 ? (
                    <p className="text-sm text-gray-500">No hay miembros activos todavía.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {detailQuery.data.members.map((member) => (
                        <li key={member.userId} className="border rounded p-3">
                          <p className="font-medium">{member.displayName ?? member.email ?? 'Miembro'}</p>
                          {member.email && <p className="text-xs text-gray-500">{member.email}</p>}
                          {member.role && <p className="text-xs text-gray-400">Rol: {member.role}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="border rounded-lg p-4 space-y-4">
                  <h3 className="text-lg font-semibold">Gastos recientes</h3>
                  <ExpenseList expenses={detailQuery.data.expenses} baseCurrency={detailQuery.data.group.base_currency} />
                </section>

                <section className="border rounded-lg p-4">
                  {detailQuery.data.members.length > 0 ? (
                    <CreateExpenseForm
                      groupId={selectedGroupId}
                      members={detailQuery.data.members}
                      baseCurrency={detailQuery.data.group.base_currency}
                    />
                  ) : (
                    <p className="text-sm text-gray-500">Añade miembros antes de registrar gastos.</p>
                  )}
                </section>

                <section className="border rounded-lg p-4">
                  <BalanceSummary
                    balance={detailQuery.data.balances}
                    members={detailQuery.data.members}
                    baseCurrency={detailQuery.data.group.base_currency}
                  />
                </section>

                <section className="border rounded-lg p-4 space-y-4">
                  <InviteMemberForm groupId={selectedGroupId} createdBy={user.id} />
                  {pendingInvites.length > 0 && (
                    <div className="space-y-2 text-sm">
                      <h3 className="font-semibold">Invitaciones pendientes</h3>
                      <ul className="space-y-2">
                        {pendingInvites.map((invite) => (
                          <li key={invite.id} className="border rounded p-3">
                            <p>{invite.email}</p>
                            <p className="text-xs text-gray-500">Expira {formatDate(invite.expiresAt)}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              </>
            )}
          </article>
        </section>
      </main>
    </AuthGate>
  );
}

export default function GroupsPage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <GroupsContent />
    </Suspense>
  );
}
