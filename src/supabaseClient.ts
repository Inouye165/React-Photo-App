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

export const supabase: SupabaseClient =
  !supabaseUrl || !supabaseAnonKey
    ? createThrowingProxy(missingMessage)
    : createClient(supabaseUrl, supabaseAnonKey);
