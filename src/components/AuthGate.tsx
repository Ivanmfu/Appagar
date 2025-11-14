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

  try {
    const supabase = getSupabaseClient();
    const { data: existing, error: fetchError } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .eq('id', user.id)
      .maybeSingle();

    if (fetchError) {
      console.error('[Profile] Error fetching profile:', fetchError);
      // Retornar perfil básico si falla la consulta
      return {
        id: user.id,
        email: user.email,
        display_name: user.user_metadata?.display_name || null,
      };
    }

    if (existing) {
      return existing;
    }

    // Crear nuevo perfil
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
      console.error('[Profile] Error creating profile:', error);
      // Retornar el perfil básico si falla la creación
      return newProfile;
    }

    return data ?? newProfile;
  } catch (error) {
    console.error('[Profile] Unexpected error:', error);
    // Retornar perfil básico en caso de error
    return {
      id: user.id,
      email: user.email,
      display_name: user.user_metadata?.display_name || null,
    };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);
  const supabase = useMemo(() => getSupabaseClient(), []);

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
    if (initializedRef.current) return;
    initializedRef.current = true;
    
    let mounted = true;
    
    const initialize = async () => {
      console.log('[Auth] Initializing...');
      try {
        const { data, error } = await supabase.auth.getSession();
        console.log('[Auth] getSession result:', { hasSession: !!data.session, error });
        
        if (mounted) {
          if (error) {
            console.error('[Auth] Error getting session:', error);
          }
          setSession(data.session);
          if (data.session) {
            console.log('[Auth] User found:', data.session.user.email);
            const profile = await ensureProfile(data.session.user);
            setProfile(profile);
            console.log('[Auth] Profile loaded');
          }
        }
      } catch (err) {
        console.error('[Auth] Error in initialize:', err);
      } finally {
        if (mounted) {
          console.log('[Auth] Setting loading=false');
          setLoading(false);
        }
      }
    };

    initialize();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;
      console.log('[Auth] Event:', event, 'Has session:', !!newSession);
      
      try {
        setSession(newSession);
        if (newSession?.user) {
          console.log('[Auth] Loading profile for:', newSession.user.email);
          const profile = await ensureProfile(newSession.user);
          setProfile(profile);
          console.log('[Auth] Profile loaded in event handler');
        } else {
          setProfile(null);
        }
      } catch (err) {
        console.error('[Auth] Error in event handler:', err);
      } finally {
        console.log('[Auth] Event handler setting loading=false');
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // Efecto separado para manejar redirecciones
  useEffect(() => {
    if (loading) return;
    
    if (!session && pathname !== '/login') {
      router.replace('/login');
    } else if (session && pathname === '/login') {
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
