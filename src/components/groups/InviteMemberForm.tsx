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

// Función de API local
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

export function InviteMemberForm({ groupId }: { groupId: string }) {
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
      const result = await createGroupInvite({ groupId, email });
      setInfoMessage(null);
      const origin = typeof window === 'undefined' ? '' : window.location.origin;
      const basePath = resolveBasePath();
      const normalizedBasePath = basePath
        ? basePath.endsWith('/')
          ? basePath.slice(0, -1)
          : basePath
        : '';
      const link = `${origin}${normalizedBasePath}/invite?token=${result.invite.token}`;
      setInviteLink(link);

      if (result.alreadyRegistered && result.receiverProfile) {
        const friendlyName = result.receiverProfile.display_name ?? result.receiverProfile.email ?? 'la persona invitada';
        setInfoMessage(`${friendlyName} ya tiene cuenta y verá la invitación directamente en su bandeja.`);
      } else {
        setInfoMessage('La invitación quedó registrada. También puedes compartir el enlace si lo prefieres.');
      }

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
        <div className="glass-list-item space-y-3 p-3 text-sm">
          <p className="font-medium text-text-primary">Invitación generada</p>
          <p className="break-all text-text-secondary">{inviteLink}</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary text-xs" type="button" onClick={copyLink}>
              📋 Copiar enlace
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`¡Te invito a unirte a mi grupo en Appagar! 🎉\n\nÚnete aquí: ${inviteLink}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#20BD5A] active:scale-95"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              WhatsApp
            </a>
          </div>
        </div>
      )}
    </form>
  );
}
