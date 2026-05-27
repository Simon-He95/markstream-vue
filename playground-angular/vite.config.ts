import type { Plugin, PluginOption } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import Vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import monacoEditorPlugin from 'vite-plugin-monaco-editor-esm'

const D2_VENDOR_PUBLIC_PATH = '/vendor/d2-browser.js'
const D2_VENDOR_FILE_NAME = 'vendor/d2-browser.js'
const d2BrowserEntry = path.resolve(__dirname, '../node_modules/@terrastruct/d2/dist/browser/index.js')

function normalizeId(id: string) {
  return id.split(path.sep).join('/')
}

function d2VendorPlugin(): Plugin {
  const vendorSource = fs.readFileSync(d2BrowserEntry)

  return {
    name: 'playground-angular-d2-vendor',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split('?')[0]
        if (pathname !== D2_VENDOR_PUBLIC_PATH) {
          next()
          return
        }

        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        res.end(vendorSource)
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: D2_VENDOR_FILE_NAME,
        source: vendorSource,
      })
    },
  }
}

export default defineConfig({
  base: './',
  publicDir: path.resolve(__dirname, '../playground/public'),
  worker: {
    format: 'es',
  },
  server: {
    port: 4175,
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
  resolve: {
    alias: [
      {
        find: /^markstream-angular$/,
        replacement: path.resolve(__dirname, './src/vendor/markstream-angular-jit.ts'),
      },
      {
        find: /^markstream-vue$/,
        replacement: path.resolve(__dirname, '../src/exports.ts'),
      },
      {
        find: /^stream-markdown-parser$/,
        replacement: path.resolve(__dirname, '../packages/markdown-parser/src/index.ts'),
      },
      {
        find: /^stream-markdown-parser\//,
        replacement: `${path.resolve(__dirname, '../packages/markdown-parser/src')}/`,
      },
      {
        find: /^markstream-core$/,
        replacement: path.resolve(__dirname, '../packages/markstream-core/src/index.ts'),
      },
      {
        find: /^markstream-core\//,
        replacement: `${path.resolve(__dirname, '../packages/markstream-core/src')}/`,
      },
      {
        find: /^@terrastruct\/d2$/,
        replacement: path.resolve(__dirname, './src/vendor/d2-bundled-stub.ts'),
      },
    ],
  },
  css: {
    postcss: path.resolve(__dirname, './postcss.config.cjs'),
  },
  optimizeDeps: {
    include: [
      'katex',
      'katex/contrib/mhchem',
      'katex/dist/contrib/mhchem',
      'mermaid',
    ],
    exclude: ['stream-monaco'],
  },
  plugins: [
    Vue(),
    d2VendorPlugin(),
    monacoEditorPlugin({
      languageWorkers: [
        'editorWorkerService',
        'typescript',
        'css',
        'html',
        'json',
      ],
      customDistPath(_root, buildOutDir) {
        return path.resolve(buildOutDir, 'monacoeditorwork')
      },
    }) as unknown as PluginOption,
  ],
  build: {
    // The Angular playground still ships Monaco as an optional local asset,
    // so a higher warning budget keeps the build signal focused on true
    // regressions instead of the expected editor payload.
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = normalizeId(id)

          if (normalized.includes('/node_modules/@angular/compiler/'))
            return 'angular-compiler'

          if (normalized.includes('/node_modules/@angular/core/'))
            return 'angular-core'

          if (normalized.includes('/node_modules/@angular/common/'))
            return 'angular-common'

          if (normalized.includes('/node_modules/@angular/platform-browser/'))
            return 'angular-platform-browser'

          if (normalized.includes('/node_modules/rxjs/'))
            return 'angular-rxjs'

          if (normalized.includes('/node_modules/monaco-editor/'))
            return 'monaco-editor'

          if (normalized.includes('/node_modules/stream-monaco/'))
            return 'stream-monaco'

          if (normalized.includes('/playground-angular/src/vendor/markstream-angular-jit.ts'))
            return 'markstream-angular'

          if (normalized.includes('/packages/markstream-angular/src/'))
            return 'markstream-angular'

          if (normalized.includes('/packages/markdown-parser/src/'))
            return 'markdown-parser'

          if (normalized.includes('/playground-angular/src/test-lab.component.ts'))
            return 'angular-test-lab'
        },
      },
    },
  },
})
