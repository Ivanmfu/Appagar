import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

// Calcular shares equitativos
function splitEvenly(totalCents: number, count: number): number[] {
  if (count === 0) return [];
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    
    const {
      groupId,
      payerId,
      totalCents,
      currency = 'EUR',
      fxRate = 1,
      shares,
      note,
      category,
      date,
    } = body;

    if (!groupId || !payerId || !totalCents) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos' },
        { status: 400 }
      );
    }

    // Verificar que el usuario es miembro del grupo
    const membership = await queryOne<{ user_id: string }>(
      `SELECT user_id FROM group_members WHERE group_id = $1 AND user_id = $2 AND is_active = true`,
      [groupId, userId]
    );

    if (!membership) {
      return NextResponse.json({ error: 'No tienes acceso a este grupo' }, { status: 403 });
    }

    const amountBaseMinor = Math.round(totalCents * fxRate);

    // Calcular shares si no se proporcionan (reparto equitativo entre participantes)
    let normalizedShares: { userId: string; shareCents: number }[] = shares || [];
    
    if (!shares || shares.length === 0) {
      // Si no hay shares, calcular reparto equitativo entre todos los miembros del grupo
      const members = await query<{ user_id: string }>(
        `SELECT user_id FROM group_members WHERE group_id = $1 AND is_active = true`,
        [groupId]
      );
      const memberIds = members.map(m => m.user_id);
      const splitAmounts = splitEvenly(totalCents, memberIds.length);
      normalizedShares = memberIds.map((id, i) => ({
        userId: id,
        shareCents: splitAmounts[i],
      }));
    }

    // Insertar gasto
    const expenseResult = await query<{
      id: string;
      group_id: string;
      payer_id: string;
      created_by: string;
      amount_minor: number;
      currency: string;
      fx_rate: number;
      amount_base_minor: number;
      category: string | null;
      note: string | null;
      date: string | null;
      created_at: string;
    }>(`
      INSERT INTO expenses (group_id, payer_id, created_by, amount_minor, currency, fx_rate, amount_base_minor, category, note, date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [groupId, payerId, userId, totalCents, currency, fxRate, amountBaseMinor, category || null, note || null, date || null]);

    if (!expenseResult.length) {
      throw new Error('No se pudo crear el gasto');
    }

    const expense = expenseResult[0];

    // Insertar participantes
    for (const share of normalizedShares) {
      await query(`
        INSERT INTO expense_participants (expense_id, user_id, share_minor, is_included)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (expense_id, user_id) DO UPDATE SET share_minor = $3, is_included = true
      `, [expense.id, share.userId, share.shareCents]);
    }

    // Registrar actividad
    await query(`
      INSERT INTO activity_events (group_id, actor_id, action, payload)
      VALUES ($1, $2, $3, $4)
    `, [groupId, userId, 'expense_created', JSON.stringify({
      expenseId: expense.id,
      amountMinor: totalCents,
      currency,
      note: note || null,
      groupId,
    })]);

    return NextResponse.json({
      id: expense.id,
      groupId: expense.group_id,
      payerId: expense.payer_id,
      createdBy: expense.created_by,
      amountMinor: expense.amount_minor,
      currency: expense.currency,
      fxRate: expense.fx_rate,
      amountBaseMinor: expense.amount_base_minor,
      category: expense.category,
      note: expense.note,
      date: expense.date,
      createdAt: expense.created_at,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating expense:', error);
    return NextResponse.json(
      { error: 'Error al crear gasto' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    
    const {
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
    } = body;

    if (!expenseId || !groupId) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos' },
        { status: 400 }
      );
    }

    // Verificar que el usuario es miembro del grupo
    const membership = await queryOne<{ user_id: string }>(
      `SELECT user_id FROM group_members WHERE group_id = $1 AND user_id = $2 AND is_active = true`,
      [groupId, userId]
    );

    if (!membership) {
      return NextResponse.json({ error: 'No tienes acceso a este grupo' }, { status: 403 });
    }

    const amountBaseMinor = Math.round(totalCents * fxRate);

    // Actualizar gasto
    const expenseResult = await query<{
      id: string;
      group_id: string;
      payer_id: string;
      created_by: string;
      amount_minor: number;
      currency: string;
      fx_rate: number;
      amount_base_minor: number;
      category: string | null;
      note: string | null;
      date: string | null;
      created_at: string;
    }>(`
      UPDATE expenses 
      SET payer_id = $1, amount_minor = $2, currency = $3, fx_rate = $4, amount_base_minor = $5, 
          category = $6, note = $7, date = $8
      WHERE id = $9 AND group_id = $10
      RETURNING *
    `, [payerId, totalCents, currency, fxRate, amountBaseMinor, category || null, note || null, date || null, expenseId, groupId]);

    if (!expenseResult.length) {
      return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 });
    }

    const expense = expenseResult[0];

    // Actualizar participantes si se proporcionan shares
    if (shares && shares.length > 0) {
      // Eliminar participantes antiguos
      await query(`DELETE FROM expense_participants WHERE expense_id = $1`, [expenseId]);
      
      // Insertar nuevos
      for (const share of shares) {
        await query(`
          INSERT INTO expense_participants (expense_id, user_id, share_minor, is_included)
          VALUES ($1, $2, $3, true)
        `, [expense.id, share.userId, share.shareCents]);
      }
    }

    // Registrar actividad
    await query(`
      INSERT INTO activity_events (group_id, actor_id, action, payload)
      VALUES ($1, $2, $3, $4)
    `, [groupId, userId, 'expense_updated', JSON.stringify({
      expenseId: expense.id,
      amountMinor: totalCents,
      currency,
      note: note || null,
      groupId,
    })]);

    return NextResponse.json({
      id: expense.id,
      groupId: expense.group_id,
      payerId: expense.payer_id,
      createdBy: expense.created_by,
      amountMinor: expense.amount_minor,
      currency: expense.currency,
      fxRate: expense.fx_rate,
      amountBaseMinor: expense.amount_base_minor,
      category: expense.category,
      note: expense.note,
      date: expense.date,
      createdAt: expense.created_at,
    });
  } catch (error) {
    console.error('Error updating expense:', error);
    return NextResponse.json(
      { error: 'Error al actualizar gasto' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const expenseId = searchParams.get('expenseId');
    const groupId = searchParams.get('groupId');

    if (!expenseId || !groupId) {
      return NextResponse.json(
        { error: 'Faltan parámetros requeridos' },
        { status: 400 }
      );
    }

    // Verificar que el usuario es miembro del grupo
    const membership = await queryOne<{ user_id: string }>(
      `SELECT user_id FROM group_members WHERE group_id = $1 AND user_id = $2 AND is_active = true`,
      [groupId, userId]
    );

    if (!membership) {
      return NextResponse.json({ error: 'No tienes acceso a este grupo' }, { status: 403 });
    }

    // Eliminar participantes
    await query(`DELETE FROM expense_participants WHERE expense_id = $1`, [expenseId]);

    // Eliminar gasto
    await query(`DELETE FROM expenses WHERE id = $1 AND group_id = $2`, [expenseId, groupId]);

    // Registrar actividad
    await query(`
      INSERT INTO activity_events (group_id, actor_id, action, payload)
      VALUES ($1, $2, $3, $4)
    `, [groupId, userId, 'expense_deleted', JSON.stringify({ expenseId, groupId })]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting expense:', error);
    return NextResponse.json(
      { error: 'Error al eliminar gasto' },
      { status: 500 }
    );
  }
}
