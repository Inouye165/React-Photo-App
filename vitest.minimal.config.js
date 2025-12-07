import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/hooks/useThumbnailQueue.test.js'],
    environment: 'happy-dom',
    setupFiles: [],
    // Use forks pool for better memory isolation
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: true,
      },
    },
    maxConcurrency: 1,
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    // Use server deps to inline mock modules
    server: {
      deps: {
        inline: [/heic2any/, /heic-to/],
      },
    },
  },
  // Prevent vite from pre-bundling these heavy deps
  optimizeDeps: {
    exclude: ['heic2any', 'heic-to'],
  },
})
