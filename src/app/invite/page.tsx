'use client';

import AuthGate, { useAuth } from '@/components/AuthGate';
import { acceptInvite, fetchInviteByToken } from '@/lib/invites';
import { getSupabaseClient } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';

function formatDate(input?: string | null) {
  if (!input) return '—';
  try {
    return new Date(input).toLocaleString();
  } catch {
    return '—';
  }
}

function InviteContent() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams?.get('token') ?? '', [searchParams]);
  const { user, loading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const inviteQuery = useQuery({
    queryKey: ['invite', token],
    enabled: Boolean(token),
    queryFn: () => fetchInviteByToken(token),
  });

  const groupQuery = useQuery({
    queryKey: ['invite-group', inviteQuery.data?.group_id],
    enabled: Boolean(inviteQuery.data?.group_id),
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('groups')
        .select('id, name, base_currency')
        .eq('id', inviteQuery.data?.group_id ?? '')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) {
        throw new Error('Necesitas iniciar sesión para unirte al grupo');
      }
      if (!token) {
        throw new Error('Enlace inválido');
      }
      return acceptInvite({ token, userId: user.id });
    },
    onSuccess: (groupId) => {
      queryClient.invalidateQueries({ queryKey: ['groups', user?.id] });
      router.push(`/groups?selected=${groupId}`);
    },
  });

  if (!token) {
    return (
      <AuthGate>
        <main className="p-6 space-y-4">
          <h1 className="text-2xl font-semibold">Invitación inválida</h1>
          <p className="text-sm text-gray-600">Es necesario un parámetro token en el enlace.</p>
          <Link className="text-sm text-blue-600 hover:underline" href="/">
            Volver al inicio
          </Link>
        </main>
      </AuthGate>
    );
  }

  if (loading) {
    return <main className="p-6 text-sm text-gray-500">Comprobando invitación...</main>;
  }

  if (!user) {
    return null;
  }

  if (inviteQuery.isError) {
    return (
      <AuthGate>
        <main className="p-6 space-y-4">
          <h1 className="text-2xl font-semibold">No se pudo cargar la invitación</h1>
          <p className="text-sm text-gray-600">
            {(inviteQuery.error as Error).message ?? 'Inténtalo de nuevo más tarde.'}
          </p>
          <Link className="text-sm text-blue-600 hover:underline" href="/">
            Volver al inicio
          </Link>
        </main>
      </AuthGate>
    );
  }

  const invite = inviteQuery.data;

  if (!invite) {
    return (
      <AuthGate>
        <main className="p-6 space-y-4">
          <h1 className="text-2xl font-semibold">Invitación no encontrada</h1>
          <p className="text-sm text-gray-600">Es posible que haya caducado o ya haya sido aceptada.</p>
          <Link className="text-sm text-blue-600 hover:underline" href="/">
            Volver al inicio
          </Link>
        </main>
      </AuthGate>
    );
  }

  if (invite.status !== 'pending') {
    return (
      <AuthGate>
        <main className="p-6 space-y-4">
          <h1 className="text-2xl font-semibold">Invitación no disponible</h1>
          <p className="text-sm text-gray-600">Esta invitación ya no se puede utilizar.</p>
          <Link className="text-sm text-blue-600 hover:underline" href={`/groups?selected=${invite.group_id}`}>
            Ir al grupo
          </Link>
        </main>
      </AuthGate>
    );
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return (
      <AuthGate>
        <main className="p-6 space-y-4">
          <h1 className="text-2xl font-semibold">Invitación expirada</h1>
          <p className="text-sm text-gray-600">Solicita una nueva invitación al propietario del grupo.</p>
          <Link className="text-sm text-blue-600 hover:underline" href="/">
            Volver al inicio
          </Link>
        </main>
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <main className="p-6 space-y-6">
        <header className="space-y-2">
          <p className="text-sm text-gray-500">Invitación para {invite.email}</p>
          <h1 className="text-2xl font-semibold">Unirte a {groupQuery.data?.name ?? 'un grupo'}</h1>
          <p className="text-sm text-gray-600">El enlace expira {formatDate(invite.expires_at)}</p>
        </header>

        <button
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60"
          disabled={acceptMutation.isPending}
          onClick={() => acceptMutation.mutate()}
        >
          {acceptMutation.isPending ? 'Uniendo...' : 'Unirme al grupo'}
        </button>

        {acceptMutation.isError && (
          <p className="text-sm text-red-600">
            {(acceptMutation.error as Error).message ?? 'No se pudo aceptar la invitación'}
          </p>
        )}

        <Link className="text-sm text-blue-600 hover:underline" href="/">
          Volver a inicio
        </Link>
      </main>
    </AuthGate>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Cargando invitación...</div>}>
      <InviteContent />
    </Suspense>
  );
}
