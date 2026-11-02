import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { gzipSync } from 'node:zlib'
import vue from '@vitejs/plugin-vue'
import { chromium } from 'playwright-core'
import { build, preview } from 'vite'

const root = process.cwd()
const output = path.join(root, '.tmp/stream-finish-budget-cpu4x')
const repeats = 3
const sourceFiles = [
  'packages/markstream-core/src/smooth-stream-controller.ts',
  'packages/markstream-core/src/streaming-text-fade.ts',
  'packages/markstream-core/src/renderer-stream-bridge.ts',
  'src/components/NodeRenderer/NodeRenderer.vue',
  'src/components/NodeRenderer/NodeRendererContent.vue',
  'src/components/NodeRenderer/composables/useSmoothStreamingBridge.ts',
  'src/components/NodeRenderer/composables/useMarkdownParsing.ts',
  'src/components/TextNode/TextNode.vue',
  'src/components/InlineCodeNode/InlineCodeNode.vue',
  'src/composables/useStreamingTextFade.ts',
  'src/composables/useSmoothMarkdownStream.ts',
  'packages/markstream-core/src/types.ts',
  'packages/markdown-parser/src/parser/index.ts',
  'packages/markdown-parser/src/parser/reuse/structured-node-reuse.ts',
  'packages/markdown-parser/src/parser/streaming/tokenizer.ts',
  'test/benchmark/streaming-fade/main.js',
]
const sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')]))
mkdirSync(output, { recursive: true })
await build({
  configFile: false,
  root: path.join(root, 'test/benchmark/streaming-fade'),
  base: '/',
  logLevel: 'error',
  plugins: [vue()],
  resolve: { alias: [
    { find: 'markstream-vue/index.css', replacement: path.join(root, 'src/index.css') },
    { find: 'markstream-vue', replacement: path.join(root, 'src/exports.ts') },
    { find: 'markstream-core', replacement: path.join(root, 'packages/markstream-core/src/index.ts') },
    { find: 'stream-markdown-parser', replacement: path.join(root, 'packages/markdown-parser/src/index.ts') },
  ] },
  build: { outDir: path.join(output, 'site'), emptyOutDir: true },
})
console.log('Built current production fixture.')

