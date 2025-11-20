import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Logger, maskKey } from './logger';
import { Database } from './database.types';

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
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables'
    );
  }

  if (!globalForSupabase.__supabaseClient) {
    Logger.info('Supabase', 'Initializing client', { urlPresent: Boolean(supabaseUrl), anonKeyMasked: maskKey(supabaseAnonKey) });
    globalForSupabase.__supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        flowType: 'pkce',
        // We handle code-exchange manually to avoid the internal PKCE initialization
        // getting stuck on static hosting (GitHub Pages with basePath).
        detectSessionInUrl: false,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
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
      const existingRaw = typeof window !== 'undefined' ? window.localStorage.getItem('appagar-auth') : null;
      if (existingRaw) {
        Logger.debug('Supabase', 'Found persisted session snapshot', { length: existingRaw.length });
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
