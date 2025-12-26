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

    // Obtener relaciones de deuda del usuario
    // Usando nombres de columna correctos del esquema:
    // - expense_participants (no expense_shares)
    // - payer_id (no paid_by_user_id)
    // - share_minor (no amount_cents)
    // - amount_minor (para settlements)
    const debtRelations = await query<{
      group_id: string;
      group_name: string;
      base_currency: string;
      from_user_id: string;
      from_name: string;
      to_user_id: string;
      to_name: string;
      amount_minor: number;
    }>(`
      WITH expense_debts AS (
        SELECT 
          e.group_id,
          e.payer_id as creditor_id,
          ep.user_id as debtor_id,
          SUM(ep.share_minor) as debt_amount
        FROM expenses e
        JOIN expense_participants ep ON ep.expense_id = e.id
        WHERE ep.user_id != e.payer_id
        GROUP BY e.group_id, e.payer_id, ep.user_id
      ),
      settlement_payments AS (
        SELECT 
          group_id,
          from_user_id as debtor_id,
          to_user_id as creditor_id,
          SUM(amount_minor) as paid_amount
        FROM settlements
        GROUP BY group_id, from_user_id, to_user_id
      ),
      net_debts AS (
        SELECT 
          ed.group_id,
          ed.creditor_id,
          ed.debtor_id,
          ed.debt_amount - COALESCE(sp.paid_amount, 0) as net_amount
        FROM expense_debts ed
        LEFT JOIN settlement_payments sp ON 
          sp.group_id = ed.group_id AND 
          sp.creditor_id = ed.creditor_id AND 
          sp.debtor_id = ed.debtor_id
        WHERE ed.debt_amount - COALESCE(sp.paid_amount, 0) > 0
      )
      SELECT 
        nd.group_id,
        g.name as group_name,
        g.base_currency,
        nd.debtor_id as from_user_id,
        uf.display_name as from_name,
        nd.creditor_id as to_user_id,
        ut.display_name as to_name,
        nd.net_amount as amount_minor
      FROM net_debts nd
      JOIN groups g ON g.id = nd.group_id
      JOIN users uf ON uf.id = nd.debtor_id
      JOIN users ut ON ut.id = nd.creditor_id
      WHERE nd.creditor_id = $1 OR nd.debtor_id = $1
      ORDER BY nd.net_amount DESC
    `, [userId]);

    // Transformar y añadir dirección
    const formattedRelations = debtRelations.map(r => ({
      groupId: r.group_id,
      groupName: r.group_name,
      baseCurrency: r.base_currency,
      fromUserId: r.from_user_id,
      fromName: r.from_name || 'Usuario',
      toUserId: r.to_user_id,
      toName: r.to_name || 'Usuario',
      amountCents: Number(r.amount_minor),
      counterpartyName: r.to_user_id === userId ? (r.from_name || 'Usuario') : (r.to_name || 'Usuario'),
      direction: r.to_user_id === userId ? 'incoming' : 'outgoing',
    }));

    return NextResponse.json(formattedRelations);
  } catch (error) {
    console.error('Error fetching debt relations:', error);
    return NextResponse.json(
      { error: 'Error al obtener relaciones de deuda' },
      { status: 500 }
    );
  }
}
