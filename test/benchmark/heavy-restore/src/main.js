import MarkdownRender, { setInfographicLoader, setKatexLoader, setMermaidLoader } from 'markstream-vue'
import { createApp, defineComponent, h, nextTick, onMounted, ref } from 'vue'
import 'markstream-vue/index.css'
import './style.css'

const params = new URLSearchParams(window.location.search)
const disableAutoVirtual = params.get('disableAutoVirtual') === '1'
const tailNodes = Number(params.get('tailNodes') || 72)
const ioEvents = []
const NativeIntersectionObserver = window.IntersectionObserver
if (NativeIntersectionObserver) {
  window.IntersectionObserver = class extends NativeIntersectionObserver {
    constructor(callback, options = {}) {
      const rootMargin = options.rootMargin || '0px'
      super((entries, observer) => {
        for (const entry of entries) {
          if (!entry.target.classList?.contains('node-slot') && ioEvents.length < 1000) {
            ioEvents.push({
              action: 'callback',
              at: performance.now(),
              target: entry.target.className || entry.target.tagName,
              rootMargin,
              top: Math.round(entry.boundingClientRect.top),
              bottom: Math.round(entry.boundingClientRect.bottom),
              isIntersecting: entry.isIntersecting,
              intersectionRatio: entry.intersectionRatio,
            })
          }
        }
        callback(entries, observer)
      }, options)
      this.benchmarkRootMargin = rootMargin
    }

    observe(target) {
      if (!target.classList?.contains('node-slot') && ioEvents.length < 1000) {
        const rect = target.getBoundingClientRect()
        ioEvents.push({
          action: 'observe',
          at: performance.now(),
          target: target.className || target.tagName,
          rootMargin: this.benchmarkRootMargin,
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
        })
      }
      return super.observe(target)
    }
  }
}

const content = ref('')
const renderKey = ref(0)
const scrollRoot = ref(null)

const counters = {
  katexLoader: 0,
  katexRender: 0,
  mermaidLoader: 0,
  mermaidParse: 0,
  mermaidRender: 0,
  infographicLoader: 0,
  infographicConstruct: 0,
  infographicRender: 0,
}

function burnCpu(ms = 6) {
  const end = performance.now() + ms
  let spin = 0
  while (performance.now() < end)
    spin += 1
  return spin
}

function resetCounters() {
  for (const key of Object.keys(counters))
    counters[key] = 0
  ioEvents.length = 0
}

setKatexLoader(() => {
  counters.katexLoader += 1
  burnCpu()
  return {
    renderToString(source) {
      counters.katexRender += 1
      burnCpu()
      return `<span class="katex" data-heavy-katex="1">${source}</span>`
    },
  }
})

setMermaidLoader(() => {
  counters.mermaidLoader += 1
  burnCpu()
  return {
    initialize() {},
    parse() {
      counters.mermaidParse += 1
      burnCpu()
      return true
    },
    async render(id, source) {
      counters.mermaidRender += 1
      burnCpu()
      return {
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="180" data-heavy-mermaid="1" data-source="${encodeURIComponent(source)}"><text x="16" y="32">${id}</text></svg>`,
      }
    },
  }
})

class BenchmarkInfographic {
  constructor({ container }) {
    counters.infographicConstruct += 1
    this.container = container
  }

  render(source) {
    counters.infographicRender += 1
    burnCpu()
    this.container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="180" data-heavy-infographic="1" data-source="${encodeURIComponent(source)}"><text x="16" y="32">infographic-ready</text></svg>`
  }

  destroy() {}
}

setInfographicLoader(() => {
  counters.infographicLoader += 1
  burnCpu()
  return BenchmarkInfographic
})

function waitFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve))
}

async function waitFrames(count) {
  for (let index = 0; index < count; index++)
    await waitFrame()
}

async function waitFor(predicate, timeoutMs = 8000) {
  const startedAt = performance.now()
  while (performance.now() - startedAt < timeoutMs) {
    await nextTick()
    await waitFrame()
    if (predicate())
      return { elapsedMs: performance.now() - startedAt, timedOut: false }
  }
  return { elapsedMs: performance.now() - startedAt, timedOut: true }
}

function getHost() {
  return document.querySelector('.bench-host')
}

function getRenderer() {
  return getHost().querySelector('.markstream-vue')
}

function getHeapUsedBytes() {
  return performance.memory?.usedJSHeapSize || 0
}

