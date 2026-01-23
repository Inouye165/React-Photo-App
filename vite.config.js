/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  console.log(`[vite] Running in mode: ${mode}`);
  console.log(`[vite] VITE_E2E: ${process.env.VITE_E2E}`);
  return {
  plugins: [react()],
  resolve: {
    alias: {
      // Provide a test/runtime shim for react-easy-crop to avoid
      // import-resolution errors in Vitest/Vite when the package
      // is missing ESM entrypoints in the test environment.
      'react-easy-crop': path.resolve(__dirname, 'src/components/CropperShim.tsx'),
    },
  },
  // WARNING: Do not add aliases for konva packages here.
  // It breaks react-konva which relies on internal structure.
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
}
})