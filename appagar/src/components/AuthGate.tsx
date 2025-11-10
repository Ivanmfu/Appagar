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
  display_name?: string | null;
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
    .select('id, email, display_name')
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
    display_name: (user.user_metadata as Record<string, unknown>)?.['display_name'] as string | undefined,
  } satisfies Profile;

  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .upsert(newProfile)
    .select('id, email, display_name')
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
  const supabase = getSupabaseClient();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
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
    } catch (error) {
      console.error('Error inesperado al recuperar sesión:', error);
      setSession(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout;
    
    // Timeout de seguridad para no quedarse cargando infinitamente
    const safetyTimeout = setTimeout(() => {
      if (mounted && loading) {
        console.warn('Timeout de carga, forzando finalización');
        setLoading(false);
      }
    }, 5000); // 5 segundos máximo
    
    // Manejar el hash de OAuth en la URL
    const handleOAuthCallback = async () => {
      try {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        if (hashParams.has('access_token')) {
          console.log('Procesando callback de OAuth...');
          // Hay un token de OAuth en la URL, procesarlo
          await supabase.auth.getSession();
          // Limpiar el hash de la URL
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (error) {
        console.error('Error procesando OAuth callback:', error);
      }
    };

    handleOAuthCallback()
      .then(() => refresh())
      .catch((error) => {
        console.error('Error en inicialización:', error);
      })
      .finally(() => {
        if (mounted) setLoading(false);
        clearTimeout(safetyTimeout);
      });

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log('Auth state changed:', event);
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
      clearTimeout(safetyTimeout);
      listener.subscription.unsubscribe();
    };
  }, [pathname, refresh, router, supabase, loading]);

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
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="p-6 text-center space-y-4">
        <div className="text-gray-500">Comprobando sesión...</div>
        <div className="text-xs text-gray-400">Si esto tarda mucho, recarga la página</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}

export default AuthGate;
