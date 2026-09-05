import MarkdownRender, { setCustomComponents } from 'markstream-vue'
import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Streamdown } from 'streamdown'
import { createApp, defineComponent, h, nextTick, onMounted, ref } from 'vue'
import CssHighlightCodeBlock from '../../../../src/components/CodeBlockNode/CssHighlightCodeBlock.vue'
import 'markstream-vue/index.css'
import 'streamdown/styles.css'
import './style.css'

const params = new URLSearchParams(window.location.search)
const renderer = params.get('renderer') || 'markstream'
const variant = params.get('variant') || 'incremental'
const cssHighlightVariant = variant === 'css-highlight-local' || variant === 'css-highlight-worker'
const smoothStreamingOptions = {
  maxCharsPerSecond: Number(params.get('smoothMaxCps') || 3000),
  maxCharsPerCommit: Number(params.get('smoothMaxChars') || 160),
  maxCommitFps: Number(params.get('smoothMaxFps') || 20),
}

const semanticTags = ['h1', 'h2', 'h3', 'p', 'ul', 'li', 'table', 'tr', 'th', 'td', 'pre', 'code', 'blockquote']

function countElements(root) {
  const tags = ['h1', 'h2', 'h3', 'p', 'ul', 'li', 'table', 'tr', 'th', 'td', 'pre', 'code', 'blockquote', 'svg', 'button']
  return Object.fromEntries(tags.map(tag => [tag, root.querySelectorAll(tag).length]))
}

function normalizeText(value) {
  return value.replace(/\u200B/g, '').replace(/\s+/g, ' ').trim()
}

function waitFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve))
}

async function waitForStableRoot(root, stableFrames = 4, timeoutMs = 30000) {
  let mutations = 0
  let stable = 0
  let previousMutations = 0
  const observer = new MutationObserver((records) => {
    mutations += records.length
  })
  observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true })
  const startedAt = performance.now()

  while (performance.now() - startedAt < timeoutMs) {
    await waitFrame()
    mutations += observer.takeRecords().length
    if (mutations === previousMutations)
      stable += 1
    else
      stable = 0
    previousMutations = mutations
    if (stable >= stableFrames) {
      observer.disconnect()
      return
    }
  }

  observer.disconnect()
  throw new Error(`Static correctness renderer did not settle within ${timeoutMs}ms`)
}

function correctnessSnapshot(root) {
  return {
    text: normalizeText(root.textContent || ''),
    semanticCounts: Object.fromEntries(semanticTags.map(tag => [tag, root.querySelectorAll(tag).length])),
  }
}

function assertCorrectnessSnapshot(actual, expected) {
  if (actual.text !== expected.text) {
    let firstDifference = 0
    while (firstDifference < actual.text.length
      && firstDifference < expected.text.length
      && actual.text[firstDifference] === expected.text[firstDifference]) {
      firstDifference++
    }
    throw new Error([
      'Final rendered text differs from a static final render.',
      `streamed length=${actual.text.length}, static length=${expected.text.length}`,
      `first difference at ${firstDifference}: streamed=${JSON.stringify(actual.text.slice(Math.max(0, firstDifference - 80), firstDifference + 120))}`,
      `first difference at ${firstDifference}: static=${JSON.stringify(expected.text.slice(Math.max(0, firstDifference - 80), firstDifference + 120))}`,
      `streamed tail=${JSON.stringify(actual.text.slice(-240))}`,
      `static tail=${JSON.stringify(expected.text.slice(-240))}`,
    ].join('\n'))
  }

  for (const tag of semanticTags) {
    if (actual.semanticCounts[tag] !== expected.semanticCounts[tag])
      throw new Error(`Final <${tag}> count differs: streamed=${actual.semanticCounts[tag]}, static=${expected.semanticCounts[tag]}`)
  }
}

function percentile(values, ratio) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  if (!sorted.length)
    return 0
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]
}

function readHeapUsedBytes() {
  return performance.memory?.usedJSHeapSize || 0
}

