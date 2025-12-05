
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
    baseURL: 'http://localhost:5173'
  },
  webServer: [
    {
      command: 'npm run dev -- --mode e2e',
      port: 5173,
      reuseExistingServer: process.env.CI ? false : true,
      timeout: 120_000,
      env: {
        VITE_E2E: 'true',
      }
    },
    {
      command: 'npm run --prefix server start',
      port: 3001,
      reuseExistingServer: process.env.CI ? false : true,
      timeout: 120_000,
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
