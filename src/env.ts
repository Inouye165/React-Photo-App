// Frontend environment variable checks
// Both dev and production allow an empty `VITE_API_URL` so the app can use
// same-origin relative URLs. In dev this relies on the Vite dev-server proxy;
// in production it relies on Vercel rewrite rules that forward /api/* and
// /csrf to the Railway backend.

type RequiredEnvKey = 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY';

const viteEnv: Record<string, unknown> = import.meta.env as unknown as Record<string, unknown>;

const readOptionalString = (key: string): string | undefined => {
  const raw = viteEnv[key];
  if (raw === undefined || raw === null) return undefined;
  return String(raw);
};

// Support both VITE_API_URL (canonical) and VITE_API_BASE_URL (legacy)
const apiUrl = readOptionalString('VITE_API_URL') || readOptionalString('VITE_API_BASE_URL') || '';
const required: ReadonlyArray<RequiredEnvKey> = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const isProduction = readOptionalString('MODE') === 'production';

// ---------------------------------------------------------------------------
// Production guardrail – fail fast if VITE_SUPABASE_URL is localhost/127.0.0.1
// ---------------------------------------------------------------------------

/**
 * Validate that a Supabase URL is not pointing at a local dev instance.
 * Exported so unit tests can exercise the check without touching import.meta.env.
 */
export function validateSupabaseUrl(url: string, mode: string): void {
  if (mode !== 'production') return;
  const lower = url.toLowerCase();
  if (lower.includes('localhost') || lower.includes('127.0.0.1')) {
    throw new Error(
      `Production build misconfigured: VITE_SUPABASE_URL points to a local address (${url}). ` +
      'Set it to your hosted Supabase project URL.'
    );
  }
}

// In production, an empty VITE_API_URL is valid — it means "use same-origin"
// (works with Vercel proxy rewrites that forward /api/* and /csrf to Railway).

for (const key of required) {
  if (isProduction) {
    // import.meta.env is populated by Vite / Vitest. Use it directly so checks run at module evaluation time.
    const value = readOptionalString(key);
    if (!value || value.trim() === '') {
      throw new Error(`Missing required environment variable: ${key}. Add it to your .env (root) or Vite env file.`);
    }
  }
}

// Run the localhost guardrail at module evaluation time
const supabaseUrlRaw = readOptionalString('VITE_SUPABASE_URL') || '';
validateSupabaseUrl(supabaseUrlRaw, readOptionalString('MODE') || '');

// Export a normalized env object. In development an empty string means "use
// relative URLs" (so code that constructs API requests can do
// `${env.VITE_API_URL || ''}/auth/verify`).
export const env = {
  VITE_API_URL: apiUrl,
  VITE_SUPABASE_URL: supabaseUrlRaw,
  VITE_SUPABASE_ANON_KEY: readOptionalString('VITE_SUPABASE_ANON_KEY') || '',
};
