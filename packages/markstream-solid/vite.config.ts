import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import solid from 'vite-plugin-solid'

export default defineConfig(({ mode }) => ({
  plugins: [
    solid({
      ssr: mode === 'ssr',
      solid: { hydratable: true },
    }),
    ...(mode === 'npm' ? [dts({ tsconfigPath: './tsconfig.build.json' })] : []),
  ],
  build: {
    ...(mode === 'ssr'
      ? {
          outDir: 'dist/server',
          emptyOutDir: false,
          ssr: resolve(__dirname, 'src/index.ts'),
        }
      : {}),
    target: 'es2019',
    cssTarget: 'chrome80',
    copyPublicDir: false,
    ...(mode === 'ssr'
      ? {}
      : { lib: {
          entry: {
            'index': resolve(__dirname, 'src/index.ts'),
            'tailwind': resolve(__dirname, 'src/tailwind-entry.ts'),
            'workers/katexWorkerClient': resolve(__dirname, 'src/workers/katexWorkerClient.ts'),
            'workers/mermaidWorkerClient': resolve(__dirname, 'src/workers/mermaidWorkerClient.ts'),
            'workers/katexCdnWorker': resolve(__dirname, 'src/workers/katexCdnWorker.ts'),
            'workers/mermaidCdnWorker': resolve(__dirname, 'src/workers/mermaidCdnWorker.ts'),
            'workers/katexRenderer.worker': resolve(__dirname, 'src/workers/katexRenderer.worker.ts'),
            'workers/mermaidParser.worker': resolve(__dirname, 'src/workers/mermaidParser.worker.ts'),
          },
          formats: ['es'],
          fileName: (_, name) => `${name}.js`,
        } }),
    rollupOptions: {
      external: ['solid-js', 'solid-js/web', 'stream-markdown-parser', 'markstream-core', 'stream-diffs', 'stream-diffs/markstream', 'katex', 'katex/contrib/mhchem', 'mermaid', '@terrastruct/d2', '@antv/infographic'],
      output: { assetFileNames: asset => asset.name?.endsWith('.css') ? 'index.css' : '[name][extname]' },
    },
  },
  test: {
    environment: 'jsdom',
  },
}))
