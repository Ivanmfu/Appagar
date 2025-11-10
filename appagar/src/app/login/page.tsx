'use client';
import { getSupabaseClient } from '@/lib/supabase';
import { ChangeEvent, useState } from 'react';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const [email, setEmail] = useState('');

  async function login() {
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signInWithOtp({ email }); // magic link
      alert('Revisa tu correo para iniciar sesión');
    } catch (error) {
      console.error(error);
      alert('No se pudo iniciar sesión: faltan variables de entorno de Supabase');
    }
  }
  return (
    <main className="p-6 max-w-sm mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Entrar</h1>
      <input
        className="border p-2 w-full"
        placeholder="tu@email"
        value={email}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
        type="email"
        required
      />
      <button className="bg-black text-white px-4 py-2 rounded" onClick={login}>Enviar enlace</button>
    </main>
  );
}
