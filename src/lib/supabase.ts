import { createClient, SupabaseClient } from '@supabase/supabase-js';
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
  // Only initialize in the browser, not during build time
  if (typeof window === 'undefined') {
    // During SSG/build time, return a stub that will never be called
    // since all components using it are client-side with 'use client'
    return null as unknown as Supabase;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables'
    );
  }

  if (!globalForSupabase.__supabaseClient) {
    globalForSupabase.__supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
  }

  return globalForSupabase.__supabaseClient;
}
