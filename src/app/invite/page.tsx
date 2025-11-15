'use client';

import AuthGate, { useAuth } from '@/components/AuthGate';
import { acceptInvite, fetchInviteByToken } from '@/lib/invites';
import { getSupabaseClient } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, type ReactNode } from 'react';

function formatDate(input?: string | null) {
  if (!input) return '—';
  try {
    return new Date(input).toLocaleString();
  } catch {
    return '—';
  }
}

const CARD_BASE_CLASS =
  'relative overflow-hidden rounded-3xl border border-white/15 bg-slate-900/70 p-8 shadow-xl shadow-black/40 backdrop-blur-2xl';

const CARD_ACCENTS: Record<'info' | 'warn' | 'error' | 'success', string> = {
  info: 'from-indigo-500/30 via-purple-500/15 to-blue-500/10',
  warn: 'from-amber-500/25 via-orange-500/15 to-yellow-400/10',
  error: 'from-rose-500/30 via-red-500/15 to-amber-500/10',
  success: 'from-emerald-500/25 via-teal-500/15 to-cyan-500/10',
};

const PRIMARY_BUTTON_CLASS =
  'inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 transition hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-70';

const SECONDARY_BUTTON_CLASS =
  'inline-flex items-center justify-center rounded-full border border-white/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/40 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

function InviteBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-36 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-purple-500/30 blur-3xl" />
      <div className="absolute bottom-0 left-6 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl" />
      <div className="absolute -bottom-24 right-10 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="absolute top-20 right-0 h-60 w-60 rounded-full bg-cyan-400/15 blur-2xl" />
    </div>
  );
}

function InviteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-950 px-4 py-16 text-slate-100">
      <InviteBackdrop />
      <div className="relative w-full max-w-xl">{children}</div>
    </div>
  );
}

