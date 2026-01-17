// Frontend environment variable checks
// In development we allow an empty `VITE_API_URL` so the app can use relative
// URLs and rely on the Vite dev-server proxy (this enables httpOnly cookies
// to work during local development). In production we still fail-fast when
// required variables are missing.

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

// In production, require an API URL to be set
if (isProduction && !apiUrl) {
  throw new Error('Missing required environment variable: VITE_API_URL. Add it to your .env (root) or Vite env file.');
}

for (const key of required) {
  if (isProduction) {
    // import.meta.env is populated by Vite / Vitest. Use it directly so checks run at module evaluation time.
    const value = readOptionalString(key);
    if (!value || value.trim() === '') {
      throw new Error(`Missing required environment variable: ${key}. Add it to your .env (root) or Vite env file.`);
    }
  }
}

// Export a normalized env object. In development an empty string means "use
// relative URLs" (so code that constructs API requests can do
// `${env.VITE_API_URL || ''}/auth/verify`).
export const env = {
  VITE_API_URL: apiUrl,
  VITE_SUPABASE_URL: readOptionalString('VITE_SUPABASE_URL') || '',
  VITE_SUPABASE_ANON_KEY: readOptionalString('VITE_SUPABASE_ANON_KEY') || '',
};
