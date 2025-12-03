const { createClient } = require('@supabase/supabase-js');

function parseBrowserCookies() {
  if (typeof document === 'undefined' || !document.cookie) return {};
  return Object.fromEntries(
    document.cookie.split(';').map((entry) => {
      const [name, ...rest] = entry.trim().split('=');
      return [decodeURIComponent(name), decodeURIComponent(rest.join('=') ?? '')];
    })
  );
}

function browserCookieStorage(storageKey, maxAgeSeconds = 60 * 60 * 24 * 60) {
  return {
    getItem: (key) => {
      const cookies = parseBrowserCookies();
      return cookies[key ?? storageKey] ?? null;
    },
    setItem: (key, value) => {
      const name = key ?? storageKey;
      const encoded = encodeURIComponent(value ?? '');
      const directives = [`path=/`, `samesite=lax`, `max-age=${maxAgeSeconds}`];
      if (typeof location !== 'undefined' && location.protocol === 'https:') {
        directives.push('secure');
      }
      document.cookie = `${encodeURIComponent(name)}=${encoded}; ${directives.join('; ')}`;
    },
    removeItem: (key) => {
      const name = key ?? storageKey;
      document.cookie = `${encodeURIComponent(name)}=; max-age=0; path=/; samesite=lax`;
    },
  };
}

function serverCookieStorage(cookieStore, storageKey, maxAgeSeconds = 60 * 60 * 24 * 60) {
  return {
    getItem: (key) => cookieStore.get(key ?? storageKey)?.value ?? null,
    setItem: (key, value) =>
      cookieStore.set(key ?? storageKey, value ?? '', {
        maxAge: maxAgeSeconds,
        sameSite: 'lax',
        path: '/',
      }),
    removeItem: (key) => cookieStore.delete(key ?? storageKey),
  };
}

function normalizeCookieStore(input) {
  if (typeof input === 'function') return input();
  return input;
}

function createBrowserClient(supabaseUrl, supabaseKey, options = {}) {
  const storageKey = options?.auth?.storageKey ?? 'sb-auth-token';
  const auth = {
    persistSession: true,
    autoRefreshToken: true,
    storage: browserCookieStorage(storageKey),
    ...options.auth,
  };

  return createClient(supabaseUrl, supabaseKey, { ...options, auth });
}

function createServerComponentClient({ cookies, supabaseUrl, supabaseKey, options = {} }) {
  const cookieStore = normalizeCookieStore(cookies);
  const storageKey = options?.auth?.storageKey ?? 'sb-auth-token';
  const auth = {
    persistSession: true,
    autoRefreshToken: true,
    storage: serverCookieStorage(cookieStore, storageKey),
    ...options.auth,
  };

  return createClient(
    supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL,
    supabaseKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY,
    { ...options, auth }
  );
}

module.exports = {
  createBrowserClient,
  createServerComponentClient,
};
