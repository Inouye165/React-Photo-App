import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';
import { isDiagEnabled, diagLog } from './utils/diag';

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

// --- DEV-only: sanitized environment diagnostics ---
if (import.meta.env.DEV) {
  try {
    const hostname = supabaseUrl ? new URL(supabaseUrl).hostname : '(empty)';
    const apiBase = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL)
      ? String(import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL)
      : '(same-origin)';
    console.info(`[env] supabase host=${hostname} apiBase=${apiBase}`);
  } catch {
    console.info('[env] supabase host=(invalid URL) apiBase=(unknown)');
  }
}

// --- Diagnostic mode: app startup log (works in all modes when ?diag=1) ---
try {
  const _sbHost = supabaseUrl ? new URL(supabaseUrl).hostname : '(empty)';
  const _apiRaw = (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL)) || '';
  const _apiMode = _apiRaw ? new URL(_apiRaw).hostname : 'same-origin';
  diagLog('startup', {
    mode: import.meta.env.MODE,
    origin: typeof window !== 'undefined' ? window.location.origin : '(ssr)',
    supabaseHost: _sbHost,
    apiMode: _apiMode,
  });
} catch {
  diagLog('startup', { error: 'failed to resolve env URLs' });
}

export const supabase: SupabaseClient =
  !supabaseUrl || !supabaseAnonKey
    ? createThrowingProxy(missingMessage)
    : createClient(supabaseUrl, supabaseAnonKey);

// --- Diagnostic: GoTrue settings probe (only when ?diag=1) ---
// Supabase GoTrue exposes /auth/v1/settings publicly.
// This tells us the auth provider config, password requirements, etc.
// Useful for detecting if the project is paused or the URL is wrong.
if (isDiagEnabled() && supabaseUrl) {
  void (async () => {
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/settings`);
      if (res.ok) {
        const settings = await res.json() as Record<string, unknown>;
        // Log only safe, non-secret fields
        diagLog('gotrue:settings', {
          external: settings.external,
          disable_signup: settings.disable_signup,
          mailer_autoconfirm: settings.mailer_autoconfirm,
          password_min_length: (settings as Record<string, unknown>).password_min_length,
        });
      } else {
        diagLog('gotrue:settings', { status: res.status, hint: res.status === 0 ? 'project may be paused' : 'unexpected' });
      }
    } catch (err) {
      diagLog('gotrue:settings:error', { message: (err as Error).message });
    }
  })();
}
