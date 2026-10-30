import { resolve } from 'node:path'
import solid from 'vite-plugin-solid'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  plugins: [solid({ ssr: mode !== 'test', hot: false })],
  resolve: {
    conditions: mode === 'test' ? ['browser'] : [],
  },
  build: {
    outDir: `dist/${mode === 'server' ? 'server' : 'client'}`,
    ssr: mode === 'server',
    lib: {
      entry: Object.fromEntries([
        'index',
        'utils/index',
        'utils/katex-threshold',
        'utils/performance-monitor',
        'utils/safeRaf',
        'workers/katexWorkerClient',
        'workers/mermaidWorkerClient',
        'workers/katexCdnWorker',
        'workers/mermaidCdnWorker',
        ...(mode === 'server' ? [] : ['workers/katexRenderer.worker', 'workers/mermaidParser.worker']),
      ].map(name => [name === 'utils/index' ? 'utils/index' : name, resolve(import.meta.dirname, `src/${name}.ts`)])),
      formats: ['es'],
      fileName: (_, name) => `${name}.js`,
    },
    rollupOptions: {
      external: id => !id.startsWith('.') && !id.startsWith('/') && !id.startsWith('\0'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.tsx'],
    restoreMocks: true,
  },
}))
