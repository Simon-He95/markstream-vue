const $ = selector => document.querySelector(selector)
const controls = Object.fromEntries(['duration', 'opacity', 'ease', 'interval', 'chunk'].map(id => [id, $(`#${id}`)]))
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
    smoothStreaming: $('#pacing').checked,
  }
}

function applySettings() {
  const value = settings()
  $('#duration-value').textContent = `${value.durationMs}ms`
  $('#opacity-value').textContent = `${Math.round(value.initialOpacity * 100)}%`
  $('#interval-value').textContent = `${controls.interval.value}ms`
  $('#chunk-value').textContent = `${controls.chunk.value} 字`
  $('#candidate-label').textContent = `${value.durationMs}ms · ${Math.round(value.initialOpacity * 100)}% · 按词淡入`
  $('#config').textContent = JSON.stringify({ preview: value, css: { '--stream-update-fade-duration': `${value.durationMs}ms`, '--stream-update-fade-ease': value.easing } }, null, 2)
  if (!loaded)
    return
  const win = after.contentWindow
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
    await Promise.all(windows.map(async (win) => {
      await win.setPacing($('#pacing').checked)
      await win.reset(seed)
    }))
    if (id !== runId)
      return
    applySettings()
    $('#before-finish').textContent = '正在接收流式输入…'
    $('#after-finish').textContent = '正在接收流式输入…'
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
      if (index < chars.length)
        await delay(Number(controls.interval.value))
    }
    const endedAt = performance.now()
    const finished = [false, false]
    const labels = [$('#before-finish'), $('#after-finish')]
    const recordCompletion = (win, index) => {
      if (!finished[index] && win.isSettled()) {
        finished[index] = true
        labels[index].textContent = `收到结束信号 → 全文补齐：${Math.round(performance.now() - endedAt)}ms（页面实测）`
        win.scrollTo(0, win.document.body.scrollHeight)
      }
    }
    await Promise.all(windows.map(async (win, index) => {
      labels[index].textContent = '已收到结束信号，等待补齐…'
      await win.finishStream()
      if (id === runId)
        recordCompletion(win, index)
    }))
    $('#status').textContent = finished[1] ? 'text_end 已发送：新版已补齐，不再等待 fade。' : 'text_end 已发送：fade 已停止，正在补齐剩余内容。'
    while (finished.some(value => !value)) {
      if (id !== runId)
        return
      windows.forEach(recordCompletion)
      await delay(16)
    }
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
$('#pacing').addEventListener('change', play)
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
  ['current', { duration: 200, opacity: 0, ease: 'cubic-bezier(0.2, 0, 0.4, 1)' }],
  ['codex', { duration: 700, opacity: 0, ease: 'cubic-bezier(0.37, 0.55, 0.86, 0.88)' }],
  ['soft', { duration: 220, opacity: 10, ease: 'cubic-bezier(0.2, 0, 0.4, 1)' }],
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
  const section = '这是同一份流式输入，左侧是旧版，右侧是新版。可以观察 **重点文字**、`inline code` 和普通文本的出现方式。\n\n- 输出过程中，新词逐渐变清晰。\n- 收到结束信号后，新版停止淡入。\n\n'
  const ending = '\n\n**全文接收完成。**'
  let sample = '# 1000 字符流式对比\n\n'
  while (sample.length + section.length + ending.length <= 1000)
    sample += section
  sample += '剩余文字会在结束时补齐，不会为了淡入动画继续等待。'.repeat(40).slice(0, 1000 - sample.length - ending.length) + ending
  scenarios.push({ id: 'sample-1000', seed: '', chunks: sample.match(/[\s\S]{1,10}/g), intervalMs: 50 })
  const selected = new URLSearchParams(location.search).get('scenario')
  if (selected && scenarios.some(scenario => scenario.id === selected)) {
    $('#scenario').value = selected
    $('#loop').checked = false
  }
  const finishReport = await fetch('/finish-results.json').then(response => response.json())
  const scenarioNames = { 'dense': '密集输入', 'burst': '突发输入', 'large-end': '大包后立即结束' }
  const variantNames = { legacy: '旧版 4 批', drain: '分词 · 延迟收尾', finish: '分词 · 立即完成', off: '关闭 fade' }
  for (const row of finishReport.summaries) {
    const tr = document.createElement('tr')
    for (const value of [scenarioNames[row.scenario], variantNames[row.variant], row.taskMs.toFixed(1), row.paintMs.toFixed(1), row.finishDelayMs.toFixed(1)]) {
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
