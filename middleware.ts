import { NextResponse, type NextRequest } from 'next/server';
import { Logger } from './src/lib/logger';
import { getMiddlewareSupabaseClient } from './src/lib/supabase/middleware';

const FIVE_MINUTES = 5 * 60 * 1000;

function withBasePath(path: string, basePath: string) {
  if (!basePath) return path;
  return `${basePath}${path}`;
}

function isPublicRoute(pathname: string, basePath: string) {
  const normalized = pathname.startsWith(basePath) ? pathname.slice(basePath.length) || '/' : pathname;
  return (
    normalized === '/login' ||
    normalized.startsWith('/invite') ||
    normalized === '/Appagar.txt' ||
    normalized === '/favicon.ico'
  );
}

export async function middleware(req: NextRequest) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  const res = NextResponse.next({ request: { headers: req.headers } });
  const supabase = getMiddlewareSupabaseClient(req, res);

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    Logger.warn('Auth', 'Error retrieving session in middleware', { error: sessionError });
  }

  const pathname = req.nextUrl.pathname;
  const publicRoute = isPublicRoute(pathname, basePath);

  if (!session && !publicRoute) {
    const redirectTo = new URL(withBasePath('/login', basePath), req.url);
    redirectTo.searchParams.set('redirectTo', pathname + req.nextUrl.search);
    return NextResponse.redirect(redirectTo);
  }

  if (session) {
    const expiresAtMs = (session.expires_at ?? 0) * 1000;
    const now = Date.now();

    if (expiresAtMs <= now) {
      Logger.info('Auth', 'Session expired in middleware, attempting refresh');
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (error || !refreshed.session) {
        Logger.warn('Auth', 'Unable to refresh expired session; redirecting to login', { error });
        const redirectTo = new URL(withBasePath('/login', basePath), req.url);
        redirectTo.searchParams.set('redirectTo', pathname + req.nextUrl.search);
        return NextResponse.redirect(redirectTo);
      }
    } else if (expiresAtMs - now < FIVE_MINUTES) {
      Logger.debug('Auth', 'Proactively refreshing session nearing expiration');
      await supabase.auth.refreshSession().catch((error) =>
        Logger.warn('Auth', 'Failed proactive refresh', { error })
      );
    }
  }

  res.headers.set('x-middleware-cache', 'no-cache');
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
