<script setup lang="ts">
import type { ParsedNode } from 'stream-markdown-parser'
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MarkdownRender from '../../../src/components/NodeRenderer'
import {
  buildBlockTextProfile,
  clearHeightEstimationExperiment,
  createEmptySimpleTextProbeProfile,
  estimateCodeBlockHeight,
  estimateSimpleTextBlockHeight,
  getHeightEstimationRendererController,
  resetHeightEstimationExperimentCaches,
  setHeightEstimationExperiment,
} from '../../../src/internal/heightEstimationExperiment'
import { removeCustomComponents } from '../../../src/utils/nodeComponents'

type SourceMode = 'nodes' | 'content'

interface TrialSnapshot {
  baseline: number | null
  experiment: number | null
}

interface EstimatorBenchmarkResult {
  mode: 'all' | 'skip-measured-simple-text'
  width: number
  passes: number[]
  coldPassMs: number | null
  warmAverageMs: number | null
  warmMinMs: number | null
  warmMaxMs: number | null
  nodeCount: number
  measuredNodeCount: number
  skippedMeasuredSimpleTextCount: number
  estimableCount: number
  simpleNodeCount: number
  codeBlockCount: number
}

const baselineId = 'height-estimation-baseline'
const experimentId = 'height-estimation-experiment'
const referenceId = 'height-estimation-reference'

const sourceMode = ref<SourceMode>('nodes')
const paneWidthPx = ref(520)
const loadingPhase = ref(false)
const isDark = ref(false)
const isBusy = ref(false)
const lastRestoreTrial = ref<Record<string, TrialSnapshot> | null>(null)
const lastLoadingTrial = ref<Record<string, number | null> | null>(null)
const lastResizeTrial = ref<Array<{ width: number, baseline: number | null, experiment: number | null }> | null>(null)
const baselinePaneRef = ref<HTMLElement | null>(null)
const experimentPaneRef = ref<HTMLElement | null>(null)
const referencePaneRef = ref<HTMLElement | null>(null)

const md = getMarkdown('height-estimation-experiment')

function buildLargeTranscriptMarkdown() {
  const blocks: string[] = [
    '# Height Estimation Experiment',
    'This transcript is intentionally text-heavy so we can compare baseline virtualization against experimental estimated heights during history restore.',
  ]

  for (let i = 1; i <= 1040; i++) {
    if (i % 70 === 0) {
      blocks.push(`## Section ${i / 70}`)
      continue
    }

    if (i % 63 === 0) {
      blocks.push([
        '```ts',
        `export function chunk${i}(input: string) {`,
        `  const lines = input.split(/\\r?\\n/)`,
        `  return lines.map((line, index) => ({ index, value: line.trim(), block: ${i} }))`,
        '}',
        '',
        `for (const item of chunk${i}('alpha\\nbeta\\ngamma')) {`,
        '  console.log(item.index, item.value)',
        '}',
        '```',
      ].join('\n'))
      continue
    }

    if (i % 41 === 0) {
      blocks.push([
        '- Probe list item with mostly plain text so Pretext can estimate it.',
        '- Another list item that keeps the inline structure simple and predictable.',
        '- Final list item used to verify list wrapper overhead in the experiment.',
      ].join('\n'))
      continue
    }

    if (i % 29 === 0) {
      blocks.push(`Paragraph ${i} mixes [links](https://example.com/${i}) with **strong text** and \`inline code\` so the text estimator should intentionally skip it.`)
      continue
    }

    blocks.push(`Paragraph ${i} keeps the structure intentionally simple for the estimator. It contains plain text, wrapped whitespace, and enough words to create multiple lines when the pane width changes from 375 to 1280 pixels.`)
  }

  return blocks.join('\n\n')
}

const transcriptMarkdown = ref(buildLargeTranscriptMarkdown())

