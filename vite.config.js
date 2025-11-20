/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // Map 'konva/lib/*' imports directly to the package lib directory so react-konva's internal imports don't create 'lib/lib' paths
      { find: /^konva\/lib(.*)/, replacement: path.resolve(__dirname, 'node_modules/konva/lib') + '$1' },
      // Map the bare 'konva' specifier to the package's main ESM entry so imports using 'konva' resolve correctly
      { find: /^konva$/, replacement: path.resolve(__dirname, 'node_modules/konva/lib/index.js') },
    ],
  },
  server: {
    host: '0.0.0.0',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
})
