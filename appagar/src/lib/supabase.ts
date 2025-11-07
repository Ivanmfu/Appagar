import { createClient, type SupabaseClient } from '@supabase/supabase-js';

declare global {
  // eslint-disable-next-line no-var
  var __supabaseClient: SupabaseClient | undefined;
}

const globalForSupabase = globalThis as typeof globalThis & {
  __supabaseClient?: SupabaseClient;
};

export function getSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables'
    );
  }

  if (!globalForSupabase.__supabaseClient) {
    globalForSupabase.__supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  }

  return globalForSupabase.__supabaseClient;
}
