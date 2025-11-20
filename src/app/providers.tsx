'use client';
import { AuthProvider } from '@/components/AuthGate';
import DebugOverlay from '@/components/DebugOverlay';
import { Logger } from '@/lib/logger';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useEffect, useState } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      try {
        let targetUrl: string;
        if (typeof input === 'string') {
          targetUrl = input;
        } else if (input instanceof Request) {
          targetUrl = input.url;
        } else if (input instanceof URL) {
          targetUrl = input.href;
        } else {
          targetUrl = String(input);
        }
        const resolved = new URL(targetUrl, window.location.href);
        if (resolved.pathname === '/Appagar.txt') {
          const redirected = `${window.location.origin}/Appagar/Appagar.txt${resolved.search}`;
          Logger.debug('FetchShim', 'Redirecting RSC fetch to base path', { from: resolved.href, to: redirected });
          return originalFetch(redirected, init);
        }
      } catch (error) {
        Logger.warn('FetchShim', 'Failed to analyse fetch request', { error });
      }
      return originalFetch(input as RequestInfo, init);
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        {children}
        <DebugOverlay />
      </AuthProvider>
    </QueryClientProvider>
  );
}
