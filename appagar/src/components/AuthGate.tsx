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
  useRef,
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
  const initializedRef = useRef(false);
  const supabase = getSupabaseClient();

  const refresh = useCallback(async () => {
    console.log('[Auth] refresh() called');
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('Error al recuperar la sesión', error);
        setSession(null);
        setProfile(null);
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
    // Solo inicializar una vez usando ref
    if (initializedRef.current) return;
    initializedRef.current = true;
    
    let mounted = true;
    // Safety timeout (10s) to avoid infinite loading if something goes wrong
    const safety = setTimeout(() => {
      if (mounted && loading) {
        console.warn('[Auth] Safety timeout reached (10s). Forcing loading=false');
        setLoading(false);
      }
    }, 10000);
    
    const initialize = async () => {
      try {
        console.log('Inicializando autenticación...');
        // Verificar si hay un hash de OAuth
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        if (hashParams.has('access_token')) {
          console.log('Procesando callback de OAuth...');
          await supabase.auth.getSession();
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        // Soportar flujo PKCE (?code=...)
        const searchParams = new URLSearchParams(window.location.search);
        if (searchParams.has('code')) {
          console.log('Intercambiando código PKCE por sesión...');
          const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (error) console.error('Error al intercambiar código PKCE', error);
          else console.log('Sesión PKCE establecida', Boolean(data.session));
          // Limpiar querystring
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        
        await refresh();
      } catch (error) {
        console.error('Error en inicialización:', error);
        setLoading(false);
      }
    };

    initialize();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log('Auth state changed:', event, 'Has session:', !!newSession);
      if (!mounted) return;
      
      setSession(newSession);
      const ensuredProfile = await ensureProfile(newSession?.user ?? null);
      setProfile(ensuredProfile ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      clearTimeout(safety);
    };
  }, []); // Array vacío - solo ejecutar al montar

  // Efecto separado para manejar redirecciones basadas en pathname
  useEffect(() => {
    console.log('Redirect effect - loading:', loading, 'session:', !!session, 'pathname:', pathname);
    
    if (loading) return; // Esperar a que termine de cargar
    
    if (!session && pathname !== '/login') {
      console.log('No session, redirecting to login');
      router.replace('/login');
    } else if (session && pathname === '/login') {
      console.log('Has session, redirecting to home');
      router.replace('/');
    }
  }, [pathname, session, loading, router]);

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
    console.log('AuthGate - loading:', loading, 'user:', !!user);
    if (!loading && !user) {
      console.log('AuthGate - Redirigiendo a login');
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="p-6 text-center space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
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
