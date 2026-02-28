
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: ['**/*.spec.ts'],
  reporter: 'list',
  timeout: 60_000,
  workers: 2,
  retries: 1,
  use: {
    headless: true,
    baseURL: 'http://127.0.0.1:4173'
  },
  webServer: [
    {
      // Backend API (used by E2E login helpers and UI fetches)
      command: 'npm --prefix server run start:e2e',
      url: 'http://127.0.0.1:3001/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        // Required to enable /api/test/* routes used by Playwright login helpers.
        // The server-side gate also forces these routes off in production.
        E2E_ROUTES_ENABLED: 'true',
        // Use local Docker Postgres for E2E runs (see docker-compose.yml).
        SUPABASE_DB_URL: 'postgresql://photoapp:photoapp_dev@127.0.0.1:5432/photoapp',
        SUPABASE_DB_URL_MIGRATIONS: 'postgresql://photoapp:photoapp_dev@127.0.0.1:5432/photoapp',
        DATABASE_URL: 'postgresql://photoapp:photoapp_dev@127.0.0.1:5432/photoapp',
      },
    },
    {
      // Frontend
      command: 'npm run dev -- --mode e2e --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI, // Reuse locally, fresh in CI
      timeout: 120_000,
      env: {
        VITE_E2E: 'true',
        // Use same-origin API calls via Vite proxy to avoid CORS mismatches when
        // Playwright runs frontend on a non-default port.
        VITE_API_URL: '',
        // Provide a deterministic Supabase base URL so Playwright can mock chat traffic.
        // This avoids requiring real Supabase credentials for E2E tests.
        VITE_SUPABASE_URL: 'http://127.0.0.1:4173/__supabase',
        VITE_SUPABASE_ANON_KEY: 'e2e-anon-key',
      }
    }
  ],
  // Only run tests in the e2e directory
  projects: [
    {
      name: 'e2e',
      testDir: 'e2e',
      testMatch: ['**/*.spec.ts'],
    }
  ]
});
