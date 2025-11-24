import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'server/**', 'e2e/**'],
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.js'],
    // Force test isolation to prevent memory leaks
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Clean up between tests
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    // Isolate each test file
    isolate: true,
  },
})