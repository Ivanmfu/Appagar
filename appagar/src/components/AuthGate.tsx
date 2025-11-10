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
  const [processingOAuth, setProcessingOAuth] = useState(false);
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
        console.log('[Auth] href:', window.location.href);
        console.log('[Auth] search:', window.location.search);
        console.log('[Auth] hash:', window.location.hash);

        // Fallback manual: si venimos con tokens en el hash, establecemos sesión inmediatamente
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        if (hashParams.has('access_token')) {
          try {
            setProcessingOAuth(true);
            const access_token = hashParams.get('access_token') ?? undefined;
            const refresh_token = hashParams.get('refresh_token') ?? undefined;
            if (access_token && refresh_token) {
              console.log('[Auth] tokens from hash -> access:', access_token.length, 'refresh:', refresh_token.length);
              const { data: setData, error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
              if (setErr) console.error('[Auth] setSession error:', setErr);
              else console.log('[Auth] setSession ok, has session:', Boolean(setData.session));
              const { data: userData, error: userErr } = await supabase.auth.getUser();
              if (userErr) console.error('[Auth] getUser after setSession error:', userErr);
              else console.log('[Auth] getUser after setSession ->', Boolean(userData.user));
              // limpiar hash para no perder tokens en futuras redirecciones
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          } finally {
            setProcessingOAuth(false);
          }
        }

        // Si venimos con PKCE (?code=...), hacemos el intercambio explícito por si la auto-detección no corre aún
        const searchParams = new URLSearchParams(window.location.search);
        if (searchParams.has('code')) {
          try {
            setProcessingOAuth(true);
            console.log('[Auth] Found ?code, exchanging for session...');
            console.log('[Auth] code value:', searchParams.get('code'));
            // Construir URL completa para el intercambio (sin basePath en hash/search, solo origin + path)
            const callbackUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;
            console.log('[Auth] callbackUrl for exchange:', callbackUrl);
            console.log('[Auth] About to call exchangeCodeForSession...');
            const startTime = Date.now();
            const result = await supabase.auth.exchangeCodeForSession(callbackUrl);
            const elapsed = Date.now() - startTime;
            console.log('[Auth] exchangeCodeForSession completed in', elapsed, 'ms');
            console.log('[Auth] result:', result);
            const { data: exData, error: exErr } = result;
            if (exErr) {
              console.error('[Auth] exchangeCodeForSession error:', exErr);
              console.error('[Auth] error code:', exErr.code);
              console.error('[Auth] error status:', exErr.status);
              console.error('[Auth] error details:', JSON.stringify(exErr, null, 2));
            } else {
              console.log('[Auth] exchange ok, has session:', Boolean(exData.session));
              console.log('[Auth] session data:', exData.session ? 'present' : 'null');
              console.log('[Auth] user:', exData.session?.user?.email);
            }
            // limpiar querystring
            console.log('[Auth] Cleaning query string...');
            window.history.replaceState({}, document.title, window.location.pathname);
            console.log('[Auth] Query string cleaned');
          } catch (err) {
            console.error('[Auth] exception during exchange:', err);
            console.error('[Auth] exception type:', typeof err);
            console.error('[Auth] exception stringified:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
          } finally {
            console.log('[Auth] Setting processingOAuth to false');
            setProcessingOAuth(false);
          }
        }

        // Pedimos la sesión actual (si detectSessionInUrl funcionó, ya estará poblada)
        console.log('[Auth] About to call getSession...');
        const { data, error } = await supabase.auth.getSession();
        console.log('[Auth] getSession completed');
        if (error) {
          console.error('Error inicial obteniendo sesión', error);
        } else {
          console.log('Sesión inicial presente:', Boolean(data.session));
          if (data.session) {
            console.log('[Auth] Session user:', data.session.user.email);
          }
        }
        console.log('[Auth] About to call refresh...');
        await refresh();
        console.log('[Auth] refresh completed');
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
    
    // Evitar redirigir mientras procesamos callback OAuth o aún cargamos
    if (loading || processingOAuth) return;
    
    if (!session && pathname !== '/login') {
      console.log('No session, redirecting to login');
      router.replace('/login');
    } else if (session && pathname === '/login') {
      console.log('Has session, redirecting to home');
      router.replace('/');
    }
  }, [pathname, session, loading, processingOAuth, router]);

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
