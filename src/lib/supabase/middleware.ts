import { createClient } from '@supabase/supabase-js';
import type { NextRequest, NextResponse } from 'next/server';
import { Database } from '../database.types';
import { Logger } from '../logger';
import { getSupabaseConfig } from './config';

const AUTH_STORAGE_KEY = 'appagar-auth';
const AUTH_MAX_AGE_SECONDS = 60 * 60 * 24 * 60; // 60 days to align with Supabase defaults

type SupabaseAuthStorage = NonNullable<
  NonNullable<Parameters<typeof createClient>[2]>['auth']
>['storage'];

function createMiddlewareStorage(req: NextRequest, res: NextResponse) {
  return {
    getItem: (key?: string) => req.cookies.get(key ?? AUTH_STORAGE_KEY)?.value ?? null,
    setItem: (key: string, value: string) => {
      const name = key ?? AUTH_STORAGE_KEY;
      Logger.debug('Supabase', 'Persisting auth cookie from middleware', { name });
      res.cookies.set(name, value ?? '', {
        maxAge: AUTH_MAX_AGE_SECONDS,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https',
      });
    },
    removeItem: (key?: string) => {
      const name = key ?? AUTH_STORAGE_KEY;
      Logger.debug('Supabase', 'Clearing auth cookie from middleware', { name });
      res.cookies.set(name, '', { maxAge: 0, path: '/', sameSite: 'lax' });
    },
  } satisfies SupabaseAuthStorage;
}

export function getMiddlewareSupabaseClient(req: NextRequest, res: NextResponse) {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        'x-client-info': 'appagar-web-middleware',
      },
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: createMiddlewareStorage(req, res),
      storageKey: AUTH_STORAGE_KEY,
      detectSessionInUrl: false,
    },
  });
}
