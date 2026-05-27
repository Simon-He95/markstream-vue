import path from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig(({ mode }) => ({
  base: mode === 'npm' ? '' : './',
  plugins: [
    dts({
      insertTypesEntry: true,
      outDir: 'dist/types',
      tsconfigPath: './tsconfig.build.json',
    }),
  ],
  resolve: mode === 'npm'
    ? undefined
    : {
        alias: [
          {
            find: /^stream-markdown-parser$/,
            replacement: path.resolve(__dirname, '../markdown-parser/src/index.ts'),
          },
          {
            find: /^stream-markdown-parser\//,
            replacement: `${path.resolve(__dirname, '../markdown-parser/src')}/`,
          },
          {
            find: /^markstream-core$/,
            replacement: path.resolve(__dirname, '../markstream-core/src/index.ts'),
          },
          {
            find: /^markstream-core\//,
            replacement: `${path.resolve(__dirname, '../markstream-core/src')}/`,
          },
        ],
      },
  build: {
    copyPublicDir: false,
    lib: {
      entry: './src/index.ts',
      formats: ['es'],
      name: 'markstream-angular',
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [
        '@antv/infographic',
        '@angular/common',
        '@angular/core',
        '@terrastruct/d2',
        'katex',
        'katex/contrib/mhchem',
        'katex/dist/contrib/mhchem',
        'mermaid',
        'stream-monaco',
        'stream-markdown-parser',
        'markstream-core',
      ],
      output: {
        assetFileNames(assetInfo) {
          if ((assetInfo.name || '').endsWith('.css'))
            return 'index.css'
          return '[name][extname]'
        },
      },
    },
  },
  worker: {
    format: 'es',
    rollupOptions: {
      external: [
        'katex',
        'katex/contrib/mhchem',
        'katex/dist/contrib/mhchem',
        'mermaid',
      ],
      output: {
        entryFileNames: 'workers/[name].js',
        chunkFileNames: 'workers/[name].js',
        assetFileNames: 'workers/[name][extname]',
      },
    },
  },
  css: {
    postcss: path.resolve(__dirname, './postcss.config.cjs'),
  },
}))