function decorateNodesForExperimentState(nodes: ParsedNode[], loading: boolean) {
  return nodes.map((node) => {
    if (!node || typeof node !== 'object')
      return node
    if (node.type === 'code_block')
      return { ...(node as any), loading } as ParsedNode
    if (node.type === 'list') {
      return {
        ...(node as any),
        items: Array.isArray((node as any).items)
          ? decorateNodesForExperimentState((node as any).items as ParsedNode[], loading)
          : [],
      } as ParsedNode
    }
    if (Array.isArray((node as any).children)) {
      return {
        ...(node as any),
        children: decorateNodesForExperimentState((node as any).children as ParsedNode[], loading),
      } as ParsedNode
    }
    return { ...(node as any) } as ParsedNode
  })
}

const parsedFinalNodes = computed(() => parseMarkdownToStructure(transcriptMarkdown.value, md, { final: true }))
const renderNodes = computed(() => decorateNodesForExperimentState(parsedFinalNodes.value, loadingPhase.value))

const rendererCommonProps = computed(() => ({
  final: true,
  isDark: isDark.value,
  codeBlockStream: false,
  viewportPriority: false,
  maxLiveNodes: 280,
  liveNodeBuffer: 48,
}))

const referenceRendererProps = computed(() => ({
  final: true,
  isDark: isDark.value,
  codeBlockStream: false,
  viewportPriority: false,
  maxLiveNodes: 0,
  batchRendering: false,
}))

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function waitFrame() {
  return new Promise<void>((resolve) => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      resolve()
      return
    }
    window.requestAnimationFrame(() => resolve())
  })
}

async function waitFrames(count = 2) {
  for (let i = 0; i < count; i++)
    await waitFrame()
}

function getController(id: string) {
  return getHeightEstimationRendererController(id)
}

function getCodeBlockSnapshot(container: HTMLElement | null, nodeIndex?: number | null) {
  if (!container)
    return null
  const selector = typeof nodeIndex === 'number'
    ? `[data-node-index="${nodeIndex}"] .code-block-container`
    : '[data-node-type="code_block"] .code-block-container'
  const block = container.querySelector(selector) as HTMLElement | null
  if (!block)
    return null
  const slot = block.closest('[data-node-index]') as HTMLElement | null
  const rawIndex = slot?.dataset.nodeIndex
  const parsedIndex = rawIndex == null ? Number.NaN : Number.parseInt(rawIndex, 10)
  return {
    nodeIndex: Number.isFinite(parsedIndex) ? parsedIndex : null,
    height: Math.round(block.getBoundingClientRect().height),
  }
}

function getProbeWrapper(container: HTMLElement | null, name: string) {
  return container?.querySelector(`.height-estimation-probes [data-probe="${name}"]`) as HTMLElement | null
}

function getProbeRoot(wrapper: HTMLElement | null | undefined) {
  return wrapper?.firstElementChild as HTMLElement | null
}

function getProbeElement(root: HTMLElement | null | undefined, selector: string) {
  if (!root)
    return null
  if (root.matches?.(selector))
    return root
  return root.querySelector(selector) as HTMLElement | null
}

function buildBenchmarkSimpleTextProfile() {
  const nextProfile = createEmptySimpleTextProbeProfile()
  const container = experimentPaneRef.value
  if (!container)
    return nextProfile

  const paragraphWrapper = getProbeWrapper(container, 'paragraph')
  const paragraphRoot = getProbeRoot(paragraphWrapper)
  const paragraphTextEl = getProbeElement(paragraphRoot, '.paragraph-node')
  nextProfile.paragraph = buildBlockTextProfile(paragraphWrapper, paragraphTextEl, 'pre-wrap')

  const listItemWrapper = getProbeWrapper(container, 'list-item')
  const listItemRoot = getProbeRoot(listItemWrapper)
  const listItemTextEl = getProbeElement(listItemRoot, '.paragraph-node')
  nextProfile.listItem = buildBlockTextProfile(listItemWrapper, listItemTextEl, 'pre-wrap')

  const listWrapper = getProbeWrapper(container, 'list')
  const listHeight = listWrapper?.offsetHeight ?? 0
  const listItemHeight = listItemWrapper?.offsetHeight ?? 0
  nextProfile.listWrapperOverhead = Math.max(0, listHeight - listItemHeight)

  for (let level = 1; level <= 6; level++) {
    const headingWrapper = getProbeWrapper(container, `heading-${level}`)
    const headingRoot = getProbeRoot(headingWrapper)
    const headingTextEl = getProbeElement(headingRoot, `h${level}`)
    nextProfile.headings[level] = buildBlockTextProfile(headingWrapper, headingTextEl, 'pre-wrap')
  }

  return nextProfile
}

