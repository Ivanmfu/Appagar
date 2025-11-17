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
      <div className="relative min-h-screen overflow-hidden text-text-primary">
        {/* Capas de profundidad */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-48 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[160px]" />
          <div className="absolute bottom-[-6rem] left-[-4rem] h-[26rem] w-[26rem] rounded-full bg-success-soft/60 blur-[140px]" />
          <div className="absolute -bottom-32 right-0 h-[28rem] w-[30rem] translate-x-1/4 rounded-full bg-primary-soft/70 blur-[150px]" />
        </div>

        <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-28 pt-8 sm:px-6 lg:px-8">
          <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-text-secondary">Appagar</p>
              <h1 className="mt-2 text-3xl font-semibold text-text-primary sm:text-4xl">
                {profile?.display_name ?? profile?.email ?? user?.email ?? 'Compañero/a'}
              </h1>
              <p className="mt-1 text-sm text-text-secondary">
                Organiza tus gastos compartidos sin perder estilo.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-full border border-white/40 bg-white/40 px-5 py-3 backdrop-blur-xl shadow-[0_6px_18px_rgba(0,0,0,0.08)]">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft/80 text-lg font-semibold text-primary">
                {(profile?.display_name ?? profile?.email ?? user?.email ?? 'A').slice(0, 1).toUpperCase()}
              </span>
              <div className="text-xs text-text-secondary">
                <p className="font-medium text-text-primary">Sesión activa</p>
                <p>{profile?.email ?? user?.email}</p>
              </div>
            </div>
          </header>

          <main className="flex-1">
            <div className="space-y-6 pb-14">{children}</div>
          </main>
        </div>

        <nav className="fixed bottom-6 left-1/2 z-20 w-[clamp(18rem,92vw,30rem)] -translate-x-1/2 rounded-full border border-white/40 bg-white/50 px-4 py-2 backdrop-blur-xl shadow-lg">
          <ul className="flex items-center justify-between text-xs font-medium text-text-secondary">
            {navItems.map((item) => {
              const isActive = activeHref === item.href;
              return (
                <li key={item.href} className="flex-1">
                  <Link
                    className={`flex flex-col items-center gap-1 rounded-full px-3 py-2 transition-colors ${
                      isActive
                        ? 'bg-primary text-white shadow-lg'
                        : 'text-text-secondary hover:text-text-primary'
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
        className="fixed bottom-28 right-6 z-30 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-3xl font-semibold text-white shadow-[0_12px_30px_rgba(36,107,253,0.35)] transition hover:scale-105 hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:right-10"
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
