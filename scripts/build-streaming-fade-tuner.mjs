import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import vue from '@vitejs/plugin-vue'
import { build } from 'vite'

const root = process.cwd()
const fixture = path.join(root, 'test/benchmark/streaming-fade')
const output = path.join(root, '.tmp/fade-comparison')
const results = JSON.parse(readFileSync(path.join(output, 'results.json'), 'utf8'))
await build({
  configFile: false,
  root: fixture,
  base: '/tune/',
  logLevel: 'error',
  plugins: [
    {
      name: 'preview-only-fade-window',
      enforce: 'pre',
      transform(code, id) {
        if (id !== path.join(root, 'src/composables/useStreamingTextFade.ts'))
          return
        return { code: code.replace('now - last.startedAt < BATCH_WINDOW_MS', 'now - last.startedAt < (globalThis.__fadeDebugBatchWindowMs ?? BATCH_WINDOW_MS)'), map: null }
      },
    },
    vue(),
  ],
  resolve: {
    alias: [
      { find: 'markstream-vue/index.css', replacement: path.join(root, 'src/index.css') },
      { find: 'markstream-vue', replacement: path.join(root, 'src/exports.ts') },
      { find: 'markstream-core', replacement: path.join(root, 'packages/markstream-core/src/index.ts') },
      { find: 'stream-markdown-parser', replacement: path.join(root, 'packages/markdown-parser/src/index.ts') },
    ],
  },
  build: { outDir: path.join(output, 'tune'), emptyOutDir: true },
})
// The comparison benchmark supplies the fixed baseline and recorded perf data.
mkdirSync(output, { recursive: true })
for (const [source, target] of [['tuner.html', 'index.html'], ['tuner.js', 'tuner.js'], ['tuner.css', 'tuner.css']])
  copyFileSync(path.join(fixture, source), path.join(output, target))
console.log(`Fade tuner ready at http://127.0.0.1:4198/ (baseline ${results.baselineRef})`)