function startObservers() {
  const host = getHost()
  const renderer = getRenderer() || host
  const state = {
    startedAt: performance.now(),
    mutations: 0,
    longTasks: [],
    frameIntervals: [],
    heapSamples: [],
    heightSamples: [],
    layoutShifts: [],
  }
  const mutationObserver = new MutationObserver((records) => {
    state.mutations += records.length
  })
  mutationObserver.observe(host, { childList: true, subtree: true, characterData: true, attributes: true })

  const longTaskObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      state.longTasks.push({ duration: entry.duration, startTime: entry.startTime })
  })
  try {
    longTaskObserver.observe({ entryTypes: ['longtask'] })
  }
  catch {}

  const layoutShiftObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput)
        state.layoutShifts.push(entry.value)
    }
  })
  try {
    layoutShiftObserver.observe({ type: 'layout-shift' })
  }
  catch {}

  const pushHeight = (height) => {
    const rounded = Math.round(height * 10) / 10
    if (Number.isFinite(rounded) && state.heightSamples[state.heightSamples.length - 1] !== rounded)
      state.heightSamples.push(rounded)
  }
  pushHeight(renderer.getBoundingClientRect().height)
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries)
      pushHeight(entry.contentRect.height)
  })
  resizeObserver.observe(renderer)

  let frame = 0
  let previousFrameAt = performance.now()
  const sampleFrame = (timestamp) => {
    state.frameIntervals.push(timestamp - previousFrameAt)
    state.heapSamples.push(getHeapUsedBytes())
    previousFrameAt = timestamp
    frame = requestAnimationFrame(sampleFrame)
  }
  frame = requestAnimationFrame(sampleFrame)

  return {
    stop() {
      cancelAnimationFrame(frame)
      state.mutations += mutationObserver.takeRecords().length
      mutationObserver.disconnect()
      for (const entry of longTaskObserver.takeRecords())
        state.longTasks.push({ duration: entry.duration, startTime: entry.startTime })
      longTaskObserver.disconnect()
      layoutShiftObserver.disconnect()
      resizeObserver.disconnect()
      state.elapsedMs = performance.now() - state.startedAt
      return state
    },
  }
}

function summarizeObservers(state) {
  const sortedFrames = state.frameIntervals.filter(value => value > 0).sort((a, b) => a - b)
  const p95Index = Math.max(0, Math.ceil(sortedFrames.length * 0.95) - 1)
  const heightDeltas = state.heightSamples.slice(1).map((height, index) => Math.abs(height - state.heightSamples[index]))
  return {
    elapsedMs: state.elapsedMs,
    mutations: state.mutations,
    longTaskCount: state.longTasks.length,
    longTaskTotalMs: state.longTasks.reduce((total, entry) => total + entry.duration, 0),
    longTaskMaxMs: Math.max(0, ...state.longTasks.map(entry => entry.duration)),
    frameP95Ms: sortedFrames[p95Index] || 0,
    frameMaxMs: Math.max(0, ...sortedFrames),
    droppedFrameEstimate: sortedFrames.reduce((total, value) => total + Math.max(0, Math.floor(value / 16.67) - 1), 0),
    heapPeakMB: Math.max(0, ...state.heapSamples) / 1024 / 1024,
    heightJumpCount: heightDeltas.filter(delta => delta > 24).length,
    heightMaxDeltaPx: Math.max(0, ...heightDeltas),
    cls: state.layoutShifts.reduce((total, value) => total + value, 0),
  }
}

function isVisible(element) {
  if (!element)
    return false
  const rect = element.getBoundingClientRect()
  return rect.bottom > 0 && rect.top < window.innerHeight
}

const heavySelectors = {
  code: '[data-markstream-code-block="1"]',
  image: '.image-node-container',
  math: '[data-markstream-math="block"]',
  mermaid: '[data-markstream-mermaid="1"]',
  infographic: '[data-markstream-infographic="1"]',
}

function getHeavyElement(type) {
  return getHost().querySelector(heavySelectors[type])
}

function getCodeEditorValue(element) {
  let instance = element?.__vueParentComponent
  while (instance) {
    const getEditorView = instance.setupState?.getEditorView
    if (typeof getEditorView === 'function') {
      const value = getEditorView()?.getModel?.()?.getValue?.()
      if (typeof value === 'string')
        return value
    }
    instance = instance.parent
  }
  return ''
}

function getProvidedValue(element, description) {
  let instance = element?.__vueParentComponent
  while (instance) {
    for (const key of Reflect.ownKeys(instance.provides || {})) {
      if (typeof key === 'symbol' && key.description === description)
        return Boolean(instance.provides[key]?.value)
    }
    instance = instance.parent
  }
  return null
}

function unwrapState(value) {
  return value && typeof value === 'object' && 'value' in value ? value.value : value
}

function readState(state, key) {
  return Object.hasOwn(state, key) ? unwrapState(state[key]) : null
}

