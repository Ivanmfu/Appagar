"use client";
import { useEffect, useState } from 'react';
import { Logger } from '@/lib/logger';

export default function DebugOverlay() {
  const [events, setEvents] = useState<string[]>([]);

  useEffect(() => {
    if (!Logger.enabled()) return;
    function push(line: string) {
      setEvents((prev) => {
        const next = [line, ...prev];
        return next.slice(0, 40);
      });
    }
    const originalDebug = console.debug;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;
    // eslint-disable-next-line no-console
    console.debug = (...args) => { push(args.join(' ')); originalDebug.apply(console, args); };
    // eslint-disable-next-line no-console
    console.info = (...args) => { push(args.join(' ')); originalInfo.apply(console, args); };
    // eslint-disable-next-line no-console
    console.warn = (...args) => { push(args.join(' ')); originalWarn.apply(console, args); };
    // eslint-disable-next-line no-console
    console.error = (...args) => { push(args.join(' ')); originalError.apply(console, args); };

    function onError(e: ErrorEvent) { push(`[GlobalError] ${e.message}`); }
    function onRejection(e: PromiseRejectionEvent) { push(`[UnhandledRejection] ${e.reason}`); }
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    push('[DebugOverlay] Active');
    return () => {
      console.debug = originalDebug;
      console.info = originalInfo;
      console.warn = originalWarn;
      console.error = originalError;
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  if (!Logger.enabled()) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 8, right: 8, zIndex: 10000, width: '380px', maxHeight: '50vh',
      overflow: 'auto', fontSize: '11px', lineHeight: 1.25, background: 'rgba(0,0,0,0.75)',
      color: '#d8d8d8', padding: '8px 10px', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      fontFamily: 'ui-monospace, monospace'
    }}>
      <div style={{ marginBottom: 6, fontWeight: 600 }}>Appagar Debug (latest {events.length})</div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {events.map((e, i) => <li key={i}>{e}</li>)}
      </ul>
      <div style={{ marginTop: 6, opacity: 0.6 }}>Toggle: localStorage.setItem(&apos;appagar-debug&apos;,&apos;1&apos;)</div>
    </div>
  );
}
