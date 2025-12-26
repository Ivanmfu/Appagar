import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { groupId, fromUserId, toUserId, amountMinor } = body;

    if (!groupId || !fromUserId || !toUserId || amountMinor === undefined) {
      return NextResponse.json(
        { error: 'Faltan parámetros requeridos' },
        { status: 400 }
      );
    }

    // Verificar que el usuario actual es parte de la transacción
    if (session.user.id !== fromUserId && session.user.id !== toUserId) {
      return NextResponse.json(
        { error: 'No autorizado para esta operación' },
        { status: 403 }
      );
    }

    // Insertar liquidación usando nombres de columna correctos del esquema
    await query(
      `INSERT INTO settlements (group_id, from_user_id, to_user_id, amount_minor)
       VALUES ($1, $2, $3, $4)`,
      [groupId, fromUserId, toUserId, amountMinor]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error creating settlement:', error);
    return NextResponse.json(
      { error: 'Error al registrar liquidación' },
      { status: 500 }
    );
  }
}