async function runEstimatorBenchmark(options?: {
  width?: number
  passes?: number
  resetCachesBeforeFirstPass?: boolean
  mode?: 'all' | 'skip-measured-simple-text'
}) {
  const targetWidth = Math.max(320, Math.round(options?.width ?? paneWidthPx.value))
  const passCount = Math.max(1, Math.round(options?.passes ?? 5))
  const mode = options?.mode ?? 'all'

  if (paneWidthPx.value !== targetWidth)
    paneWidthPx.value = targetWidth

  const current = await waitUntilReady()
  const profile = buildBenchmarkSimpleTextProfile()
  const nodes = renderNodes.value
  const passes: number[] = []
  const measuredIndexes = new Set<number>(
    mode === 'skip-measured-simple-text'
      ? (current.experiment?.nodes ?? [])
          .filter(node => typeof node.measuredHeight === 'number' && node.measuredHeight > 0)
          .map(node => node.index)
      : [],
  )
  let estimableCount = 0
  let simpleNodeCount = 0
  let codeBlockCount = 0
  let skippedMeasuredSimpleTextCount = 0

  if (options?.resetCachesBeforeFirstPass !== false)
    resetHeightEstimationExperimentCaches()

  for (let pass = 0; pass < passCount; pass++) {
    let nextEstimableCount = 0
    let nextSimpleNodeCount = 0
    let nextCodeBlockCount = 0
    let nextSkippedMeasuredSimpleTextCount = 0
    const startedAt = performance.now()

    for (const [index, node] of nodes.entries()) {
      const shouldSkipSimpleText = measuredIndexes.has(index)
      if (!shouldSkipSimpleText) {
        const estimatedText = estimateSimpleTextBlockHeight(node, targetWidth, profile)
        if (estimatedText) {
          nextEstimableCount++
          nextSimpleNodeCount++
          continue
        }
      }
      else if (
        node.type === 'paragraph'
        || node.type === 'heading'
        || node.type === 'list'
        || node.type === 'list_item'
      ) {
        nextSkippedMeasuredSimpleTextCount++
      }

      if (node.type !== 'code_block')
        continue

      const estimatedCode = estimateCodeBlockHeight(node, {
        rendererKind: 'stream-diffs',
        showHeader: true,
      })
      if (!estimatedCode)
        continue
      nextEstimableCount++
      nextCodeBlockCount++
    }

    passes.push(performance.now() - startedAt)
    estimableCount = nextEstimableCount
    simpleNodeCount = nextSimpleNodeCount
    codeBlockCount = nextCodeBlockCount
    skippedMeasuredSimpleTextCount = nextSkippedMeasuredSimpleTextCount
  }

  const warmPasses = passes.slice(1)
  return {
    mode,
    width: targetWidth,
    passes,
    coldPassMs: passes[0] ?? null,
    warmAverageMs: warmPasses.length ? warmPasses.reduce((total, value) => total + value, 0) / warmPasses.length : null,
    warmMinMs: warmPasses.length ? Math.min(...warmPasses) : null,
    warmMaxMs: warmPasses.length ? Math.max(...warmPasses) : null,
    nodeCount: nodes.length,
    measuredNodeCount: measuredIndexes.size,
    skippedMeasuredSimpleTextCount,
    estimableCount,
    simpleNodeCount,
    codeBlockCount,
  } satisfies EstimatorBenchmarkResult
}

