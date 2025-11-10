import { getSupabaseClient } from '@/lib/supabase';
import { simplifyDebts } from '@/lib/money';

type GroupBalanceRow = {
  group_id: string;
  user_id: string;
  net_minor: number;
};

export async function getGroupBalance(groupId: string) {
  const supabase = getSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
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
