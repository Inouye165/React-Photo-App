/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Use Array syntax to support Regex replacements
    alias: [
      // 1. Regex: Catch ANY import starting with "konva/lib/" (like Core.js or Global.js)
      //    and redirect it strictly to the main konva.js bundle.
      //    This regex ensures we drop the suffix (e.g., /Core.js) so we don't get ENOTDIR errors.
      {
        find: /konva\/lib\/.*/,
        replacement: path.resolve(__dirname, 'node_modules/konva/konva.js')
      },
      // 2. Exact match for main "konva" import
      {
        find: /^konva$/,
        replacement: path.resolve(__dirname, 'node_modules/konva/konva.js')
      }
    ]
  },
  optimizeDeps: {
    include: ['konva', 'react-konva']
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