import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: ['**/*.spec.ts'],
  reporter: 'list',
  timeout: 60_000,
  use: {
    headless: true,
    baseURL: 'http://localhost:5173'
  },
  webServer: [
    {
      command: 'npm run dev',
      port: 5173,
      reuseExistingServer: process.env.CI ? false : true,
      timeout: 120_000,
    },
    {
      command: 'npm run --prefix server start',
      port: 3001,
      reuseExistingServer: process.env.CI ? false : true,
      timeout: 120_000,
    }
  ]
});
