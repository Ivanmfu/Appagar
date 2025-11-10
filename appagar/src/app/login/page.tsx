'use client';
import { getSupabaseClient } from '@/lib/supabase';
import { ChangeEvent, useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSendLink() {
    if (!email) {
      setError('Por favor ingresa tu email');
      return;
    }

    try {
      setError('');
      const supabase = getSupabaseClient();
      const { error: authError } = await supabase.auth.signInWithOtp({ 
        email,
        options: {
          emailRedirectTo: window.location.origin + '/Appagar'
        }
      });
      
      if (authError) throw authError;
      
      setSent(true);
    } catch (error) {
      console.error(error);
      setError('Error al enviar el enlace. Por favor verifica tu email.');
    }
  }

  if (sent) {
    return (
      <main className="p-6 max-w-md mx-auto mt-12 space-y-4 text-center">
        <div className="text-5xl">📧</div>
        <h1 className="text-2xl font-semibold">¡Revisa tu correo!</h1>
        <p className="text-gray-600">
          Hemos enviado un enlace mágico a <strong>{email}</strong>
        </p>
        <p className="text-sm text-gray-500">
          Haz clic en el enlace del email para acceder a tu cuenta.
          El enlace es válido por 1 hora.
        </p>
        <button 
          className="text-blue-600 hover:underline text-sm"
          onClick={() => setSent(false)}
        >
          Usar otro email
        </button>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-md mx-auto mt-12 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Bienvenido a Appagar</h1>
        <p className="text-gray-600">
          Ingresa tu email para iniciar sesión o crear una cuenta
        </p>
      </div>

      <div className="space-y-4 bg-white p-6 rounded-lg border shadow-sm">
        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            className="border border-gray-300 p-3 w-full rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="tu@email.com"
            value={email}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setEmail(event.target.value);
              setError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSendLink()}
            type="email"
            required
          />
        </div>

        {error && (
          <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">
            {error}
          </div>
        )}

        <button 
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-md w-full font-medium transition-colors"
          onClick={handleSendLink}
        >
          Continuar con Email
        </button>

        <div className="text-xs text-gray-500 text-center">
          Te enviaremos un enlace mágico para acceder sin contraseña.
          <br />
          Si es tu primera vez, se creará tu cuenta automáticamente.
        </div>
      </div>
    </main>
  );
}
