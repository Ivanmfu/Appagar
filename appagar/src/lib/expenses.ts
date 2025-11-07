import { getSupabaseClient } from '@/lib/supabase';

export async function createExpense({
  groupId, payerId, totalCents, currency = 'EUR',
  fxRate = 1, shares, note, category, date
}: {
  groupId: string; payerId: string; totalCents: number; currency?: string;
  fxRate?: number; shares: { userId: string; shareCents: number }[];
  note?: string; category?: string; date?: string;
}) {
  const supabase = getSupabaseClient();
  const amountBaseMinor = Math.round(totalCents * fxRate);
  const { data: exp, error: e1 } = await supabase
    .from('expenses')
    .insert([{
      group_id: groupId, payer_id: payerId,
      amount_minor: totalCents, currency, fx_rate: fxRate,
      amount_base_minor: amountBaseMinor, category, note, date
    }]).select().single();
  if (e1) throw e1;

  const rows = shares.map(s => ({ expense_id: exp.id, user_id: s.userId, share_minor: s.shareCents, is_included: true }));
  const { error: e2 } = await supabase.from('expense_participants').insert(rows);
  if (e2) throw e2;

  return exp;
}
