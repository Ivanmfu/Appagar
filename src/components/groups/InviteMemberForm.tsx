"use client";

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';

type InviteResult = {
  invite: {
    id: string;
    token: string;
  };
  alreadyRegistered: boolean;
  receiverProfile: {
    display_name: string | null;
    email: string | null;
  } | null;
};

async function createGroupInvite(params: {
  groupId: string;
  email: string;
}): Promise<InviteResult> {
  const res = await fetch('/api/invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Error al crear invitación');
  }
  return res.json();
}

// Generador de enlace sin email (solo para copiar/WhatsApp)
async function createLinkOnlyInvite(groupId: string): Promise<string> {
  const res = await fetch('/api/invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupId, email: '' }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Error al crear enlace');
  }
  const result = await res.json();
  return result.invite.token;
}

export function InviteMemberForm({ groupId }: { groupId: string }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function resolveBasePath() {
    const fromEnv = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    if (fromEnv) return fromEnv;
    if (typeof window !== 'undefined') {
      const maybeData = (window as typeof window & {
        __NEXT_DATA__?: { config?: { basePath?: string } };
      }).__NEXT_DATA__;
      if (maybeData?.config?.basePath) return maybeData.config.basePath;
    }
    return '';
  }

  function buildLink(token: string) {
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    const basePath = resolveBasePath().replace(/\/$/, '');
    return `${origin}${basePath}/invite?token=${token}`;
  }

  // Mutación para invitación por email
  const emailMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      const result = await createGroupInvite({ groupId, email });
      const link = buildLink(result.invite.token);
      setInviteLink(link);
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['group-detail', groupId] });
      setEmail('');
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Error al enviar');
    },
  });

  // Mutación para generar enlace
  const linkMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      const token = await createLinkOnlyInvite(groupId);
      const link = buildLink(token);
      setInviteLink(link);
      return link;
    },
    onSuccess: async (link) => {
      await queryClient.invalidateQueries({ queryKey: ['group-detail', groupId] });
      await copyToClipboard(link);
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Error al generar enlace');
    },
  });

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('No se pudo copiar');
    }
  }

  function onEmailSubmit(event: FormEvent) {
    event.preventDefault();
    emailMutation.mutate();
  }

  function shareWhatsApp() {
    if (inviteLink) {
      const text = encodeURIComponent(`¡Únete a mi grupo en Appagar! 🎉\n\n${inviteLink}`);
      window.open(`https://wa.me/?text=${text}`, '_blank');
    } else {
      // Generar enlace primero y luego compartir
      linkMutation.mutateAsync().then((link) => {
        const text = encodeURIComponent(`¡Únete a mi grupo en Appagar! 🎉\n\n${link}`);
        window.open(`https://wa.me/?text=${text}`, '_blank');
      });
    }
  }

  const isLoading = emailMutation.isPending || linkMutation.isPending;

  return (
    <div className="space-y-4">
      {/* Header compacto */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Invitar amigos</h3>
          <p className="text-xs text-text-secondary">Enlace válido 48h</p>
        </div>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {/* Opción 1: Por correo */}
      <form className="space-y-2" onSubmit={onEmailSubmit}>
        <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Por correo
        </label>
        <div className="flex gap-2">
          <input
            className="input-field flex-1 text-sm"
            placeholder="email@ejemplo.com"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button
            className="btn-primary whitespace-nowrap px-3 py-2 text-xs"
            disabled={isLoading || !email}
            type="submit"
          >
            {emailMutation.isPending ? '...' : 'Enviar'}
          </button>
        </div>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border-light" />
        <span className="text-xs text-text-secondary">o</span>
        <div className="h-px flex-1 bg-border-light" />
      </div>

      {/* Opción 2: Copiar enlace */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          Por enlace
        </label>
        {inviteLink ? (
          <div className="flex items-center gap-2 rounded-xl border border-border-light bg-white/50 p-2">
            <span className="flex-1 truncate text-xs text-text-secondary">{inviteLink}</span>
            <button
              className="text-xs font-medium text-primary hover:underline"
              type="button"
              onClick={() => copyToClipboard(inviteLink)}
            >
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
        ) : (
          <button
            className="btn-secondary w-full justify-center text-xs"
            disabled={isLoading}
            type="button"
            onClick={() => linkMutation.mutate()}
          >
            {linkMutation.isPending ? 'Generando...' : 'Generar enlace'}
          </button>
        )}
      </div>

      {/* Opción 3: WhatsApp */}
      <button
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#20BD5A] active:scale-[0.98]"
        disabled={isLoading}
        type="button"
        onClick={shareWhatsApp}
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        Compartir por WhatsApp
      </button>
    </div>
  );
}
