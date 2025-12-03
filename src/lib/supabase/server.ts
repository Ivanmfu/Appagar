import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Logger, maskKey } from '../logger';
import { Database } from '../database.types';

export function getServerSupabaseClient() {
  const publicServiceRoleKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY;

  if (publicServiceRoleKey) {
    throw new Error('The Supabase service role key must never be exposed via NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY.');
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables');
  }

  if (serviceRoleKey && supabaseAnonKey === serviceRoleKey) {
    throw new Error('The Supabase service role key cannot be used as the public anon key.');
  }

  Logger.info('Supabase', 'Initializing server component client', {
    urlPresent: Boolean(supabaseUrl),
    anonKeyMasked: maskKey(supabaseAnonKey),
  });

  return createServerComponentClient<Database>({
    cookies,
    supabaseUrl,
    supabaseKey: supabaseAnonKey,
    options: {
      auth: {
        storageKey: 'appagar-auth',
      },
    },
  });
}
