
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
    baseURL: 'http://127.0.0.1:5173'
  },
  webServer: [
    {
      // Backend API (used by E2E login helpers and UI fetches)
      command: 'npm --prefix server start',
      url: 'http://127.0.0.1:3001/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        // Required to enable /api/test/* routes used by Playwright login helpers.
        // The server-side gate also forces these routes off in production.
        E2E_ROUTES_ENABLED: 'true',
      },
    },
    {
      // Frontend
      command: 'npm run dev -- --mode e2e',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI, // Reuse locally, fresh in CI
      timeout: 120_000,
      env: {
        VITE_E2E: 'true',
        VITE_API_URL: 'http://127.0.0.1:3001',
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
