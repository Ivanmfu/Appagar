import { Logger, maskKey } from '../logger';

export function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY;
  const publicServiceRoleKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (publicServiceRoleKey) {
    throw new Error('The Supabase service role key must never be exposed via NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY.');
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    const fallbackUrl = process.env.NEXT_PUBLIC_SUPABASE_PLACEHOLDER_URL || 'http://localhost:54321';
    const fallbackAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PLACEHOLDER_ANON_KEY || 'supabase-anon-placeholder';
    Logger.warn('Supabase', 'Missing Supabase public environment variables; using placeholder values. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for production.', {
      fallbackUrl,
      anonKeyMasked: maskKey(fallbackAnonKey),
    });

    return { supabaseUrl: fallbackUrl, supabaseAnonKey: fallbackAnonKey } as const;
  }

  if (serviceRoleKey && supabaseAnonKey === serviceRoleKey) {
    throw new Error('The Supabase service role key cannot be used as the public anon key.');
  }

  Logger.info('Supabase', 'Resolved Supabase environment configuration', {
    urlPresent: Boolean(supabaseUrl),
    anonKeyMasked: maskKey(supabaseAnonKey),
  });

  return { supabaseUrl, supabaseAnonKey } as const;
}
