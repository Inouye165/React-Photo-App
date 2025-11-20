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
    // WE MUST USE ARRAY SYNTAX HERE
    // This allows us to use Regex to strip the '/Core.js' suffix
    alias: [
      {
        // Match "konva/lib/ANYTHING"
        find: /konva\/lib\/.*/,
        // Replace it with just "konva.js" (dropping the suffix)
        replacement: path.resolve(__dirname, 'node_modules/konva/konva.js')
      },
      {
        // Match exact "konva" import
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