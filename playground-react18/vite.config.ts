import path from 'node:path'
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  base: './',
  server: {
    port: 4174,
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      input: {
        'main': path.resolve(__dirname, 'index.html'),
        'editing-api': path.resolve(__dirname, 'editing-api.html'),
      },
    },
  },
  optimizeDeps: {
    exclude: ['stream-diffs'],
    // Loaded lazily by stream-diffs/@pierre/diffs when an edit session starts.
    // Prebundle it for CJS interop even though stream-diffs stays unbundled.
    include: ['@pierre/diffs > lru_map'],
  },
  // Only use alias in dev mode - for production build, use the built package
  resolve: {
    // markstream-react's workspace link resolves React 19 while this playground
    // pins React 18; keep a single React runtime in both dev and build.
    dedupe: ['react', 'react-dom'],
    ...(mode === 'development'
      ? {
          alias: {
            'markstream-react': path.resolve(__dirname, '../packages/markstream-react/src'),
            'markstream-core': path.resolve(__dirname, '../packages/markstream-core/src/index.ts'),
            'markstream-core/': `${path.resolve(__dirname, '../packages/markstream-core/src')}/`,
          },
        }
      : {}),
  },
  plugins: [
    react(),
  ],
}))
