'use client';

import { AuthProvider } from '@/components/AuthGate';
import DebugOverlay from '@/components/DebugOverlay';
import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        retry: 1,
      },
    },
  }));

  return (
    <SessionProvider>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          {children}
          <DebugOverlay />
        </AuthProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
