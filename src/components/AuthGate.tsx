'use client';

import { linkPendingGroupInvitesToUser } from '@/lib/invites';
import { getSupabaseClient } from '@/lib/supabase';
import { Logger, withTiming } from '@/lib/logger';
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
  Logger.debug('Profile', 'ensureProfile invoked', { email: user?.email });
  if (!user) {
    Logger.debug('Profile', 'No user, returning null');
    return null;
  }

  // WORKAROUND: Usar perfil del auth.user directamente mientras arreglamos RLS
  const fallbackProfile = {
    id: user.id,
    email: user.email,
    display_name: user.user_metadata?.display_name || user.user_metadata?.full_name || null,
  };

  try {
    const supabase = getSupabaseClient();
    Logger.debug('Profile', 'Fetching profile (timeout 3s)');
    
    // Crear promesa con timeout de 3 segundos
    const fetchPromise = supabase
      .from('profiles')
      .select('id, email, display_name')
      .eq('id', user.id)
      .maybeSingle();

    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Profile fetch timeout')), 3000)
    );

    const { data: existing, error: fetchError } = await Promise.race([
      fetchPromise,
      timeoutPromise,
    ]) as Awaited<typeof fetchPromise>;
    Logger.debug('Profile', 'DB query result', { hasExisting: Boolean(existing), fetchError });

    if (fetchError) {
      Logger.warn('Profile', 'Error fetching profile, returning fallback', { fetchError });
      return fallbackProfile;
    }

    if (existing) {
      Logger.debug('Profile', 'Existing profile found', existing);
      await linkPendingGroupInvitesToUser({ userId: user.id, email: existing.email ?? user.email ?? null });
      return existing;
    }

    Logger.info('Profile', 'No profile found – creating profile');
    const newProfile = {
      id: user.id,
      email: user.email,
      display_name: fallbackProfile.display_name,
    } satisfies Profile;

    const { data: created, error: upsertError } = await supabase
      .from('profiles')
      .upsert(newProfile, { onConflict: 'id' })
      .select('id, email, display_name')
      .single();

    if (upsertError) {
      Logger.warn('Profile', 'Upsert error, returning fallback', { upsertError });
      await linkPendingGroupInvitesToUser({ userId: user.id, email: user.email ?? fallbackProfile.email ?? null });
      return fallbackProfile;
    }

    const profileToUse = created ?? newProfile;
    await linkPendingGroupInvitesToUser({ userId: user.id, email: profileToUse.email ?? fallbackProfile.email ?? null });
    Logger.info('Profile', 'Profile created', profileToUse);
    return profileToUse;
  } catch (error) {
    Logger.warn('Profile', 'Exception/timeout - returning fallback', { error });
    await linkPendingGroupInvitesToUser({ userId: user.id, email: user.email ?? fallbackProfile.email ?? null });
    Logger.debug('Profile', 'Fallback after exception');
    return fallbackProfile;
  }
}

