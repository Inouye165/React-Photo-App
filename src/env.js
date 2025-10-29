// Frontend environment variable checks
// In development we allow an empty `VITE_API_URL` so the app can use relative
// URLs and rely on the Vite dev-server proxy (this enables httpOnly cookies
// to work during local development). In production we still fail-fast when
// required variables are missing.

const required = ['VITE_API_URL'];
const isProduction = import.meta.env.MODE === 'production';

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
export const env = Object.fromEntries(required.map(k => [k, import.meta.env[k] ? String(import.meta.env[k]) : '']));
