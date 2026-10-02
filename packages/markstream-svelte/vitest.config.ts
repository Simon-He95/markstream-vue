import { resolve } from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: [
      {
        find: /^stream-markdown-parser$/,
        replacement: resolve(import.meta.dirname, '../markdown-parser/src/index.ts'),
      },
      {
        find: /^markstream-core$/,
        replacement: resolve(import.meta.dirname, '../markstream-core/src/index.ts'),
      },
    ],
    conditions: ['browser'],
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
    testTimeout: 10_000,
  },
})
