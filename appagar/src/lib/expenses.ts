import { getSupabaseClient } from '@/lib/supabase';

export type CreateExpenseInput = {
  groupId: string;
  payerId: string;
  totalCents: number;
  currency?: string;
  fxRate?: number;
  shares: { userId: string; shareCents: number }[];
  note?: string;
  category?: string;
  date?: string;
};

export async function createExpense({
  groupId,
  payerId,
  totalCents,
  currency = 'EUR',
  fxRate = 1,
  shares,
  note,
  category,
  date,
}: CreateExpenseInput) {
  const supabase = getSupabaseClient();
  const amountBaseMinor = Math.round(totalCents * fxRate);

  const { data: expense, error: createExpenseError } = await supabase
    .from('expenses')
    .insert([
      {
        group_id: groupId,
        payer_id: payerId,
        amount_minor: totalCents,
        currency,
        fx_rate: fxRate,
        amount_base_minor: amountBaseMinor,
        category,
        note,
        date,
      },
    ])
    .select()
    .single();

  if (createExpenseError) throw createExpenseError;

  if (!expense) {
    throw new Error('No se pudo crear el gasto');
  }

  const rows = shares.map((share) => ({
    expense_id: expense.id,
    user_id: share.userId,
    share_minor: share.shareCents,
    is_included: true,
  }));

  const { error: participantsError } = await supabase
    .from('expense_participants')
    .insert(rows);

  if (participantsError) throw participantsError;

  return expense;
}
