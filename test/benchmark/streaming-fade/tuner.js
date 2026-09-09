const $ = selector => document.querySelector(selector)
const controls = Object.fromEntries(['duration', 'opacity', 'batch', 'ease', 'interval', 'chunk'].map(id => [id, $(`#${id}`)]))
const before = $('#before')
const after = $('#after')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let scenarios
let seed = ''
let runId = 0
let playing = false
let loaded = false

function settings() {
  return {
    durationMs: Number(controls.duration.value),
    initialOpacity: Number(controls.opacity.value) / 100,
    easing: controls.ease.value,
    batchWindowMs: Number(controls.batch.value),
    maxBatches: 4,
  }
}

function applySettings() {
  const value = settings()
  $('#duration-value').textContent = `${value.durationMs}ms`
  $('#opacity-value').textContent = `${Math.round(value.initialOpacity * 100)}%`
  $('#batch-value').textContent = `${value.batchWindowMs}ms`
  $('#interval-value').textContent = `${controls.interval.value}ms`
  $('#chunk-value').textContent = `${controls.chunk.value} 字`
  $('#candidate-label').textContent = `${value.durationMs}ms · ${Math.round(value.initialOpacity * 100)}% · 合批 ${value.batchWindowMs}ms`
  $('#batch-note').textContent = value.durationMs > value.batchWindowMs * 4 ? '当前时长较长，密集输入达到 4 批后会更多地合并到最新批次。' : ''
  $('#config').textContent = JSON.stringify({ preview: value, css: { '--stream-update-fade-duration': `${value.durationMs}ms`, '--stream-update-fade-ease': value.easing } }, null, 2)
  if (!loaded)
    return
  const win = after.contentWindow
  win.__fadeDebugBatchWindowMs = value.batchWindowMs
  const style = win.document.documentElement.style
  style.setProperty('--lab-duration', `${value.durationMs}ms`)
  style.setProperty('--lab-opacity', String(value.initialOpacity))
  style.setProperty('--lab-ease', value.easing)
}

async function play() {
  if (!loaded)
    return
  const id = ++runId
  playing = true
  const windows = [before.contentWindow, after.contentWindow]
  do {
    if (id !== runId)
      return
    const chars = Array.from($('#text').value)
    let content = seed
    await Promise.all(windows.map(win => win.reset(seed)))
    if (id !== runId)
      return
    applySettings()
    for (let index = 0; index < chars.length;) {
      if (id !== runId)
        return
      const size = Number(controls.chunk.value)
      content += chars.slice(index, index + size).join('')
      index = Math.min(chars.length, index + size)
      await Promise.all(windows.map(win => win.setContent(content)))
      if (id !== runId)
        return
      for (const win of windows)
        win.scrollTo(0, win.document.body.scrollHeight)
      $('#status').textContent = `同步播放 · ${index} / ${chars.length} 字 · 拖动上方滑块可实时调整右侧`
      await delay(Number(controls.interval.value))
    }
    await delay(Math.max(280, settings().durationMs) + 300)
    if (id !== runId)
      return
    $('#status').textContent = $('#loop').checked ? '本轮完成，即将循环…' : '本轮完成，可以继续调参或重播'
    if ($('#loop').checked)
      await delay(500)
  } while ($('#loop').checked)
  if (id === runId)
    playing = false
}

function selectScenario() {
  const scenario = scenarios.find(item => item.id === $('#scenario').value)
  seed = scenario.seed
  $('#text').value = scenario.chunks.join('')
  controls.interval.value = String(scenario.intervalMs)
  controls.chunk.value = String(Array.from(scenario.chunks[0]).length)
  applySettings()
}

for (const input of Object.values(controls))
  input.addEventListener('input', applySettings)
$('#play').addEventListener('click', play)
$('#stop').addEventListener('click', () => {
  runId++
  playing = false
  $('#status').textContent = '已停止出字，正在播放的淡入会自然结束'
})
$('#scenario').addEventListener('change', () => {
  selectScenario()
  play()
})
$('#text').addEventListener('change', play)
$('#loop').addEventListener('change', () => {
  if ($('#loop').checked && !playing)
    play()
})
for (const [id, value] of [
  ['current', { duration: 200, opacity: 0, batch: 50, ease: 'cubic-bezier(0.2, 0, 0.4, 1)' }],
  ['soft', { duration: 220, opacity: 10, batch: 60, ease: 'cubic-bezier(0.2, 0, 0.4, 1)' }],
]) {
  $(`#${id}`).addEventListener('click', () => {
    for (const [key, setting] of Object.entries(value))
      controls[key].value = String(setting)
    applySettings()
    play()
  })
}
$('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#config').textContent)
    $('#copy').textContent = '已复制'
    setTimeout(() => {
      $('#copy').textContent = '复制参数'
    }, 1800)
  }
  catch {
    $('details').open = true
    $('#status').textContent = '浏览器未允许复制，请在下方参数区手动复制'
  }
})

async function waitForFrame(frame) {
  while (!frame.contentWindow.ready)
    await delay(50)
}

async function init() {
  applySettings()
  const response = await fetch('/results.json')
  if (!response.ok)
    throw new Error('无法加载原始对比数据，请先运行 benchmark-streaming-fade.mjs')
  const report = await response.json()
  scenarios = report.scenarios
  for (const row of report.summaries) {
    const tr = document.createElement('tr')
    for (const value of [row.scenario, row.variant, row.taskMs.toFixed(1), row.frameP95Ms.toFixed(1), row.peakDeltas]) {
      const td = document.createElement('td')
      td.textContent = String(value)
      tr.append(td)
    }
    $('#perf').append(tr)
  }
  await Promise.all([waitForFrame(before), waitForFrame(after)])
  const style = after.contentDocument.createElement('style')
  style.textContent = `
    .text-node-stream-delta, .inline-code-stream-delta {
      animation-name: fade-lab-reveal !important;
      animation-duration: var(--lab-duration) !important;
      animation-timing-function: var(--lab-ease) !important;
    }
    @keyframes fade-lab-reveal { from { opacity: var(--lab-opacity); } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) {
      .text-node-stream-delta, .inline-code-stream-delta { animation-duration: 0s !important; }
    }
  `
  after.contentDocument.head.append(style)
  loaded = true
  $('#play').disabled = false
  selectScenario()
  await play()
}
init().catch((error) => {
  $('#status').textContent = error.message
})
