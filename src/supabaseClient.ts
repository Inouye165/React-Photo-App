import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

// Prefer explicit Vite env, fallback to loaded env shim
const supabaseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || env.VITE_SUPABASE_ANON_KEY;

const missingMessage =
  '[supabaseClient] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Auth features disabled.';

function createThrowingProxy(message: string): SupabaseClient {
  // Warn once in console (avoid noisy stack traces from createClient)
  console.warn(message);

  // Provide a proxy that throws a clear error when used, so calling code gets actionable feedback.
  const handler: ProxyHandler<object> = {
    get() {
      throw new Error(
        message +
          ' Set these in a .env.local or .env file: VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=...'
      );
    }
  };

  return new Proxy({}, handler) as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Sanitized diagnostics — safe for production (no secrets/PII).
// Logs the Supabase URL and a key fingerprint so we can quickly confirm which
// project the build is pointing at without leaking the full anon key.
// ---------------------------------------------------------------------------
function keyFingerprint(key: string | undefined): string {
  if (!key) return '(empty)';
  if (key.length < 20) return `len=${key.length}`;
  return `${key.slice(0, 8)}…${key.slice(-4)} (len=${key.length})`;
}

try {
  const host = supabaseUrl ? new URL(supabaseUrl).hostname : '(empty)';
  const apiBase = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL)
    ? String(import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL)
    : '(same-origin)';
  console.info(
    `[env] supabase url=${supabaseUrl} host=${host} anonKey=${keyFingerprint(supabaseAnonKey)} apiBase=${apiBase} mode=${import.meta.env.MODE}`,
  );
} catch {
  console.info('[env] supabase url=(invalid) anonKey=(unknown)');
}

// One-time Supabase reachability probe (runs in browser only)
if (typeof window !== 'undefined' && supabaseUrl) {
  fetch(`${supabaseUrl}/auth/v1/`, { method: 'GET' })
    .then((res) => {
      console.info(`[env] supabase reachability probe: status=${res.status} ok=${res.ok}`);
      if (!res.ok) {
        console.warn(
          `[env] Supabase project may be paused or URL is wrong (status ${res.status}).`,
        );
      }
    })
    .catch((err) => {
      console.error('[env] supabase reachability probe FAILED (network error):', err?.message ?? err);
    });
}

export const supabase: SupabaseClient =
  !supabaseUrl || !supabaseAnonKey
    ? createThrowingProxy(missingMessage)
    : createClient(supabaseUrl, supabaseAnonKey);
