import { getSupabaseClient } from '@/lib/supabase';
import { simplifyDebts } from '@/lib/money';
import { Database } from '@/lib/database.types';

type GroupBalanceRow = Database['public']['Views']['group_balance']['Row'];

export async function getGroupBalance(groupId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('group_balance')
    .select('*')
    .eq('group_id', groupId);

  if (error) throw error;

  const rows = (data ?? []) as GroupBalanceRow[];

  // Convertir a formato para simplifyDebts
  const nets = rows.map((row) => ({
    userId: row.user_id,
    net: row.net_minor
  }));

  // Obtener transacciones simplificadas
  const transactions = simplifyDebts(nets);

  return { balances: rows, transactions };
}
