/// <reference types="vitest" />

import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import Vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'vite'
import Pages from 'vite-plugin-pages'

const require = createRequire(import.meta.url)

const preferredVueI18nEntry = path.resolve(
  path.dirname(require.resolve('vue-i18n/package.json', { paths: [__dirname] })),
  'dist/vue-i18n.mjs',
)
const antvInfographicBrowserEntry = path.resolve(
  fs.realpathSync(path.resolve(__dirname, 'node_modules/@antv/infographic')),
  'dist/infographic.min.js',
)

export default defineConfig(() => {
  return {
    base: './',
    server: {
      fs: {
        allow: [
          path.resolve(__dirname, '..'),
        ],
      },
    },
    worker: {
      // Avoid IIFE/UMD for workers; use ESM which supports code-splitting
      format: 'es',
    },
    resolve: {
      alias: {
        '~/': `${path.resolve(__dirname, 'src')}/`,
        'markstream-vue/index.css': path.resolve(__dirname, '../src/index.css'),
        'markstream-vue': path.resolve(__dirname, '../src/exports.ts'),
        'markstream-angular': path.resolve(__dirname, '../packages/markstream-angular/src/index.ts'),
        'stream-markdown-parser': path.resolve(__dirname, '../packages/markdown-parser/src/index.ts'),
        'markstream-core': path.resolve(__dirname, '../packages/markstream-core/src/index.ts'),
        'vue-i18n': preferredVueI18nEntry,
        '@antv/infographic': antvInfographicBrowserEntry,
      },
    },
    optimizeDeps: {
      // Keep workspace-linked parser/runtime packages on source files in dev so
      // fixes in the monorepo are reflected immediately instead of getting
      // stuck behind Vite's optimized-deps cache.
      exclude: [
        'stream-markdown-parser',
        'markstream-core',
      ],
    },
    plugins: [
      Vue({}),

      // https://github.com/hannoeru/vite-plugin-pages
      Pages(),

      // https://github.com/antfu/unplugin-auto-import
      AutoImport({
        imports: ['vue', 'vue-router', '@vueuse/core'],
        dts: true,
      }),

      // https://github.com/antfu/vite-plugin-components
      Components({
        dts: true,
      }),
    ],
  }
})
