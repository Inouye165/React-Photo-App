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
  // WARNING: Do not add aliases for 'konva' or 'konva/lib/...' here.
  // It breaks react-konva which relies on internal structure.
  optimizeDeps: {
    include: ['konva', 'react-konva']
  },
  server: {
    host: '0.0.0.0',
    // Proxy API requests to the local backend so the browser can use httpOnly
    // cookies without cross-origin issues during development.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path,
      },
      '/csrf': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/photos': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/upload': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/privilege': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/events': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        // SSE/WebSocket support
        ws: true,
      },
      '/display': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/capture-intents': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/collectibles': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/save-captioned-image': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
}
})
