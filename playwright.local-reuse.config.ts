import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  testMatch: ['**/*.spec.ts'],
  reporter: 'list',
  timeout: 60_000,
  workers: 1,
  retries: 0,
  use: {
    headless: true,
    baseURL: 'http://127.0.0.1:5173',
  },
  projects: [
    {
      name: 'e2e',
      testDir: 'e2e',
      testMatch: ['**/*.spec.ts'],
    },
  ],
})