const homeRoute = '/';
const loginRoute = '/login';

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);
  const supabase = useMemo(() => getSupabaseClient(), []);

  const refresh = useCallback(async () => {
    Logger.info('Auth', 'Manual refresh invoked');
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        Logger.warn('Auth', 'Error getting session', { error });
        setSession(null);
        setProfile(null);
        return;
      }

      const nextSession = data.session ?? null;
      setSession(nextSession);
      const ensuredProfile = await withTiming('Auth', 'ensureProfile', () => ensureProfile(nextSession?.user ?? null));
      setProfile(ensuredProfile ?? null);
    } catch (error) {
      Logger.error('Auth', 'Unexpected error during refresh', { error });
      setSession(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    let isMounted = true;

    // Safety timeout: force loading=false after 10 seconds
      // Removed forced timeout fallback

    (async () => {
      Logger.info('Auth', 'Initializing');
      try {
        let sessionToUse: Session | null = null;
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          const hasCode = url.searchParams.has('code');
          const hasError = url.searchParams.has('error_description') || url.searchParams.has('error');
          const hasHashTokens = url.hash.includes('access_token') || url.hash.includes('refresh_token');
          const hasAuthParams = hasCode || hasError || hasHashTokens;

          if (hasAuthParams) {
            Logger.info('Auth', 'Processing auth callback manually');
            const isTokenCallback = hasHashTokens && !hasCode;

            if (isTokenCallback) {
              const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
              const access_token = hashParams.get('access_token');
              const refresh_token = hashParams.get('refresh_token');

              if (access_token && refresh_token) {
                const { data, error } = await supabase.auth.setSession({
                  access_token,
                  refresh_token,
                });

                Logger.debug('Auth', 'setSession result from hash tokens', {
                  hasSession: !!data.session,
                  error,
                });

                if (error) {
                  Logger.warn('Auth', 'Auth callback processing returned error', { error });
                }

                if (data.session && isMounted) {
                  Logger.info('Auth', 'Session obtained from token callback');
                  sessionToUse = data.session;
                  setSession(data.session);
                  const profile = await withTiming('Auth', 'ensureProfile(callback)', () => ensureProfile(data.session!.user));
                  setProfile(profile);
                }
              } else {
                Logger.warn('Auth', 'Token callback missing access/refresh token');
              }
            } else {
              const { data, error } = await supabase.auth.exchangeCodeForSession(url.toString());

              Logger.debug('Auth', 'exchangeCodeForSession result', {
                hasSession: !!data.session,
                error,
              });

              if (error) {
                Logger.warn('Auth', 'Auth callback processing returned error', { error });
              }

              if (data.session && isMounted) {
                Logger.info('Auth', 'Session obtained from callback');
                sessionToUse = data.session;
                setSession(data.session);
                const profile = await withTiming('Auth', 'ensureProfile(callback)', () => ensureProfile(data.session!.user));
                setProfile(profile);
              }
            }

            // Clean sensitive params from the URL once processed
            router.replace(pathname || homeRoute);
          }
        }

        if (!sessionToUse) {
          const { data, error } = await supabase.auth.getSession();
          Logger.debug('Auth', 'getSession result', { hasSession: !!data.session, error, userId: data.session?.user?.id, email: data.session?.user?.email });

          if (!isMounted) return;

          if (error) {
            Logger.warn('Auth', 'Error in getSession', { error });
          }

          sessionToUse = data.session;
          setSession(sessionToUse);

          if (sessionToUse) {
            Logger.info('Auth', 'User session detected', { email: sessionToUse.user.email, userId: sessionToUse.user.id });
            const profile = await withTiming('Auth', 'ensureProfile(initial)', () => ensureProfile(sessionToUse!.user));
            setProfile(profile);
            Logger.debug('Auth', 'Profile state updated');
          }
        }
      } catch (error) {
        Logger.error('Auth', 'Error in initialize', { error });
      } finally {
        if (isMounted) {
          Logger.debug('Auth', 'Initialization complete; loading=false');
          setLoading(false);
        }
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;
      Logger.info('Auth', 'Auth state change', { event, hasSession: !!newSession });
      
      try {
        setSession(newSession);
        if (newSession?.user) {
          Logger.debug('Auth', 'ensureProfile on auth event', { email: newSession.user.email });
          const profile = await withTiming('Auth', 'ensureProfile(event)', () => ensureProfile(newSession.user));
          setProfile(profile);
        } else {
          setProfile(null);
        }
      } catch (err) {
        Logger.error('Auth', 'Error in event handler', { err });
      } finally {
        Logger.debug('Auth', 'Auth event complete; loading=false');
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [pathname, router, supabase]);

  // Efecto separado para manejar redirecciones
  useEffect(() => {
    if (loading) return;

    const isLoginRoute = pathname === loginRoute || pathname?.endsWith('/login');

    if (!session && !isLoginRoute) {
      router.replace(loginRoute);
    } else if (session && isLoginRoute) {
      router.replace(homeRoute);
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
    Logger.debug('AuthGate', 'Render gating check', { loading, hasUser: !!user });
    if (!loading && !user) {
      Logger.info('AuthGate', 'Redirecting to login (no user)');
      router.replace(loginRoute);
    }
  }, [loading, user, router]);

  if (!user && !loading) {
    return null;
  }

  return <>{children}</>;
}

export default AuthGate;
