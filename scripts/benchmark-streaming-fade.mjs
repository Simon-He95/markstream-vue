import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import vue from '@vitejs/plugin-vue'
import { chromium } from 'playwright-core'
import { build, preview } from 'vite'

const root = process.cwd()
const output = path.join(root, '.tmp/fade-comparison')
const baselineRef = execFileSync('git', ['rev-parse', process.env.FADE_BASELINE_REF || '52b774767e2f038283bd64a908f34b94588a6301'], { encoding: 'utf8' }).trim()
const repeats = Number(process.env.FADE_REPEATS || 3)
const baselineFiles = ['TextNode', 'InlineCodeNode'].map(name => [`src/components/${name}/${name}.vue`, execFileSync('git', ['show', `${baselineRef}:src/components/${name}/${name}.vue`], { encoding: 'utf8' })])
const aliases = [
  { find: 'markstream-vue/index.css', replacement: path.join(root, 'src/index.css') },
  { find: 'markstream-vue', replacement: path.join(root, 'src/exports.ts') },
  { find: 'markstream-core', replacement: path.join(root, 'packages/markstream-core/src/index.ts') },
  { find: 'stream-markdown-parser', replacement: path.join(root, 'packages/markdown-parser/src/index.ts') },
]
mkdirSync(output, { recursive: true })
for (const variant of ['before', 'after']) {
  await build({
    configFile: false,
    root: path.join(root, 'test/benchmark/streaming-fade'),
    base: `/${variant}/`,
    logLevel: 'error',
    plugins: [
      ...(variant === 'before' ? [{ name: 'baseline-fade', enforce: 'pre', load(id) { return baselineFiles.find(([file]) => id === path.join(root, file))?.[1] } }] : []),
      vue(),
    ],
    resolve: { alias: aliases },
    build: { outDir: path.join(output, variant), emptyOutDir: true },
  })
}
console.log('Built before/after production fixtures.')
const sentence = '流式文字应该自然地接续出现，已经出现的内容保持稳定，新内容轻轻显现。'
const history = `# 已有对话\n\n${'这是一段已经完成的历史消息，包含 **重点** 和 `code`。\n\n'.repeat(60)}## 正在回复\n\n`
const scenarios = [
  { id: 'regular', label: '参考节奏 · 2 字 / 50ms', seed: '流式输出：', chunks: Array.from({ length: 100 }, (_, index) => sentence.repeat(6).slice(index * 2, index * 2 + 2)), intervalMs: 50 },
  { id: 'slow', label: '慢速 · 1 字 / 300ms', seed: '慢速输出：', chunks: Array.from(sentence.slice(0, 16)), intervalMs: 300 },
  { id: 'fast', label: '快速 · 4 字 / 16ms', seed: '快速输出：', chunks: Array.from({ length: 160 }, (_, index) => sentence.repeat(24).slice(index * 4, index * 4 + 4)), intervalMs: 16 },
  { id: 'burst', label: `突发 · ${sentence.length * 4} 字 / 200ms`, seed: '突发输出：', chunks: Array.from({ length: 16 }, () => sentence.repeat(4)), intervalMs: 200 },
  { id: 'history', label: '长历史 · 60 段 + 快速追加', seed: history, chunks: Array.from({ length: 100 }, () => '继续输出'), intervalMs: 16 },
]
const server = await preview({ configFile: false, root, logLevel: 'error', build: { outDir: output }, preview: { host: '127.0.0.1', port: 4199, strictPort: true } })
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const browserVersion = browser.version()
const results = []
const errors = []
const visualSamples = []
const checks = []
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  page.on('pageerror', error => errors.push(error.message))
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]))
  for (const variant of ['before', 'after']) {
    for (const probe of ['text', 'code']) {
      await page.goto(`http://127.0.0.1:4199/${variant}/?probe=${probe}`)
      await page.waitForFunction(() => window.ready)
      const samples = await page.evaluate(async () => {
        const samples = []
        for (const age of [0, 50, 100, 200, 400]) {
          await window.reset('初始')
          await window.setContent('初始甲')
          const delta = document.querySelector('[class$="stream-delta"], .text-node-stream-delta, .inline-code-stream-delta')
          const animation = delta.getAnimations()[0]
          animation.pause()
          animation.currentTime = age
          const before = Number(getComputedStyle(delta).opacity)
          await window.setContent('初始甲乙')
          const parent = document.querySelector('.text-node, .inline-code')
          const containing = [...parent.children].find(child => child.textContent.includes('甲'))
          samples.push({ ageMs: age, before, after: Number(getComputedStyle(containing).opacity), sameAnimation: containing.getAnimations().includes(animation), durationMs: animation.effect.getTiming().duration, easing: getComputedStyle(delta).animationTimingFunction })
        }
        return samples
      })
      visualSamples.push({ variant, probe, samples })
      if (variant === 'after') {
        for (const sample of samples) {
          assert.equal(sample.sameAnimation, true)
          assert.equal(sample.durationMs, 200)
          assert.equal(sample.easing, 'cubic-bezier(0.2, 0, 0.4, 1)')
          if (sample.ageMs === 0)
            assert.equal(sample.before, 0)
          assert.ok(Math.abs(sample.before - sample.after) < 0.001)
        }
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.evaluate(async () => {
          await window.reset('base')
          await window.setContent('base appended')
        })
        await page.waitForFunction(() => !document.querySelector('.text-node-stream-delta, .inline-code-stream-delta'))
        checks.push(`${probe}: reduced motion settles`)
        await page.emulateMedia({ reducedMotion: 'no-preference' })
      }
    }
  }
  await page.goto('http://127.0.0.1:4199/after/?probe=text')
  await page.waitForFunction(() => window.ready)
  const selectionResult = await page.evaluate(async () => {
    await window.reset('base')
    await window.setContent('base tail')
    const delta = document.querySelector('.text-node-stream-delta')
    const text = delta.firstChild
    const selection = window.getSelection()
    const range = document.createRange()
    range.setStart(text, 1)
    range.setEnd(text, 4)
    selection.removeAllRanges()
    selection.addRange(range)
    await window.setContent('base tail more')
    await new Promise(resolve => setTimeout(resolve, 250))
    const preserved = selection.toString() === 'tai' && text.isConnected
    selection.removeAllRanges()
    document.dispatchEvent(new Event('selectionchange'))
    await new Promise(resolve => setTimeout(resolve, 250))
    return { preserved, text: document.getElementById('app').textContent, deltas: document.querySelectorAll('.text-node-stream-delta').length }
  })
  assert.deepEqual(selectionResult, { preserved: true, text: 'base tail more', deltas: 0 })
  checks.push('text selection survives append and natural animation completion; release catches up')
  await page.goto('http://127.0.0.1:4199/after/')
  await page.waitForFunction(() => window.ready)
  const mixedContent = '## 标题\n\n**重点**与 `inlineCode` 和 [链接](https://example.com)\n\n- 列表项'
  const mixedScenario = { seed: '', chunks: Array.from(mixedContent), intervalMs: 8 }
  const mixedFade = await page.evaluate(scenario => window.runStream(scenario), mixedScenario)
  const mixedStatic = await page.evaluate(scenario => window.runStream(scenario), { ...mixedScenario, enabled: false })
  assert.equal(mixedFade.renderedText, mixedStatic.renderedText)
  assert.equal(mixedFade.remainingDeltas, 0)
  assert.ok(mixedFade.peakDeltas > 0)
  checks.push('streamed heading, strong, inline code, link and list match fade=false after completion')
  // Warm up each production bundle before paired runs.
  for (const variant of ['before', 'after']) {
    await page.goto(`http://127.0.0.1:4199/${variant}/`)
    await page.waitForFunction(() => window.ready)
    await page.evaluate(scenario => window.runStream(scenario), { ...scenarios[2], chunks: scenarios[2].chunks.slice(0, 12) })
  }
  for (const scenario of scenarios) {
    for (let repeat = 0; repeat < repeats; repeat++) {
      const variants = repeat % 2 ? ['after', 'before', 'off'] : ['before', 'after', 'off']
      for (const variant of variants) {
        await page.goto(`http://127.0.0.1:4199/${variant === 'off' ? 'after' : variant}/`)
        await page.waitForFunction(() => window.ready)
        await page.evaluate(({ seed, enabled }) => window.reset(seed, enabled), { seed: scenario.seed, enabled: variant !== 'off' })
        await cdp.send('HeapProfiler.collectGarbage')
        const before = await metrics()
        const result = await page.evaluate(scenario => window.runStream(scenario), { ...scenario, enabled: variant !== 'off', prepared: true })
        const after = await metrics()
        await cdp.send('HeapProfiler.collectGarbage')
        const collected = await metrics()
        assert.equal(result.complete, true)
        assert.equal(result.remainingDeltas, 0)
        if (variant === 'after')
          assert.ok(result.peakPerNode <= 4)
        results.push({
          scenario: scenario.id,
          variant,
          repeat,
          ...result,
          taskMs: (after.TaskDuration - before.TaskDuration) * 1000,
          scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
          layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
          styleMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000,
          heapAfterGcKB: collected.JSHeapUsedSize / 1024,
          heapGrowthAfterGcKB: (collected.JSHeapUsedSize - before.JSHeapUsedSize) / 1024,
        })
        console.log(`${scenario.id} ${variant} ${repeat + 1}/${repeats}: ${results.at(-1).taskMs.toFixed(1)}ms task, peak ${result.peakDeltas} spans, frame p95 ${result.frameP95Ms.toFixed(1)}ms`)
      }
    }
  }
  for (const scenario of scenarios) {
    const expected = results.find(row => row.scenario === scenario.id && row.variant === 'off').renderedText
    for (const row of results.filter(row => row.scenario === scenario.id))
      assert.equal(row.renderedText, expected)
  }
  assert.deepEqual(errors, [])
}
finally {
  await browser.close()
  await new Promise(resolve => server.httpServer.close(resolve))
}
const median = values => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]
const summaries = scenarios.flatMap(scenario => ['before', 'after', 'off'].map((variant) => {
  const rows = results.filter(row => row.scenario === scenario.id && row.variant === variant)
  return { scenario: scenario.id, variant, ...Object.fromEntries(['taskMs', 'scriptMs', 'layoutMs', 'styleMs', 'frameP95Ms', 'frameMaxMs', 'framesOver25Ms', 'peakDeltas', 'peakPerNode', 'peakElements', 'heapAfterGcKB', 'heapGrowthAfterGcKB', 'longTasks', 'deliveryMs'].map(key => [key, median(rows.map(row => row[key]))])) }
}))
const report = { baselineRef, repeats, generatedAt: new Date().toISOString(), browser: `${browserVersion}, ${process.platform}/${process.arch}, headless, production builds, 1100×800, no CPU throttling`, fade: { durationMs: 200, initialOpacity: 0, easing: 'cubic-bezier(0.2, 0, 0.4, 1)', batchWindowMs: 50, maxBatches: 4 }, scope: 'Only TextNode and InlineCodeNode differ; raw stream, smoothStreaming=false. CDP TaskDuration includes browser work and identical fixture instrumentation, not GPU time. Heap values are post-GC retained JS heap, not peak memory.', scenarios, summaries, results, visualSamples, checks }
writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2))
const table = summaries.map(row => `| ${row.scenario} | ${row.variant} | ${row.taskMs.toFixed(1)} | ${row.scriptMs.toFixed(1)} | ${row.layoutMs.toFixed(1)} | ${row.styleMs.toFixed(1)} | ${row.frameP95Ms.toFixed(1)} | ${row.peakDeltas} | ${row.heapAfterGcKB.toFixed(0)} |`).join('\n')
writeFileSync(path.join(output, 'results.md'), `# Streaming fade comparison\n\nBaseline: ${baselineRef}. ${repeats} alternating repetitions; median. ${report.browser}.\n\n${report.scope}\n\n| Scenario | Variant | Main thread ms | Script ms | Layout ms | Style ms | Frame p95 ms | Peak fade spans | Retained JS KB |\n|---|---|---:|---:|---:|---:|---:|---:|---:|\n${table}\n\nFunctional checks: bounded per-node batches, natural fade completion, reduced motion, exact input delivery, and no browser errors.\n`)
const tableHtml = summaries.map(row => `<tr><td>${row.scenario}</td><td>${row.variant}</td><td>${row.taskMs.toFixed(1)}</td><td>${row.frameP95Ms.toFixed(1)}</td><td>${row.peakDeltas}</td><td>${row.heapAfterGcKB.toFixed(0)}</td></tr>`).join('')
writeFileSync(path.join(output, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fade · Before / After</title><style>body{margin:32px;background:#f2f3ef;color:#202723;font:16px/1.6 system-ui}h1{font-size:30px;margin-bottom:6px}p{max-width:1000px}button,select{font:inherit;padding:8px 14px;margin-right:12px;border:1px solid #c2c8be;background:white;border-radius:6px}button{cursor:pointer;background:#234f37;color:white}main{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:24px 0}article{background:white;border:1px solid #d5dbd2;border-radius:8px;overflow:hidden}h2{font-size:16px;padding:12px 24px;margin:0;border-bottom:1px solid #e1e6df}iframe{border:0;width:100%;height:410px}table{border-collapse:collapse;background:white;width:100%;max-width:1100px;font-variant-numeric:tabular-nums}td,th{text-align:left;padding:8px 16px;border-bottom:1px solid #e1e6df}.note{font-size:13px;color:#566154}</style><h1>流式 Fade · 前后对照</h1><p>旧版：280ms 从透明开始，更新时提前结束上一批。新版：200ms 从透明开始，cubic-bezier(0.2, 0, 0.4, 1)，50ms 内合批，每个文字节点最多 4 批，旧动画自然结束。</p><select id="scenario">${scenarios.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}</select><button id="play">同步播放</button><span id="status">选择场景，比较同一份输入</span><main><article><h2>Before · 当前旧版</h2><iframe id="before" src="/before/"></iframe></article><article><h2>After · 有界批次淡入</h2><iframe id="after" src="/after/"></iframe></article></main><h2>Performance · 独立运行 ${repeats} 次的中位数</h2><p class="note">生产构建 / Headless Chrome / 1100 × 800 / 无 CPU 降速。主线程时间为整段测试的 CDP TaskDuration；不是每帧时间，不包含 GPU。关闭 smoothStreaming 以隔离 fade。off 为新版关闭 fade。下方性能来自独立运行，不是双栏同时播放。</p><table><thead><tr><th>场景</th><th>版本</th><th>主线程 ms</th><th>帧间隔 p95 ms</th><th>峰值动画 span</th><th>GC 后 JS KB</th></tr></thead><tbody>${tableHtml}</tbody></table><p class="note">完整原始数据：<a href="results.json">results.json</a> · <a href="results.md">Markdown 报告</a></p><script>const scenarios=${JSON.stringify(scenarios)};let done=0;document.querySelector('#play').onclick=()=>{done=0;document.querySelector('#play').disabled=true;document.querySelector('#status').textContent='播放中…';const scenario=scenarios.find(s=>s.id===document.querySelector('#scenario').value);for(const id of ['before','after'])document.getElementById(id).contentWindow.postMessage({type:'play-fade',scenario},location.origin)};addEventListener('message',e=>{if(e.origin===location.origin&&e.data?.type==='fade-done'&&++done===2){document.querySelector('#play').disabled=false;document.querySelector('#status').textContent='完成，可切换场景重播'}})</script></html>`)
console.log(`Report: ${path.join(output, 'index.html')}`)
