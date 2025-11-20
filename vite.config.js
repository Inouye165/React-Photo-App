/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

// Define __dirname for ESM environment
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Force 'konva' import to point directly to the library index
      'konva': path.resolve(__dirname, 'node_modules/konva/lib/index.js'),
      // Force deep imports like 'konva/lib/Core.js' to look in the lib directory
      'konva/lib': path.resolve(__dirname, 'node_modules/konva/lib'),
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