import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import autoprefixer from 'autoprefixer'
import tailwindcss from 'tailwindcss'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindConfig from '../tailwind.config'

export default defineConfig({
  base: './',
  publicDir: resolve(import.meta.dirname, '../public'),
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
  plugins: [solid({ ssr: true, hot: false }), vue()],
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
