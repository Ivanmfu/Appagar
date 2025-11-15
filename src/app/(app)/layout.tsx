import { Suspense } from 'react';
import type { ReactNode } from 'react';
import AppShell from '@/components/layout/AppShell';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
