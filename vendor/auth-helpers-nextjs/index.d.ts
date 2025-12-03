import { SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js';

type CookieGetter = ReturnType<typeof import('next/headers').cookies> | (() => ReturnType<typeof import('next/headers').cookies>);

type ClientOptions<Database> = SupabaseClientOptions<Database>;

export function createBrowserClient<Database = any>(
  supabaseUrl: string,
  supabaseKey: string,
  options?: ClientOptions<Database>
): SupabaseClient<Database>;

export function createServerComponentClient<Database = any>(params: {
  cookies: CookieGetter;
  supabaseUrl?: string;
  supabaseKey?: string;
  options?: ClientOptions<Database>;
}): SupabaseClient<Database>;
