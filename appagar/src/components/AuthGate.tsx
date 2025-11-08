'use client';

import { getSupabaseClient } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type Profile = {
  id: string;
  email?: string | null;
  full_name?: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function ensureProfile(user: User | null) {
  if (!user) return null;

  const supabase = getSupabaseClient();
  const { data: existing, error: fetchError } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', user.id)
    .maybeSingle();

  if (fetchError) {
    console.error('Error al comprobar el perfil', fetchError);
    return existing ?? null;
  }

  if (existing) {
    return existing;
  }

  const newProfile = {
    id: user.id,
    email: user.email,
    full_name: (user.user_metadata as Record<string, unknown>)?.['full_name'] as string | undefined,
  } satisfies Profile;

  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .upsert(newProfile)
    .select('id, email, full_name')
    .single();

  if (error) {
    console.error('Error al crear el perfil', error);
    return existing ?? newProfile;
  }

  return data ?? newProfile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => getSupabaseClient(), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Error al recuperar la sesión', error);
      setSession(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    const nextSession = data.session ?? null;
    setSession(nextSession);
    const ensuredProfile = await ensureProfile(nextSession?.user ?? null);
    setProfile(ensuredProfile ?? null);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    let mounted = true;
    refresh().finally(() => {
      if (mounted) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      const ensuredProfile = await ensureProfile(newSession?.user ?? null);
      setProfile(ensuredProfile ?? null);

      if (!newSession && pathname !== '/login') {
        router.replace('/login');
      } else if (newSession && pathname === '/login') {
        router.replace('/');
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [pathname, refresh, router, supabase]);

  const value = useMemo(
    () => ({ session, user: session?.user ?? null, profile, loading, refresh }),
    [session, profile, loading, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
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

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Cargando sesión...</div>;
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}

export default AuthGate;
