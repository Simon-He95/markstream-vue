import { copyFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import autoprefixer from 'autoprefixer'
import tailwindcss from 'tailwindcss'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindConfig from '../tailwind.config'

const sharedAssets: Record<string, string> = {
  '/favicon.svg': resolve(import.meta.dirname, '../playground/public/favicon.svg'),
  '/vue-markdown-icon.svg': resolve(import.meta.dirname, '../playground/public/vue-markdown-icon.svg'),
  '/og-image.png': resolve(import.meta.dirname, '../docs/public/og-image.png'),
}

export default defineConfig({
  base: './',
  publicDir: resolve(import.meta.dirname, 'public'),
  css: {
    postcss: {
      plugins: [tailwindcss({ ...tailwindConfig, content: tailwindConfig.content.map(pattern => resolve(import.meta.dirname, '..', pattern)) }), autoprefixer(), {
        postcssPlugin: 'markstream-solid-playground-themes',
        Rule(rule) {
          if (rule.source?.input.file?.includes('/themes/'))
            rule.selector = rule.selector.replaceAll('.markstream-vue', ':is(.markstream-vue, .markstream-solid)')
        },
      }],
    },
  },
  plugins: [solid({ ssr: true, hot: false }), vue(), {
    name: 'markstream-solid-shared-assets',
    resolveId(id) {
      return sharedAssets[id]
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const file = sharedAssets[(request.url ?? '').split('?')[0]]
        if (!file)
          return next()
        response.setHeader('Content-Type', file.endsWith('.svg') ? 'image/svg+xml' : 'image/png')
        response.end(readFileSync(file))
      })
    },
    generateBundle() {
      for (const [url, file] of Object.entries(sharedAssets))
        this.emitFile({ type: 'asset', fileName: url.slice(1), source: readFileSync(file) })
    },
    writeBundle(options) {
      for (const route of ['component-parity', 'line-number-handoff-check'])
        copyFileSync(resolve(options.dir!, 'index.html'), resolve(options.dir!, `${route}.html`))
    },
  }],
  server: { fs: { allow: [resolve(import.meta.dirname, '..')] } },
  worker: { format: 'es' },
  resolve: {
    alias: [
      { find: /^markstream-solid\/index.css$/, replacement: resolve(import.meta.dirname, '../packages/markstream-solid/src/index.css') },
      { find: /^markstream-solid$/, replacement: resolve(import.meta.dirname, '../packages/markstream-solid/src/index.ts') },
      { find: /^stream-markdown-parser$/, replacement: resolve(import.meta.dirname, '../packages/markdown-parser/src/index.ts') },
      { find: /^markstream-core$/, replacement: resolve(import.meta.dirname, '../packages/markstream-core/src/index.ts') },
      { find: /^@antv\/infographic$/, replacement: resolve(import.meta.dirname, '../node_modules/@antv/infographic/dist/infographic.min.js') },
    ],
    dedupe: ['solid-js', 'vue', 'katex', 'mermaid', 'stream-diffs', '@antv/infographic', '@terrastruct/d2'],
  },
  optimizeDeps: { exclude: ['stream-diffs', 'stream-markdown-parser'] },
})
