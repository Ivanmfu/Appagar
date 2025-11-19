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

const CARD_BASE_CLASS = 'relative overflow-hidden glass-card p-8 shadow-[0_18px_36px_rgba(15,23,42,0.15)]';

const CARD_ACCENTS: Record<'info' | 'warn' | 'error' | 'success', string> = {
  info: 'from-primary/15 via-primary-soft/20 to-primary/10',
  warn: 'from-amber-400/15 via-amber-300/10 to-amber-200/5',
  error: 'from-danger/15 via-danger-soft/20 to-danger/10',
  success: 'from-success/15 via-success-soft/20 to-success/10',
};

const PRIMARY_BUTTON_CLASS = 'btn-primary w-full justify-center sm:w-auto disabled:cursor-not-allowed disabled:opacity-70';

const SECONDARY_BUTTON_CLASS = 'btn-secondary w-full justify-center sm:w-auto';

function InviteBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-40 left-1/2 h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-primary/15 blur-[160px]" />
      <div className="absolute bottom-[-4rem] left-[-3rem] h-[24rem] w-[24rem] rounded-full bg-success-soft/60 blur-[140px]" />
      <div className="absolute -bottom-24 right-0 h-[26rem] w-[26rem] translate-x-1/4 rounded-full bg-primary-soft/70 blur-[150px]" />
      <div className="absolute top-32 right-16 h-[18rem] w-[18rem] rounded-full bg-white/40 blur-[120px]" />
    </div>
  );
}

function InviteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-16 text-text-primary">
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
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-text-secondary">Enlace no válido</p>
              <h1 className="text-3xl font-semibold text-text-primary">Invitación inválida</h1>
              <p className="text-sm text-text-secondary">Necesitas acceder mediante un enlace con token válido.</p>
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
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-text-secondary">Cargando</p>
            <h1 className="text-2xl font-semibold text-text-primary">Comprobando invitación...</h1>
            <p className="text-sm text-text-secondary">Estamos verificando tu sesión y el token recibido.</p>
          </header>
          <div className="flex justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
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
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-text-secondary">Cargando</p>
              <h1 className="text-2xl font-semibold text-text-primary">Buscando tu invitación</h1>
              <p className="text-sm text-text-secondary">Un momento, estamos trayendo los datos.</p>
            </header>
            <div className="flex justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
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
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-text-secondary">No disponible</p>
              <h1 className="text-3xl font-semibold text-text-primary">No se pudo cargar la invitación</h1>
              <p className="text-sm text-text-secondary">
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
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-text-secondary">No encontrado</p>
              <h1 className="text-3xl font-semibold text-text-primary">Invitación no encontrada</h1>
              <p className="text-sm text-text-secondary">Puede que haya caducado o ya haya sido utilizada.</p>
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
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-text-secondary">Invitación cerrada</p>
              <h1 className="text-3xl font-semibold text-text-primary">Esta invitación ya no está activa</h1>
              <p className="text-sm text-text-secondary">Puedes revisar el grupo para confirmar si ya formas parte.</p>
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
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-text-secondary">Invitación expirada</p>
              <h1 className="text-3xl font-semibold text-text-primary">Necesitas un enlace nuevo</h1>
              <p className="text-sm text-text-secondary">Solicita otra invitación al propietario del grupo.</p>
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
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-text-secondary">
              Invitación para {invite.receiver_email ?? invite.email}
            </p>
            <h1 className="text-3xl font-semibold text-text-primary">
              Únete a {groupQuery.data?.name ?? 'tu próximo grupo'}
            </h1>
            <p className="text-sm text-text-secondary">El enlace expira {formatDate(invite.expires_at)}</p>
          </header>

          <div className="glass-list-item border border-white/40 bg-white/30 p-5 text-sm text-text-secondary">
            <dl className="space-y-3">
              <div className="flex justify-between gap-4">
                <dt className="text-xs font-semibold uppercase tracking-[0.25em] text-text-secondary/80">Grupo</dt>
                <dd className="text-sm font-medium text-text-primary">
                  {groupQuery.data?.name ?? (groupQuery.isLoading ? 'Cargando…' : 'Grupo privado')}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-xs font-semibold uppercase tracking-[0.25em] text-text-secondary/80">Estado</dt>
                <dd className="text-sm font-medium text-success">Disponible</dd>
              </div>
              {groupQuery.data?.base_currency && (
                <div className="flex justify-between gap-4">
                  <dt className="text-xs font-semibold uppercase tracking-[0.25em] text-text-secondary/80">Divisa base</dt>
                  <dd className="text-sm font-medium text-text-primary">{groupQuery.data.base_currency}</dd>
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
            <p className="text-sm text-danger">
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
    <Suspense fallback={<div className="p-6 text-sm text-text-secondary">Cargando invitación...</div>}>
      <InviteContent />
    </Suspense>
  );
}
