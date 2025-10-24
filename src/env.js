// Frontend environment variable fail-fast checks
// This module is imported at app startup to ensure required Vite env vars are present.
const required = [
  'VITE_API_URL'
];

for (const key of required) {
  // import.meta.env is populated by Vite / Vitest. Use it directly so checks run at module evaluation time.
  if (!import.meta.env[key] || String(import.meta.env[key]).trim() === '') {
    throw new Error(`Missing required environment variable: ${key}. Add it to your .env (root) or Vite env file.`);
  }
}

// Optionally export a normalized env object for other modules to import
export const env = Object.fromEntries(required.map(k => [k, import.meta.env[k]]));
