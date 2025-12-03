import type { Database } from '@/lib/database.types';
import { AppError } from '@/lib/errors';
import { getSupabaseClient } from '@/lib/supabase';
import { validateSettlementInput } from '@/lib/validation';

export type SettlementRow = Database['public']['Tables']['settlements']['Row'];

export type CreateGroupSettlementInput = {
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
};

export async function settleGroupDebt({
  groupId,
  fromUserId,
  toUserId,
  amountMinor,
}: CreateGroupSettlementInput): Promise<SettlementRow> {
  const parsed = validateSettlementInput({ groupId, fromUserId, toUserId, amountMinor });
  if (parsed.fromUserId === parsed.toUserId) {
    throw AppError.validation('La liquidación requiere dos personas distintas');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('settlements')
    .insert({
      group_id: parsed.groupId,
      from_user_id: parsed.fromUserId,
      to_user_id: parsed.toUserId,
      amount_minor: Math.trunc(parsed.amountMinor),
    })
    .select()
    .single();

  if (error) {
    throw AppError.fromSupabase(error, 'No se pudo registrar la liquidación');
  }

  if (!data) {
    throw new AppError('unknown', 'No se pudo registrar la liquidación');
  }

  return data as SettlementRow;
}