function percentile(values: number[], ratio: number) {
  if (!values.length)
    return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))
  return sorted[index]
}

function median(values: number[]) {
  return percentile(values, 0.5)
}

const reports = ref<{
  baseline: ReturnType<NonNullable<ReturnType<typeof getController>>['getReport']> | null
  experiment: ReturnType<NonNullable<ReturnType<typeof getController>>['getReport']> | null
  reference: ReturnType<NonNullable<ReturnType<typeof getController>>['getReport']> | null
}>({
  baseline: null,
  experiment: null,
  reference: null,
})

function collectReportsNow() {
  reports.value = {
    baseline: getController(baselineId)?.getReport() ?? null,
    experiment: getController(experimentId)?.getReport() ?? null,
    reference: getController(referenceId)?.getReport() ?? null,
  }
  return reports.value
}

async function refreshReports() {
  await nextTick()
  await waitFrames(2)
  return collectReportsNow()
}

const comparisonSummary = computed(() => {
  const baseline = reports.value.baseline
  const experiment = reports.value.experiment
  const reference = reports.value.reference
  if (!baseline || !experiment || !reference)
    return null

  const actualTotalHeight = reference.estimatedTotalHeight
  const baselineError = Math.abs(baseline.estimatedTotalHeight - actualTotalHeight)
  const experimentError = Math.abs(experiment.estimatedTotalHeight - actualTotalHeight)
  const improvement = baselineError > 0 ? ((baselineError - experimentError) / baselineError) * 100 : 0

  const referenceByIndex = new Map(reference.nodes.map(node => [node.index, node]))
  const simpleEligibleTypes = new Set(['paragraph', 'heading', 'list', 'list_item'])
  const eligibleSimpleNodes = reference.nodes.filter(node => simpleEligibleTypes.has(node.type))
  const simpleErrors: number[] = []
  let overEstimateCount = 0
  let underEstimateCount = 0

  for (const node of experiment.nodes) {
    if (node.estimateKind !== 'simple-text' || node.estimatedHeight == null)
      continue
    const actual = referenceByIndex.get(node.index)?.measuredHeight
    if (!actual || actual <= 0)
      continue
    const delta = node.estimatedHeight - actual
    if (delta > 0)
      overEstimateCount++
    else if (delta < 0)
      underEstimateCount++
    simpleErrors.push(Math.abs(delta) / actual)
  }

  const codeErrors: number[] = []
  for (const node of experiment.nodes) {
    if (node.estimateKind !== 'code-block' || node.estimatedHeight == null)
      continue
    const actual = referenceByIndex.get(node.index)?.measuredHeight
    if (!actual || actual <= 0)
      continue
    codeErrors.push(Math.abs(node.estimatedHeight - actual) / actual)
  }

  return {
    actualTotalHeight,
    baselineError,
    experimentError,
    improvement,
    simpleCoverage: eligibleSimpleNodes.length > 0 ? (simpleErrors.length / eligibleSimpleNodes.length) * 100 : 0,
    simpleMedianError: median(simpleErrors.map(value => value * 100)),
    simpleP90Error: percentile(simpleErrors.map(value => value * 100), 0.9),
    simpleOverEstimateCount: overEstimateCount,
    simpleUnderEstimateCount: underEstimateCount,
    codeMedianError: median(codeErrors.map(value => value * 100)),
    codeP90Error: percentile(codeErrors.map(value => value * 100), 0.9),
  }
})

