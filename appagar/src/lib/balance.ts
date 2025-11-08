import { getSupabaseClient } from '@/lib/supabase';
import { simplifyDebts } from '@/lib/money';

export async function getGroupBalance(groupId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('group_balance')
    .select('*')
    .eq('group_id', groupId);

  if (error) throw error;

  const rows = data ?? [];

  // Convertir a formato para simplifyDebts
  const nets = rows.map((row) => ({
    userId: row.user_id,
    net: row.net_minor
  }));

  // Obtener transacciones simplificadas
  const transactions = simplifyDebts(nets);

  return { balances: rows, transactions };
}
