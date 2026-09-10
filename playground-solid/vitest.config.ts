import path from 'node:path'
import solid from 'vite-plugin-solid'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    solid({
      solid: { hydratable: true },
    }),
  ],
  resolve: {
    alias: [
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
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
})
