import type { PluginOption } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'
import monacoEditorPlugin from 'vite-plugin-monaco-editor-esm'

export default defineConfig({
  base: './',
  server: {
    port: 4174,
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['stream-monaco'],
  },
  resolve: {
    alias: {
      'markstream-react': new URL('../packages/markstream-react/src', import.meta.url).pathname,
    },
  },
  plugins: [
    react(),
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
