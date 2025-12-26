export { getSupabaseClient } from './client';

// Server-only helpers should be imported directly from './server' to avoid
// bundling server component APIs (like `next/headers`) into client modules.
