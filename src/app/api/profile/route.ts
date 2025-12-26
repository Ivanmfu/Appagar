import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import bcrypt from 'bcryptjs';

// GET - Obtener perfil del usuario
export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await queryOne<{
      id: string;
      email: string;
      display_name: string | null;
      image: string | null;
      created_at: string;
    }>(`SELECT id, email, display_name, image, created_at FROM users WHERE id = $1`, [session.user.id]);

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      image: user.image,
      createdAt: user.created_at,
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json(
      { error: 'Error al obtener perfil' },
      { status: 500 }
    );
  }
}

// PATCH - Actualizar perfil del usuario
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { displayName, email, password } = body;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (displayName !== undefined) {
      updates.push(`display_name = $${paramCount}`);
      values.push(displayName?.trim() || null);
      paramCount++;
    }

    if (email !== undefined) {
      // Verificar que el email no esté en uso
      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM users WHERE email = $1 AND id != $2`,
        [email.toLowerCase().trim(), session.user.id]
      );
      if (existing) {
        return NextResponse.json(
          { error: 'Este correo electrónico ya está en uso' },
          { status: 400 }
        );
      }
      updates.push(`email = $${paramCount}`);
      values.push(email.toLowerCase().trim());
      paramCount++;
    }

    if (password !== undefined) {
      if (password.length < 8) {
        return NextResponse.json(
          { error: 'La contraseña debe tener al menos 8 caracteres' },
          { status: 400 }
        );
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push(`password_hash = $${paramCount}`);
      values.push(hashedPassword);
      paramCount++;
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Sin cambios' }, { status: 400 });
    }

    updates.push(`updated_at = NOW()`);
    values.push(session.user.id);

    await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`,
      values
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json(
      { error: 'Error al actualizar perfil' },
      { status: 500 }
    );
  }
}
