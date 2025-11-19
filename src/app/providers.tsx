'use client';
import { AuthProvider } from '@/components/AuthGate';
import DebugOverlay from '@/components/DebugOverlay';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        {children}
        <DebugOverlay />
      </AuthProvider>
    </QueryClientProvider>
  );
}
