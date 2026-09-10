import path from 'node:path'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig(({ mode }) => ({
  base: './',
  server: {
    port: 4177,
    strictPort: true,
    host: '127.0.0.1',
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
  preview: {
    port: 4177,
    strictPort: true,
    host: '127.0.0.1',
  },
  worker: {
    format: 'es',
  },
  resolve: mode === 'development'
    ? {
        alias: [
          {
            find: /^@antv\/infographic$/,
            replacement: path.resolve(__dirname, '../node_modules/@antv/infographic/dist/infographic.min.js'),
          },
          {
            find: /^markstream-solid\/workers\/(.+)$/,
            replacement: `${path.resolve(__dirname, '../packages/markstream-solid/src/workers')}/$1`,
          },
          {
            find: /^markstream-solid\/index\.css$/,
            replacement: path.resolve(__dirname, '../packages/markstream-solid/src/index.css'),
          },
          {
            find: 'markstream-solid',
            replacement: path.resolve(__dirname, '../packages/markstream-solid/src/index.ts'),
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
      }
    : {
        alias: [
          {
            find: /^@antv\/infographic$/,
            replacement: path.resolve(__dirname, '../node_modules/@antv/infographic/dist/infographic.min.js'),
          },
        ],
      },
  optimizeDeps: {
    include: ['mermaid', 'solid-js', 'solid-js/web'],
    exclude: ['stream-diffs', 'stream-markdown-parser'],
  },
  plugins: [
    solid({
      solid: { hydratable: true },
    }),
  ],
}))