function InviteCard({ accent = 'info', children }: { accent?: 'info' | 'warn' | 'error' | 'success'; children: ReactNode }) {
  const gradient = CARD_ACCENTS[accent] ?? CARD_ACCENTS.info;
  return (
    <section className={`${CARD_BASE_CLASS}`}>
      <div className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${gradient} opacity-80`} aria-hidden />
      <div className="relative space-y-6">{children}</div>
    </section>
  );
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
      router.push(`/grupos/detalle?id=${groupId}`);
    },
  });

  if (!token) {
    return (
      <AuthGate>
        <InviteLayout>
          <InviteCard accent="error">
            <header className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-200/70">Enlace no válido</p>
              <h1 className="text-3xl font-semibold text-white">Invitación inválida</h1>
              <p className="text-sm text-slate-200/80">Necesitas acceder mediante un enlace con token válido.</p>
            </header>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link className={SECONDARY_BUTTON_CLASS} href="/">
                Volver al inicio
              </Link>
            </div>
          </InviteCard>
        </InviteLayout>
      </AuthGate>
    );
  }

  if (loading) {
    return (
      <InviteLayout>
        <InviteCard accent="info">
          <header className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-200/70">Cargando</p>
            <h1 className="text-2xl font-semibold text-white">Comprobando invitación...</h1>
            <p className="text-sm text-slate-200/80">Estamos verificando tu sesión y el token recibido.</p>
          </header>
          <div className="flex justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        </InviteCard>
      </InviteLayout>
    );
  }

  if (!user) {
    return null;
  }

  if (inviteQuery.isLoading) {
    return (
      <AuthGate>
        <InviteLayout>
          <InviteCard accent="info">
            <header className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-200/70">Cargando</p>
              <h1 className="text-2xl font-semibold text-white">Buscando tu invitación</h1>
              <p className="text-sm text-slate-200/80">Un momento, estamos trayendo los datos.</p>
            </header>
            <div className="flex justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            </div>
          </InviteCard>
        </InviteLayout>
      </AuthGate>
    );
  }

  if (inviteQuery.isError) {
    return (
      <AuthGate>
        <InviteLayout>
          <InviteCard accent="error">
            <header className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-200/70">No disponible</p>
              <h1 className="text-3xl font-semibold text-white">No se pudo cargar la invitación</h1>
              <p className="text-sm text-slate-200/80">
                {(inviteQuery.error as Error).message ?? 'Inténtalo de nuevo más tarde.'}
              </p>
            </header>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link className={SECONDARY_BUTTON_CLASS} href="/">
                Volver al inicio
              </Link>
            </div>
          </InviteCard>
        </InviteLayout>
      </AuthGate>
    );
  }

  const invite = inviteQuery.data;

  if (!invite) {
    return (
      <AuthGate>
        <InviteLayout>
          <InviteCard accent="error">
            <header className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-200/70">No encontrado</p>
              <h1 className="text-3xl font-semibold text-white">Invitación no encontrada</h1>
              <p className="text-sm text-slate-200/80">Puede que haya caducado o ya haya sido utilizada.</p>
            </header>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link className={SECONDARY_BUTTON_CLASS} href="/">
                Volver al inicio
              </Link>
            </div>
          </InviteCard>
        </InviteLayout>
      </AuthGate>
    );
  }

  if (invite.status !== 'pending') {
    return (
      <AuthGate>
        <InviteLayout>
          <InviteCard accent="warn">
            <header className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-200/70">Invitación cerrada</p>
              <h1 className="text-3xl font-semibold text-white">Esta invitación ya no está activa</h1>
              <p className="text-sm text-slate-200/80">Puedes revisar el grupo para confirmar si ya formas parte.</p>
            </header>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link className={PRIMARY_BUTTON_CLASS} href={`/grupos/detalle?id=${invite.group_id}`}>
                Ir al grupo
              </Link>
              <Link className={SECONDARY_BUTTON_CLASS} href="/">
                Volver al inicio
              </Link>
            </div>
          </InviteCard>
        </InviteLayout>
      </AuthGate>
    );
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return (
      <AuthGate>
        <InviteLayout>
          <InviteCard accent="warn">
            <header className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-200/70">Invitación expirada</p>
              <h1 className="text-3xl font-semibold text-white">Necesitas un enlace nuevo</h1>
              <p className="text-sm text-slate-200/80">Solicita otra invitación al propietario del grupo.</p>
            </header>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link className={SECONDARY_BUTTON_CLASS} href="/">
                Volver al inicio
              </Link>
            </div>
          </InviteCard>
        </InviteLayout>
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <InviteLayout>
        <InviteCard accent="info">
          <header className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-200/70">
              Invitación para {invite.email}
            </p>
            <h1 className="text-3xl font-semibold text-white">
              Únete a {groupQuery.data?.name ?? 'tu próximo grupo'}
            </h1>
            <p className="text-sm text-slate-200/80">El enlace expira {formatDate(invite.expires_at)}</p>
          </header>

          <div className="rounded-2xl border border-white/15 bg-white/5 p-5 text-sm text-slate-200/80">
            <dl className="space-y-3">
              <div className="flex justify-between gap-4">
                <dt className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-300/80">Grupo</dt>
                <dd className="text-sm font-medium text-white">
                  {groupQuery.data?.name ?? (groupQuery.isLoading ? 'Cargando…' : 'Grupo privado')}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-300/80">Estado</dt>
                <dd className="text-sm font-medium text-emerald-200">Disponible</dd>
              </div>
              {groupQuery.data?.base_currency && (
                <div className="flex justify-between gap-4">
                  <dt className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-300/80">Divisa base</dt>
                  <dd className="text-sm font-medium text-white">{groupQuery.data.base_currency}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              className={PRIMARY_BUTTON_CLASS}
              disabled={acceptMutation.isPending}
              onClick={() => acceptMutation.mutate()}
              type="button"
            >
              {acceptMutation.isPending ? 'Uniendo…' : 'Unirme al grupo'}
            </button>
            <Link className={SECONDARY_BUTTON_CLASS} href="/">
              Volver al inicio
            </Link>
          </div>

          {acceptMutation.isError && (
            <p className="text-sm text-rose-200">
              {(acceptMutation.error as Error).message ?? 'No se pudo aceptar la invitación'}
            </p>
          )}
        </InviteCard>
      </InviteLayout>
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
