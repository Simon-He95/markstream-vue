import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vue2 from '@vitejs/plugin-vue2'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const require = createRequire(import.meta.url)
let vueCompiler: any
try {
  vueCompiler = require('@vue/compiler-sfc')
}
catch {
  try {
    vueCompiler = require('vue/compiler-sfc')
  }
  catch {
    vueCompiler = require('vue-template-compiler')
  }
}

export default defineConfig(({ mode }) => {
  const isNpm = mode === 'npm'
  const plugins = [
    vue2({ compiler: vueCompiler, script: { babelParserPlugins: ['typescript'] } }),
  ]
  if (isNpm) {
    plugins.push(
      dts({
        outDir: 'dist/types',
        insertTypesEntry: true,
        tsconfigPath: './tsconfig.build.json',
      }),
    )
  }

  return {
    plugins,
    build: {
      target: 'es2015',
      cssTarget: 'chrome61',
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
      emptyOutDir: true,
      lib: {
        entry: resolve(__dirname, 'src/exports.ts'),
        name: 'MarkstreamVue2',
        fileName: format => (format === 'cjs' ? 'index.cjs' : 'index.js'),
        formats: ['es', 'cjs'],
      },
      rollupOptions: {
        external: (id: string) => {
          if (id === 'mermaid' || id.startsWith('mermaid/'))
            return true
          if (/node_modules\/mermaid(?:\/|$)/.test(id))
            return true
          return [
            'vue',
            '@vue/composition-api',
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
        output: {
          exports: 'named',
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
    },
    worker: {
      format: 'es',
      rollupOptions: {
        external: (id: string) => /(?:^|\/)(?:mermaid|katex)(?:\/|$)/.test(id),
        output: {
          entryFileNames: 'workers/[name].js',
          chunkFileNames: 'workers/[name].js',
          assetFileNames: 'workers/[name][extname]',
        },
      },
    },
  }
})
