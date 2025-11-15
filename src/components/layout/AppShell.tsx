'use client';

import AuthGate, { useAuth } from '@/components/AuthGate';
import { AddExpenseFlow } from '@/components/groups/AddExpenseFlow';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ReactNode, useMemo, useState, useCallback } from 'react';

const navItems = [
  { href: '/', label: 'Inicio' },
  { href: '/amigos', label: 'Amigos' },
  { href: '/grupos', label: 'Grupos' },
  { href: '/actividad', label: 'Actividad' },
  { href: '/cuenta', label: 'Cuenta' },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { profile, user } = useAuth();

  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [addExpenseGroupId, setAddExpenseGroupId] = useState<string | undefined>(undefined);

  const activeHref = useMemo(() => {
    if (!pathname) return '/';
    if (pathname === '/') return '/';
    const match = navItems.find((item) => item.href !== '/' && pathname.startsWith(item.href));
    return match?.href ?? '/';
  }, [pathname]);

  const currentGroupId = useMemo(() => {
    if (!pathname) return undefined;
    if (!pathname.startsWith('/grupos/detalle')) return undefined;
    return searchParams?.get('id') ?? undefined;
  }, [pathname, searchParams]);

  const openAddExpense = useCallback(() => {
    if (pathname?.startsWith('/grupos/detalle') && currentGroupId) {
      setAddExpenseGroupId(currentGroupId);
    } else {
      setAddExpenseGroupId(undefined);
    }
    setAddExpenseOpen(true);
  }, [pathname, currentGroupId]);

  const closeAddExpense = useCallback(() => {
    setAddExpenseOpen(false);
    setAddExpenseGroupId(undefined);
  }, []);

  return (
    <AuthGate>
      <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-purple-500/30 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="absolute -bottom-24 right-12 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute top-24 right-0 h-64 w-64 rounded-full bg-cyan-400/10 blur-2xl" />
        </div>

        <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-28 pt-8 sm:px-6 lg:px-8">
          <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-300">Appagar</p>
              <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">
                {profile?.display_name ?? user?.email ?? 'Compañero/a'}
              </h1>
              <p className="mt-1 text-sm text-slate-300">
                Organiza tus gastos compartidos sin perder estilo.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/10 px-4 py-2 backdrop-blur-xl">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-lg font-semibold text-white">
                {(profile?.display_name ?? user?.email ?? 'A').slice(0, 1).toUpperCase()}
              </span>
              <div className="text-xs text-slate-300">
                <p className="font-medium text-white/90">Sesión activa</p>
                <p>{user?.email}</p>
              </div>
            </div>
          </header>

          <main className="flex-1">
            <div className="space-y-6 pb-14">{children}</div>
          </main>
        </div>

        <nav className="fixed bottom-6 left-1/2 z-20 w-[clamp(18rem,90vw,28rem)] -translate-x-1/2 rounded-full border border-white/10 bg-white/10 px-3 py-2 backdrop-blur-xl">
          <ul className="flex items-center justify-between text-xs font-medium">
            {navItems.map((item) => {
              const isActive = activeHref === item.href;
              return (
                <li key={item.href} className="flex-1">
                  <Link
                    className={`flex flex-col items-center gap-1 rounded-full px-3 py-2 transition ${
                      isActive
                        ? 'bg-white/20 text-white shadow-lg shadow-white/10'
                        : 'text-slate-300 hover:text-white'
                    }`}
                    href={item.href}
                  >
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <button
          aria-label="Registrar nuevo gasto"
          className="fixed bottom-28 right-6 z-30 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-3xl font-semibold text-white shadow-2xl shadow-purple-500/30 transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:right-10"
          onClick={openAddExpense}
          type="button"
        >
          +
        </button>

        <AddExpenseFlow
          currentGroupId={addExpenseGroupId}
          isOpen={addExpenseOpen}
          onClose={closeAddExpense}
        />
      </div>
    </AuthGate>
  );
}
