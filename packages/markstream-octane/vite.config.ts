import { resolve } from 'node:path'
import process from 'node:process'
import { octane } from 'octane/compiler/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import UnpluginClassExtractor from 'unplugin-class-extractor/vite'
import { defineConfig } from 'vite'

const external = [
  'node:module',
  'katex',
  'katex/contrib/mhchem',
  'mermaid',
  'stream-diffs',
  'stream-markdown-parser',
  'markstream-core',
  '@antv/infographic',
  '@terrastruct/d2',
  '@floating-ui/dom',
]

export default defineConfig(({ mode }) => {
  const server = mode === 'npm-server'
  const plugins = [
    octane({ ssr: server }),
  ]

  if (!server) {
    plugins.push(
      UnpluginClassExtractor({
        output: 'dist/.tailwind-source.ts',
        include: [/\/src\/.*\.(?:ts|tsrx)(\?.*)?$/],
      }) as never,
    )
  }

  if (process.env.ANALYZE === 'true') {
    plugins.push(
      visualizer({
        filename: server ? 'bundle-visualizer-server.html' : 'bundle-visualizer-client.html',
        gzipSize: true,
        brotliSize: true,
      }) as never,
    )
  }

  return {
    plugins,
    resolve: {
      alias: server
        ? [{ find: /^octane$/, replacement: 'octane/server' }]
        : [],
      extensions: ['.tsrx', '.ts', '.mjs', '.js', '.json'],
    },
    css: {
      postcss: './postcss.config.cjs',
    },
    worker: {
      format: 'es',
      rollupOptions: {
        external: [
          'katex',
          'katex/contrib/mhchem',
          'mermaid',
        ],
        output: {
          entryFileNames: 'workers/[name].js',
          chunkFileNames: 'workers/[name].js',
          assetFileNames: 'workers/[name][extname]',
        },
      },
    },
    build: {
      target: 'esnext',
      cssTarget: 'chrome100',
      cssCodeSplit: false,
      cssMinify: true,
      emptyOutDir: true,
      outDir: server ? 'dist/server' : 'dist/client',
      copyPublicDir: false,
      sourcemap: false,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_debugger: true,
          pure_funcs: ['console.log'],
          passes: 2,
        },
        format: {
          comments: false,
        },
      },
      lib: {
        entry: server
          ? { index: resolve(__dirname, 'src/server.ts') }
          : {
              index: resolve(__dirname, 'src/index.ts'),
              styles: resolve(__dirname, 'src/tailwind-entry.ts'),
            },
        name: 'markstream-octane',
        fileName: (_, entryName) => `${entryName}.js`,
        cssFileName: 'index',
        formats: ['es'],
      },
      rollupOptions: {
        external: [
          ...external,
          server ? 'octane/server' : 'octane',
        ],
        output: {
          banner: '// octane-no-slot: compiler-assigned hook slots are already present.',
          chunkFileNames: 'chunks/[name]-[hash].js',
        },
      },
    },
  }
})
