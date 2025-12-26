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

    // Obtener actividad reciente del usuario
    const activities = await query<{
      id: string;
      group_id: string | null;
      group_name: string | null;
      actor_id: string | null;
      actor_name: string | null;
      action: string;
      payload: Record<string, unknown>;
      created_at: string;
    }>(`
      SELECT 
        ae.id,
        ae.group_id,
        g.name as group_name,
        ae.actor_id,
        u.display_name as actor_name,
        ae.action,
        ae.payload,
        ae.created_at
      FROM activity_events ae
      LEFT JOIN groups g ON g.id = ae.group_id
      LEFT JOIN users u ON u.id = ae.actor_id
      WHERE ae.group_id IN (
        SELECT group_id FROM group_members WHERE user_id = $1
      )
      ORDER BY ae.created_at DESC
      LIMIT 50
    `, [userId]);

    // Transformar a camelCase
    const feed = activities.map(a => ({
      id: a.id,
      groupId: a.group_id,
      groupName: a.group_name || 'Grupo desconocido',
      actorId: a.actor_id,
      actorName: a.actor_name || 'Usuario',
      action: a.action,
      payload: a.payload || {},
      createdAt: a.created_at,
    }));

    return NextResponse.json(feed);
  } catch (error) {
    console.error('Error fetching activity:', error);
    return NextResponse.json(
      { error: 'Error al obtener actividad' },
      { status: 500 }
    );
  }
}