function installBenchmark({ getContent, setContent, getFinal, setFinal, renderExpected }) {
  window.__runBenchmark = async ({ chunks, intervalMs, endMarker, timeoutMs, stableFrames }) => {
    if (window.__benchmarkUnavailableReason)
      throw new Error(window.__benchmarkUnavailableReason)
    const root = document.querySelector('.bench-host')
    await setFinal(false)
    setContent('')
    await nextTick()
    await waitFrame()

    const updateDurations = []
    const streamingUpdateDurations = []
    const heightSamples = []
    const frameIntervals = []
    const heapSamples = []
    let longTaskCount = 0
    let longTaskTotalMs = 0
    const longTasks = []
    let mutationCount = 0
    let frameSampling = true
    let previousFrameAt = 0
    const observer = new MutationObserver((records) => {
      mutationCount += records.length
    })
    observer.observe(root, { childList: true, subtree: true, characterData: true })
    const perfObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTaskCount += 1
        longTaskTotalMs += entry.duration
        longTasks.push({ startTime: entry.startTime, duration: entry.duration })
      }
    })
    try {
      perfObserver.observe({ entryTypes: ['longtask'] })
    }
    catch {}

    const sampleFrame = (timestamp) => {
      if (previousFrameAt)
        frameIntervals.push(timestamp - previousFrameAt)
      previousFrameAt = timestamp
      heapSamples.push(readHeapUsedBytes())
      if (frameSampling)
        requestAnimationFrame(sampleFrame)
    }
    requestAnimationFrame(sampleFrame)

    // Reset the optional CSS Highlight probe before transport starts. A
    // renderer must not tokenize or touch CSS.highlights while loading.
    window.__markstreamCssHighlightMetrics = undefined
    const start = performance.now()
    for (const chunk of chunks) {
      const updateStart = performance.now()
      await setContent(getContent() + chunk)
      await nextTick()
      const updateMs = performance.now() - updateStart
      updateDurations.push(updateMs)
      streamingUpdateDurations.push(updateMs)
      heightSamples.push(root.scrollHeight)
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }

    const expectedContent = `${chunks.join('')}\n\n${endMarker}\n`
    const lastChunkCommittedAt = performance.now()
    const cssHighlightAtTransport = window.__markstreamCssHighlightMetrics
      ? { ...window.__markstreamCssHighlightMetrics }
      : null
    const markerUpdateStart = lastChunkCommittedAt
    await setContent(expectedContent)
    await nextTick()
    updateDurations.push(performance.now() - markerUpdateStart)
    heightSamples.push(root.scrollHeight)
    await setFinal(true)
    await nextTick()
    const transportEnd = performance.now()
    mutationCount += observer.takeRecords().length
    const mutationsAtTransportEnd = mutationCount

    let markerSeenAt = 0
    let mutationsAtMarker = 0
    let stableFrameCount = 0
    let previousMutationCount = mutationCount
    while (performance.now() - transportEnd < timeoutMs) {
      await waitFrame()
      mutationCount += observer.takeRecords().length
      heapSamples.push(readHeapUsedBytes())
      const markerVisible = (root.textContent || '').includes(endMarker)
      if (markerVisible && !markerSeenAt)
        markerSeenAt = performance.now()
      if (markerSeenAt && !mutationsAtMarker)
        mutationsAtMarker = mutationCount

      if (markerSeenAt && getFinal() && mutationCount === previousMutationCount)
        stableFrameCount += 1
      else
        stableFrameCount = 0
      previousMutationCount = mutationCount

      if (markerSeenAt && getFinal() && stableFrameCount >= stableFrames)
        break
    }

    if (!markerSeenAt)
      throw new Error(`Smooth renderer did not reach end marker within ${timeoutMs}ms`)
    if (!getFinal())
      throw new Error('Renderer final state was not committed')
    if (stableFrameCount < stableFrames)
      throw new Error(`Renderer did not remain mutation-stable for ${stableFrames} frames within ${timeoutMs}ms`)
    if (getContent() !== expectedContent)
      throw new Error(`Source content mismatch: actual=${getContent().length}, expected=${expectedContent.length}`)

    const completedAt = performance.now()
    const totalMs = completedAt - start
    const sorted = updateDurations.slice().sort((a, b) => a - b)
    const heightJumps = heightSamples.reduce((count, value, index, array) => {
      return index > 0 && Math.abs(value - array[index - 1]) > 24 ? count + 1 : count
    }, 0)
    mutationCount += observer.takeRecords().length
    observer.disconnect()
    for (const entry of perfObserver.takeRecords()) {
      longTaskCount += 1
      longTaskTotalMs += entry.duration
      longTasks.push({ startTime: entry.startTime, duration: entry.duration })
    }
    perfObserver.disconnect()
    frameSampling = false

    const targetSnapshot = correctnessSnapshot(root)
    if (!targetSnapshot.text.includes(endMarker))
      throw new Error('End marker is missing from the final rendered text')

    const frameP95Ms = percentile(frameIntervals, 0.95)
    const frameMaxMs = Math.max(0, ...frameIntervals)
    const droppedFrameEstimate = frameIntervals.reduce((total, duration) => {
      return total + Math.max(0, Math.floor(duration / 16.67) - 1)
    }, 0)
    const summarizePhase = (from, to, mutationStart, mutationEnd) => {
      const phaseLongTasks = longTasks.filter(entry => entry.startTime >= from && entry.startTime < to)
      return {
        elapsedMs: to - from,
        longTaskCount: phaseLongTasks.length,
        longTaskTotalMs: phaseLongTasks.reduce((total, entry) => total + entry.duration, 0),
        mutations: Math.max(0, mutationEnd - mutationStart),
      }
    }

    const rawCssHighlight = window.__markstreamCssHighlightMetrics || null
    const cssHighlight = rawCssHighlight
      ? {
          ...rawCssHighlight,
          firstEnhancedAt: rawCssHighlight.firstEnhancedAt == null ? null : rawCssHighlight.firstEnhancedAt - start,
          lastDisposedAt: rawCssHighlight.lastDisposedAt == null ? null : rawCssHighlight.lastDisposedAt - start,
          streamingTokenizeCalls: cssHighlightAtTransport?.tokenizeCalls ?? 0,
          streamingRegistryMs: cssHighlightAtTransport?.registryMs ?? 0,
        }
      : null
    const streamP95 = percentile(streamingUpdateDurations, 0.95)
    return {
      chunks: chunks.length + 1,
      transportChunks: chunks.length,
      contentChars: expectedContent.length,
      totalMs,
      transportMs: transportEnd - start,
      caughtUpMs: markerSeenAt - transportEnd,
      settleMs: completedAt - markerSeenAt,
      phases: {
        transport: summarizePhase(start, transportEnd, 0, mutationsAtTransportEnd),
        catchUp: summarizePhase(transportEnd, markerSeenAt, mutationsAtTransportEnd, mutationsAtMarker),
        settle: summarizePhase(markerSeenAt, completedAt, mutationsAtMarker, mutationCount),
      },
      stableFrames: stableFrameCount,
      finalCommitted: getFinal(),
      endMarkerVisible: true,
      p95UpdateMs: sorted[Math.floor(sorted.length * 0.95)] || 0,
      maxUpdateMs: Math.max(...updateDurations),
      avgUpdateMs: updateDurations.reduce((sum, value) => sum + value, 0) / updateDurations.length,
      streaming: {
        chunkCount: streamingUpdateDurations.length,
        avgCommitMs: streamingUpdateDurations.reduce((sum, value) => sum + value, 0) / streamingUpdateDurations.length,
        p95CommitMs: streamP95,
        maxCommitMs: Math.max(...streamingUpdateDurations),
        busyRatio: streamingUpdateDurations.reduce((sum, value) => sum + value, 0) / Math.max(1, transportEnd - start),
      },
      cssHighlight,
      longTaskCount,
      longTaskTotalMs,
      longTaskMaxMs: Math.max(0, ...longTasks.map(entry => entry.duration)),
      longTaskTimeline: longTasks.map(entry => ({
        startMs: entry.startTime - start,
        durationMs: entry.duration,
      })),
      markerSeenMs: markerSeenAt - start,
      mutationCount,
      domNodes: root.querySelectorAll('*').length,
      elementCounts: countElements(root),
      heightJumps,
      frameP95Ms,
      frameMaxMs,
      droppedFrameEstimate,
      heapPeakMB: Math.max(0, ...heapSamples) / 1024 / 1024,
      targetSnapshot,
    }
  }

  window.__verifyBenchmarkResult = async ({ expectedContent, targetSnapshot, timeoutMs, stableFrames }) => {
    if (getContent() !== expectedContent)
      throw new Error('Benchmark source changed before correctness verification')
    const expectedRoot = await renderExpected(expectedContent)
    await waitForStableRoot(expectedRoot, stableFrames, timeoutMs)
    const expectedSnapshot = correctnessSnapshot(expectedRoot)
    assertCorrectnessSnapshot(targetSnapshot, expectedSnapshot)
    return {
      textChars: targetSnapshot.text.length,
      semanticCounts: targetSnapshot.semanticCounts,
    }
  }
}