function getRendererState(element) {
  let instance = element?.__vueParentComponent
  while (instance) {
    if (instance.type?.name === 'NodeRenderer') {
      const state = instance.setupState || {}
      const nodeVisibilityHandles = readState(state, 'nodeVisibilityHandles')
      const parsedNodes = readState(state, 'parsedNodes')
      return {
        requestedFinal: readState(state, 'requestedFinal'),
        effectiveFinal: readState(state, 'effectiveFinal'),
        finalRestoreAutoVirtualEnabled: readState(state, 'finalRestoreAutoVirtualEnabled'),
        viewportPriorityEnabled: readState(state, 'viewportPriorityEnabled'),
        viewportPriorityAutoDisabled: readState(state, 'viewportPriorityAutoDisabled'),
        viewportPriorityMaxTargets: readState(state, 'viewportPriorityMaxTargets'),
        hasObservedNonFinalContent: readState(state, 'hasObservedNonFinalContent'),
        virtualizationEnabled: readState(state, 'virtualizationEnabled'),
        deferNodes: readState(state, 'deferNodes'),
        parsedNodeCount: Array.isArray(parsedNodes) ? parsedNodes.length : null,
        visibilityHandleCount: nodeVisibilityHandles instanceof Map ? nodeVisibilityHandles.size : null,
        mode: readState(state, 'resolvedMode'),
      }
    }
    instance = instance.parent
  }
  return null
}

function snapshot() {
  const host = getHost()
  const heavy = {}
  for (const [type, selector] of Object.entries(heavySelectors)) {
    const element = host.querySelector(selector)
    heavy[type] = {
      mounted: Boolean(element),
      visible: isVisible(element),
      mode: element?.getAttribute('data-markstream-mode') || element?.getAttribute('data-markstream-code-block-state') || '',
      pending: element?.getAttribute('data-markstream-pending') === 'true',
      offscreenDeferral: getProvidedValue(element, 'OffscreenHeavyNodeDeferral'),
      top: element ? Math.round(element.getBoundingClientRect().top) : null,
      distanceFromViewportPx: element ? Math.max(0, Math.round(element.getBoundingClientRect().top - window.innerHeight)) : null,
    }
  }
  heavy.code.enhanced = Boolean(host.querySelector('.stream-diffs-shell, [data-markstream-code-block="1"][data-markstream-enhanced="true"]'))
  heavy.image.enhanced = Boolean(host.querySelector('.image-node__img.has-natural-size'))
  heavy.math.enhanced = Boolean(host.querySelector('[data-markstream-math="block"][data-markstream-mode="katex"]'))
  heavy.mermaid.enhanced = Boolean(host.querySelector('[data-heavy-mermaid="1"]'))
  heavy.infographic.enhanced = Boolean(host.querySelector('[data-heavy-infographic="1"]'))
  return {
    domNodes: host.querySelectorAll('*').length,
    slots: host.querySelectorAll('.node-slot').length,
    nodePlaceholders: host.querySelectorAll('.node-placeholder').length,
    scrollTop: Math.round(scrollRoot.value.scrollTop),
    scrollHeight: Math.round(scrollRoot.value.scrollHeight),
    counters: { ...counters },
    rendererState: getRendererState(host.querySelector('.markstream-vue')),
    ioEvents: ioEvents.slice(),
    heavy,
  }
}

function buildMarkdown() {
  const parts = []
  for (let index = 0; index < 12; index++)
    parts.push(`RESTORE INTRO ${index}: This paragraph intentionally occupies several wrapped lines so every heavy block starts outside the initial viewport while remaining inside the first restored node window. `.repeat(2), '\n\n')
  parts.push('## HEAVY RESTORE ZONE\n\n')
  parts.push('```ts\nconst HEAVY_CODE_READY = true\nconsole.log(HEAVY_CODE_READY)\n```\n\n')
  parts.push('Spacer before image.\n\n')
  parts.push('![HEAVY_IMAGE_READY](/heavy-image.svg)\n\n')
  parts.push('Spacer before math.\n\n')
  parts.push('$$\nHEAVY_MATH_READY = E = mc^2\n$$\n\n')
  parts.push('Spacer before mermaid.\n\n')
  parts.push('```mermaid\ngraph LR\n  HEAVY_MERMAID_READY --> viewport\n```\n\n')
  parts.push('Spacer before infographic.\n\n')
  parts.push('```infographic\ntitle HEAVY_INFOGRAPHIC_READY\ndata 1 2 3\n```\n\n')
  for (let index = 0; index < tailNodes; index++)
    parts.push(`RESTORE TAIL ${index}: persistent history content keeps the final restore above the automatic virtualization threshold.\n\n`)
  parts.push('HEAVY_RESTORE_DOCUMENT_END')
  return parts.join('')
}

const markdown = buildMarkdown()

async function waitObservation(ms) {
  const startedAt = performance.now()
  while (performance.now() - startedAt < ms)
    await waitFrame()
}

