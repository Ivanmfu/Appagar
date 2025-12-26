import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const userId = session.user.id;
    const groupId = params.id;

    if (!groupId) {
      return NextResponse.json({ error: 'ID de grupo requerido' }, { status: 400 });
    }

    // Verificar que el usuario es miembro del grupo
    const membership = await queryOne<{ user_id: string }>(
      `SELECT user_id FROM group_members WHERE group_id = $1 AND user_id = $2 AND is_active = true`,
      [groupId, userId]
    );

    if (!membership) {
      return NextResponse.json({ error: 'No tienes acceso a este grupo' }, { status: 403 });
    }

    // Obtener el grupo
    const group = await queryOne<{
      id: string;
      name: string;
      base_currency: string;
      created_by: string | null;
      created_at: string;
      group_type: string | null;
      start_date: string | null;
      end_date: string | null;
      description: string | null;
    }>(`SELECT id, name, base_currency, created_by, created_at, group_type, start_date, end_date, description FROM groups WHERE id = $1`, [groupId]);

    if (!group) {
      return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 });
    }

    // Obtener miembros
    const members = await query<{
      user_id: string;
      display_name: string | null;
      email: string | null;
      joined_at: string;
      role: string | null;
      is_active: boolean;
    }>(`
      SELECT gm.user_id, u.display_name, u.email, gm.joined_at, gm.role, gm.is_active
      FROM group_members gm
      LEFT JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = $1 AND gm.is_active = true
    `, [groupId]);

    // Obtener gastos
    const expenses = await query<{
      id: string;
      group_id: string;
      payer_id: string;
      payer_name: string | null;
      amount_minor: number;
      amount_base_minor: number;
      currency: string;
      date: string | null;
      note: string | null;
      created_at: string;
      category: string | null;
    }>(`
      SELECT e.id, e.group_id, e.payer_id, u.display_name as payer_name,
             e.amount_minor, e.amount_base_minor, e.currency, e.date, e.note, e.created_at, e.category
      FROM expenses e
      LEFT JOIN users u ON u.id = e.payer_id
      WHERE e.group_id = $1
      ORDER BY e.date DESC, e.created_at DESC
      LIMIT 50
    `, [groupId]);

    // Obtener participantes de los gastos
    const expenseIds = expenses.map(e => e.id);
    let participants: {
      expense_id: string;
      user_id: string;
      share_minor: number;
      display_name: string | null;
      email: string | null;
    }[] = [];

    if (expenseIds.length > 0) {
      participants = await query<{
        expense_id: string;
        user_id: string;
        share_minor: number;
        display_name: string | null;
        email: string | null;
      }>(`
        SELECT ep.expense_id, ep.user_id, ep.share_minor, u.display_name, u.email
        FROM expense_participants ep
        LEFT JOIN users u ON u.id = ep.user_id
        WHERE ep.expense_id = ANY($1)
      `, [expenseIds]);
    }

    // Obtener invitaciones
    const invites = await query<{
      id: string;
      group_id: string;
      email: string | null;
      receiver_email: string | null;
      receiver_id: string | null;
      status: string;
      token: string;
      expires_at: string | null;
      created_at: string;
      created_by: string;
      sender_id: string | null;
    }>(`
      SELECT id, group_id, email, receiver_email, receiver_id, status, token, expires_at, created_at, created_by, sender_id
      FROM group_invites
      WHERE group_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [groupId]);

    // Calcular balances
    const balances = await query<{
      user_id: string;
      net_minor: number;
    }>(`
      SELECT 
        ep.user_id,
        COALESCE(SUM(
          CASE WHEN e.payer_id = ep.user_id 
               THEN e.amount_base_minor - ep.share_minor 
               ELSE -ep.share_minor 
          END
        ), 0) AS net_minor
      FROM expense_participants ep
      JOIN expenses e ON e.id = ep.expense_id
      WHERE e.group_id = $1
      GROUP BY ep.user_id
    `, [groupId]);

    // Mapear participantes por gasto
    const participantsByExpense: Record<string, typeof participants> = {};
    participants.forEach(p => {
      if (!participantsByExpense[p.expense_id]) {
        participantsByExpense[p.expense_id] = [];
      }
      participantsByExpense[p.expense_id].push(p);
    });

    // Formatear respuesta
    const formattedExpenses = expenses.map(e => ({
      id: e.id,
      groupId: e.group_id,
      payerId: e.payer_id,
      payerName: e.payer_name,
      amountMinor: e.amount_minor,
      amountBaseMinor: e.amount_base_minor,
      currency: e.currency,
      date: e.date,
      note: e.note,
      createdAt: e.created_at,
      category: e.category,
      participants: (participantsByExpense[e.id] || []).map(p => ({
        userId: p.user_id,
        shareMinor: p.share_minor,
        displayName: p.display_name,
        email: p.email,
      })),
    }));

    const formattedMembers = members.map(m => ({
      userId: m.user_id,
      displayName: m.display_name,
      email: m.email,
      joinedAt: m.joined_at,
      role: m.role,
      isActive: m.is_active,
    }));

    const formattedInvites = invites.map(i => ({
      id: i.id,
      groupId: i.group_id,
      receiverEmail: i.receiver_email || i.email,
      receiverId: i.receiver_id,
      senderId: i.sender_id || i.created_by,
      status: i.status,
      token: i.token,
      expiresAt: i.expires_at,
      createdAt: i.created_at,
      createdBy: i.created_by,
    }));

    // Calcular transfers (deudas simplificadas)
    const userBalances = new Map<string, number>();
    balances.forEach(b => userBalances.set(b.user_id, Number(b.net_minor)));

    const transfers: { fromUserId: string; toUserId: string; amountCents: number }[] = [];
    const creditors = [...userBalances.entries()].filter(([, b]) => b > 0).sort((a, b) => b[1] - a[1]);
    const debtors = [...userBalances.entries()].filter(([, b]) => b < 0).sort((a, b) => a[1] - b[1]);

    let ci = 0, di = 0;
    while (ci < creditors.length && di < debtors.length) {
      const [creditorId, credit] = creditors[ci];
      const [debtorId, debt] = debtors[di];
      const amount = Math.min(credit, -debt);
      if (amount > 0) {
        transfers.push({ fromUserId: debtorId, toUserId: creditorId, amountCents: amount });
      }
      creditors[ci] = [creditorId, credit - amount];
      debtors[di] = [debtorId, debt + amount];
      if (creditors[ci][1] <= 0) ci++;
      if (debtors[di][1] >= 0) di++;
    }

    // Calcular totales por usuario para el formato completo
    const formattedBalances = balances.map(b => ({
      userId: b.user_id,
      netBalanceCents: Number(b.net_minor),
      totalPaidCents: 0, // Calculado simplificadamente
      totalOwedCents: 0, // Calculado simplificadamente
      settlementsPaidCents: 0,
      settlementsReceivedCents: 0,
    }));

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        base_currency: group.base_currency,
        created_by: group.created_by,
        created_at: group.created_at,
        group_type: group.group_type,
        start_date: group.start_date,
        end_date: group.end_date,
        description: group.description,
      },
      members: formattedMembers,
      expenses: formattedExpenses,
      invites: formattedInvites,
      balances: {
        balances: formattedBalances,
        transfers,
      },
    });
  } catch (error) {
    console.error('Error fetching group detail:', error);
    return NextResponse.json(
      { error: 'Error al obtener detalle del grupo' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const userId = session.user.id;
    const groupId = params.id;

    if (!groupId) {
      return NextResponse.json({ error: 'ID de grupo requerido' }, { status: 400 });
    }

    // Verificar que el usuario es owner del grupo
    const membership = await queryOne<{ role: string }>(
      `SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2 AND is_active = true`,
      [groupId, userId]
    );

    const group = await queryOne<{ created_by: string | null }>(
      `SELECT created_by FROM groups WHERE id = $1`,
      [groupId]
    );

    const isOwner = membership?.role === 'owner' || group?.created_by === userId;

    if (!isOwner) {
      return NextResponse.json({ error: 'Solo el propietario puede eliminar el grupo' }, { status: 403 });
    }

    // Eliminar en orden: participantes de gastos, gastos, invitaciones, miembros, grupo
    await query(`DELETE FROM expense_participants WHERE expense_id IN (SELECT id FROM expenses WHERE group_id = $1)`, [groupId]);
    await query(`DELETE FROM expenses WHERE group_id = $1`, [groupId]);
    await query(`DELETE FROM settlements WHERE group_id = $1`, [groupId]);
    await query(`DELETE FROM group_invites WHERE group_id = $1`, [groupId]);
    await query(`DELETE FROM activity_events WHERE group_id = $1`, [groupId]);
    await query(`DELETE FROM group_members WHERE group_id = $1`, [groupId]);
    await query(`DELETE FROM groups WHERE id = $1`, [groupId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting group:', error);
    return NextResponse.json(
      { error: 'Error al eliminar grupo' },
      { status: 500 }
    );
  }
}
