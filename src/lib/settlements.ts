import { getSupabaseClient } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

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
  if (!groupId) throw new Error('Falta el identificador del grupo');
  if (!fromUserId || !toUserId) {
    throw new Error('No se pudo determinar quién paga y recibe la liquidación');
  }
  if (fromUserId === toUserId) {
    throw new Error('La liquidación requiere dos personas distintas');
  }

  const sanitizedAmount = Math.trunc(amountMinor);
  if (sanitizedAmount <= 0) {
    throw new Error('La cantidad a liquidar debe ser mayor que cero');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('settlements')
    .insert({
      group_id: groupId,
      from_user_id: fromUserId,
      to_user_id: toUserId,
      amount_minor: sanitizedAmount,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('No se pudo registrar la liquidación');
  }

  return data as SettlementRow;
}
