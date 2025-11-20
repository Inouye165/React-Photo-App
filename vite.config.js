/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path";
import fs from "fs";
import { createRequire } from 'module';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: [
      'konva',
      'konva/lib/Core.js',
    ],
  },
  resolve: {
    alias: (() => {
      const requireFromModule = createRequire(import.meta.url);
      // Candidate paths to check in order
      const konvaLibDir = path.resolve(__dirname, 'node_modules/konva/lib');
      const konvaLibIndex = path.join(konvaLibDir, 'index.js');
      const konvaUMD = path.resolve(__dirname, 'node_modules/konva/konva.js');

      // fallback to require.resolve if necessary
      let konvaReplacement = null;
      if (fs.existsSync(konvaLibIndex)) {
        konvaReplacement = konvaLibIndex;
      } else if (fs.existsSync(konvaUMD)) {
        konvaReplacement = konvaUMD;
      } else {
        // try resolving with Node require
        try {
          konvaReplacement = requireFromModule.resolve('konva');
        } catch (err) {
          konvaReplacement = path.resolve(__dirname, 'node_modules/konva');
        }
      }

      // Always map 'konva/lib/*' imports to the package lib folder if it exists
      const aliases = [];
      if (fs.existsSync(konvaLibDir)) {
        aliases.push({ find: /^konva\/lib(.*)/, replacement: konvaLibDir + '$1' });
      }
      aliases.push({ find: /^konva$/, replacement: konvaReplacement });
      return aliases;
    })(),
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
