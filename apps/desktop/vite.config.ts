import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main process
        entry: 'electron/main/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              // WASM module with a locateFile hook: keep it external so it
              // resolves sql-wasm.wasm from node_modules at runtime.
              external: ['sql.js'],
            },
          },
        },
      },
      {
        // Preload script. Electron >=28 supports ESM preloads, but only
        // when the file extension is .mjs (the package is type:module and
        // vite-plugin-electron keeps import statements as-is), so we emit
        // index.mjs and point the main process at it.
        entry: 'electron/preload/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            rollupOptions: {
              output: {
                format: 'es',
                entryFileNames: '[name].mjs',
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  optimizeDeps: {
    // Never pre-bundle workspace packages: @vibe/core contains
    // main-process-only node:fs code that must not enter the renderer
    // bundle, and @vibe/shared is plain TS that Vite can transform
    // directly. Pre-bundling them is what caused the
    // "Dynamic require of fs is not supported" white screen.
    exclude: ['@vibe/core', '@vibe/shared'],
  },
  server: {
    port: 5173,
  },
})
