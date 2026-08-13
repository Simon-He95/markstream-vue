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
  pluginsArr.push(visualizer({ filename: 'bundle-visualizer-tailwind.html', gzipSize: true }) as any)
}

export default defineConfig({
  base: '/',
  plugins: pluginsArr,
  build: {
    target: 'es2015',
    cssTarget: 'chrome61',
    cssCodeSplit: false,
    copyPublicDir: false,
    // Build into a temporary folder; we copy only `index.tailwind.css`
    // into `dist/` and delete the rest.
    outDir: 'dist-tw',
    emptyOutDir: true,
    lib: {
      entry: {
        index: './src/exports.ts',
        styles: './src/styles-entry.ts',
      },
      formats: ['es'],
      name,
      fileName: (_, entryName) => `${entryName}.js`,
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
        'markdown-it-task-checkbox',
        'mermaid',
        'vue-i18n',
        'katex',
        '@terrastruct/d2',
        'katex/contrib/mhchem',
        'katex/dist/contrib/mhchem',
        // syntax highlighting / editor libs that previously caused
        // many language/theme chunks to be emitted
        'shiki',
        'monaco-editor',
        'monaco-editor-core',
        'stream-monaco',
        'stream-diffs',
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
        entryFileNames: '[name].js',
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
      external: (id: string) => /(?:^|\/)(?:@terrastruct\/d2|mermaid|katex|shiki|monaco-editor|vscode-textmate|vscode-oniguruma)(?:\/|$)/.test(id),
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
        // Do not run Tailwind here; this build produces the Tailwind-ready CSS.
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
