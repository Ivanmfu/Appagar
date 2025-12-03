import { AppError } from '@/lib/errors';
import { getSupabaseClient } from '@/lib/supabase';
import { normalizeEmailInput, normalizeNameInput, validatePasswordInput } from '@/lib/validation';
import {
  type UpdateDisplayNameInput,
  type UpdateEmailInput,
  type UpdateEmailResult,
  type UpdatePasswordInput,
} from './types';

export async function updateDisplayName({ userId, displayName }: UpdateDisplayNameInput) {
  if (!userId) {
    throw AppError.authRequired('Necesitas iniciar sesión para actualizar tu nombre.');
  }

  const supabase = getSupabaseClient();
  const normalized = normalizeNameInput(displayName);

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ display_name: normalized })
    .eq('id', userId);

  if (profileError) throw AppError.fromSupabase(profileError, 'No se pudo actualizar tu nombre.');

  const { error: authError } = await supabase.auth.updateUser({
    data: { display_name: normalized, full_name: normalized },
  });

  if (authError) throw AppError.fromSupabase(authError, 'No se pudo actualizar tu nombre.');

  return normalized;
}

export async function updateEmail({ userId, email, currentEmail }: UpdateEmailInput): Promise<UpdateEmailResult> {
  if (!userId) {
    throw AppError.authRequired('Necesitas iniciar sesión para actualizar tu correo.');
  }

  const supabase = getSupabaseClient();
  const normalized = normalizeEmailInput(email);

  const { error: authError } = await supabase.auth.updateUser({
    email: normalized,
  });

  if (authError) throw AppError.fromSupabase(authError, 'No se pudo actualizar tu correo.');

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ email: normalized })
    .eq('id', userId);

  if (profileError) throw AppError.fromSupabase(profileError, 'No se pudo actualizar tu correo.');

  const normalizedCurrent = currentEmail ? normalizeEmailInput(currentEmail) : undefined;

  return {
    normalizedEmail: normalized,
    requiresConfirmation: normalizedCurrent ? normalized !== normalizedCurrent : true,
  } satisfies UpdateEmailResult;
}

export async function updatePassword({ password, confirmPassword }: UpdatePasswordInput) {
  const validation = validatePasswordInput(password, confirmPassword);
  if (!validation.valid) {
    throw new AppError('validation', validation.message ?? 'La contraseña no es válida.');
  }

  const supabase = getSupabaseClient();
  const { error: authError } = await supabase.auth.updateUser({
    password: password.trim(),
  });

  if (authError) throw AppError.fromSupabase(authError, 'No se pudo actualizar tu contraseña.');
}

export async function signOutSession() {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw AppError.fromSupabase(error, 'No se pudo cerrar sesión.');
}
