'use client';

import AuthGate, { useAuth } from '@/components/AuthGate';
import { getSupabaseClient } from '@/lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const { profile, user, loading } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (loading) {
    return <main className="p-6 text-sm text-gray-500">Comprobando sesión...</main>;
  }

  return (
    <AuthGate>
      <main className="p-6 space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-semibold">Hola, {profile?.display_name ?? user?.email ?? 'compañero/a'}</h1>
            <p className="text-gray-600 mt-1">
              Gestiona tus grupos, añade gastos y mantén el balance al día.
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-3 py-1.5 rounded transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
        
        <div className="flex gap-3">
          <Link className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors" href="/groups">
            Ver grupos
          </Link>
          <Link className="border border-blue-600 text-blue-600 hover:bg-blue-50 px-4 py-2 rounded transition-colors" href="/groups?new=1">
            Crear grupo
          </Link>
        </div>
      </main>
    </AuthGate>
  );
}
