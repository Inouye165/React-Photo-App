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
    alias: {
      // "Nuclear" Fix: Point EVERYTHING to the root konva.js file.
      // This bypasses the missing 'lib' folder in CI entirely.
      
      // 1. Handle 'import ... from "konva"'
      'konva': path.resolve(__dirname, 'node_modules/konva/konva.js'),
      
      // 2. Handle 'import ... from "konva/lib/Core.js"' (used by react-konva)
      'konva/lib/Core.js': path.resolve(__dirname, 'node_modules/konva/konva.js'),
      
      // 3. Catch-all for other deep imports
      'konva/lib': path.resolve(__dirname, 'node_modules/konva/konva.js'),
    }
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