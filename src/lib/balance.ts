import { computeUserTotals } from '@/lib/finance';
import { simplifyDebts } from '@/lib/money';
import { getSupabaseClient } from '@/lib/supabase';

export type GroupBalanceSummary = {
  balances: Awaited<ReturnType<typeof computeUserTotals>>;
  transfers: ReturnType<typeof simplifyDebts>;
};

export async function getGroupBalance(groupId: string): Promise<GroupBalanceSummary> {
  const balances = await computeUserTotals(groupId);
  const transfers = simplifyDebts(
    balances.map(({ userId, netBalanceCents }) => ({ userId, netBalanceCents })),
  );

  return { balances, transfers } satisfies GroupBalanceSummary;
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
