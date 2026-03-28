/// <reference types="vitest" />
import { defineConfig } from 'vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const googleMapsApiKey = env.VITE_GOOGLE_MAPS_API_KEY || env.GOOGLE_API_KEY || ''
  return {
  define: {
    'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(googleMapsApiKey),
  },
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
