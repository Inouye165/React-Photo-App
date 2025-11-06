import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'server/**', 'e2e/**'],
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.js'],
  },
})