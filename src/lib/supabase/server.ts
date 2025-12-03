import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies, headers } from 'next/headers';
import { Logger } from '../logger';
import { Database } from '../database.types';
import { getSupabaseConfig } from './config';

export function getServerSupabaseClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();
  const requestHeaders = headers();

  Logger.info('Supabase', 'Initializing server component client', {
    hasCookieStore: Boolean(cookies),
    forwardedHost: requestHeaders.get('host'),
  });

  return createServerComponentClient<Database>({
    cookies,
    supabaseUrl,
    supabaseKey: supabaseAnonKey,
    options: {
      global: {
        headers: {
          'x-client-info': 'appagar-web-ssr',
          'x-forwarded-host': requestHeaders.get('host') ?? undefined,
        },
      },
      auth: {
        storageKey: 'appagar-auth',
        detectSessionInUrl: false,
      },
    },
  });
}
