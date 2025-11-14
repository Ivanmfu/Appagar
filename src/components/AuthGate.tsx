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
    
    const initialize = async () => {
      try {
        console.log('Inicializando autenticación...');
        console.log('[Auth] URL:', window.location.href);
        
        // Primero, permitir que Supabase procese cualquier callback OAuth en la URL
        // Esperar un poco para que el SDK procese el código de la URL
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Obtener la sesión inicial
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Error obteniendo sesión inicial:', error);
          setLoading(false);
        } else if (data.session) {
          console.log('Sesión inicial encontrada:', data.session.user.email);
          setSession(data.session);
          const ensuredProfile = await ensureProfile(data.session.user);
          setProfile(ensuredProfile ?? null);
          setLoading(false);
        } else {
          console.log('No hay sesión inicial');
          setLoading(false);
        }
      } catch (error) {
        console.error('Error en inicialización:', error);
        setLoading(false);
      }
    };

    initialize();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log('[Auth] State change:', event, 'Session:', !!newSession, 'User:', newSession?.user?.email);
      if (!mounted) return;
      
      if (event === 'SIGNED_IN') {
        console.log('[Auth] Usuario autenticado vía SIGNED_IN');
        setLoading(true); // Activar loading mientras procesamos
        setSession(newSession);
        try {
          const ensuredProfile = await ensureProfile(newSession?.user ?? null);
          setProfile(ensuredProfile ?? null);
        } catch (error) {
          console.error('[Auth] Error en ensureProfile:', error);
        } finally {
          console.log('[Auth] Finalizando SIGNED_IN, setting loading=false');
          setLoading(false);
        }
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('[Auth] Token refrescado');
        setSession(newSession);
        if (!loading) setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        console.log('[Auth] Usuario cerró sesión');
        setSession(null);
        setProfile(null);
        setLoading(false);
      } else if (event === 'INITIAL_SESSION') {
        console.log('[Auth] Sesión inicial detectada vía INITIAL_SESSION');
        if (newSession) {
          setSession(newSession);
          try {
            const ensuredProfile = await ensureProfile(newSession.user);
            setProfile(ensuredProfile ?? null);
          } catch (error) {
            console.error('[Auth] Error en ensureProfile:', error);
          }
        }
        console.log('[Auth] Finalizando INITIAL_SESSION, setting loading=false');
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []); // Array vacío - solo ejecutar al montar

  // Efecto separado para manejar redirecciones basadas en pathname
  useEffect(() => {
    console.log('[Redirect] loading:', loading, 'session:', !!session, 'pathname:', pathname);
    
    if (loading) {
      console.log('[Redirect] Esperando carga...');
      return;
    }
    
    // Dar tiempo para que se procese el callback OAuth antes de redirigir
    const timer = setTimeout(() => {
      if (!session && pathname !== '/login') {
        console.log('[Redirect] Sin sesión, redirigiendo a login');
        router.replace('/login');
      } else if (session && pathname === '/login') {
        console.log('[Redirect] Con sesión, redirigiendo a home');
        router.replace('/');
      }
    }, 200);
    
    return () => clearTimeout(timer);
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
