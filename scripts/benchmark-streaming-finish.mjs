import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import vue from '@vitejs/plugin-vue'
import { chromium } from 'playwright-core'
import { build, preview } from 'vite'

const root = process.cwd()
const output = path.join(root, '.tmp/stream-finish-perf')
const baselineRef = execFileSync('git', ['rev-parse', process.env.FADE_BASELINE_REF || 'HEAD'], { encoding: 'utf8' }).trim()
const repeats = 3
const baselineFiles = new Map([
  'packages/markstream-core/src/streaming-text-fade.ts',
  'packages/markstream-core/src/smooth-stream-controller.ts',
  'src/components/NodeRenderer/composables/useSmoothStreamingBridge.ts',
  'src/components/NodeRenderer/composables/useMarkdownParsing.ts',
  'src/components/NodeRenderer/NodeRenderer.vue',
  'src/components/NodeRenderer/NodeRendererContent.vue',
  'src/composables/useStreamingTextFade.ts',
  'src/components/TextNode/TextNode.vue',
  'src/components/InlineCodeNode/InlineCodeNode.vue',
].map(file => [path.join(root, file), execFileSync('git', ['show', `${baselineRef}:${file}`], { encoding: 'utf8' })]))
const delayedReplacements = new Map([
  ['src/components/NodeRenderer/composables/useSmoothStreamingBridge.ts', ['const flush = props.smoothStreamingOptions?.flushOnFinish !== false', 'const flush = false']],
  ['src/components/NodeRenderer/NodeRenderer.vue', ['const textStreamFinal = computed(() => requestedFinal.value === true || inheritedTextFinal?.value === true)', 'const textStreamFinal = computed(() => false)']],
  ['src/components/NodeRenderer/NodeRendererContent.vue', ['css: props.fade !== false && !final,', 'css: props.fade !== false,']],
].map(([file, replacement]) => [path.join(root, file), replacement]))
mkdirSync(output, { recursive: true })
for (const variant of ['legacy', 'drain', 'finish']) {
  await build({
    configFile: false,
    root: path.join(root, 'test/benchmark/streaming-fade'),
    base: `/${variant}/`,
    logLevel: 'error',
    plugins: [
      {
        name: 'finish-comparison',
        enforce: 'pre',
        load(id) {
          if (variant === 'legacy')
            return baselineFiles.get(id)
        },
        transform(code, id) {
          const replacement = delayedReplacements.get(id)
          if (variant !== 'drain' || !replacement)
            return
          assert.ok(code.includes(replacement[0]), `Missing controlled comparison source in ${id}`)
          return { code: code.replace(replacement[0], replacement[1]), map: null }
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
    build: { outDir: path.join(output, variant), emptyOutDir: true },
  })
  console.log(`Built ${variant}`)
}

const sentence = '中文流式测试 mixed words appear smoothly，继续输出。'
const characters = Array.from(sentence.repeat(30))
const scenarios = [
  { id: 'dense', seed: '开始：', chunks: Array.from({ length: 100 }, (_, index) => characters.slice(index * 4, index * 4 + 4).join('')), intervalMs: 16 },
  { id: 'burst', seed: '开始：', chunks: Array.from({ length: 6 }, () => sentence.repeat(2)), intervalMs: 200 },
  { id: 'large-end', seed: '开始：', chunks: [sentence.repeat(20)], intervalMs: 0 },
]
const variants = ['legacy', 'drain', 'finish', 'off']
const server = await preview({ configFile: false, root, logLevel: 'error', build: { outDir: output }, preview: { host: '127.0.0.1', port: 4201, strictPort: true } })
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const errors = []
const runs = []
const checks = []
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  page.on('pageerror', error => errors.push(error.message))
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]))
  async function navigate(variant) {
    await page.goto(`http://127.0.0.1:4201/${variant === 'off' ? 'finish' : variant}/?smooth=true`)
    await page.waitForFunction(() => window.ready)
  }
  for (const seed of ['', 'base ']) {
    await navigate('finish')
    const check = await page.evaluate(async (seed) => {
      await window.setPacing(false)
      await window.reset(seed)
      await window.setContent(`${seed}one two three`)
      await new Promise(resolve => requestAnimationFrame(resolve))
      await window.finishStream()
      await new Promise(resolve => requestAnimationFrame(resolve))
      const animations = document.getElementById('app').getAnimations({ subtree: true }).filter(animation => animation.playState === 'running')
      const translucent = [...document.querySelectorAll('.text-node, .paragraph-node')].filter(node => Number(getComputedStyle(node).opacity) < 1)
      return { seed, activeAnimationsAfterFinal: animations.map(animation => animation.animationName ?? animation.transitionProperty), translucentAfterFinal: translucent.length }
    }, seed)
    checks.push(check)
    assert.equal(check.activeAnimationsAfterFinal.length, 0, JSON.stringify(check))
    assert.equal(check.translucentAfterFinal, 0, JSON.stringify(check))
  }
  for (const variant of variants) {
    await navigate(variant)
    await page.evaluate(scenario => window.runStream(scenario), { ...scenarios[0], chunks: scenarios[0].chunks.slice(0, 8), enabled: variant !== 'off' })
  }
  for (const scenario of scenarios) {
    for (let repeat = 0; repeat < repeats; repeat++) {
      const order = repeat % 2 ? [...variants].reverse() : variants
      for (const variant of order) {
        await navigate(variant)
        await page.evaluate(({ seed, enabled }) => window.reset(seed, enabled), { seed: scenario.seed, enabled: variant !== 'off' })
        await cdp.send('HeapProfiler.collectGarbage')
        const frameId = (await cdp.send('Page.getFrameTree')).frameTree.frame.id
        const events = []
        const onData = ({ value }) => events.push(...value)
        cdp.on('Tracing.dataCollected', onData)
        await cdp.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' })
        const before = await metrics()
        const result = await page.evaluate(scenario => window.runStream(scenario), { ...scenario, enabled: variant !== 'off', prepared: true })
        const after = await metrics()
        const completed = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve))
        await cdp.send('Tracing.end')
        await completed
        cdp.off('Tracing.dataCollected', onData)
        if (repeat === 0)
          writeFileSync(path.join(output, `trace-${scenario.id}-${variant}.json`), JSON.stringify({ traceEvents: events }))
        const finishMark = events.find(event => event.name === 'stream-final')
        assert.ok(finishMark, 'Missing final trace marker')
        const paint = events.find(event => event.name === 'Paint' && event.args?.data?.frame === frameId)
        const rendererPid = paint?.pid ?? finishMark.pid
        const traceEvents = events.filter(event => event.pid === rendererPid && event.ph === 'X')
        const eventStat = (name, afterFinal = false) => {
          const matches = traceEvents.filter(event => event.name === name && (!afterFinal || event.ts >= finishMark.ts))
          return { count: matches.length, ms: matches.reduce((sum, event) => sum + (event.dur || 0), 0) / 1000 }
        }
        const trace = Object.fromEntries(['Paint', 'Layout', 'UpdateLayoutTree', 'RasterTask', 'CompositeLayers'].map(name => [name, { total: eventStat(name), afterFinal: eventStat(name, true) }]))
        assert.equal(result.remainingDeltas, 0)
        assert.equal(result.complete, true)
        if (variant === 'finish' || variant === 'off') {
          assert.equal(result.settledAtFinalCommit, true)
          assert.equal(result.deltasAtFinalCommit, 0)
        }
        const expected = await page.evaluate(async (text) => {
          await window.setPacing(false)
          await window.reset(text, false)
          await window.finishStream()
          return document.getElementById('app').textContent
        }, scenario.seed + scenario.chunks.join(''))
        assert.equal(result.renderedText, expected)
        const timing = { ...result }
        delete timing.renderedText
        runs.push({ scenario: scenario.id, variant, repeat, ...timing, taskMs: (after.TaskDuration - before.TaskDuration) * 1000, scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000, layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000, styleMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000, trace })
        console.log(`${scenario.id} ${variant} ${repeat + 1}: task ${runs.at(-1).taskMs.toFixed(1)}ms, finish ${result.finishDelayMs.toFixed(1)}ms, paint ${trace.Paint.total.count}/${trace.Paint.total.ms.toFixed(1)}ms`)
      }
    }
  }
  assert.deepEqual(errors, [])
}
finally {
  await browser.close()
  await new Promise(resolve => server.httpServer.close(resolve))
}
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const summaries = scenarios.flatMap(scenario => variants.map((variant) => {
  const rows = runs.filter(row => row.scenario === scenario.id && row.variant === variant)
  return {
    scenario: scenario.id,
    variant,
    ...Object.fromEntries(['taskMs', 'scriptMs', 'layoutMs', 'styleMs', 'finishDelayMs', 'finalCommitMs', 'frameP95Ms', 'frameMaxMs', 'peakDeltas', 'longTasks'].map(key => [key, median(rows.map(row => row[key]))])),
    taskRangeMs: [Math.min(...rows.map(row => row.taskMs)), Math.max(...rows.map(row => row.taskMs))],
    paintMs: median(rows.map(row => row.trace.Paint.total.ms)),
    paintCount: median(rows.map(row => row.trace.Paint.total.count)),
    afterFinalPaintMs: median(rows.map(row => row.trace.Paint.afterFinal.ms)),
    afterFinalPaintCount: median(rows.map(row => row.trace.Paint.afterFinal.count)),
    rasterMs: median(rows.map(row => row.trace.RasterTask.total.ms)),
  }
}))
writeFileSync(path.join(output, 'results.json'), `${JSON.stringify({ baselineRef, repeats, browser: browser.version(), generatedAt: new Date().toISOString(), scope: 'Headless Chrome, 1100x900, production builds, alternating variants, no CPU throttling. All variants use smoothStreaming=true and parseCoalesceMs=0. Off is fade=false and includes its existing pacing/DOM optimizations. Drain is current source with only final flush, final fade settlement and final enter-transition suppression disabled at build time. Timings include trace and identical RAF/DOM sampling overhead. Paint is renderer main-thread paint recording; RasterTask is renderer raster CPU, not GPU time. Durations overlap and must not be summed. Missing CompositeLayers/RasterTask events do not imply zero GPU cost.', scenarios, summaries, runs, checks, errors }, null, 2)}\n`)
console.log(`Saved ${path.join(output, 'results.json')}`)
