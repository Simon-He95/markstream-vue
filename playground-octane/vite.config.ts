import path from 'node:path'
import { octane } from 'octane/compiler/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [
    octane(),
  ],
  resolve: {
    extensions: ['.tsrx', '.ts', '.mjs', '.js', '.json'],
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        'main': path.resolve(__dirname, 'index.html'),
        'editing-api': path.resolve(__dirname, 'editing-api.html'),
      },
    },
  },
  server: {
    port: 4176,
    strictPort: true,
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['stream-diffs'],
    // Loaded lazily by stream-diffs/@pierre/diffs when an edit session starts.
    // Prebundle it for CJS interop even though stream-diffs stays unbundled.
    include: ['@pierre/diffs > lru_map'],
  },
})