const StreamdownApp = defineComponent({
  setup() {
    const content = ref('')
    const final = ref(false)
    onMounted(() => {
      const host = document.querySelector('.react-host')
      const expectedHost = document.querySelector('.react-oracle-host')
      const reactRoot = createRoot(host)
      const expectedReactRoot = createRoot(expectedHost)
      const render = () => {
        reactRoot.render(React.createElement(Streamdown, {
          animated: true,
          isAnimating: !final.value,
          mode: final.value ? 'static' : 'streaming',
          lineNumbers: false,
        }, content.value))
      }
      render()
      installBenchmark({
        getContent: () => content.value,
        setContent: (value) => {
          content.value = value
          flushSync(render)
        },
        getFinal: () => final.value,
        setFinal: (value) => {
          final.value = value
          flushSync(render)
        },
        renderExpected: async (value) => {
          flushSync(() => {
            expectedReactRoot.render(React.createElement(Streamdown, {
              animated: false,
              isAnimating: false,
              mode: 'static',
              lineNumbers: false,
            }, value))
          })
          return expectedHost
        },
      })
      window.__ready = true
    })
    return () => h('main', { class: 'bench-shell' }, [
      h('section', { class: 'bench-host react-host' }),
      h('section', { class: 'bench-oracle react-oracle-host' }),
    ])
  },
})

