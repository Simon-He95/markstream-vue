import process from 'node:process'
/// <reference types="vitest" />

import Vue from '@vitejs/plugin-vue'
import autoprefixer from 'autoprefixer'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig } from 'vite'
import { name } from './package.json'

// https://vitejs.dev/config/
const pluginsArr: any[] = [Vue()]

if (process.env.ANALYZE === 'true') {
  pluginsArr.push(visualizer({ filename: 'dist-tw/bundle-visualizer-tailwind.html', gzipSize: true }) as any)
}

export default defineConfig({
  base: '/',
  plugins: pluginsArr,
  build: {
    target: 'es2015',
    cssTarget: 'chrome61',
    copyPublicDir: false,
    // Build into a temporary folder; we copy only `index.tailwind.css`
    // into `dist/` and delete the rest.
    outDir: 'dist-tw',
    emptyOutDir: true,
    lib: {
      entry: './src/exports.ts',
      formats: ['es'],
      name,
      fileName: 'index',
    },
    rollupOptions: {
      // Externalise large runtime/highlighter/editor libs so we don't
      // bundle all language/theme chunks into `dist/` during the
      // tailwind-only build. These packages are provided as peer deps
      // (or loaded by consumers) and should not be emitted by this
      // helper build.
      external: [
        'vue',
        'markdown-it-ts',
        'markdown-it-container',
        'markdown-it-emoji',
        'markdown-it-footnote',
        'markdown-it-ins',
        'markdown-it-mark',
        'markdown-it-sub',
        'markdown-it-sup',
        'markdown-it-task-checkbox',
        'mermaid',
        'vue-i18n',
        'katex',
        'katex/contrib/mhchem',
        // syntax highlighting / editor libs that previously caused
        // many language/theme chunks to be emitted
        'shiki',
        'monaco-editor',
        'monaco-editor-core',
        'stream-monaco',
        'stream-markdown',
        'stream-markdown-parser',
        '@floating-ui/dom',
        'vscode-textmate',
        'vscode-oniguruma',
      ],
      output: {
        globals: {
          vue: 'Vue',
        },
        exports: 'named',
        entryFileNames: 'index.js',
        chunkFileNames: 'chunks/[name].js',
        // Emit CSS asset with a distinct name so consumers can pick the
        // "tailwind-ready" CSS separately (index.tailwind.css).
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
  worker: {
    // Ensure web workers are bundled as ESM; IIFE/UMD are invalid with code-splitting
    format: 'es',
    rollupOptions: {
      // Externalize heavy libs in worker bundling as well
      external: (id: string) => /(?:^|\/)(?:mermaid|katex|shiki|monaco-editor|vscode-textmate|vscode-oniguruma)(?:\/|$)/.test(id),
      output: {
        entryFileNames: 'workers/[name].js',
        chunkFileNames: 'workers/[name].js',
        assetFileNames: 'workers/[name][extname]',
      },
    },
  },
  css: {
    postcss: {
      plugins: [
        // 不使用 tailwindcss 插件，这样 @apply 指令就不会被处理
        autoprefixer,
      ],
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
