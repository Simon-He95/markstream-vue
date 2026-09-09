import MarkdownRender from 'markstream-vue'
import { createApp, h, nextTick, ref } from 'vue'
import InlineCodeNode from '../../../src/components/InlineCodeNode/InlineCodeNode.vue'
import TextNode from '../../../src/components/TextNode/TextNode.vue'
import 'markstream-vue/index.css'
import './style.css'

const params = new URLSearchParams(location.search)
const content = ref('')
const final = ref(false)
const fade = ref(params.get('fade') !== 'false')
const probe = params.get('probe')
const host = document.getElementById('app')
const deltaSelector = '.text-node-stream-delta, .inline-code-stream-delta'
const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
createApp({
  setup: () => () => probe
    ? h(probe === 'code' ? InlineCodeNode : TextNode, { node: { type: probe === 'code' ? 'inline_code' : 'text', content: content.value, code: content.value, raw: content.value }, fade: fade.value })
    : h(MarkdownRender, {
        content: content.value,
        final: final.value,
        fade: fade.value,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
        maxLiveNodes: 0,
        parseCoalesceMs: 0,
      }),
}).mount(host)

window.setContent = async (value) => {
  content.value = value
  await nextTick()
}
window.reset = async (seed = '', enabled = true) => {
  fade.value = false
  final.value = false
  await window.setContent(seed)
  await frame()
  fade.value = enabled
  await nextTick()
}
window.runStream = async ({ seed, chunks, intervalMs, enabled = true, visual = false, prepared = false }) => {
  if (!prepared)
    await window.reset(seed, enabled)
  const frames = []
  const longTasks = []
  let previousFrame
  let frameId
  let peakDeltas = 0
  let peakPerNode = 0
  let peakElements = 0
  const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration)))
  observer.observe({ type: 'longtask' })
  function sample(now) {
    if (previousFrame != null)
      frames.push(now - previousFrame)
    previousFrame = now
    frameId = requestAnimationFrame(sample)
  }
  frameId = requestAnimationFrame(sample)
  const started = performance.now()
  for (let index = 0; index < chunks.length; index++) {
    const delay = started + index * intervalMs - performance.now()
    if (delay > 0)
      await wait(delay)
    content.value += chunks[index]
    await nextTick()
    peakDeltas = Math.max(peakDeltas, host.querySelectorAll(deltaSelector).length)
    peakElements = Math.max(peakElements, host.querySelectorAll('*').length)
    const counts = new Map()
    for (const delta of host.querySelectorAll(deltaSelector)) {
      const count = (counts.get(delta.parentElement) || 0) + 1
      counts.set(delta.parentElement, count)
      peakPerNode = Math.max(peakPerNode, count)
    }
    if (visual)
      window.scrollTo(0, document.body.scrollHeight)
  }
  const deliveryMs = performance.now() - started
  final.value = true
  await nextTick()
  await wait(400)
  await frame()
  cancelAnimationFrame(frameId)
  observer.disconnect()
  const sorted = frames.toSorted((a, b) => a - b)
  return {
    deliveryMs,
    elapsedMs: performance.now() - started,
    frameP95Ms: sorted[Math.floor(sorted.length * 0.95)] || 0,
    frameMaxMs: Math.max(0, ...frames),
    framesOver25Ms: frames.filter(value => value > 25).length,
    longTasks: longTasks.length,
    longTaskMs: longTasks.reduce((a, b) => a + b, 0),
    peakDeltas,
    peakPerNode,
    peakElements,
    remainingDeltas: host.querySelectorAll(deltaSelector).length,
    textLength: host.textContent.length,
    renderedText: host.textContent,
    complete: content.value === seed + chunks.join(''),
  }
}
window.addEventListener('message', async (event) => {
  if (event.origin !== location.origin || event.data?.type !== 'play-fade')
    return
  await window.runStream({ ...event.data.scenario, visual: true })
  window.parent.postMessage({ type: 'fade-done' }, location.origin)
})
window.ready = true
