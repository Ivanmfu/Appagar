'use client';

import { useAuth } from '@/components/AuthGate';
import { createGroup, fetchUserGroups, GroupSummary } from '@/lib/groups';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Logger, withTiming } from '@/lib/logger';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';

const CARD_CLASS = 'glass-card p-6';

function formatDate(input?: string | null) {
  if (!input) return '—';
  try {
    return new Date(input).toLocaleDateString();
  } catch {
    return '—';
  }
}

function formatCurrency(minor: number, currency: string) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
  }).format(minor / 100);
}

function describeBalance(minor: number, currency: string) {
  if (minor > 0) return `Te deben ${formatCurrency(minor, currency)}`;
  if (minor < 0) return `Debes ${formatCurrency(Math.abs(minor), currency)}`;
  return 'Todo en orden ✨';
}

export default function GroupsPageClient() {
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
      return withTiming('GroupsPage', 'fetchUserGroups', () => fetchUserGroups(user.id));
    },
  });

  const { activeGroups, settledGroups } = useMemo(() => {
    const all = groupsQuery.data ?? [];
    const buckets: { activeGroups: GroupSummary[]; settledGroups: GroupSummary[] } = {
      activeGroups: [],
      settledGroups: [],
    };

    all.forEach((group) => {
      if (group.userNetBalanceMinor === 0) {
        buckets.settledGroups.push(group);
      } else {
        buckets.activeGroups.push(group);
      }
    });

    buckets.activeGroups.sort((a, b) => {
      const aTime = a.lastExpenseAt ? new Date(a.lastExpenseAt).getTime() : 0;
      const bTime = b.lastExpenseAt ? new Date(b.lastExpenseAt).getTime() : 0;
      return bTime - aTime;
    });

    buckets.settledGroups.sort((a, b) => a.name.localeCompare(b.name));

    return buckets;
  }, [groupsQuery.data]);

  const hasAnyGroup = (groupsQuery.data?.length ?? 0) > 0;

  const createGroupMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!user?.id) {
        throw new Error('Necesitas iniciar sesión para crear un grupo');
      }
      return withTiming('GroupsPage', 'createGroup', () => createGroup({
        name,
        userId: user.id,
        email: profile?.email ?? user.email ?? null,
        displayName:
          profile?.display_name ??
          (user.user_metadata as Record<string, unknown>)?.['display_name']?.toString() ??
          (user.user_metadata as Record<string, unknown>)?.['full_name']?.toString() ??
          null,
      }));
    },
    onSuccess: async (group) => {
      Logger.info('GroupsPage', 'Group created', { groupId: group.id });
      await queryClient.invalidateQueries({ queryKey: ['groups', user?.id] });
      setGroupName('');
      setCreateOpen(false);
      router.replace(`/grupos/detalle?id=${group.id}`);
    },
    onError: (err) => Logger.error('GroupsPage', 'Create group error', { err }),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!groupName.trim()) return;
    Logger.debug('GroupsPage', 'Submit create group', { name: groupName.trim() });
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
            <h2 className="text-lg font-semibold text-text-primary">Gestiona tus grupos</h2>
            <p className="text-sm text-text-secondary">
              Crea un nuevo espacio o entra en uno existente para registrar gastos compartidos.
            </p>
          </div>
          <button
            className="btn-primary"
            onClick={() => setCreateOpen(true)}
            type="button"
          >
            Nuevo grupo
          </button>
        </header>

        {createOpen && (
          <form className="glass-card grid gap-4 p-5" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2 text-sm">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary" htmlFor="group-name">
                Nombre del grupo
              </label>
              <input
                id="group-name"
                className="input-field"
                placeholder="Viaje a la Sierra"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                required
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                className="btn-primary disabled:opacity-60"
                disabled={createGroupMutation.isPending}
                type="submit"
              >
                {createGroupMutation.isPending ? 'Creando...' : 'Crear y entrar'}
              </button>
              <button
                className="btn-secondary"
                onClick={closeCreate}
                type="button"
              >
                Cancelar
              </button>
            </div>
            {createGroupMutation.error && (
              <p className="text-sm text-danger">
                {(createGroupMutation.error as Error).message ?? 'No se pudo crear el grupo'}
              </p>
            )}
          </form>
        )}
      </section>

      <section className={`${CARD_CLASS} space-y-4`}>
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Grupos activos</h2>
          <span className="text-xs text-text-secondary">{activeGroups.length} en curso</span>
        </header>

        {groupsQuery.isLoading && <p className="text-sm text-text-secondary">Cargando grupos...</p>}
        {groupsQuery.error && (
          <p className="text-sm text-danger">
            {(groupsQuery.error as Error).message ?? 'No se pudieron cargar los grupos'}
          </p>
        )}

        {activeGroups.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {activeGroups.map((group) => {
              const balanceCopy = describeBalance(group.userNetBalanceMinor, group.baseCurrency);
              const balanceTone =
                group.userNetBalanceMinor > 0
                  ? 'text-success'
                  : 'text-danger';
              return (
                <Link
                  key={group.id}
                  className="glass-card group p-5 transition hover:-translate-y-0.5 hover:shadow-xl"
                  href={`/grupos/detalle?id=${group.id}`}
                >
                  <header className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-text-primary">{group.name}</h3>
                    <span className="text-xs text-text-secondary">{group.memberCount} miembros</span>
                  </header>
                  <div className="mt-3 space-y-1 text-xs text-text-secondary">
                    <p>Creado {formatDate(group.createdAt)}</p>
                    <p>Último gasto {formatDate(group.lastExpenseAt)} · Base {group.baseCurrency}</p>
                    <p>Total del grupo {formatCurrency(group.totalSpendMinor, group.baseCurrency)}</p>
                    <p className={`font-semibold ${balanceTone}`}>{balanceCopy}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          !groupsQuery.isLoading && (
            <div className="rounded-2xl border border-dashed border-border-subtle bg-white/60 p-6 text-center text-sm text-text-secondary shadow-[0_6px_18px_rgba(0,0,0,0.06)] backdrop-blur-lg">
              {hasAnyGroup
                ? 'Ya no tienes cuentas pendientes en tus grupos activos.'
                : 'Todavía no perteneces a ningún grupo. Crea uno nuevo y comparte el enlace con tus amigos.'}
            </div>
          )
        )}
      </section>

      <section className={`${CARD_CLASS} space-y-4`}>
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-text-primary">Grupos con cuentas saldadas</h2>
          <p className="text-sm text-text-secondary">Aquí verás los grupos donde tu saldo neto es cero.</p>
        </header>

        {groupsQuery.isLoading && <p className="text-sm text-text-secondary">Comprobando grupos...</p>}

        {!groupsQuery.isLoading && settledGroups.length === 0 && (
          <p className="text-sm text-text-secondary">Aún no tienes grupos totalmente saldados. ¡Sigue equilibrando gastos!</p>
        )}

        {settledGroups.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {settledGroups.map((group) => (
              <Link
                key={group.id}
                className="glass-card p-5 transition hover:-translate-y-0.5 hover:shadow-xl"
                href={`/grupos/detalle?id=${group.id}`}
              >
                <header className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-text-primary">{group.name}</h3>
                  <span className="text-xs text-success">Todo en orden ✨</span>
                </header>
                <div className="mt-3 space-y-1 text-xs text-text-secondary">
                  <p>Creado {formatDate(group.createdAt)}</p>
                  <p>Último movimiento {formatDate(group.lastExpenseAt)} · Base {group.baseCurrency}</p>
                  <p>Total del grupo {formatCurrency(group.totalSpendMinor, group.baseCurrency)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
