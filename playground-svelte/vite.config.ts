import type { PluginOption } from 'vite'
import path from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import monacoEditorPlugin from 'vite-plugin-monaco-editor-esm'

export default defineConfig({
  base: './',
  server: {
    port: 4176,
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
  worker: {
    format: 'es',
  },
  resolve: {
    alias: [
      {
        find: /^@antv\/infographic$/,
        replacement: path.resolve(__dirname, '../node_modules/@antv/infographic/dist/infographic.min.js'),
      },
      {
        find: /^markstream-svelte\/workers\/(.+)$/,
        replacement: `${path.resolve(__dirname, '../packages/markstream-svelte/src/workers')}/$1`,
      },
      {
        find: /^markstream-svelte\/index\.css$/,
        replacement: path.resolve(__dirname, '../packages/markstream-svelte/src/index.css'),
      },
      {
        find: 'markstream-svelte',
        replacement: path.resolve(__dirname, '../packages/markstream-svelte/src/index.ts'),
      },
      {
        find: /^stream-markdown-parser$/,
        replacement: path.resolve(__dirname, '../packages/markdown-parser/src/index.ts'),
      },
      {
        find: /^markstream-core$/,
        replacement: path.resolve(__dirname, '../packages/markstream-core/src/index.ts'),
      },
      {
        find: /^markstream-core\//,
        replacement: `${path.resolve(__dirname, '../packages/markstream-core/src')}/`,
      },
    ],
  },
  optimizeDeps: {
    include: ['mermaid'],
    exclude: ['stream-monaco', 'stream-markdown-parser'],
  },
  plugins: [
    svelte(),
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
})
