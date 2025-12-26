import { logActivity } from '@/lib/activity';
import { Database } from '@/lib/database.types';
import { AppError } from '@/lib/errors';
import { computeShares } from '@/lib/finance';
import { getSupabaseClient } from '@/lib/supabase';
import {
  validateCreateExpenseInput,
  validateDeleteExpenseInput,
  validateUpdateExpenseInput,
} from '@/lib/validation';

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
  const parsed = validateCreateExpenseInput({
    groupId,
    payerId,
    totalCents,
    currency,
    fxRate,
    shares,
    note,
    category,
    date,
    createdBy,
  });

  const supabase = getSupabaseClient();
  const amountBaseMinor = Math.round(parsed.totalCents * parsed.fxRate);

  const normalizedShares = computeShares({
    amountCents: parsed.totalCents,
    paidByUserId: parsed.payerId,
    shares: parsed.shares,
  });

  const { data: expense, error: createExpenseError } = await supabase
    .from('expenses')
    .insert([
      {
        group_id: parsed.groupId,
        payer_id: parsed.payerId,
        created_by: parsed.createdBy,
        amount_minor: parsed.totalCents,
        currency: parsed.currency,
        fx_rate: parsed.fxRate,
        amount_base_minor: amountBaseMinor,
        category: parsed.category,
        note: parsed.note,
        date: parsed.date,
      },
    ])
    .select()
    .single();

  if (createExpenseError) throw AppError.fromSupabase(createExpenseError, 'No se pudo crear el gasto');

  if (!expense) {
    throw new AppError('unknown', 'No se pudo crear el gasto');
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
    .upsert(rows, {
      onConflict: 'expense_id,user_id',
    })
    .select('expense_id,user_id,share_minor,is_included');

  if (participantsError) throw AppError.fromSupabase(participantsError, 'No se pudo registrar los participantes');

  await logActivity({
    groupId: parsed.groupId,
    actorId: parsed.createdBy,
    action: 'expense_created',
    payload: {
      expenseId: expenseData.id,
      amountMinor: parsed.totalCents,
      currency: parsed.currency,
      note: parsed.note ?? null,
      groupId: parsed.groupId,
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
  const parsed = validateUpdateExpenseInput({
    expenseId,
    groupId,
    payerId,
    totalCents,
    currency,
    fxRate,
    shares,
    note,
    category,
    date,
    updatedBy,
  });

  const supabase = getSupabaseClient();
  const amountBaseMinor = Math.round(parsed.totalCents * parsed.fxRate);

  const normalizedShares = computeShares({
    amountCents: parsed.totalCents,
    paidByUserId: parsed.payerId,
    shares: parsed.shares,
  });

  const { data: existingExpenseRaw, error: fetchExistingError } = await supabase
    .from('expenses')
    .select('id, created_by')
    .eq('id', parsed.expenseId)
    .eq('group_id', parsed.groupId)
    .maybeSingle();

  if (fetchExistingError) throw AppError.fromSupabase(fetchExistingError, 'No se pudo cargar el gasto');
  if (!existingExpenseRaw) {
    throw AppError.notFound('El gasto no existe o ya fue eliminado.');
  }

  const existingExpense = existingExpenseRaw as { id: string; created_by: string | null };
  const createdBy = existingExpense.created_by ?? parsed.updatedBy;

  const { data: updatedExpense, error: expenseUpdateError } = await supabase
    .from('expenses')
    .update({
      payer_id: parsed.payerId,
      created_by: createdBy,
      amount_minor: parsed.totalCents,
      currency: parsed.currency,
      fx_rate: parsed.fxRate,
      amount_base_minor: amountBaseMinor,
      category: parsed.category,
      note: parsed.note,
      date: parsed.date,
    })
    .eq('id', parsed.expenseId)
    .eq('group_id', parsed.groupId)
    .select()
    .single();

  if (expenseUpdateError) throw AppError.fromSupabase(expenseUpdateError, 'No se pudo actualizar el gasto');
  if (!updatedExpense) {
    throw new AppError('unknown', 'No se pudo actualizar el gasto');
  }

  const { error: deleteParticipantsError } = await supabase
    .from('expense_participants')
    .delete()
    .eq('expense_id', parsed.expenseId);

  if (deleteParticipantsError) throw AppError.fromSupabase(deleteParticipantsError, 'No se pudo actualizar el reparto');

  if (normalizedShares.length > 0) {
    const rows = normalizedShares.map((share) => ({
      expense_id: parsed.expenseId,
      user_id: share.userId,
      share_minor: share.shareCents,
      is_included: true,
    }));

    const { error: insertParticipantsError } = await supabase
      .from('expense_participants')
      .upsert(rows, {
        onConflict: 'expense_id,user_id',
      })
      .select('expense_id,user_id,share_minor,is_included');

    if (insertParticipantsError) throw AppError.fromSupabase(insertParticipantsError, 'No se pudo actualizar el reparto');
  }

  await logActivity({
    groupId: parsed.groupId,
    actorId: parsed.updatedBy,
    action: 'expense_updated',
    payload: {
      expenseId: parsed.expenseId,
      amountMinor: parsed.totalCents,
      currency: parsed.currency,
      note: parsed.note ?? null,
      groupId: parsed.groupId,
    },
  });

  return updatedExpense as Expense;
}

export async function deleteExpense({ expenseId, groupId, deletedBy }: DeleteExpenseInput) {
  const parsed = validateDeleteExpenseInput({ expenseId, groupId, deletedBy });
  const supabase = getSupabaseClient();

  const { data: existingExpenseRaw2, error: fetchError } = await supabase
    .from('expenses')
    .select('id, amount_minor, currency, note')
    .eq('id', parsed.expenseId)
    .eq('group_id', parsed.groupId)
    .maybeSingle();

  if (fetchError) throw AppError.fromSupabase(fetchError, 'No se pudo cargar el gasto');
  if (!existingExpenseRaw2) {
    throw AppError.notFound('El gasto ya no existe.');
  }

  const existingExpenseForDelete = existingExpenseRaw2 as { id: string; amount_minor: number; currency: string | null; note: string | null };

  const { error: deleteParticipantsError } = await supabase
    .from('expense_participants')
    .delete()
    .eq('expense_id', parsed.expenseId);

  if (deleteParticipantsError) throw AppError.fromSupabase(deleteParticipantsError, 'No se pudo borrar el reparto');

  const { error: deleteExpenseError } = await supabase
    .from('expenses')
    .delete()
    .eq('id', parsed.expenseId)
    .eq('group_id', parsed.groupId);

  if (deleteExpenseError) throw AppError.fromSupabase(deleteExpenseError, 'No se pudo eliminar el gasto');

  await logActivity({
    groupId: parsed.groupId,
    actorId: parsed.deletedBy,
    action: 'expense_deleted',
    payload: {
      expenseId: parsed.expenseId,
      amountMinor: existingExpenseForDelete.amount_minor,
      currency: existingExpenseForDelete.currency ?? 'EUR',
      note: existingExpenseForDelete.note ?? null,
      groupId: parsed.groupId,
    },
  });
}
