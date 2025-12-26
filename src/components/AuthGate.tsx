'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useCallback } from 'react';

type User = {
  id: string;
  email: string;
  name?: string | null;
  display_name?: string | null; // Alias for backwards compatibility
  image?: string | null;
};

type AuthContextValue = {
  user: User | null;
  profile: User | null; // Alias for backwards compatibility
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const homeRoute = '/';
const loginRoute = '/login';

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  const loading = status === 'loading';

  const user = useMemo<User | null>(() => {
    if (!session?.user) return null;
    return {
      id: session.user.id,
      email: session.user.email ?? '',
      name: session.user.name,
      display_name: session.user.name, // Alias for backwards compatibility
      image: session.user.image,
    };
  }, [session]);

  const refresh = useCallback(async () => {
    await update();
  }, [update]);

  const logout = useCallback(async () => {
    await signOut({ callbackUrl: loginRoute });
  }, []);

  // Redirect logic
  useEffect(() => {
    if (loading) return;

    const isLoginPage = window.location.pathname === loginRoute ||
      window.location.pathname.endsWith('/login');

    if (!session && !isLoginPage) {
      router.replace(loginRoute);
    } else if (session && isLoginPage) {
      router.replace(homeRoute);
    }
  }, [session, loading, router]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    profile: user, // Alias for backwards compatibility
    loading,
    refresh,
    logout,
  }), [user, loading, refresh, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return ctx;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(loginRoute);
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}

export default AuthGate;
