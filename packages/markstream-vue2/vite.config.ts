import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import process from 'node:process'
import vue2 from '@vitejs/plugin-vue2'
import { visualizer } from 'rollup-plugin-visualizer'
import { minify as terserMinify } from 'terser'
import UnpluginClassExtractor from 'unplugin-class-extractor/vite'
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
  const assetFileNames = (assetInfo: any) => {
    try {
      const fname = (assetInfo && ((assetInfo as any).name || (assetInfo as any).fileName || '')) as string
      if (fname && fname.endsWith('.css'))
        return 'index.css'
    }
    catch {}
    return '[name][extname]'
  }
  const createChunkOutput = (format: 'es' | 'cjs') => ({
    format,
    exports: 'named' as const,
    entryFileNames: format === 'cjs' ? 'index.cjs' : 'index.js',
    // Keep ES and CJS chunks in separate namespaces so one format cannot
    // overwrite the other in `dist/` when both outputs are emitted together.
    chunkFileNames: format === 'cjs' ? 'chunks/[name]-[hash].cjs' : 'chunks/[name]-[hash].js',
    assetFileNames,
  })
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
      UnpluginClassExtractor({
        output: 'dist/tailwind.ts',
        include: [/\/src\/components\/(?:[^/]+\/)*[^/]+\.vue(\?.*)?$/],
      }) as any,
    )
    if (process.env.ANALYZE === 'true') {
      plugins.push(
        visualizer({ filename: 'bundle-visualizer.html', gzipSize: true, brotliSize: true }) as any,
      )
    }
  }

  plugins.push({
    name: 'markstream-vue2:minify-worker-bundles',
    apply: 'build',
    async generateBundle(_, bundle) {
      const terserOptions = {
        module: true,
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
      } as const

      for (const [fileName, output] of Object.entries(bundle)) {
        if (!fileName.startsWith('workers/'))
          continue

        if (output.type === 'chunk') {
          const result = await terserMinify(output.code, terserOptions)
          if (result.code)
            output.code = result.code.endsWith('\n') ? result.code : `${result.code}\n`
          continue
        }

        if (output.type === 'asset' && typeof output.source === 'string') {
          const result = await terserMinify(output.source, terserOptions)
          if (result.code)
            output.source = result.code.endsWith('\n') ? result.code : `${result.code}\n`
        }
      }
    },
  })

  return {
    plugins,
    resolve: {
      alias: {
        vue: 'vue-demi',
      },
    },
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
      },
      rollupOptions: {
        external: (id: string) => {
          if (id === '@terrastruct/d2' || id.startsWith('@terrastruct/d2/'))
            return true
          if (/node_modules\/@terrastruct\/d2(?:\/|$)/.test(id))
            return true
          if (id === '@floating-ui/dom' || id.startsWith('@floating-ui/dom/'))
            return true
          if (/node_modules\/@floating-ui\/dom(?:\/|$)/.test(id))
            return true
          if (id === 'mermaid' || id.startsWith('mermaid/'))
            return true
          if (/node_modules\/mermaid(?:\/|$)/.test(id))
            return true
          return [
            'vue-demi',
            '@vue/composition-api',
            'vue-i18n',
            'katex',
            'mermaid',
            'katex/contrib/mhchem',
            'stream-monaco',
            'stream-markdown',
            'stream-markdown-parser',
            'markstream-core',
            '@antv/infographic',
            '@terrastruct/d2',
            '@floating-ui/dom',
            'monaco-editor',
            'shiki',
          ].includes(id)
        },
        output: [
          createChunkOutput('es'),
          createChunkOutput('cjs'),
        ],
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
    css: {
      postcss: './postcss.config.cjs',
    },
  }
})