window.__runHeavyRestoreInitial = async ({ observationMs }) => {
  content.value = ''
  renderKey.value += 1
  scrollRoot.value.scrollTop = 0
  resetCounters()
  await nextTick()
  await waitFrames(2)
  const observers = startObservers()
  const startedAt = performance.now()
  content.value = markdown
  await nextTick()
  await waitFrames(2)
  const firstSnapshot = snapshot()
  await waitObservation(observationMs)
  const settledSnapshot = snapshot()
  const observerState = observers.stop()
  return {
    totalMs: performance.now() - startedAt,
    sourceChars: markdown.length,
    sourceMatches: content.value === markdown,
    firstSnapshot,
    settledSnapshot,
    observers: summarizeObservers(observerState),
  }
}

function enhancementReady(type) {
  const host = getHost()
  if (type === 'code')
    return Boolean(host.querySelector('.stream-diffs-shell, [data-markstream-code-block="1"][data-markstream-enhanced="true"]'))
  if (type === 'image')
    return Boolean(host.querySelector('.image-node__img.has-natural-size'))
  if (type === 'math')
    return Boolean(host.querySelector('[data-markstream-math="block"][data-markstream-mode="katex"]'))
  if (type === 'mermaid')
    return Boolean(host.querySelector('[data-heavy-mermaid="1"]'))
  return Boolean(host.querySelector('[data-heavy-infographic="1"]'))
}

function targetCorrect(type) {
  const host = getHost()
  if (type === 'code')
    return getCodeEditorValue(getHeavyElement(type)).includes('HEAVY_CODE_READY')
  if (type === 'image')
    return Boolean(host.querySelector('img[alt="HEAVY_IMAGE_READY"].has-natural-size'))
  if (type === 'math')
    return host.querySelector('[data-heavy-katex="1"]')?.textContent?.includes('HEAVY_MATH_READY') === true
  if (type === 'mermaid') {
    const source = host.querySelector('[data-heavy-mermaid="1"]')?.getAttribute('data-source')
    return source != null && decodeURIComponent(source).includes('HEAVY_MERMAID_READY')
  }
  const source = host.querySelector('[data-heavy-infographic="1"]')?.getAttribute('data-source')
  return source != null && decodeURIComponent(source).includes('HEAVY_INFOGRAPHIC_READY')
}

window.__runHeavyRestoreDeep = async ({ timeoutMs, strict = true }) => {
  const observers = startObservers()
  const startedAt = performance.now()
  const targets = []
  for (const type of Object.keys(heavySelectors)) {
    let element = getHeavyElement(type)
    if (!element) {
      scrollRoot.value.scrollTop = Math.round(scrollRoot.value.scrollHeight * 0.35)
      scrollRoot.value.dispatchEvent(new Event('scroll'))
      await waitFrames(4)
      element = getHeavyElement(type)
    }
    if (!element)
      throw new Error(`Heavy restore target is not mounted: ${type}`)
    element.scrollIntoView({ block: 'center' })
    scrollRoot.value.dispatchEvent(new Event('scroll'))
    await waitFrames(3)
    const result = await waitFor(() => enhancementReady(type) && targetCorrect(type), timeoutMs)
    targets.push({ type, ...result, enhanced: enhancementReady(type), correct: targetCorrect(type) })
  }
  await waitFrames(4)
  const finalSnapshot = snapshot()
  const observerState = observers.stop()
  const correctness = {
    sourceMatches: content.value === markdown,
    ...Object.fromEntries(targets.map(target => [target.type, target.correct])),
  }
  const enhancementPassed = targets.every(target => target.enhanced && !target.timedOut)
  const correctnessPassed = Object.values(correctness).every(Boolean)
  if (strict && !enhancementPassed)
    throw new Error(`Heavy restore enhancement timed out: ${JSON.stringify(targets)}`)
  if (strict && !correctnessPassed)
    throw new Error(`Heavy restore correctness failed: ${JSON.stringify({ correctness, targets })}`)
  return {
    totalMs: performance.now() - startedAt,
    targets,
    finalSnapshot,
    correctness,
    enhancementPassed,
    correctnessPassed,
    observers: summarizeObservers(observerState),
  }
}

const App = defineComponent({
  setup() {
    onMounted(() => {
      scrollRoot.value = document.scrollingElement
      window.__ready = true
    })
    return () => h('main', { class: 'bench-shell' }, [
      h('section', { class: 'bench-scroll' }, [
        h('div', { class: 'bench-host' }, [
          h(MarkdownRender, {
            key: renderKey.value,
            content: content.value,
            final: true,
            mode: 'chat',
            smoothStreaming: false,
            ...(disableAutoVirtual ? { maxLiveNodes: 0 } : {}),
            codeRenderer: 'stream-diffs',
            viewportPriorityOptions: {
              rootMargin: '0px',
              heavyBlockMargin: '0px',
            },
          }),
        ]),
      ]),
    ])
  },
})

createApp(App).mount('#app')
