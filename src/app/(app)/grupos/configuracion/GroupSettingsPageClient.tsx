'use client';

import { useAuth } from '@/components/AuthGate';
import { InviteMemberForm } from '@/components/groups/InviteMemberForm';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

// Tipos locales
type GroupMember = {
  userId: string;
  displayName: string | null;
  email: string | null;
  joinedAt: string | null;
  role: string | null;
  isActive: boolean;
};

type GroupInvite = {
  id: string;
  receiverEmail: string | null;
  receiverId: string | null;
  status: string;
  expiresAt: string | null;
};

type GroupDetail = {
  group: {
    id: string;
    name: string;
    base_currency: string;
    created_by: string | null;
    created_at: string;
  };
  members: GroupMember[];
  invites: GroupInvite[];
};

// Funciones de API
async function fetchGroupDetail(groupId: string): Promise<GroupDetail> {
  const res = await fetch(`/api/groups/${groupId}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Error al cargar grupo');
  }
  return res.json();
}

async function deleteGroup(params: { groupId: string }): Promise<void> {
  const res = await fetch(`/api/groups/${params.groupId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Error al eliminar grupo');
  }
}

const CARD_CLASS = 'glass-card p-6';

function formatDate(input?: string | null) {
  if (!input) return '—';
  try {
    return new Date(input).toLocaleDateString();
  } catch {
    return '—';
  }
}

export default function GroupSettingsPageClient() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [groupId, setGroupId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);

  useEffect(() => {
    const id = searchParams?.get('id');
    if (id) {
      setGroupId(id);
    } else {
      router.replace('/grupos');
    }
  }, [router, searchParams]);

  const detailQuery = useQuery({
    queryKey: ['group-detail', groupId],
    enabled: Boolean(groupId),
    queryFn: async () => {
      if (!groupId) throw new Error('Grupo no encontrado');
      return fetchGroupDetail(groupId);
    },
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (targetGroupId: string) => {
      if (!user?.id) {
        throw new Error('Necesitas iniciar sesión para eliminar el grupo');
      }
      return deleteGroup({ groupId: targetGroupId });
    },
    onSuccess: async (_data, targetGroupId) => {
      setShowDeleteConfirm(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['groups', user?.id] }),
        queryClient.invalidateQueries({ queryKey: ['group-detail', targetGroupId] }),
        queryClient.invalidateQueries({ queryKey: ['activity', user?.id] }),
      ]);
      router.replace('/grupos');
    },
  });

  const pendingInvites = useMemo(() => {
    const invites = detailQuery.data?.invites ?? [];
    return invites.filter((invite) => {
      if (invite.status !== 'pending') return false;
      if (!invite.expiresAt) return true;
      return new Date(invite.expiresAt) > new Date();
    });
  }, [detailQuery.data?.invites]);

  const currentMemberRole = useMemo(() => {
    const detail = detailQuery.data;
    if (!detail || !user?.id) return null;
    return detail.members.find((member) => member.userId === user.id)?.role ?? null;
  }, [detailQuery.data, user?.id]);

  const canDeleteGroup = useMemo(() => {
    if (!detailQuery.data) return false;
    return currentMemberRole === 'owner' || user?.id === detailQuery.data.group.created_by;
  }, [currentMemberRole, detailQuery.data, user?.id]);

  if (!groupId) {
    return (
      <div className={CARD_CLASS}>
        <p className="text-sm text-text-secondary">Redirigiendo a tus grupos...</p>
      </div>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <div className={CARD_CLASS}>
        <p className="text-sm text-text-secondary">Cargando configuración del grupo...</p>
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <div className={`${CARD_CLASS} space-y-4`}>
        <p className="text-sm text-danger">
          {(detailQuery.error as Error).message ?? 'No se pudieron obtener los detalles del grupo'}
        </p>
        <Link
          className="inline-flex items-center text-sm text-primary underline-offset-2 hover:text-text-primary hover:underline"
          href="/grupos"
        >
          Volver a grupos
        </Link>
      </div>
    );
  }

  const detail = detailQuery.data;
  if (!detail) {
    return (
      <div className={CARD_CLASS}>
        <p className="text-sm text-danger">El grupo no existe o no tienes acceso.</p>
        <Link
          className="mt-4 inline-block text-sm text-primary underline-offset-2 hover:text-text-primary hover:underline"
          href="/grupos"
        >
          Volver a grupos
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          className="inline-flex items-center gap-2 text-sm text-primary underline-offset-2 hover:text-text-primary hover:underline"
          href={`/grupos/detalle?id=${detail.group.id}`}
        >
          ← Volver al grupo
        </Link>
        <Link
          className="text-sm font-semibold text-primary underline-offset-4 hover:text-text-primary hover:underline"
          href={`/grupos/editar?id=${detail.group.id}`}
        >
          Editar
        </Link>
      </div>

      <section className={`${CARD_CLASS} space-y-2`}>
        <h1 className="text-2xl font-semibold text-text-primary">{detail.group.name}</h1>
        <p className="text-sm text-text-secondary">
          Base {detail.group.base_currency} · {detail.members.length} miembros · Creado {formatDate(detail.group.created_at)}
        </p>
      </section>

      <section className={`${CARD_CLASS} space-y-4`}>
        <button
          type="button"
          onClick={() => setShowInviteForm((value) => !value)}
          className="flex w-full items-center justify-between rounded-2xl border border-white/30 bg-white/60 px-4 py-3 text-sm font-medium text-text-primary shadow-[0_6px_18px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft/80 text-lg">👤+</span>
            Invitar miembros
          </span>
          <span className="text-xs text-text-secondary">{showInviteForm ? 'Ocultar' : 'Abrir'}</span>
        </button>

        {showInviteForm && user?.id && (
          <div className="rounded-2xl border border-white/30 bg-white/70 p-5 shadow-[0_6px_18px_rgba(0,0,0,0.06)] backdrop-blur-xl">
            <InviteMemberForm createdBy={user.id} groupId={detail.group.id} />
          </div>
        )}

        {!user?.id && showInviteForm && (
          <p className="text-sm text-text-secondary">Necesitas iniciar sesión para enviar invitaciones.</p>
        )}

        {pendingInvites.length > 0 && (
          <div className="space-y-3 text-sm text-text-secondary">
            <h4 className="font-semibold text-text-primary">Invitaciones pendientes</h4>
            <ul className="grid gap-3 md:grid-cols-2">
              {pendingInvites.map((invite) => (
                <li key={invite.id} className="glass-card p-4">
                  <p className="font-medium text-text-primary">{invite.receiverEmail ?? 'Invitación sin email'}</p>
                  {invite.receiverId && (
                    <p className="text-xs text-success">La persona ya tiene cuenta y verá esta invitación directamente.</p>
                  )}
                  <p className="text-xs text-text-secondary">Expira {formatDate(invite.expiresAt)}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className={`${CARD_CLASS} space-y-4`}>
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-text-primary">Miembros activos</h2>
          <p className="text-sm text-text-secondary">Personas con acceso al grupo.</p>
        </header>
        {detail.members.length === 0 ? (
          <p className="text-sm text-text-secondary">Todavía no hay miembros activos en el grupo.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {detail.members.map((member) => (
              <li key={member.userId} className="glass-card p-4">
                <p className="text-sm font-semibold text-text-primary">{member.displayName ?? member.email ?? 'Miembro'}</p>
                {member.email && <p className="text-xs text-text-secondary">{member.email}</p>}
                {member.role && <p className="text-xs text-text-secondary">Rol: {member.role}</p>}
                <p className="mt-2 text-xs text-text-secondary">Desde {formatDate(member.joinedAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canDeleteGroup && (
        <section className={`${CARD_CLASS} space-y-4 border border-danger/40 bg-danger-soft/20`}>
          <div>
            <h3 className="text-lg font-semibold text-danger">Zona peligrosa</h3>
            <p className="text-sm text-text-secondary">
              Eliminar este grupo borrará todos los gastos, participantes e invitaciones asociadas. Esta acción no se puede deshacer.
            </p>
          </div>
          {deleteMutation.error && (
            <p className="text-sm text-danger">
              {(deleteMutation.error as Error).message ?? 'No se pudo eliminar el grupo en este momento.'}
            </p>
          )}
          <button
            type="button"
            className="btn-danger w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleteMutation.isPending}
          >
            Eliminar grupo
          </button>
        </section>
      )}

      {showDeleteConfirm && groupId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-10">
          <div className="absolute inset-0" onClick={() => (deleteMutation.isPending ? null : setShowDeleteConfirm(false))} />
          <div className="relative z-10 w-full max-w-lg">
            <div className="space-y-5 rounded-2xl border border-white/40 bg-white/70 p-6 shadow-xl backdrop-blur-2xl max-h-[80vh] overflow-y-auto">
              <h2 className="text-xl font-semibold text-text-primary">¿Eliminar el grupo?</h2>
              <p className="text-sm text-text-secondary">
                Esta operación eliminará permanentemente todos los gastos, miembros y asentamientos asociados a este grupo. No podrás recuperarlos más adelante.
              </p>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleteMutation.isPending}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-danger disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => deleteMutation.mutate(groupId)}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar definitivamente'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
