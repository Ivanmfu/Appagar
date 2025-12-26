'use client';

import { useAuth } from '@/components/AuthGate';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

// Tipo local para items de actividad
type ActivityFeedItem = {
  id: string;
  groupId: string | null;
  groupName: string;
  actorId: string | null;
  actorName: string;
  action: 'expense_created' | 'expense_updated' | 'expense_deleted' | 'group_created' | 'group_deleted';
  payload: {
    amountMinor?: number;
    currency?: string;
    note?: string;
    groupName?: string;
  };
  createdAt: string;
};

// Función de API
async function fetchActivityFeed(): Promise<ActivityFeedItem[]> {
  const res = await fetch('/api/activity');
  if (!res.ok) throw new Error('Error al cargar actividad');
  return res.json();
}

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

function formatCurrency(minor?: number, currency: string = 'EUR') {
  if (!minor || !Number.isFinite(minor)) return '—';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
  }).format(minor / 100);
}

function getActionLabel(action: ActivityFeedItem['action']) {
  switch (action) {
    case 'expense_created':
      return 'Nuevo gasto';
    case 'expense_updated':
      return 'Gasto editado';
    case 'expense_deleted':
      return 'Gasto eliminado';
    case 'group_created':
      return 'Grupo creado';
    case 'group_deleted':
      return 'Grupo eliminado';
    default:
      return 'Actividad';
  }
}

function describeActivity(item: ActivityFeedItem) {
  const amount = formatCurrency(item.payload.amountMinor, item.payload.currency ?? 'EUR');
  const hasAmount = amount !== '—';
  const note = item.payload.note ? ` «${item.payload.note}»` : '';

  switch (item.action) {
    case 'expense_created':
      return `${item.actorName} registró un gasto de ${amount}${note} en ${item.groupName}.`;
    case 'expense_updated':
      return `${item.actorName} actualizó un gasto de ${amount}${note} en ${item.groupName}.`;
    case 'expense_deleted':
      return `${item.actorName} eliminó ${hasAmount ? `un gasto de ${amount}` : 'un gasto'}${note} en ${item.groupName}.`;
    case 'group_created':
      return `${item.actorName} creó el grupo ${item.groupName}.`;
    case 'group_deleted':
      return `${item.actorName} eliminó el grupo ${item.payload.groupName ?? item.groupName}.`;
    default:
      return `${item.actorName} registró actividad en ${item.groupName}.`;
  }
}

export default function ActivityPage() {
  const { user } = useAuth();

  const activityQuery = useQuery({
    queryKey: ['activity', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return [] as ActivityFeedItem[];
      return fetchActivityFeed();
    },
    staleTime: 10_000,
  });

  const feed = activityQuery.data ?? [];

  return (
    <div className="space-y-6">
      <section className={`${CARD_CLASS} space-y-4`}>
        <header className="space-y-2">
          <h2 className="text-lg font-semibold text-text-primary">Actividad reciente</h2>
          <p className="text-sm text-text-secondary">
            Todas las acciones relevantes de tus grupos aparecen aquí al instante.
          </p>
        </header>

        {activityQuery.isLoading && <p className="text-sm text-text-secondary">Cargando actividad...</p>}
        {activityQuery.error && (
          <p className="text-sm text-danger">
            {(activityQuery.error as Error).message ?? 'No se pudo recuperar la actividad reciente.'}
          </p>
        )}

        {feed.length > 0 ? (
          <ul className="space-y-3">
            {feed.map((item) => (
              <li
                key={item.id}
                className="glass-list-item space-y-2 border border-white/40 bg-white/30 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-text-primary">{item.actorName}</p>
                    <p className="text-xs text-text-secondary">{describeActivity(item)}</p>
                  </div>
                  <span className="rounded-full border border-white/40 bg-white/40 px-3 py-1 text-xs font-medium text-text-secondary backdrop-blur">
                    {getActionLabel(item.action)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-secondary">
                  <span>{formatDateTime(item.createdAt)}</span>
                  <span className="font-medium text-text-primary/80">{item.groupName}</span>
                </div>
                {item.payload.note && item.action !== 'group_deleted' && (
                  <p className="text-xs italic text-text-secondary/80">“{item.payload.note}”</p>
                )}
                {item.groupId && (
                  <div className="pt-2">
                    <Link
                      className="text-xs font-semibold text-primary underline-offset-2 hover:text-text-primary hover:underline"
                      href={`/grupos/detalle?id=${item.groupId}`}
                    >
                      Ver detalles del grupo
                    </Link>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          !activityQuery.isLoading && (
            <div className="rounded-2xl border border-dashed border-white/20 p-6 text-center text-sm text-text-secondary">
              Todavía no hay actividad registrada. Crea o edita gastos para empezar a verla aquí.
            </div>
          )
        )}
      </section>
    </div>
  );
}
