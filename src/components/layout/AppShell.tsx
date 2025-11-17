'use client';

import AuthGate, { useAuth } from '@/components/AuthGate';
import { AddExpenseFlow } from '@/components/groups/AddExpenseFlow';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ReactNode, Suspense, useCallback, useMemo, useState } from 'react';

const navItems = [
  { href: '/', label: 'Inicio' },
  { href: '/amigos', label: 'Amigos' },
  { href: '/grupos', label: 'Grupos' },
  { href: '/actividad', label: 'Actividad' },
  { href: '/cuenta', label: 'Cuenta' },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { profile, user } = useAuth();

  const activeHref = useMemo(() => {
    if (!pathname) return '/';
    if (pathname === '/') return '/';
    const match = navItems.find((item) => item.href !== '/' && pathname.startsWith(item.href));
    return match?.href ?? '/';
  }, [pathname]);

  return (
    <AuthGate>
      <div className="relative min-h-screen overflow-hidden bg-app-bg text-text-primary">
        {/* Gradiente suave de fondo */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-blue-100/40 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-emerald-50/60 blur-3xl" />
          <div className="absolute -bottom-24 right-12 h-72 w-72 rounded-full bg-purple-50/50 blur-3xl" />
        </div>

        <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-28 pt-8 sm:px-6 lg:px-8">
          <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-text-secondary">Appagar</p>
              <h1 className="mt-2 text-3xl font-semibold text-text-primary sm:text-4xl">
                {profile?.display_name ?? user?.email ?? 'Compañero/a'}
              </h1>
              <p className="mt-1 text-sm text-text-secondary">
                Organiza tus gastos compartidos sin perder estilo.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-full border border-white/60 bg-white/70 px-4 py-2 backdrop-blur-md shadow-sm">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                {(profile?.display_name ?? user?.email ?? 'A').slice(0, 1).toUpperCase()}
              </span>
              <div className="text-xs text-text-secondary">
                <p className="font-medium text-text-primary">Sesión activa</p>
                <p>{user?.email}</p>
              </div>
            </div>
          </header>

          <main className="flex-1">
            <div className="space-y-6 pb-14">{children}</div>
          </main>
        </div>

        <nav className="fixed bottom-6 left-1/2 z-20 w-[clamp(18rem,90vw,28rem)] -translate-x-1/2 rounded-full border border-white/60 bg-white/70 px-3 py-2 backdrop-blur-md shadow-md">
          <ul className="flex items-center justify-between text-xs font-medium">
            {navItems.map((item) => {
              const isActive = activeHref === item.href;
              return (
                <li key={item.href} className="flex-1">
                  <Link
                    className={`flex flex-col items-center gap-1 rounded-full px-3 py-2 transition ${
                      isActive
                        ? 'bg-primary text-white shadow-md'
                        : 'text-text-secondary hover:text-text-primary hover:bg-white/60'
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
        <Suspense fallback={null}>
          <FloatingAddExpenseTrigger />
        </Suspense>
      </div>
    </AuthGate>
  );
}

function FloatingAddExpenseTrigger() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [addExpenseGroupId, setAddExpenseGroupId] = useState<string | undefined>(undefined);

  const openAddExpense = useCallback(() => {
    const groupId = searchParams?.get('id') ?? undefined;
    if (pathname?.startsWith('/grupos/detalle') && groupId) {
      setAddExpenseGroupId(groupId);
    } else {
      setAddExpenseGroupId(undefined);
    }
    setAddExpenseOpen(true);
  }, [pathname, searchParams]);

  const closeAddExpense = useCallback(() => {
    setAddExpenseOpen(false);
    setAddExpenseGroupId(undefined);
  }, []);

  return (
    <>
      <button
        aria-label="Registrar nuevo gasto"
        className="fixed bottom-28 right-6 z-30 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-3xl font-semibold text-white shadow-lg shadow-primary/30 transition hover:scale-105 hover:bg-primary-hover hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:right-10"
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
    </>
  );
}
