/* Centralized logging & debug mode detection */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const search = new URLSearchParams(window.location.search);
  if (search.get('debug') === '1') return true;
  try {
    if (window.localStorage.getItem('appagar-debug') === '1') return true;
  } catch {}
  // @ts-expect-error allow diagnostic global
  if (window.__APPAGAR_DEBUG === true) return true;
  return false;
}

function fmt(level: LogLevel, scope: string, message: string, meta?: unknown) {
  const ts = new Date().toISOString();
  return `[${ts}][${scope}][${level}] ${message}` + (meta ? ` :: ${safeSerialize(meta)}` : '');
}

function safeSerialize(obj: unknown): string {
  try {
    return JSON.stringify(obj, (_k, v) => {
      if (typeof v === 'string' && v.length > 400) return v.slice(0, 397) + '…';
      return v;
    });
  } catch (e) {
    return `"<unserializable:${(e as Error).message}>"`;
  }
}

export const Logger = {
  enabled(): boolean {
    return isDebugEnabled();
  },
  debug(scope: string, message: string, meta?: unknown) {
    if (!isDebugEnabled()) return;
    // eslint-disable-next-line no-console
    console.debug(fmt('debug', scope, message, meta));
  },
  info(scope: string, message: string, meta?: unknown) {
    if (!isDebugEnabled()) return;
    // eslint-disable-next-line no-console
    console.info(fmt('info', scope, message, meta));
  },
  warn(scope: string, message: string, meta?: unknown) {
    if (!isDebugEnabled()) return;
    // eslint-disable-next-line no-console
    console.warn(fmt('warn', scope, message, meta));
  },
  error(scope: string, message: string, meta?: unknown) {
    if (!isDebugEnabled()) return;
    // eslint-disable-next-line no-console
    console.error(fmt('error', scope, message, meta));
  },
};

export async function withTiming<T>(scope: string, label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    Logger.debug(scope, `Completed ${label}`, { ms: Math.round(performance.now() - start) });
    return result;
  } catch (err) {
    Logger.error(scope, `Failed ${label}`, { ms: Math.round(performance.now() - start), err });
    throw err;
  }
}

export function maskKey(key?: string | null): string | null {
  if (!key) return null;
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '…' + key.slice(-4);
}
