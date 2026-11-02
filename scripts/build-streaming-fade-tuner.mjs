import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import vue from '@vitejs/plugin-vue'
import { build } from 'vite'

const root = process.cwd()
const fixture = path.join(root, 'test/benchmark/streaming-fade')
const output = path.join(root, '.tmp/fade-comparison')
const resultsPath = path.join(root, 'test/benchmark/streaming-fade-results.json')
const baselineRef = execFileSync('git', ['rev-parse', process.env.FADE_BASELINE_REF || 'HEAD'], { encoding: 'utf8' }).trim()
const baselineFiles = [
  'packages/markstream-core/src/streaming-text-fade.ts',
  'packages/markstream-core/src/smooth-stream-controller.ts',
  'src/components/NodeRenderer/composables/useSmoothStreamingBridge.ts',
  'src/components/NodeRenderer/composables/useMarkdownParsing.ts',
  'src/components/NodeRenderer/NodeRenderer.vue',
  'src/components/NodeRenderer/NodeRendererContent.vue',
  'src/composables/useStreamingTextFade.ts',
  'src/components/TextNode/TextNode.vue',
  'src/components/InlineCodeNode/InlineCodeNode.vue',
].map(file => [path.join(root, file), execFileSync('git', ['show', `${baselineRef}:${file}`], { encoding: 'utf8' })])
for (const variant of ['before', 'tune']) {
  await build({
    configFile: false,
    root: fixture,
    base: `/${variant}/`,
    logLevel: 'error',
    plugins: [
      ...(variant === 'before' ? [{ name: 'baseline-stream', enforce: 'pre', load(id) { return baselineFiles.find(([file]) => file === id)?.[1] } }] : []),
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
    build: { outDir: path.join(output, variant), emptyOutDir: true },
  })
}
// Keep the historical performance report separate from the live parameter comparison.
mkdirSync(output, { recursive: true })
copyFileSync(resultsPath, path.join(output, 'results.json'))
copyFileSync(path.join(root, 'test/benchmark/streaming-fade-results.md'), path.join(output, 'results.md'))
copyFileSync(path.join(root, 'test/benchmark/streaming-finish-results.json'), path.join(output, 'finish-results.json'))
copyFileSync(path.join(root, 'test/benchmark/streaming-finish-results.md'), path.join(output, 'finish-results.md'))
copyFileSync(path.join(root, 'test/benchmark/streaming-finish-budget-results.md'), path.join(output, 'budget-results.md'))
for (const file of ['streaming-finish-budget-results.md', 'streaming-finish-budget-results.json', 'streaming-finish-cpu4x-results.md', 'streaming-finish-cpu4x-results.json', 'streaming-finish-results.json'])
  copyFileSync(path.join(root, 'test/benchmark', file), path.join(output, file))
for (const [source, target] of [['tuner.html', 'index.html'], ['tuner.js', 'tuner.js'], ['tuner.css', 'tuner.css']])
  copyFileSync(path.join(fixture, source), path.join(output, target))
console.log(`Fade tuner ready at http://127.0.0.1:4198/ (baseline ${baselineRef})`)