async function waitUntilReady(timeoutMs = 45000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const current = await refreshReports()
    const referenceCodeBlocks = current.reference?.nodes.filter(node => node.type === 'code_block') ?? []
    const referenceCodeBlocksReady = referenceCodeBlocks.every(node => typeof node.measuredHeight === 'number' && node.measuredHeight > 0)
    const widthsAligned = current.baseline
      && current.experiment
      && current.reference
      && Math.abs(current.baseline.width - current.reference.width) <= 2
      && Math.abs(current.experiment.width - current.reference.width) <= 2
    if (
      current.baseline
      && current.experiment
      && current.reference
      && current.reference.totalNodes >= 1000
      && current.reference.measuredCount > 0
      && referenceCodeBlocksReady
      && widthsAligned
    ) {
      return current
    }
    await wait(120)
  }
  throw new Error('Timed out waiting for height estimation experiment to become ready.')
}

async function scrollAllTo(offset: number) {
  for (const pane of [baselinePaneRef.value, experimentPaneRef.value, referencePaneRef.value]) {
    if (pane)
      pane.scrollTop = offset
  }
  await waitFrames(2)
}

async function runRestoreTrial() {
  isBusy.value = true
  try {
    await waitUntilReady()
    const reference = getController(referenceId)
    const baseline = getController(baselineId)
    const experiment = getController(experimentId)
    if (!reference || !baseline || !experiment)
      throw new Error('Renderer controllers are not ready.')

    const report = reference.getReport()
    const targetOffset = Math.max(0, report.estimatedTotalHeight * 0.55)
    await scrollAllTo(targetOffset)
    const anchor = reference.captureRestoreAnchor()
    if (!anchor)
      throw new Error('Failed to capture restore anchor.')

    await scrollAllTo(0)
    baseline.restoreAnchor(anchor)
    experiment.restoreAnchor(anchor)
    await waitFrames(2)

    const snapshots: Record<string, TrialSnapshot> = {
      t0: {
        baseline: baseline.getAnchorDrift(anchor),
        experiment: experiment.getAnchorDrift(anchor),
      },
      t200: { baseline: null, experiment: null },
      t500: { baseline: null, experiment: null },
    }

    await wait(200)
    snapshots.t200 = {
      baseline: baseline.getAnchorDrift(anchor),
      experiment: experiment.getAnchorDrift(anchor),
    }
    await wait(300)
    snapshots.t500 = {
      baseline: baseline.getAnchorDrift(anchor),
      experiment: experiment.getAnchorDrift(anchor),
    }
    lastRestoreTrial.value = snapshots
    await refreshReports()
    return snapshots
  }
  finally {
    isBusy.value = false
  }
}

async function runLoadingReadyTrial() {
  if (sourceMode.value !== 'nodes')
    return null

  isBusy.value = true
  try {
    await scrollAllTo(0)
    loadingPhase.value = true
    await waitUntilReady()
    const before = {
      baseline: getCodeBlockSnapshot(baselinePaneRef.value),
      experiment: getCodeBlockSnapshot(experimentPaneRef.value),
    }
    loadingPhase.value = false
    await waitUntilReady()
    await wait(250)
    const after = {
      baseline: getCodeBlockSnapshot(baselinePaneRef.value, before.baseline?.nodeIndex),
      experiment: getCodeBlockSnapshot(experimentPaneRef.value, before.experiment?.nodeIndex),
    }
    const result = {
      baseline: before.baseline != null && after.baseline != null ? after.baseline.height - before.baseline.height : null,
      experiment: before.experiment != null && after.experiment != null ? after.experiment.height - before.experiment.height : null,
    }
    lastLoadingTrial.value = result
    return result
  }
  finally {
    isBusy.value = false
  }
}

