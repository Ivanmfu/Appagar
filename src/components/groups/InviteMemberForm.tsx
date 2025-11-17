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
      const invite = await createGroupInvite({ groupId, email, createdBy });
      const origin = typeof window === 'undefined' ? '' : window.location.origin;
      const basePath = resolveBasePath();
      const normalizedBasePath = basePath
        ? basePath.endsWith('/')
          ? basePath.slice(0, -1)
          : basePath
        : '';
      const link = `${origin}${normalizedBasePath}/invite?token=${invite.token}`;
      setInviteLink(link);
      return invite;
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
    <form className="space-y-3" onSubmit={onSubmit}>
      <div>
        <h3 className="text-base font-semibold">Invitar miembro</h3>
        <p className="text-xs text-gray-500">Enviaremos un enlace válido durante 48 horas.</p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Email de la persona
        <input
          className="border rounded px-3 py-2"
          placeholder="persona@email.com"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        className="bg-blue-600 text-text-primary px-4 py-2 rounded disabled:opacity-60"
        disabled={mutation.isPending}
        type="submit"
      >
        {mutation.isPending ? 'Enviando...' : 'Generar invitación'}
      </button>

      {inviteLink && (
        <div className="border rounded p-3 text-sm space-y-2">
          <p className="font-medium">Invitación generada</p>
          <p className="break-all text-gray-600">{inviteLink}</p>
          <button className="text-blue-600 hover:underline" type="button" onClick={copyLink}>
            Copiar enlace
          </button>
        </div>
      )}
    </form>
  );
}
