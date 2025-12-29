import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vue2 from '@vitejs/plugin-vue2'
import { defineConfig } from 'vite'
import monacoEditorPlugin from 'vite-plugin-monaco-editor-esm'

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
    monacoEditorPlugin({
      languageWorkers: [
        'editorWorkerService',
        'typescript',
        'css',
        'html',
        'json',
      ],
      customDistPath(root, buildOutDir) {
        return resolve(buildOutDir, 'monacoeditorwork')
      },
    }),
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
    exclude: ['stream-monaco'],
  },
  resolve: {
    dedupe: ['vue'],
    alias: [
      {
        find: /^vue$/,
        replacement: vueRuntime,
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
    ],
  },
  server: {
    fs: {
      allow: [resolve(__dirname, '..')],
    },
  },
})
