import { computeShares } from '@/lib/finance';
import { getSupabaseClient } from '@/lib/supabase';
import { Database } from '@/lib/database.types';
import { logActivity } from '@/lib/activity';

type Expense = Database['public']['Tables']['expenses']['Row'];

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
  createdBy: string;
};

export type UpdateExpenseInput = {
  expenseId: string;
  groupId: string;
  payerId: string;
  totalCents: number;
  currency?: string;
  fxRate?: number;
  shares: { userId: string; shareCents: number }[];
  note?: string;
  category?: string;
  date?: string;
  updatedBy: string;
};

export type DeleteExpenseInput = {
  expenseId: string;
  groupId: string;
  deletedBy: string;
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
  createdBy,
}: CreateExpenseInput) {
  const supabase = getSupabaseClient();
  const amountBaseMinor = Math.round(totalCents * fxRate);

  const normalizedShares = computeShares({
    amountCents: totalCents,
    paidByUserId: payerId,
    shares,
  });

  const { data: expense, error: createExpenseError } = await supabase
    .from('expenses')
    .insert([
      {
        group_id: groupId,
        payer_id: payerId,
        created_by: createdBy,
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

  const expenseData = expense as Expense;

  const rows = normalizedShares.map((share) => ({
    expense_id: expenseData.id,
    user_id: share.userId,
    share_minor: share.shareCents,
    is_included: true,
  }));

  const { error: participantsError } = await supabase
    .from('expense_participants')
    .insert(rows);

  if (participantsError) throw participantsError;

  await logActivity({
    groupId,
    actorId: createdBy,
    action: 'expense_created',
    payload: {
      expenseId: expenseData.id,
      amountMinor: totalCents,
      currency,
      note: note ?? null,
      groupId,
    },
  });

  return expenseData;
}

export async function updateExpense({
  expenseId,
  groupId,
  payerId,
  totalCents,
  currency = 'EUR',
  fxRate = 1,
  shares,
  note,
  category,
  date,
  updatedBy,
}: UpdateExpenseInput) {
  const supabase = getSupabaseClient();
  const amountBaseMinor = Math.round(totalCents * fxRate);

  const normalizedShares = computeShares({
    amountCents: totalCents,
    paidByUserId: payerId,
    shares,
  });

  const { data: updatedExpense, error: expenseUpdateError } = await supabase
    .from('expenses')
    .update({
      payer_id: payerId,
      amount_minor: totalCents,
      currency,
      fx_rate: fxRate,
      amount_base_minor: amountBaseMinor,
      category,
      note,
      date,
    })
    .eq('id', expenseId)
    .eq('group_id', groupId)
    .select()
    .single();

  if (expenseUpdateError) throw expenseUpdateError;
  if (!updatedExpense) {
    throw new Error('No se pudo actualizar el gasto');
  }

  const { error: deleteParticipantsError } = await supabase
    .from('expense_participants')
    .delete()
    .eq('expense_id', expenseId);

  if (deleteParticipantsError) throw deleteParticipantsError;

  if (normalizedShares.length > 0) {
    const rows = normalizedShares.map((share) => ({
      expense_id: expenseId,
      user_id: share.userId,
      share_minor: share.shareCents,
      is_included: true,
    }));

    const { error: insertParticipantsError } = await supabase
      .from('expense_participants')
      .insert(rows);

    if (insertParticipantsError) throw insertParticipantsError;
  }

  await logActivity({
    groupId,
    actorId: updatedBy,
    action: 'expense_updated',
    payload: {
      expenseId,
      amountMinor: totalCents,
      currency,
      note: note ?? null,
      groupId,
    },
  });

  return updatedExpense as Expense;
}

export async function deleteExpense({ expenseId, groupId, deletedBy }: DeleteExpenseInput) {
  const supabase = getSupabaseClient();

  const { data: existingExpense, error: fetchError } = await supabase
    .from('expenses')
    .select('id, amount_minor, currency, note')
    .eq('id', expenseId)
    .eq('group_id', groupId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!existingExpense) {
    throw new Error('El gasto ya no existe.');
  }

  const { error: deleteParticipantsError } = await supabase
    .from('expense_participants')
    .delete()
    .eq('expense_id', expenseId);

  if (deleteParticipantsError) throw deleteParticipantsError;

  const { error: deleteExpenseError } = await supabase
    .from('expenses')
    .delete()
    .eq('id', expenseId)
    .eq('group_id', groupId);

  if (deleteExpenseError) throw deleteExpenseError;

  await logActivity({
    groupId,
    actorId: deletedBy,
    action: 'expense_deleted',
    payload: {
      expenseId,
      amountMinor: existingExpense.amount_minor,
      currency: existingExpense.currency ?? 'EUR',
      note: existingExpense.note ?? null,
      groupId,
    },
  });
}
