/// <reference types="vitest" />

import type { PluginOption } from 'vite'
import path from 'node:path'
import Vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'vite'
import monacoEditorPlugin from 'vite-plugin-monaco-editor-esm'
import Pages from 'vite-plugin-pages'

export default defineConfig({
  base: './',
  worker: {
    // Avoid IIFE/UMD for workers; use ESM which supports code-splitting
    format: 'es',
  },
  resolve: {
    alias: {
      '~/': `${path.resolve(__dirname, 'src')}/`,
      'markstream-vue': path.resolve(__dirname, '../src/exports.ts'),
      'stream-markdown-parser': path.resolve(__dirname, '../packages/markdown-parser/src/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['stream-monaco', 'monaco-editor'],
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

    monacoEditorPlugin({
      languageWorkers: [
        'editorWorkerService',
        'typescript',
        'css',
        'html',
        'json',
      ],
      customDistPath(root, buildOutDir) {
        return path.resolve(buildOutDir, 'monacoeditorwork')
      },
    }) as unknown as PluginOption,
  ],
})
