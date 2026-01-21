import type { PluginOption } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'
import monacoEditorPlugin from 'vite-plugin-monaco-editor-esm'

export default defineConfig(({ mode }) => ({
  base: './',
  server: {
    port: 4174,
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['stream-monaco', 'monaco-editor'],
  },
  // Only use alias in dev mode - for production build, use the built package
  resolve: mode === 'development'
    ? {
        alias: {
          'markstream-react': path.resolve(__dirname, '../packages/markstream-react/src'),
        },
      }
    : undefined,
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
}))