async function runResizeTrial(widths = [375, 768, 1280]) {
  isBusy.value = true
  try {
    let baseline = getController(baselineId)
    let experiment = getController(experimentId)
    let reference = getController(referenceId)
    if (!baseline || !experiment || !reference)
      throw new Error('Renderer controllers are not ready.')
    await waitUntilReady()
    const report = reference.getReport()
    await scrollAllTo(Math.max(0, report.estimatedTotalHeight * 0.4))
    const anchor = reference.captureRestoreAnchor()
    if (!anchor)
      throw new Error('Failed to capture resize anchor.')

    const results: Array<{ width: number, baseline: number | null, experiment: number | null }> = []
    for (const width of widths) {
      paneWidthPx.value = width
      await waitUntilReady()
      baseline = getController(baselineId)
      experiment = getController(experimentId)
      reference = getController(referenceId)
      if (!baseline || !experiment || !reference)
        throw new Error('Renderer controllers are not ready after resize.')
      baseline.restoreAnchor(anchor)
      experiment.restoreAnchor(anchor)
      await wait(320)
      results.push({
        width,
        baseline: baseline.getAnchorDrift(anchor),
        experiment: experiment.getAnchorDrift(anchor),
      })
    }
    lastResizeTrial.value = results
    return results
  }
  finally {
    isBusy.value = false
  }
}

watch(
  [sourceMode, loadingPhase, paneWidthPx, isDark],
  async () => {
    await refreshReports()
  },
  { immediate: true },
)

watch(
  sourceMode,
  (mode) => {
    if (mode === 'content')
      loadingPhase.value = false
  },
)

onMounted(() => {
  setHeightEstimationExperiment(experimentId, {
    enabled: true,
    textEstimation: true,
    codeBlockEstimation: true,
    restore: true,
    diagnostics: true,
  })

  const api = {
    waitUntilReady,
    refreshReports,
    runRestoreTrial,
    runLoadingReadyTrial,
    runResizeTrial,
    runEstimatorBenchmark,
    setSourceMode: async (mode: SourceMode) => {
      sourceMode.value = mode
      await refreshReports()
    },
    setPaneWidth: async (width: number) => {
      paneWidthPx.value = width
      await refreshReports()
    },
    setLoadingPhase: async (value: boolean) => {
      loadingPhase.value = value
      await refreshReports()
    },
    getReports: () => reports.value,
    getSummary: () => comparisonSummary.value,
  }

  ;(window as any).__heightEstimationExperiment = api
})

onBeforeUnmount(() => {
  if ((window as any).__heightEstimationExperiment)
    delete (window as any).__heightEstimationExperiment
  clearHeightEstimationExperiment(experimentId)
  for (const id of [baselineId, experimentId, referenceId])
    removeCustomComponents(id)
})
</script>

