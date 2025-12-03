import { createBrowserClient, type SupabaseClient } from '@supabase/auth-helpers-nextjs';
import { Logger, maskKey } from '../logger';
import { Database } from '../database.types';

type Supabase = SupabaseClient<Database>;

declare global {
  // eslint-disable-next-line no-var
  var __supabaseClient: Supabase | undefined;
}

const globalForSupabase = globalThis as typeof globalThis & {
  __supabaseClient?: Supabase;
};

export function getSupabaseClient(): Supabase {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY;
  const publicServiceRoleKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables');
  }

  if (publicServiceRoleKey) {
    throw new Error('The Supabase service role key must never be exposed via NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY.');
  }

  if (typeof window !== 'undefined' && serviceRoleKey) {
    throw new Error('The Supabase service role key cannot be loaded in the browser environment.');
  }

  if (serviceRoleKey && supabaseAnonKey === serviceRoleKey) {
    throw new Error('The Supabase service role key cannot be used in the client. Provide the anon key instead.');
  }

  if (!globalForSupabase.__supabaseClient) {
    Logger.info('Supabase', 'Initializing client', {
      urlPresent: Boolean(supabaseUrl),
      anonKeyMasked: maskKey(supabaseAnonKey),
    });
    globalForSupabase.__supabaseClient = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        flowType: 'pkce',
        // We handle code-exchange manually to avoid the internal PKCE initialization
        // getting stuck on static hosting (GitHub Pages with basePath).
        detectSessionInUrl: false,
        storageKey: 'appagar-auth',
      },
      global: {
        headers: {
          'x-client-info': 'appagar-web',
        },
      },
      db: {
        schema: 'public',
      },
      realtime: {
        params: {
          eventsPerSecond: 2,
        },
      },
    });
    try {
      const existingRaw = (() => {
        if (typeof document === 'undefined') return null;
        const cookies = document.cookie.split(';').map((entry) => entry.trim());
        const match = cookies.find((cookie) => cookie.startsWith('appagar-auth='));
        if (!match) return null;
        return decodeURIComponent(match.split('=')[1] ?? '');
      })();
      if (existingRaw) {
        Logger.debug('Supabase', 'Found persisted session snapshot', { length: existingRaw.length });
        try {
          const parsed = JSON.parse(existingRaw);
          const sess = parsed?.currentSession ?? parsed?.session ?? parsed;
          // If we have tokens in storage, rehydrate the client asynchronously so
          // queries that run immediately after initialization have the token.
          if (sess && sess.access_token && sess.refresh_token) {
            // non-blocking rehydrate
            globalForSupabase.__supabaseClient.auth
              .setSession({ access_token: sess.access_token, refresh_token: sess.refresh_token })
              .then(({ data, error }) => {
                if (error) {
                  Logger.warn('Supabase', 'Failed rehydrating session into client', { error });
                } else {
                  Logger.debug('Supabase', 'Rehydrated session into client', { hasSession: !!data?.session });
                }
              })
              .catch((err) => Logger.error('Supabase', 'Unexpected error rehydrating session', { err }));
          }
        } catch (e) {
          Logger.warn('Supabase', 'Failed parsing persisted session', { err: e });
        }
      } else {
        Logger.debug('Supabase', 'No persisted session found');
      }
    } catch (e) {
      Logger.warn('Supabase', 'Failed reading localStorage', { err: e });
    }
    globalForSupabase.__supabaseClient.auth.onAuthStateChange((event, session) => {
      Logger.info('AuthEvent', event, { hasSession: Boolean(session), userId: session?.user?.id, email: session?.user?.email });
    });
  }

  return globalForSupabase.__supabaseClient;
}

export type { Supabase };
