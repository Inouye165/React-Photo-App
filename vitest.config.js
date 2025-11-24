import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'server/**', 'e2e/**'],
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.js'],
    // CRITICAL: Use forks with single fork to prevent memory accumulation
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: true,
      },
    },
    // Force sequential execution
    maxConcurrency: 1,
    fileParallelism: false,
    // Clean up between tests
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    // Isolate each test file completely
    isolate: true,
    // Disable threads entirely
    threads: false,
  },
})