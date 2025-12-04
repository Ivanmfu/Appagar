'use client';

import { linkPendingGroupInvitesToUser } from '@/lib/invites';
import { getSupabaseClient } from '@/lib/supabase';
import { isAuthError } from '@/lib/supabase/auth';
import { Logger, withTiming } from '@/lib/logger';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
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
type StorageSource = 'localStorage' | 'sessionStorage';

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
function findPkceVerifier(): { key: string; value: string; source: StorageSource } | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const sources: Array<{ storage: Storage; source: StorageSource }> = [];
  if (window.localStorage) {
    sources.push({ storage: window.localStorage, source: 'localStorage' });
  }
  if (window.sessionStorage) {
    sources.push({ storage: window.sessionStorage, source: 'sessionStorage' });
  }

  for (const { storage, source } of sources) {
    try {
      const length = storage.length;
      for (let index = 0; index < length; index += 1) {
        const key = storage.key(index);
        if (!key) continue;
        const normalized = key.toLowerCase();
        if (!normalized.includes('code') || !normalized.includes('verifier')) {
          continue;
        }
        const value = storage.getItem(key);
        if (value) {
          return { key, value, source };
        }
      }
    } catch (error) {
      Logger.warn('Auth', 'Unable to inspect storage for PKCE verifier', { error, source });
    }
  }

  return null;
}

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

  const handleAuthFailure = useCallback(
    async (reason: string) => {
      Logger.warn('Auth', 'Auth failure detected; signing out', { reason });
      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        Logger.warn('Auth', 'Error signing out after auth failure', { signOutError });
      }
      setSession(null);
      setProfile(null);
      setLoading(false);
      router.replace(loginRoute);
    },
    [router, supabase]
  );

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

      let nextSession = data.session ?? null;

      if (nextSession?.expires_at && nextSession.expires_at * 1000 <= Date.now()) {
        Logger.info('Auth', 'Session expired during refresh; attempting token refresh');
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshed.session) {
          await handleAuthFailure('refresh-session-failed');
          return;
        }
        nextSession = refreshed.session;
      }

      const { data: userData, error: userError, status } = await supabase.auth.getUser();
      if (userError || !userData.user || status === 401) {
        await handleAuthFailure('user-unavailable');
        return;
      }

      setSession(nextSession);
      const ensuredProfile = await withTiming('Auth', 'ensureProfile', () => ensureProfile(nextSession?.user ?? null));
      setProfile(ensuredProfile ?? null);
    } catch (error) {
      if (isAuthError(error)) {
        await handleAuthFailure('refresh-exception');
        return;
      }
      Logger.error('Auth', 'Unexpected error during refresh', { error });
      setSession(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [handleAuthFailure, supabase]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    let isMounted = true;

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
              const code = url.searchParams.get('code');
              const state = url.searchParams.get('state');
              Logger.debug('Auth', 'PKCE callback parameters', {
                hasCode: Boolean(code),
                codePreview: code ? `${code.slice(0, 4)}...${code.slice(-4)}` : null,
                hasState: Boolean(state),
              });

              if (!code) {
                Logger.warn('Auth', 'Missing PKCE code parameter in callback');
              } else {
                const verifierEntry = findPkceVerifier();
                Logger.debug('Auth', 'PKCE verifier lookup', {
                  found: Boolean(verifierEntry),
                  source: verifierEntry?.source ?? null,
                  key: verifierEntry?.key ?? null,
                  length: verifierEntry?.value.length ?? null,
                });

                if (!verifierEntry) {
                  Logger.warn('Auth', 'PKCE verifier not present in storage; relying on Supabase SDK fallback');
                }

                const exchangeResult = await supabase.auth.exchangeCodeForSession(code);

                const { data, error } = exchangeResult;

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
                  if (verifierEntry) {
                    try {
                      const storage = verifierEntry.source === 'localStorage' ? window.localStorage : window.sessionStorage;
                      storage.removeItem(verifierEntry.key);
                    } catch (error) {
                      Logger.warn('Auth', 'Unable to clean PKCE verifier from storage', { error, key: verifierEntry.key, source: verifierEntry.source });
                    }
                  }
                }
              }
            }

            // Clean sensitive params from the URL once processed
            router.replace(pathname || homeRoute);
          }
        }

        if (!sessionToUse) {
          const { data, error, status } = await supabase.auth.getSession();
          Logger.debug('Auth', 'getSession result', { hasSession: !!data.session, error, status, userId: data.session?.user?.id, email: data.session?.user?.email });

          if (!isMounted) return;

          if (error) {
            Logger.warn('Auth', 'Error in getSession', { error, status });
          }

          sessionToUse = data.session;

          if (sessionToUse?.expires_at && sessionToUse.expires_at * 1000 <= Date.now()) {
            Logger.info('Auth', 'Session expired during init; refreshing');
            const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError || !refreshed.session) {
              await handleAuthFailure('init-refresh-failed');
              return;
            }
            sessionToUse = refreshed.session;
          }

          const { data: userData, error: userError, status: userStatus } = await supabase.auth.getUser();
          if (userError || !userData.user || userStatus === 401) {
            await handleAuthFailure('init-user-missing');
            return;
          }

          setSession(sessionToUse);

          if (sessionToUse) {
            Logger.info('Auth', 'User session detected', { email: sessionToUse.user.email, userId: sessionToUse.user.id });
            const profile = await withTiming('Auth', 'ensureProfile(initial)', () => ensureProfile(sessionToUse!.user));
            setProfile(profile);
            Logger.debug('Auth', 'Profile state updated');
          }
        }
      } catch (error) {
        if (isAuthError(error)) {
          await handleAuthFailure('init-exception');
          return;
        }
        Logger.error('Auth', 'Error in initialize', { error });
      } finally {
        if (isMounted) {
          Logger.debug('Auth', 'Initialization complete; loading=false');
          setLoading(false);
        }
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(async (
      event: AuthChangeEvent,
      newSession: Session | null
    ) => {
      if (!isMounted) return;
      Logger.info('Auth', 'Auth state change', { event, hasSession: !!newSession });

      try {
        if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
          const { data: userData, error: userError } = await supabase.auth.getUser();
          if (userError || !userData.user) {
            await handleAuthFailure('auth-event-user-missing');
            return;
          }
        }

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