<template>
  <div class="height-experiment-page">
    <header class="experiment-header">
      <div>
        <p class="eyebrow">
          Experimental restore harness
        </p>
        <h1>Height Estimation Experiment</h1>
        <p class="subtitle">
          Baseline vs estimated fallback on the same long transcript. Reference renderer stays offscreen with full rendering so we can compare against measured truth.
        </p>
      </div>
      <div class="control-grid">
        <label>
          <span>Source</span>
          <select v-model="sourceMode">
            <option value="nodes">nodes + final</option>
            <option value="content">content</option>
          </select>
        </label>
        <label>
          <span>Pane Width</span>
          <input v-model.number="paneWidthPx" type="number" min="320" max="1400" step="1">
        </label>
        <label class="toggle">
          <input v-model="isDark" type="checkbox">
          <span>Dark</span>
        </label>
        <label class="toggle">
          <input v-model="loadingPhase" type="checkbox" :disabled="sourceMode !== 'nodes'">
          <span>Loading phase</span>
        </label>
      </div>
      <div class="button-row">
        <button type="button" :disabled="isBusy" @click="refreshReports()">
          Refresh Report
        </button>
        <button type="button" :disabled="isBusy" @click="runRestoreTrial()">
          Run Restore Trial
        </button>
        <button type="button" :disabled="isBusy || sourceMode !== 'nodes'" @click="runLoadingReadyTrial()">
          Run Loading Trial
        </button>
        <button type="button" :disabled="isBusy" @click="runResizeTrial()">
          Run Resize Trial
        </button>
      </div>
    </header>

    <section class="summary-grid">
      <article class="summary-card">
        <h2>Height Error</h2>
        <p>Baseline: {{ comparisonSummary?.baselineError?.toFixed?.(1) ?? '-' }}px</p>
        <p>Experiment: {{ comparisonSummary?.experimentError?.toFixed?.(1) ?? '-' }}px</p>
        <p>Improvement: {{ comparisonSummary?.improvement?.toFixed?.(1) ?? '-' }}%</p>
      </article>
      <article class="summary-card">
        <h2>Simple Text Probe</h2>
        <p>Coverage: {{ comparisonSummary?.simpleCoverage?.toFixed?.(1) ?? '-' }}%</p>
        <p>Median error: {{ comparisonSummary?.simpleMedianError?.toFixed?.(1) ?? '-' }}%</p>
        <p>P90 error: {{ comparisonSummary?.simpleP90Error?.toFixed?.(1) ?? '-' }}%</p>
      </article>
      <article class="summary-card">
        <h2>Error Direction</h2>
        <p>Over-estimates: {{ comparisonSummary?.simpleOverEstimateCount ?? '-' }}</p>
        <p>Under-estimates: {{ comparisonSummary?.simpleUnderEstimateCount ?? '-' }}</p>
        <p>Code P90: {{ comparisonSummary?.codeP90Error?.toFixed?.(1) ?? '-' }}%</p>
      </article>
    </section>

    <section class="trial-grid">
      <article class="trial-card">
        <h2>Restore Trial</h2>
        <pre>{{ JSON.stringify(lastRestoreTrial, null, 2) }}</pre>
      </article>
      <article class="trial-card">
        <h2>Loading Trial</h2>
        <pre>{{ JSON.stringify(lastLoadingTrial, null, 2) }}</pre>
      </article>
      <article class="trial-card">
        <h2>Resize Trial</h2>
        <pre>{{ JSON.stringify(lastResizeTrial, null, 2) }}</pre>
      </article>
    </section>

    <section class="renderer-grid">
      <article class="renderer-card">
        <h2>Baseline</h2>
        <div ref="baselinePaneRef" class="renderer-pane" :style="{ width: `${paneWidthPx}px` }" data-testid="baseline-pane">
          <MarkdownRender
            v-if="sourceMode === 'nodes'"
            :key="`baseline-nodes-stream-diffs-${loadingPhase}-${paneWidthPx}-${isDark}`"
            :custom-id="baselineId"
            :nodes="renderNodes"
            v-bind="rendererCommonProps"
          />
          <MarkdownRender
            v-else
            :key="`baseline-content-stream-diffs-${paneWidthPx}-${isDark}`"
            :custom-id="baselineId"
            :content="transcriptMarkdown"
            v-bind="rendererCommonProps"
          />
        </div>
      </article>

      <article class="renderer-card">
        <h2>Experiment</h2>
        <div ref="experimentPaneRef" class="renderer-pane" :style="{ width: `${paneWidthPx}px` }" data-testid="experiment-pane">
          <MarkdownRender
            v-if="sourceMode === 'nodes'"
            :key="`experiment-nodes-stream-diffs-${loadingPhase}-${paneWidthPx}-${isDark}`"
            :custom-id="experimentId"
            :nodes="renderNodes"
            v-bind="rendererCommonProps"
          />
          <MarkdownRender
            v-else
            :key="`experiment-content-stream-diffs-${paneWidthPx}-${isDark}`"
            :custom-id="experimentId"
            :content="transcriptMarkdown"
            v-bind="rendererCommonProps"
          />
        </div>
      </article>
    </section>

    <div class="reference-shell" aria-hidden="true">
      <div ref="referencePaneRef" class="renderer-pane reference-pane" :style="{ width: `${paneWidthPx}px` }">
        <MarkdownRender
          v-if="sourceMode === 'nodes'"
          :key="`reference-nodes-stream-diffs-${loadingPhase}-${paneWidthPx}-${isDark}`"
          :custom-id="referenceId"
          :nodes="renderNodes"
          v-bind="referenceRendererProps"
        />
        <MarkdownRender
          v-else
          :key="`reference-content-stream-diffs-${paneWidthPx}-${isDark}`"
          :custom-id="referenceId"
          :content="transcriptMarkdown"
          v-bind="referenceRendererProps"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.height-experiment-page {
  min-height: 100vh;
  padding: 32px;
  background:
    radial-gradient(circle at top left, rgb(255 244 214 / 0.7), transparent 28%),
    linear-gradient(180deg, #f7f1e4 0%, #fbfaf7 100%);
  color: #1f2937;
}

.experiment-header {
  display: grid;
  gap: 20px;
  margin-bottom: 24px;
}

.eyebrow {
  margin: 0 0 8px;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #8b5e3c;
}

.experiment-header h1 {
  margin: 0;
  font-size: 2.25rem;
  line-height: 1.05;
}

.subtitle {
  margin: 10px 0 0;
  max-width: 72ch;
  line-height: 1.6;
  color: #4b5563;
}

.control-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.control-grid label,
.toggle {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid rgb(148 163 184 / 0.24);
  border-radius: 14px;
  background: rgb(255 255 255 / 0.72);
}

.control-grid select,
.control-grid input[type='number'] {
  min-width: 180px;
  padding: 8px 10px;
  border: 1px solid rgb(148 163 184 / 0.26);
  border-radius: 10px;
  background: #fff;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.button-row button {
  padding: 10px 14px;
  border: 0;
  border-radius: 999px;
  background: #8b5e3c;
  color: #fff;
  cursor: pointer;
}

.button-row button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.summary-grid,
.trial-grid,
.renderer-grid {
  display: grid;
  gap: 16px;
  margin-bottom: 20px;
}

.summary-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.trial-grid {
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.renderer-grid {
  grid-template-columns: repeat(2, max-content);
  overflow-x: auto;
  align-items: start;
}

.summary-card,
.trial-card,
.renderer-card {
  padding: 18px;
  border: 1px solid rgb(148 163 184 / 0.22);
  border-radius: 20px;
  background: rgb(255 255 255 / 0.82);
  box-shadow: 0 18px 40px -28px rgb(15 23 42 / 0.28);
}

.renderer-card {
  width: max-content;
}

.summary-card h2,
.trial-card h2,
.renderer-card h2 {
  margin: 0 0 10px;
  font-size: 1rem;
}

.summary-card p {
  margin: 6px 0 0;
}

.trial-card pre {
  max-height: 200px;
  overflow: auto;
  margin: 0;
  padding: 12px;
  border-radius: 14px;
  background: #111827;
  color: #e5e7eb;
  font-size: 12px;
}

.renderer-pane {
  height: 70vh;
  max-width: 100%;
  overflow: auto;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid rgb(148 163 184 / 0.18);
  background: #fffef8;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.6);
}

.reference-shell {
  position: absolute;
  left: -100000px;
  top: 0;
  pointer-events: none;
  opacity: 0;
}

.reference-pane {
  width: 520px;
}

.reference-shell :deep(.markdown-renderer),
.reference-shell :deep(.code-block-container) {
  content-visibility: visible;
  contain: none;
  contain-intrinsic-size: 0 0;
}

@media (max-width: 900px) {
  .height-experiment-page {
    padding: 20px;
  }

  .renderer-grid {
    grid-template-columns: 1fr;
    overflow-x: visible;
  }

  .renderer-card {
    width: auto;
  }

  .renderer-pane {
    width: 100% !important;
    height: 62vh;
  }
}
</style>
