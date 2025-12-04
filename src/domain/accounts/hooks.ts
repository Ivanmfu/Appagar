import { useMutation } from '@tanstack/react-query';

import { getUserMessage } from '@/lib/errors';

import {
  signOutSession,
  updateDisplayName,
  updateEmail,
  updatePassword,
} from './api';
import type { UpdateEmailResult, UpdatePasswordInput } from './types';

type AccountHooksOptions = {
  userId?: string | null;
  onSessionInvalid?: () => void;
  onProfileChanged?: () => Promise<void> | void;
};

export function useAccountMutations({ userId, onSessionInvalid, onProfileChanged }: AccountHooksOptions) {
  const updateNameMutation = useMutation({
    mutationFn: async (nextDisplayName: string) => {
      const normalized = await updateDisplayName({
        userId: userId ?? '',
        displayName: nextDisplayName,
      });
      await onProfileChanged?.();
      return normalized;
    },
  });

  const updateEmailMutation = useMutation<UpdateEmailResult, unknown, { nextEmail: string; currentEmail?: string }>(
    {
      mutationFn: async ({ nextEmail, currentEmail }) => {
        const result = await updateEmail({
          userId: userId ?? '',
          email: nextEmail,
          currentEmail,
        });
        await onProfileChanged?.();
        return result;
      },
    }
  );

  const updatePasswordMutation = useMutation({
    mutationFn: async ({ password, confirmPassword }: UpdatePasswordInput) => {
      const result = await updatePassword({ password, confirmPassword });
      await onProfileChanged?.();
      return result;
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => signOutSession(),
    onSuccess: () => onSessionInvalid?.(),
    onError: (error: unknown) => {
      const message = getUserMessage(error, 'No se pudo cerrar sesión.');
      console.error('[Account] Sign out failed:', message);
    },
  });

  return {
    updateNameMutation,
    updateEmailMutation,
    updatePasswordMutation,
    logoutMutation,
  };
}
