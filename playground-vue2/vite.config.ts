import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vue2 from '@vitejs/plugin-vue2'
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
const vueRuntime = require.resolve('vue/dist/vue.runtime.esm.js')

export default defineConfig({
  plugins: [
    vue2({ compiler: vueCompiler, script: { babelParserPlugins: ['typescript'] } }),
  ],
  build: {
    modulePreload: false,
  },
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        entryFileNames: 'workers/[name].js',
        chunkFileNames: 'workers/[name].js',
        assetFileNames: 'workers/[name][extname]',
      },
    },
  },
  optimizeDeps: {
    exclude: ['stream-diffs'],
    // stream-diffs/edit reaches this CommonJS default export through
    // @pierre/diffs. Prebundle it so Vite dev can interop with the raw ESM
    // module graph used by the CodeBlock editing API.
    include: ['@pierre/diffs > lru_map'],
  },
  resolve: {
    dedupe: ['vue'],
    alias: [
      {
        find: /^vue$/,
        replacement: vueRuntime,
      },
      {
        find: /^markstream-vue2\/index\.css$/,
        replacement: resolve(__dirname, '../packages/markstream-vue2/dist/index.css'),
      },
      {
        find: /^markstream-vue2\/index\.tailwind\.css$/,
        replacement: resolve(__dirname, '../packages/markstream-vue2/dist/index.tailwind.css'),
      },
      {
        find: /^markstream-vue2\/tailwind$/,
        replacement: resolve(__dirname, '../packages/markstream-vue2/dist/tailwind.ts'),
      },
      {
        find: /^markstream-vue2$/,
        replacement: resolve(__dirname, '../packages/markstream-vue2/src'),
      },
      {
        find: /^markstream-vue2\//,
        replacement: `${resolve(__dirname, '../packages/markstream-vue2/src')}/`,
      },
      {
        find: 'stream-markdown-parser',
        replacement: resolve(__dirname, '../packages/markdown-parser/src/index.ts'),
      },
      {
        find: 'stream-markdown-parser/',
        replacement: resolve(__dirname, '../packages/markdown-parser/src/'),
      },
      {
        find: /^markstream-core$/,
        replacement: resolve(__dirname, '../packages/markstream-core/src/index.ts'),
      },
      {
        find: /^markstream-core\//,
        replacement: `${resolve(__dirname, '../packages/markstream-core/src')}/`,
      },
    ],
  },
  server: {
    fs: {
      allow: [resolve(__dirname, '..')],
    },
  },
})
