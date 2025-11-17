'use client';

import { useAuth } from '@/components/AuthGate';
import { fetchUserGroups, GroupSummary } from '@/lib/groups';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo } from 'react';

const CARD_CLASS = 'glass-card p-6';

function formatDateTime(input?: string | null) {
  if (!input) return '—';
  try {
    const date = new Date(input);
    return `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return '—';
  }
}

export default function ActivityPage() {
  const { user } = useAuth();

  const groupsQuery = useQuery({
    queryKey: ['groups', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return [] as GroupSummary[];
      return fetchUserGroups(user.id);
    },
  });

  const sortedByActivity = useMemo(() => {
    const data = groupsQuery.data ?? [];
    return [...data].sort((a, b) => {
      const aTime = a.lastExpenseAt ? new Date(a.lastExpenseAt).getTime() : 0;
      const bTime = b.lastExpenseAt ? new Date(b.lastExpenseAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [groupsQuery.data]);

  return (
    <div className="space-y-6">
      <section className={`${CARD_CLASS} space-y-4`}>
        <header className="space-y-2">
          <h2 className="text-lg font-semibold text-text-primary">Actividad reciente</h2>
          <p className="text-sm text-text-secondary">
            Consulta el último movimiento registrado en cada uno de tus grupos.
          </p>
        </header>

        {groupsQuery.isLoading && <p className="text-sm text-text-secondary">Cargando actividad...</p>}
        {groupsQuery.error && (
          <p className="text-sm text-danger">
            {(groupsQuery.error as Error).message ?? 'No se pudo recuperar la actividad reciente'}
          </p>
        )}

        {sortedByActivity.length > 0 ? (
          <ul className="space-y-3">
            {sortedByActivity.map((group) => (
              <li key={group.id} className="glass-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{group.name}</p>
                    <p className="text-xs text-text-secondary">Último movimiento {formatDateTime(group.lastExpenseAt)}</p>
                  </div>
                  <Link className="text-xs font-semibold text-primary underline-offset-2 hover:text-text-primary hover:underline" href={`/grupos/detalle?id=${group.id}`}>
                    Abrir grupo
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          !groupsQuery.isLoading && (
            <div className="rounded-2xl border border-dashed border-white/20 p-6 text-center text-sm text-text-secondary">
              Todavía no hay movimientos. Registra gastos para verlos aquí.
            </div>
          )
        )}
      </section>
    </div>
  );
}
