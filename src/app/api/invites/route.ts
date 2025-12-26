import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

const INVITE_EXPIRATION_HOURS = 48;

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    
    const { groupId, email } = body;

    if (!groupId || !email?.trim()) {
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

    const normalizedEmail = email.trim().toLowerCase();

    // Buscar si el email ya tiene cuenta
    const existingProfile = await queryOne<{
      id: string;
      email: string | null;
      display_name: string | null;
    }>(
      `SELECT id, email, display_name FROM users WHERE LOWER(email) = $1`,
      [normalizedEmail]
    );

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + INVITE_EXPIRATION_HOURS * 60 * 60 * 1000).toISOString();

    // Crear invitación
    const inviteResult = await query<{
      id: string;
      group_id: string;
      email: string | null;
      receiver_email: string | null;
      receiver_id: string | null;
      token: string;
      status: string;
      expires_at: string | null;
      created_at: string;
      created_by: string;
      sender_id: string | null;
    }>(`
      INSERT INTO group_invites (group_id, email, receiver_email, receiver_id, token, status, expires_at, created_by, sender_id)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)
      RETURNING *
    `, [
      groupId,
      normalizedEmail,
      normalizedEmail,
      existingProfile?.id ?? null,
      token,
      expiresAt,
      userId,
      userId,
    ]);

    if (!inviteResult.length) {
      throw new Error('No se pudo crear la invitación');
    }

    const invite = inviteResult[0];

    return NextResponse.json({
      invite: {
        id: invite.id,
        group_id: invite.group_id,
        email: invite.email,
        receiver_email: invite.receiver_email,
        receiver_id: invite.receiver_id,
        token: invite.token,
        status: invite.status,
        expires_at: invite.expires_at,
        created_at: invite.created_at,
        created_by: invite.created_by,
        sender_id: invite.sender_id,
      },
      alreadyRegistered: Boolean(existingProfile),
      receiverProfile: existingProfile ? {
        id: existingProfile.id,
        email: existingProfile.email,
        display_name: existingProfile.display_name,
      } : null,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating invite:', error);
    return NextResponse.json(
      { error: 'Error al crear invitación' },
      { status: 500 }
    );
  }
}
