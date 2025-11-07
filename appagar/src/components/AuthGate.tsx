'use client';
// Simplified AuthGate for debugging the runtime error.
// Original logic (Supabase session check + redirect) temporarily removed.
// We'll reintroduce once we confirm this wrapper no longer triggers the React invalid type error.
export function AuthGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
export default AuthGate;
