import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email y contraseña son requeridos' },
        { status: 400 }
      );
    }
    
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 6 caracteres' },
        { status: 400 }
      );
    }
    
    const normalizedEmail = email.toLowerCase().trim();
    
    // Verificar si el usuario ya existe
    const existing = await query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1',
      [normalizedEmail]
    );
    
    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Ya existe una cuenta con este email' },
        { status: 409 }
      );
    }
    
    // TODO: Usar bcrypt para hashear la contraseña en producción
    // Por ahora guardamos el password directamente (NO SEGURO para producción)
    const passwordHash = password; // TODO: await bcrypt.hash(password, 12)
    
    // Crear usuario
    await query(
      `INSERT INTO users (id, email, password_hash, created_at)
       VALUES (gen_random_uuid(), $1, $2, NOW())`,
      [normalizedEmail, passwordHash]
    );
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error registering user:', error);
    return NextResponse.json(
      { error: 'Error al registrar usuario' },
      { status: 500 }
    );
  }
}
