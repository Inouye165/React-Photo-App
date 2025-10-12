import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'server/**'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
  },
})