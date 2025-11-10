'use client';

import AuthGate, { useAuth } from '@/components/AuthGate';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const { profile, user, loading } = useAuth();

  if (loading) {
    return <main className="p-6 text-sm text-gray-500">Comprobando sesión...</main>;
  }

  return (
    <AuthGate>
      <main className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Hola, {profile?.full_name ?? user?.email ?? 'compañero/a'}</h1>
        <p className="text-gray-600">
          Gestiona tus grupos, añade gastos y mantén el balance al día.
        </p>
        <div className="flex gap-3">
          <Link className="bg-black text-white px-4 py-2 rounded" href="/groups">
            Ver grupos
          </Link>
          <Link className="border border-black px-4 py-2 rounded" href="/groups?new=1">
            Crear grupo
          </Link>
        </div>
      </main>
    </AuthGate>
  );
}