const MarkstreamApp = defineComponent({
  setup() {
    const content = ref('')
    const final = ref(false)
    const expectedContent = ref('')
    const customId = cssHighlightVariant ? 'benchmark-css-highlight' : undefined
    if (variant === 'css-highlight-worker') {
      window.__benchmarkUnavailableReason = 'CSS Highlight worker tokenizer is not implemented; provide a pure transferable tokenizer before collecting this row.'
    }
    else if (cssHighlightVariant) {
      setCustomComponents(customId, { code_block: CssHighlightCodeBlock })
    }
    installBenchmark({
      getContent: () => content.value,
      setContent: (value) => {
        content.value = value
      },
      getFinal: () => final.value,
      setFinal: (value) => {
        final.value = value
      },
      renderExpected: async (value) => {
        expectedContent.value = value
        await nextTick()
        return document.querySelector('.vue-oracle-host')
      },
    })
    onMounted(() => {
      window.__ready = true
    })
    return () => h('main', { class: 'bench-shell' }, [
      h('section', { class: 'bench-host vue-host' }, [
        h(MarkdownRender, {
          content: content.value,
          mode: 'chat',
          final: final.value,
          maxLiveNodes: variant === 'window' ? 64 : 0,
          batchRendering: true,
          renderBatchSize: 16,
          smoothStreaming: variant === 'incremental-nosmooth' || variant === 'window' ? false : 'auto',
          smoothStreamingOptions,
          parseCoalesceMs: 32,
          renderCodeBlocksAsPre: true,
          customId,
        }),
      ]),
      h('section', { class: 'bench-oracle vue-oracle-host' }, [
        h(MarkdownRender, {
          content: expectedContent.value,
          mode: 'chat',
          final: true,
          maxLiveNodes: variant === 'window' ? 64 : 0,
          batchRendering: true,
          renderBatchSize: 16,
          smoothStreaming: false,
          parseCoalesceMs: 32,
          renderCodeBlocksAsPre: true,
          customId,
        }),
      ]),
    ])
  },
})

createApp(renderer === 'streamdown' ? StreamdownApp : MarkstreamApp).mount('#app')
