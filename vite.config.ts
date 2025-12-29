import process from 'node:process'
/// <reference types="vitest" />

import Vue from '@vitejs/plugin-vue'
import { visualizer } from 'rollup-plugin-visualizer'
import UnpluginClassExtractor from 'unplugin-class-extractor/vite'
import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { name } from './package.json'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Use an empty base for library (npm) builds so emitted asset URLs are relative.
  // If base is '/', Vite will emit absolute '/assets/...' paths which can break
  // consumers that bundle this package. Leaving base empty lets the consumer
  // resolve assets correctly during their build.
  const base = mode === 'npm' ? '' : '/'
  let plugins = [Vue(), Components()]

  let build: Record<string, any> = {
    target: 'es2015',
    cssTarget: 'chrome61',
  }

  if (mode === 'npm') {
    plugins = [
      Vue(),
      dts({
        outDir: 'dist/types',
        // Ensure the plugin emits a single `dist/types/exports.d.ts` entry
        // that re-exports all public types. This helps downstream bundlers
        // (rollup-plugin-dts) consume a stable entrypoint instead of relying
        // on ad-hoc merges which can accidentally drop or rename exports.
        insertTypesEntry: true,
        // Use a build-only tsconfig without path aliases to avoid rewriting
        // imports like "stream-markdown-parser" into relative workspace paths
        // in the emitted .d.ts (which breaks type bundling).
        tsconfigPath: './tsconfig.build.json',
      }),
      UnpluginClassExtractor({
        output: 'dist/tailwind.ts',
        include: [/\/src\/components\/(?:[^/]+\/)*[^/]+\.vue(\?.*)?$/],
      }) as any,
    ]
    // Add optional bundle visualizer when ANALYZE=true
    if (process.env.ANALYZE === 'true') {
      plugins.push(
        // write interactive treemap to `dist/bundle-visualizer.html`
        visualizer({ filename: 'dist/bundle-visualizer.html', gzipSize: true, brotliSize: true }) as any,
      )
    }
    build = {
      target: 'es2015',
      cssTarget: 'chrome61',
      // emit assets at dist root (no assets/ folder)
      assetsDir: '',
      copyPublicDir: false,
      minify: 'terser',
      terserOptions: {
        compress: {
          ecma: 2015,
          drop_console: false,
          drop_debugger: true,
          pure_funcs: ['console.log'],
          passes: 2,
        },
        mangle: {
          safari10: true,
        },
        format: {
          comments: false,
          ecma: 2015,
        },
      },
      sourcemap: false,
      lib: {
        entry: './src/exports.ts',
        // produce both ESM Only
        formats: ['es'],
        name,
        fileName: (format: string) => (format === 'cjs' ? 'index.cjs' : 'index.js'),
      },
      rollupOptions: {
        external: (id: string) => {
          if (id === 'mermaid' || id.startsWith('mermaid/'))
            return true
          // also match resolved node_modules paths that include /node_modules/mermaid
          if (/node_modules\/mermaid(?:\/|$)/.test(id))
            return true
          return [
            'vue',
            'vue-i18n',
            'katex',
            'mermaid',
            'katex/contrib/mhchem',
            'stream-monaco',
            'stream-markdown',
            'stream-markdown-parser',
            'monaco-editor',
            'shiki',
          ].includes(id)
        },
        // Use Rollup output naming
        output: {
          globals: {
            vue: 'Vue',
          },
          exports: 'named',
          // Don't override entryFileNames here - let lib.fileName control the main library output
          // Workers will be handled by worker.rollupOptions.output below
          chunkFileNames: '[name].js',
          assetFileNames: (assetInfo: any) => {
            try {
              const fname = (assetInfo && ((assetInfo as any).name || (assetInfo as any).fileName || '')) as string
              if (fname && fname.endsWith('.css'))
                return 'index.css'
            }
            catch {}
            return '[name][extname]'
          },
        },
      },
    }
  }

  // Alias resolution: during dev/test, point workspace dep to source to avoid needing its dist build
  const alias: Record<string, string> = {
    '@': '/src',
  }
  if (mode !== 'npm') {
    alias['stream-markdown-parser'] = '/packages/markdown-parser/src/index.ts'
    alias['stream-markdown-parser/*'] = '/packages/markdown-parser/src/*'
  }

  return {
    base,
    plugins,
    build,
    test: {
      environment: 'jsdom',
      setupFiles: ['./test/setup/vitest.setup.ts'],
      restoreMocks: true,
    },
    worker: {
      // Ensure web workers are bundled as ESM; IIFE/UMD are invalid with code-splitting
      format: 'es',
      // Externalize mermaid in worker bundling as well (treat mermaid and mermaid/* as external)
      rollupOptions: {
        external: (id: string) => /(?:^|\/)(?:mermaid|katex)(?:\/|$)/.test(id),
        output: {
          // Emit workers with deterministic names (no hash) in workers/ subfolder
          entryFileNames: 'workers/[name].js',
          chunkFileNames: 'workers/[name].js',
          assetFileNames: 'workers/[name][extname]',
        },
      },
    },
    css: {
      postcss: './postcss.config.cjs',
    },
    resolve: { alias },
  }
})
