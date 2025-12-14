
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
  webServer: {
    command: 'npm run dev -- --mode e2e',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI, // Reuse locally, fresh in CI
    timeout: 120_000,
    env: {
      VITE_E2E: 'true',
      VITE_API_URL: 'http://127.0.0.1:5173', // Same origin as Vite - prevents fallback to localhost:3001
    }
  },
  // Only run tests in the e2e directory
  projects: [
    {
      name: 'e2e',
      testDir: 'e2e',
      testMatch: ['**/*.spec.ts'],
    }
  ]
});
