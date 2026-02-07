import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/server/**',
      'e2e/**',
      'React-Photo-App/**',
      '**/App.test.jsx', // Exclude memory-heavy App.test.jsx (covered by App.auth.test.jsx)
    ],
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
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
    deps: {
      inline: ['@excalidraw/excalidraw', 'roughjs'],
    },
  },
  server: {
    deps: {
      inline: ['@excalidraw/excalidraw', 'roughjs'],
    },
  },
  resolve: {
    alias: {
      heic2any: path.resolve(__dirname, '__mocks__/heic2any.ts'),
      'heic-to': path.resolve(__dirname, '__mocks__/heic-to.ts'),
      'roughjs/bin/rough': path.resolve(__dirname, 'node_modules/roughjs/bin/rough.js'),
    },
  },
});
