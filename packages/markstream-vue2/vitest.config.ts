import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vue2 from '@vitejs/plugin-vue2'
import { defineConfig } from 'vitest/config'

const require = createRequire(import.meta.url)

export default defineConfig({
  plugins: [vue2({ compiler: require('vue/compiler-sfc') })],
  resolve: {
    alias: {
      'vue': require.resolve('vue'),
      'vue-demi': require.resolve('vue-demi/lib/v2.7/index.mjs'),
      'stream-markdown-parser': resolve(import.meta.dirname, '../markdown-parser/src/index.ts'),
      'markstream-core': resolve(import.meta.dirname, '../markstream-core/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['../../test/setup/vitest.setup.ts'],
    restoreMocks: true,
  },
})
