import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const userId = session.user.id;

    // Obtener grupos del usuario con información de balance
    // Usando nombres de columna correctos del esquema:
    // - expense_participants (no expense_shares)
    // - payer_id (no paid_by_user_id)
    // - share_minor (no amount_cents)
    // - amount_base_minor (no amount_cents para expenses)
    // - amount_minor (para settlements)
    const groups = await query<{
      id: string;
      name: string;
      base_currency: string;
      member_count: number;
      created_at: string;
      last_expense_at: string | null;
      total_spend_minor: number;
      user_net_balance_minor: number;
    }>(`
      SELECT 
        g.id,
        g.name,
        g.base_currency,
        (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count,
        g.created_at,
        (SELECT MAX(created_at) FROM expenses WHERE group_id = g.id) as last_expense_at,
        COALESCE((SELECT SUM(amount_base_minor) FROM expenses WHERE group_id = g.id), 0) as total_spend_minor,
        COALESCE(
          (SELECT SUM(
            CASE 
              WHEN ep.user_id = $1 THEN -ep.share_minor 
              WHEN e.payer_id = $1 THEN ep.share_minor 
              ELSE 0 
            END
          )
          FROM expenses e
          JOIN expense_participants ep ON ep.expense_id = e.id
          WHERE e.group_id = g.id AND (e.payer_id = $1 OR ep.user_id = $1))
          - COALESCE(
            (SELECT SUM(
              CASE WHEN s.from_user_id = $1 THEN -s.amount_minor WHEN s.to_user_id = $1 THEN s.amount_minor ELSE 0 END
            )
            FROM settlements s WHERE s.group_id = g.id AND (s.from_user_id = $1 OR s.to_user_id = $1)),
            0
          ),
          0
        ) as user_net_balance_minor
      FROM groups g
      INNER JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $1
      ORDER BY COALESCE((SELECT MAX(created_at) FROM expenses WHERE group_id = g.id), g.created_at) DESC
    `, [userId]);

    // Transformar a camelCase para el frontend
    const formattedGroups = groups.map(g => ({
      id: g.id,
      name: g.name,
      baseCurrency: g.base_currency,
      memberCount: Number(g.member_count),
      createdAt: g.created_at,
      lastExpenseAt: g.last_expense_at,
      totalSpendMinor: Number(g.total_spend_minor),
      userNetBalanceMinor: Number(g.user_net_balance_minor),
    }));

    return NextResponse.json(formattedGroups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    return NextResponse.json(
      { error: 'Error al obtener grupos' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { name, baseCurrency = 'EUR' } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: 'Introduce un nombre de grupo' },
        { status: 400 }
      );
    }

    // Crear grupo
    const groupResult = await query<{
      id: string;
      name: string;
      base_currency: string;
      created_at: string;
      created_by: string;
    }>(`
      INSERT INTO groups (name, base_currency, created_by)
      VALUES ($1, $2, $3)
      RETURNING id, name, base_currency, created_at, created_by
    `, [name.trim(), baseCurrency, userId]);

    if (!groupResult.length) {
      throw new Error('No se pudo crear el grupo');
    }

    const group = groupResult[0];

    // Agregar creador como miembro
    await query(`
      INSERT INTO group_members (group_id, user_id, is_active, role)
      VALUES ($1, $2, true, 'owner')
    `, [group.id, userId]);

    // Registrar actividad
    await query(`
      INSERT INTO activity_events (group_id, actor_id, action, payload)
      VALUES ($1, $2, $3, $4)
    `, [group.id, userId, 'group_created', JSON.stringify({ groupName: group.name, groupId: group.id })]);

    return NextResponse.json({
      id: group.id,
      name: group.name,
      baseCurrency: group.base_currency,
      createdAt: group.created_at,
      createdBy: group.created_by,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating group:', error);
    return NextResponse.json(
      { error: 'Error al crear grupo' },
      { status: 500 }
    );
  }
}
