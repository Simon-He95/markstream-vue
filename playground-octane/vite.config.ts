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
  },
})