const sentence = '中文长文本 mixed words remain readable，流式输入结束后立即显示剩余内容。'
function documentOfLength(length) {
  let text = ''
  for (let index = 1; text.length < length; index++) {
    text += `## 小节 ${index}\n\n${sentence.repeat(3)} **重点内容** 与 \`inline code\`。\n\n- 列表第一项 ${sentence}\n- 列表第二项 ${sentence}\n\n`
  }
  return text
}
const history = documentOfLength(20000)
const tail = documentOfLength(4000)
const burst = documentOfLength(8000)
const scenarios = [
  { id: 'plain-20k-end', label: '2 万字符纯文本末包', seed: '开始：', chunks: [sentence.repeat(Math.ceil(20000 / sentence.length)).slice(0, 20000)], intervalMs: 0 },
  { id: 'history-20k-tail-4k', label: '约 2 万字符历史 + 约 4 千字符增量', seed: history, chunks: Array.from({ length: Math.ceil(tail.length / 200) }, (_, index) => tail.slice(index * 200, index * 200 + 200)), intervalMs: 50 },
  { id: 'bursts-8k-times-3', label: '三个约 8 千字符 Markdown 大包', seed: '开始：\n\n', chunks: [burst, burst, burst], intervalMs: 200 },
  { id: 'structured-50k-end', label: '约 5 万字符 Markdown 末包', seed: '开始：\n\n', chunks: [documentOfLength(50000)], intervalMs: 0 },
]
console.log(JSON.stringify(scenarios.map(s => ({ id: s.id, seedChars: s.seed.length, appendedChars: s.chunks.join('').length }))))
const server = await preview({ configFile: false, root, logLevel: 'error', build: { outDir: path.join(output, 'site') }, preview: { host: '127.0.0.1', port: 4202, strictPort: true } })
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const browserVersion = browser.version()
const runs = []
const errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  page.on('pageerror', error => errors.push(error.message))
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]))
  for (const scenario of scenarios) {
    for (let repeat = 0; repeat < repeats; repeat++) {
      for (const cpuRate of repeat % 2 ? [4, 1] : [1, 4]) {
        await page.goto('http://127.0.0.1:4202/?smooth=true')
        await page.waitForFunction(() => window.ready)
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
        const reference = await page.evaluate(async ({ seed, full }) => {
          await window.setPacing(false)
          await window.reset(full, false)
          await window.finishStream()
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          const expectedText = document.getElementById('app').textContent
          await window.reset(seed)
          await window.setPacing(true)
          window.scrollTo(0, document.body.scrollHeight)
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          await new Promise(resolve => setTimeout(resolve, 300))
          return { expectedText, initialElements: document.getElementById('app').querySelectorAll('*').length }
        }, { seed: scenario.seed, full: scenario.seed + scenario.chunks.join('') })
        await cdp.send('HeapProfiler.collectGarbage')
        const events = []
        const onData = ({ value }) => events.push(...value)
        cdp.on('Tracing.dataCollected', onData)
        await cdp.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,toplevel', transferMode: 'ReportEvents' })
        const before = await metrics()
        const result = await page.evaluate(async ({ seed, chunks, intervalMs }) => {
          const host = document.getElementById('app')
          const frames = []
          const longTasks = []
          const collect = entries => longTasks.push(...entries.map(({ startTime, duration }) => ({ startTime, duration })))
          const observer = new PerformanceObserver(list => collect(list.getEntries()))
          observer.observe({ type: 'longtask' })
          let lastCallback = performance.now()
          let lastTimestamp
          let rafId
          function sample(timestamp) {
            const now = performance.now()
            frames.push({ start: lastCallback, end: now, gap: now - lastCallback, rafGap: lastTimestamp == null ? null : timestamp - lastTimestamp })
            lastCallback = now
            lastTimestamp = timestamp
            rafId = requestAnimationFrame(sample)
          }
          rafId = requestAnimationFrame(sample)
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          const started = performance.now()
          performance.mark('cpu4-start')
          let content = seed
          for (let index = 0; index < chunks.length; index++) {
            const delay = started + index * intervalMs - performance.now()
            if (delay > 0)
              await new Promise(resolve => setTimeout(resolve, delay))
            content += chunks[index]
            await window.setContent(content)
          }
          const visibleTextBeforeFinal = host.textContent.length
          const activeWordsBeforeFinal = host.querySelectorAll('.text-node-stream-delta, .inline-code-stream-delta').length
          const finalStart = performance.now()
          performance.mark('cpu4-final')
          await window.finishStream()
          const finalCommitAt = performance.now()
          performance.mark('cpu4-final-commit')
          const textAtCommit = host.textContent
          const remainingWordsAtCommit = host.querySelectorAll('.text-node-stream-delta, .inline-code-stream-delta').length
          while (!window.isSettled()) {
            if (performance.now() - finalStart > 60000)
              throw new Error('Final rendering did not complete within 60 seconds')
            await new Promise(resolve => setTimeout(resolve, 50))
          }
          const completionAt = performance.now()
          performance.mark('cpu4-render-complete')
          const textAfterCompletion = host.textContent
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          const twoRafsAt = performance.now()
          performance.mark('cpu4-two-rafs')
          await new Promise(resolve => setTimeout(resolve, 1000))
          cancelAnimationFrame(rafId)
          collect(observer.takeRecords())
          observer.disconnect()
          const observedEnd = performance.now()
          performance.mark('cpu4-observation-end')
          const finalFrames = frames.filter(frame => frame.end >= finalStart)
          const finalTasks = longTasks.filter(task => task.startTime + task.duration > finalStart)
          const sorted = finalFrames.map(frame => frame.gap).sort((a, b) => a - b)
          return {
            inputChars: content.length,
            visibleTextBeforeFinal,
            activeWordsBeforeFinal,
            textAtCommit,
            textAfterCompletion,
            finalCompletionMs: completionAt - finalStart,
            remainingWordsAtCommit,
            finalCommitMs: finalCommitAt - finalStart,
            twoRafsAfterFinalMs: twoRafsAt - finalStart,
            finalCallbackGapMaxMs: Math.max(0, ...finalFrames.map(frame => frame.gap)),
            finalRafGapMaxMs: Math.max(0, ...finalFrames.map(frame => frame.rafGap ?? 0)),
            finalCallbackGapP95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
            finalGapsOver33Ms: finalFrames.filter(frame => frame.gap > 33.4).length,
            finalGapsOver50Ms: finalFrames.filter(frame => frame.gap > 50).length,
            finalLongTasks: finalTasks.length,
            finalLongTaskMaxMs: Math.max(0, ...finalTasks.map(task => task.duration)),
            finalLongTaskMs: finalTasks.reduce((sum, task) => sum + task.duration, 0),
            finalBlockingMs: finalTasks.reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0),
            finalElements: host.querySelectorAll('*').length,
            activeAnimationsAfterObservation: host.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length,
            started,
            finalStart,
            finalCommitAt,
            observedEnd,
            frames,
            longTasks,
          }
        }, scenario)
        const after = await metrics()
        const done = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve))
        await cdp.send('Tracing.end')
        await done
        cdp.off('Tracing.dataCollected', onData)
        const mark = events.find(event => event.name === 'cpu4-final')
        const endMark = events.find(event => event.name === 'cpu4-observation-end')
        assert.ok(mark && endMark)
        const traceWindow = events.filter(event => event.pid === mark.pid && event.ph === 'X' && event.ts < endMark.ts && event.ts + (event.dur ?? 0) > mark.ts)
        const trace = Object.fromEntries(['Layout', 'UpdateLayoutTree', 'Paint', 'RasterTask'].map((name) => {
          const matching = traceWindow.filter(event => event.name === name)
          return [name, { count: matching.length, ms: matching.reduce((sum, event) => sum + (event.dur ?? 0), 0) / 1000, maxMs: Math.max(0, ...matching.map(event => (event.dur ?? 0) / 1000)) }]
        }))
        const traceFile = `trace-${scenario.id}-${cpuRate}x-${repeat + 1}.json.gz`
        writeFileSync(path.join(output, traceFile), gzipSync(JSON.stringify({ traceEvents: events })))
        assert.equal(result.textAfterCompletion, reference.expectedText)
        assert.equal(result.remainingWordsAtCommit, 0)
        assert.equal(result.activeAnimationsAfterObservation, 0)
        const row = { scenario: scenario.id, cpuRate, repeat, seedChars: scenario.seed.length, appendedChars: scenario.chunks.join('').length, initialElements: reference.initialElements, finalTextChars: result.textAfterCompletion.length, unseenTextCharsAtFinal: result.textAfterCompletion.length - result.visibleTextBeforeFinal, ...result, trace, traceFile, taskMs: (after.TaskDuration - before.TaskDuration) * 1000 }
        delete row.textAtCommit
        delete row.textAfterCompletion
        runs.push(row)
        writeFileSync(path.join(output, 'runs.partial.json'), JSON.stringify(runs, null, 2))
        console.log(`${scenario.id} ${cpuRate}x #${repeat + 1}: final ${row.finalCommitMs.toFixed(1)}ms; complete ${row.finalCompletionMs.toFixed(1)}ms; max gap ${row.finalCallbackGapMaxMs.toFixed(1)}ms; long tasks ${row.finalLongTasks}/${row.finalLongTaskMaxMs.toFixed(1)}ms; layout ${trace.Layout.ms.toFixed(1)}ms; paint ${trace.Paint.ms.toFixed(1)}ms`)
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
const summaries = scenarios.flatMap(scenario => [1, 4].map((cpuRate) => {
  const rows = runs.filter(row => row.scenario === scenario.id && row.cpuRate === cpuRate)
  return {
    scenario: scenario.id,
    label: scenario.label,
    cpuRate,
    seedChars: scenario.seed.length,
    appendedChars: scenario.chunks.join('').length,
    ...Object.fromEntries(['unseenTextCharsAtFinal', 'activeWordsBeforeFinal', 'finalCommitMs', 'finalCompletionMs', 'twoRafsAfterFinalMs', 'finalCallbackGapMaxMs', 'finalRafGapMaxMs', 'finalCallbackGapP95Ms', 'finalGapsOver33Ms', 'finalGapsOver50Ms', 'finalLongTasks', 'finalLongTaskMaxMs', 'finalBlockingMs', 'finalElements'].map(key => [key, median(rows.map(row => row[key]))])),
    finalCommitRangeMs: [Math.min(...rows.map(row => row.finalCommitMs)), Math.max(...rows.map(row => row.finalCommitMs))],
    worstFinalGapMs: Math.max(...rows.map(row => row.finalCallbackGapMaxMs)),
    runsWithFinalLongTask: rows.filter(row => row.finalLongTasks > 0).length,
    finalLayoutMs: median(rows.map(row => row.trace.Layout.ms)),
    finalPaintMs: median(rows.map(row => row.trace.Paint.ms)),
    finalRasterMs: median(rows.map(row => row.trace.RasterTask.ms)),
  }
}))
writeFileSync(path.join(output, 'results.json'), `${JSON.stringify({ browser: browserVersion, generatedAt: new Date().toISOString(), repeats, viewport: { width: 1100, height: 900 }, cpuRates: [1, 4], sourceHashes, scope: 'Current production build. Emulation.setCPUThrottlingRate applied per run; not a GPU throttle or exact low-end hardware model. 1x/4x alternate order. Same full-render configuration: smoothStreaming=true, fade=true, no virtualization/batching/deferred nodes, parseCoalesceMs=0. Seed and static reference rendered before measurement; GC requested before tracing. One second observed after render completion and two RAF callbacks. Completion is polled every 50ms through the renderer metrics; final-window timing includes all drain frames. Per-frame probes record timestamps only, without DOM scans. Final-window Long Tasks and frame intervals include tasks/intervals that overlap the final marker, even if they started during last input delivery. RAF gaps are a renderer responsiveness proxy, not measured GPU dropped frames. Trace times can overlap; do not sum across categories.', scenarios, summaries, runs, errors }, null, 2)}\n`)
console.log(`Saved ${path.join(output, 'results.json')}`)
