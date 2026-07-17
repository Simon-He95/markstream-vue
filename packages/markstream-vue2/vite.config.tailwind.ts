import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import process from 'node:process'
import vue2 from '@vitejs/plugin-vue2'
import autoprefixer from 'autoprefixer'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig } from 'vite'

const require = createRequire(import.meta.url)
let vueCompiler: any
try {
  vueCompiler = require('@vue/compiler-sfc')
}
catch {
  try {
    vueCompiler = require('vue/compiler-sfc')
  }
  catch {
    vueCompiler = require('vue-template-compiler')
  }
}

const pluginsArr: any[] = [vue2({ compiler: vueCompiler, script: { babelParserPlugins: ['typescript'] } })]

if (process.env.ANALYZE === 'true')
  pluginsArr.push(visualizer({ filename: 'bundle-visualizer-tailwind.html', gzipSize: true }) as any)

export default defineConfig({
  plugins: pluginsArr,
  resolve: {
    alias: {
      vue: 'vue-demi',
    },
  },
  build: {
    target: 'es2015',
    cssTarget: 'chrome61',
    copyPublicDir: false,
    outDir: 'dist-tw',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/tailwind-entry.ts'),
      formats: ['es'],
      name: 'MarkstreamVue2',
      fileName: 'index',
    },
    rollupOptions: {
      external: (id: string) => {
        if (id === 'stream-diffs' || id.startsWith('stream-diffs/'))
          return true
        if (/node_modules\/stream-diffs(?:\/|$)/.test(id))
          return true
        if (id === 'stream-monaco' || id.startsWith('stream-monaco/'))
          return true
        if (/node_modules\/stream-monaco(?:\/|$)/.test(id))
          return true
        if (id === 'mermaid' || id.startsWith('mermaid/'))
          return true
        if (/node_modules\/mermaid(?:\/|$)/.test(id))
          return true
        return [
          'vue-demi',
          '@vue/composition-api',
          'vue-i18n',
          'katex',
          'mermaid',
          'katex/contrib/mhchem',
          'stream-diffs',
          'stream-monaco',
          'stream-markdown',
          'stream-markdown-parser',
          'monaco-editor',
          'shiki',
          '@floating-ui/dom',
          '@terrastruct/d2',
        ].includes(id)
      },
      output: {
        exports: 'named',
        entryFileNames: 'index.js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: (assetInfo: any) => {
          try {
            const fname = (assetInfo && ((assetInfo as any).name || (assetInfo as any).fileName || '')) as string
            if (fname && fname.endsWith('.css'))
              return 'index.tailwind.css'
          }
          catch {}
          return '[name][extname]'
        },
      },
    },
  },
  css: {
    postcss: {
      plugins: [
        // Do not run Tailwind here; keep @apply for consumer Tailwind pipelines.
        autoprefixer,
      ],
    },
  },
})
