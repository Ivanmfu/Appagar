"use client";

import { createGroupInvite } from '@/lib/invites';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';

type Props = {
  groupId: string;
  createdBy: string;
};

export function InviteMemberForm({ groupId, createdBy }: Props) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  function resolveBasePath() {
    const fromEnv = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    if (fromEnv) {
      return fromEnv;
    }

    if (typeof window !== 'undefined') {
      const maybeData = (window as typeof window & {
        __NEXT_DATA__?: { config?: { basePath?: string } };
      }).__NEXT_DATA__;
      if (maybeData?.config?.basePath) {
        return maybeData.config.basePath;
      }

      const knownRoutes = new Set([
        '',
        'amigos',
        'grupos',
        'actividad',
        'cuenta',
        'invite',
        'login',
      ]);

      const segments = window.location.pathname.split('/').filter(Boolean);
      if (segments.length > 0) {
        const candidate = segments[0];
        if (!knownRoutes.has(candidate)) {
          return `/${candidate}`;
        }
      }
    }

    return '';
  }

  const mutation = useMutation({
    mutationFn: async () => {
      setError(null);
      const result = await createGroupInvite({ groupId, email, createdBy });
      setInfoMessage(null);
      const origin = typeof window === 'undefined' ? '' : window.location.origin;
      const basePath = resolveBasePath();
      const normalizedBasePath = basePath
        ? basePath.endsWith('/')
          ? basePath.slice(0, -1)
          : basePath
        : '';
      if (result.kind === 'group') {
        const link = `${origin}${normalizedBasePath}/invite?token=${result.invite.token}`;
        setInviteLink(link);
        return result;
      }

      setInviteLink(null);
      const friendlyName = result.receiverProfile.display_name ?? result.receiverProfile.email ?? 'la persona invitada';
      setInfoMessage(`${friendlyName} ya tiene cuenta. Se ha enviado una invitación interna para conectar.`);
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['group-detail', groupId] });
      setEmail('');
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'No se pudo enviar la invitación';
      setError(message);
    },
  });

  async function copyLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
    } catch (err) {
      console.error('No se pudo copiar el enlace', err);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <h3 className="text-base font-semibold text-text-primary">Invitar miembro</h3>
        <p className="text-xs text-text-secondary">Enviaremos un enlace válido durante 48 horas.</p>
      </div>

      <label className="flex flex-col gap-2 text-sm text-text-secondary">
        Email de la persona
        <input
          className="input-field"
          placeholder="persona@email.com"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (error) setError(null);
            if (infoMessage) setInfoMessage(null);
          }}
          required
        />
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}
      {infoMessage && <p className="text-sm text-success">{infoMessage}</p>}

      <button
        className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
        disabled={mutation.isPending}
        type="submit"
      >
        {mutation.isPending ? 'Enviando...' : 'Generar invitación'}
      </button>

      {inviteLink && (
        <div className="glass-list-item space-y-2 p-3 text-sm">
          <p className="font-medium text-text-primary">Invitación generada</p>
          <p className="break-all text-text-secondary">{inviteLink}</p>
          <button className="btn-secondary text-xs" type="button" onClick={copyLink}>
            Copiar enlace
          </button>
        </div>
      )}
    </form>
  );
}
