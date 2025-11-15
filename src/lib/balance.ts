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

export async function simplifyGroupDebts(groupId: string) {
  const supabase = getSupabaseClient();

  try {
    const rpc = supabase.rpc as unknown as (
      fn: string,
      params?: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message: string } | null }>;

    const { error } = await rpc('simplify_group_debts', { group_id: groupId });
    if (error) {
      // Cuando el procedimiento no exista todavía, continuamos con la lógica en memoria.
      console.warn('simplify_group_debts RPC no disponible', error);
    }
  } catch (rpcError) {
    console.warn('Error al ejecutar simplify_group_debts RPC', rpcError);
  }

  // Siempre devolvemos un balance recalculado para refrescar la vista.
  return getGroupBalance(groupId);
}
