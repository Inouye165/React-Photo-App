// Frontend environment variable checks
// In development we allow an empty `VITE_API_URL` so the app can use relative
// URLs and rely on the Vite dev-server proxy (this enables httpOnly cookies
// to work during local development). In production we still fail-fast when
// required variables are missing.

// Support both VITE_API_URL (canonical) and VITE_API_BASE_URL (legacy)
const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '';
const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const isProduction = import.meta.env.MODE === 'production';

// In production, require an API URL to be set
if (isProduction && !apiUrl) {
  throw new Error('Missing required environment variable: VITE_API_URL. Add it to your .env (root) or Vite env file.');
}

for (const key of required) {
  if (isProduction) {
    // import.meta.env is populated by Vite / Vitest. Use it directly so checks run at module evaluation time.
    if (!import.meta.env[key] || String(import.meta.env[key]).trim() === '') {
      throw new Error(`Missing required environment variable: ${key}. Add it to your .env (root) or Vite env file.`);
    }
  }
}

// Export a normalized env object. In development an empty string means "use
// relative URLs" (so code that constructs API requests can do
// `${env.VITE_API_URL || ''}/auth/verify`).
export const env = {
  VITE_API_URL: apiUrl,
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL ? String(import.meta.env.VITE_SUPABASE_URL) : '',
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY ? String(import.meta.env.VITE_SUPABASE_ANON_KEY) : ''
};
