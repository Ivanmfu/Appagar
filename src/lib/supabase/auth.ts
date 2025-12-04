import { AuthApiError, AuthError, PostgrestError } from '@supabase/supabase-js';
import { Logger } from '../logger';

export function isAuthError(error: unknown): boolean {
  if (!error) return false;

  if (error instanceof AuthApiError || error instanceof AuthError) return true;
  if (error instanceof PostgrestError && (error.status === 401 || error.status === 403)) return true;

  const status = (error as { status?: number })?.status;
  if (status === 401 || status === 403) return true;

  const code = (error as { code?: string })?.code;
  if (code && ['PGRST301', 'PGRST302'].includes(code)) return true;

  return false;
}

export async function handleAuthError(error: unknown, reason: string, onInvalidSession: () => void) {
  if (!isAuthError(error)) return;
  Logger.warn('Auth', 'Auth error detected', { reason, error });
  onInvalidSession();
}
