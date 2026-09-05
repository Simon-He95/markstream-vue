<script setup lang="ts">
import type { ParsedNode } from 'stream-markdown-parser'
import type { EstimatedNodeHeight } from '../../internal/heightEstimationExperiment'
import type { CustomComponents } from '../../types'
import type { CodeBlockPreviewPayload } from '../../types/component-props'
import type {
  MarkstreamCaptureVirtualStateOptions,
  MarkstreamHeightCache,
  MarkstreamNodeLifecycle,
  MarkstreamRendererHandle,
  MarkstreamViewportPriorityOptions,
  MarkstreamVirtualAnchor,
  MarkstreamVirtualMetrics,
  MarkstreamVirtualPhase,
  MarkstreamVirtualReason,
  MarkstreamVirtualState,
  NodeRendererDomMode,
  NodeRendererMode,
  NodeRendererProps,
} from '../../types/node-renderer-props'
import type { VirtualHeightSummary } from './composables/useHeightModel'
import { computed, defineAsyncComponent, getCurrentInstance, inject, markRaw, mergeProps, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, shallowRef, triggerRef, watch, watchEffect } from 'vue'
import AdmonitionNode from '../../components/AdmonitionNode'
import BlockquoteNode from '../../components/BlockquoteNode'
import CheckboxNode from '../../components/CheckboxNode'
import DefinitionListNode from '../../components/DefinitionListNode'
import EmojiNode from '../../components/EmojiNode'
import EmphasisNode from '../../components/EmphasisNode'
import FootnoteAnchorNode from '../../components/FootnoteAnchorNode'
import FootnoteNode from '../../components/FootnoteNode'
import FootnoteReferenceNode from '../../components/FootnoteReferenceNode'
import HardBreakNode from '../../components/HardBreakNode'
import HeadingNode from '../../components/HeadingNode'
import HighlightNode from '../../components/HighlightNode'
import ImageNode from '../../components/ImageNode'
import InlineCodeNode from '../../components/InlineCodeNode'
import InsertNode from '../../components/InsertNode'
import LinkNode from '../../components/LinkNode'
import ListItemNode from '../../components/ListItemNode'
import ListNode from '../../components/ListNode'
import ParagraphNode from '../../components/ParagraphNode'
import PreCodeNode from '../../components/PreCodeNode'
import { resolvePreCodeVisualOptions } from '../../components/PreCodeNode/preCodeVisual'
import ReferenceNode from '../../components/ReferenceNode'
import StrikethroughNode from '../../components/StrikethroughNode'
import StrongNode from '../../components/StrongNode'
import SubscriptNode from '../../components/SubscriptNode'
import SuperscriptNode from '../../components/SuperscriptNode'
import TableNode from '../../components/TableNode'
import TextNode from '../../components/TextNode'
import ThematicBreakNode from '../../components/ThematicBreakNode'
import VmrContainerNode from '../../components/VmrContainerNode'
import { DEFAULT_VIEWPORT_PRIORITY_ROOT_MARGIN, provideOffscreenHeavyNodeDeferral, provideViewportPriority, provideViewportPriorityOptions } from '../../composables/viewportPriority'
import {
  buildBlockTextProfile,
  createEmptySimpleTextProbeProfile,
  estimateCodeBlockHeight,
  estimateSimpleTextBlockHeight,
  getHeightEstimationExperiment,
  heightEstimationExperimentRevision,
  registerHeightEstimationRendererController,
} from '../../internal/heightEstimationExperiment'
import { getCodeBlockExtraProps } from '../../utils/codeBlockExtraProps'
import { getCustomCodeLanguageComponent } from '../../utils/customCodeLanguageComponent'
import { isDevEnvironment } from '../../utils/devEnv'
import { clampInfographicPreviewHeight, clampMermaidPreviewHeight, estimateInfographicPreviewHeight, estimateMermaidPreviewHeight, parsePositiveNumber } from '../../utils/diagramHeight'
import { getCustomNodeAttrs, getHtmlTagFromContent, shouldRenderUnknownHtmlTagAsText, stripCustomHtmlWrapper } from '../../utils/htmlRenderer'
import { isReservedNodeComponentKey, useCustomNodeComponents } from '../../utils/nodeComponents'
import { MARKSTREAM_NODE_LIFECYCLE_KEY } from '../../utils/nodeLifecycle'
import { setNormalizedElementScrollTop } from '../../utils/normalizedScroll'
import { throttle } from '../../utils/throttle'
import { normalizeTypewriterCursorMode } from '../../utils/typewriter'
import HtmlBlockNode from '../HtmlBlockNode/HtmlBlockNode.vue'
import HtmlInlineNode from '../HtmlInlineNode/HtmlInlineNode.vue'
import { createMathBlockMinHeightCache, provideMathBlockMinHeightCache } from '../MathBlockNode/minHeightCache'
import { CodeBlockNodeAsync, MathBlockNodeAsync, MathInlineNodeAsync, PreCodeBlockAsync, withViewportDeferredLoading } from './asyncComponent'
import { useBatchRenderingScheduler } from './composables/useBatchRenderingScheduler'
import { useBatchRenderingState } from './composables/useBatchRenderingState'
import { useFocusSyncScheduler } from './composables/useFocusSyncScheduler'
import { useHeightMeasurements } from './composables/useHeightMeasurements'
import { getHeightCacheWidthBucket, UNKNOWN_HEIGHT_CACHE_WIDTH_BUCKET, useHeightModel } from './composables/useHeightModel'
import { useLiveRangeState } from './composables/useLiveRangeState'
import { useMarkdownParsing } from './composables/useMarkdownParsing'
import { useNodeVisibilityState } from './composables/useNodeVisibilityState'
import { useResolvedRendererOptions } from './composables/useResolvedRendererOptions'
import { useSchedulerPlatform } from './composables/useSchedulerPlatform'
import { useScrollListener } from './composables/useScrollListener'
import { useScrollRestore } from './composables/useScrollRestore'
import { useSmoothStreamingBridge } from './composables/useSmoothStreamingBridge'
import { useViewportRoot } from './composables/useViewportRoot'
import FallbackComponent from './FallbackComponent.vue'
import HeightEstimationProbes from './HeightEstimationProbes.vue'
import { InfographicBlockNodeLoading } from './InfographicBlockNodeLoading'
import { MermaidBlockNodeLoading } from './MermaidBlockNodeLoading'
import { normalizeRendererMode, RENDERER_MODE_DEFAULTS } from './rendererModeDefaults'
import { buildVirtualMeasurementKey, buildVirtualRendererLayoutKey, stringifyVirtualToken } from './virtualLayoutKey'

type RuntimeCodeBlockNode = ParsedNode & {
  type: 'code_block'
  language?: string
  loading?: boolean
  diff?: boolean
  code?: string
  originalCode?: string
  updatedCode?: string
  raw?: string
  startLine?: number
  endLine?: number
}
type RuntimeHtmlNode = ParsedNode & {
  type: 'html_block' | 'html_inline'
  tag?: string
  content?: string
}

defineOptions({ name: 'NodeRenderer' })

const props = withDefaults(defineProps<NodeRendererProps>(), {
  codeBlockStream: true,
  renderCodeBlocksAsPre: undefined,
  showTooltips: undefined,
  typewriter: false,
  smoothStreaming: 'auto',
  fade: undefined,
  batchRendering: undefined,
  debugPerformance: false,
  viewportPriority: undefined,
  deferNodesUntilVisible: undefined,
  nodeVirtual: undefined,
})

const emit = defineEmits<{
  (e: 'copy', code: string): void
  (e: 'copy-code', code: string): void
  (e: 'handleArtifactClick', payload: CodeBlockPreviewPayload): void
  (e: 'click', event: MouseEvent, referenceId?: string): void
  (e: 'mouseover', event: MouseEvent): void
  (e: 'mouseout', event: MouseEvent): void
  (e: 'virtual-state-change', payload: MarkstreamVirtualState): void
  (e: 'height-change', payload: MarkstreamVirtualMetrics): void
  (e: 'render-settled', payload: MarkstreamVirtualMetrics): void
  (e: 'render-final', payload: MarkstreamVirtualMetrics): void
  (e: 'anchor-change', payload: MarkstreamVirtualAnchor): void
}>()

function isNativeDomEvent(value: unknown): value is Event {
  return typeof Event !== 'undefined' && value instanceof Event
}

function emitCodeCopy(payload: unknown) {
  if (isNativeDomEvent(payload))
    return

  if (typeof payload === 'string') {
    // eslint-disable-next-line vue/custom-event-name-casing -- Public copy-code event is kebab-case.
    emit('copy-code', payload)
    emit('copy', payload)
    return
  }

  emit('copy', payload as string)
}

// Stable per-setup handlers shared by every pre-merged item props object.
// Building them once here (instead of inline arrow functions in the template)
// keeps the cached vnode props free of per-render closures.
function handleArtifactClick(payload: CodeBlockPreviewPayload) {
  emit('handleArtifactClick', payload)
}

function emitMouseoverRaw(event: MouseEvent) {
  emit('mouseover', event)
}

function emitMouseoutRaw(event: MouseEvent) {
  emit('mouseout', event)
}

const instance = getCurrentInstance()
const inheritedNestedRendererProps = inject<{ value?: Partial<NodeRendererProps> } | undefined>('markstreamNestedRendererProps', undefined)

function toKebabCase(value: string) {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}

function hasOwnRendererProp(key: keyof NodeRendererProps) {
  const vnodeProps = instance?.vnode.props as Record<string, unknown> | null | undefined
  if (!vnodeProps)
    return false

  return Object.prototype.hasOwnProperty.call(vnodeProps, key)
    || Object.prototype.hasOwnProperty.call(vnodeProps, toKebabCase(String(key)))
}

function resolveRendererProp<K extends keyof NodeRendererProps>(key: K): NodeRendererProps[K] {
  const ownValue = props[key]
  if (hasOwnRendererProp(key))
    return ownValue

  return (inheritedNestedRendererProps?.value?.[key] as NodeRendererProps[K] | undefined) ?? ownValue
}

const isDevEnv = isDevEnvironment()

function normalizeRendererDomMode(value: unknown): NodeRendererDomMode {
  return value === 'minimal' ? 'minimal' : 'full'
}

const resolvedMode = computed<NodeRendererMode>(() => normalizeRendererMode(resolveRendererProp('mode')))
const resolvedTypewriterCursorMode = computed(() => normalizeTypewriterCursorMode(resolveRendererProp('typewriter')))
const typewriterEnabled = computed(() => resolvedTypewriterCursorMode.value !== 'off')
const resolvedDomMode = computed<NodeRendererDomMode>(() => normalizeRendererDomMode(resolveRendererProp('domMode')))
const resolvedRenderCodeBlocksAsPre = computed(() => resolveRendererProp('renderCodeBlocksAsPre') === true)
const resolvedModeDefaults = computed(() => RENDERER_MODE_DEFAULTS[resolvedMode.value])
const resolvedShowTooltipsProp = computed(() => resolveRendererProp('showTooltips') ?? resolvedModeDefaults.value.showTooltips)
const resolvedFade = computed(() => resolveRendererProp('fade') ?? resolvedModeDefaults.value.fade)
const resolvedBatchRendering = computed(() => resolveRendererProp('batchRendering') ?? resolvedModeDefaults.value.batchRendering)
const resolvedInitialRenderBatchSize = computed(() => resolveRendererProp('initialRenderBatchSize') ?? resolvedModeDefaults.value.initialRenderBatchSize)
const resolvedRenderBatchSize = computed(() => resolveRendererProp('renderBatchSize') ?? resolvedModeDefaults.value.renderBatchSize)
const resolvedRenderBatchDelay = computed(() => resolveRendererProp('renderBatchDelay') ?? resolvedModeDefaults.value.renderBatchDelay)
const resolvedRenderBatchBudgetMs = computed(() => resolveRendererProp('renderBatchBudgetMs') ?? resolvedModeDefaults.value.renderBatchBudgetMs)
const resolvedRenderBatchIdleTimeoutMs = computed(() => resolveRendererProp('renderBatchIdleTimeoutMs') ?? resolvedModeDefaults.value.renderBatchIdleTimeoutMs)
const resolvedDeferNodesUntilVisible = computed(() => resolveRendererProp('deferNodesUntilVisible') ?? resolvedModeDefaults.value.deferNodesUntilVisible)
const resolvedMaxLiveNodes = computed(() => resolveRendererProp('maxLiveNodes') ?? resolvedModeDefaults.value.maxLiveNodes)
const resolvedLiveNodeBuffer = computed(() => resolveRendererProp('liveNodeBuffer') ?? resolvedModeDefaults.value.liveNodeBuffer)
const resolvedNodeVirtual = computed(() => resolveRendererProp('nodeVirtual') ?? resolvedModeDefaults.value.nodeVirtual)

const rendererProps = {
  get content() { return props.content },
  get nodes() { return props.nodes },
  get final() { return props.final },
  get parseOptions() { return resolveRendererProp('parseOptions') },
  get customMarkdownIt() { return resolveRendererProp('customMarkdownIt') },
  get debugPerformance() { return props.debugPerformance },
  get customHtmlTags() { return resolveRendererProp('customHtmlTags') },
  get mode() { return resolveRendererProp('mode') },
  get domMode() { return resolvedDomMode.value },
  get htmlPolicy() { return resolveRendererProp('htmlPolicy') },
  get viewportPriority() { return resolveRendererProp('viewportPriority') },
  get viewportPriorityOptions() { return resolveRendererProp('viewportPriorityOptions') },
  get codeBlockStream() { return resolveRendererProp('codeBlockStream') },
  get codeBlockDarkTheme() { return resolveRendererProp('codeBlockDarkTheme') },
  get codeBlockLightTheme() { return resolveRendererProp('codeBlockLightTheme') },
  get codeBlockMinWidth() { return resolveRendererProp('codeBlockMinWidth') },
  get codeBlockMaxWidth() { return resolveRendererProp('codeBlockMaxWidth') },
  get codeBlockOptions() { return resolveRendererProp('codeBlockOptions') },
  get codeBlockProps() { return resolveRendererProp('codeBlockProps') },
  get mermaidProps() { return resolveRendererProp('mermaidProps') },
  get d2Props() { return resolveRendererProp('d2Props') },
  get infographicProps() { return resolveRendererProp('infographicProps') },
  get showTooltips() { return resolvedShowTooltipsProp.value },
  get themes() { return resolveRendererProp('themes') },
  get isDark() { return resolveRendererProp('isDark') },
  get customId() { return resolveRendererProp('customId') },
  get indexKey() { return props.indexKey },
  get typewriter() { return resolveRendererProp('typewriter') },
  get smoothStreaming() { return props.smoothStreaming },
  get smoothStreamingOptions() { return resolveRendererProp('smoothStreamingOptions') },
  get parseCoalesceMs() { return resolveRendererProp('parseCoalesceMs') },
  get fade() { return resolvedFade.value },
  get batchRendering() { return resolvedBatchRendering.value },
  get initialRenderBatchSize() { return resolvedInitialRenderBatchSize.value },
  get renderBatchSize() { return resolvedRenderBatchSize.value },
  get renderBatchDelay() { return resolvedRenderBatchDelay.value },
  get renderBatchBudgetMs() { return resolvedRenderBatchBudgetMs.value },
  get renderBatchIdleTimeoutMs() { return resolvedRenderBatchIdleTimeoutMs.value },
  get deferNodesUntilVisible() { return resolvedDeferNodesUntilVisible.value },
  get maxLiveNodes() { return resolvedMaxLiveNodes.value },
  get liveNodeBuffer() { return resolvedLiveNodeBuffer.value },
  get nodeVirtual() { return resolvedNodeVirtual.value },
  get virtualScroll() { return props.virtualScroll },
  get renderAsFragment() { return props.renderAsFragment },
} as Readonly<NodeRendererProps>

/* eslint-disable vue/custom-event-name-casing -- Public virtualScroll events are kebab-case. */
function emitHeightChange(metrics: MarkstreamVirtualMetrics) {
  emit('height-change', metrics)
}

function emitVirtualStateChange(state: MarkstreamVirtualState) {
  emit('virtual-state-change', state)
}

function emitAnchorChange(anchor: MarkstreamVirtualAnchor) {
  emit('anchor-change', anchor)
}

function emitRenderSettled(metrics: MarkstreamVirtualMetrics) {
  emit('render-settled', metrics)
}

function emitRenderFinal(metrics: MarkstreamVirtualMetrics) {
  emit('render-final', metrics)
}
/* eslint-enable vue/custom-event-name-casing */

const MAX_DEFERRED_NODE_COUNT = 900
const MAX_VIEWPORT_OBSERVER_TARGETS = 640
const VIEWPORT_PRIORITY_RECOVERY_COUNT = 200
const FINAL_RESTORE_AUTO_MAX_LIVE_NODES = 50
const FINAL_RESTORE_AUTO_LIVE_NODE_BUFFER = 16
const CONTENT_STREAMING_TAIL_IDLE_MS = 1200
const BOTTOM_ANCHOR_CAPTURE_MAX_DISTANCE_PX = 160
const BOTTOM_ANCHOR_SCROLL_ROOT_MAX_DISTANCE_PX = 64
const BOTTOM_ANCHOR_RELEASE_THRESHOLD_PX = 32

const containerRef = ref<HTMLElement>()
const paragraphProbeWrapperRef = ref<HTMLElement | null>(null)
const listItemProbeWrapperRef = ref<HTMLElement | null>(null)
const listProbeWrapperRef = ref<HTMLElement | null>(null)
const headingProbeWrapperRefs = reactive<Record<number, HTMLElement | null>>({
  1: null,
  2: null,
  3: null,
  4: null,
  5: null,
  6: null,
})
const viewportPriorityAutoDisabled = ref(false)
const textStreamState = new Map<string, string>()
const streamRenderVersion = ref(0)
// The parsedNodes watch runs with `immediate` before useHeightModel
// initializes; guard prefix invalidation until the model exists. The first
// prefix build is full anyway, so dropping the early mark is safe.
let heightModelReady = false
const measuredContainerWidth = ref(0)
const simpleTextProbeProfile = ref(createEmptySimpleTextProbeProfile())

function resolveViewportPriorityRootMargin(value: unknown, fallback: string) {
  if (typeof value !== 'string')
    return fallback

  const trimmed = value.trim()
  return trimmed || fallback
}

function resolveViewportPriorityMaxTargets(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0
    ? Math.max(1, Math.trunc(numeric))
    : MAX_VIEWPORT_OBSERVER_TARGETS
}

const resolvedViewportPriorityOptions = computed<MarkstreamViewportPriorityOptions>(() => {
  const options = rendererProps.viewportPriorityOptions ?? {}
  const rootMargin = resolveViewportPriorityRootMargin(options.rootMargin, DEFAULT_VIEWPORT_PRIORITY_ROOT_MARGIN)

  return {
    rootMargin,
    heavyBlockMargin: resolveViewportPriorityRootMargin(options.heavyBlockMargin, rootMargin),
    maxTargets: resolveViewportPriorityMaxTargets(options.maxTargets),
  }
})
const viewportPriorityRootMargin = computed(() => resolvedViewportPriorityOptions.value.rootMargin ?? DEFAULT_VIEWPORT_PRIORITY_ROOT_MARGIN)
const viewportPriorityMaxTargets = computed(() => resolvedViewportPriorityOptions.value.maxTargets ?? MAX_VIEWPORT_OBSERVER_TARGETS)
provideViewportPriorityOptions(resolvedViewportPriorityOptions)

function resolveVirtualScrollRoot() {
  if (props.virtualScroll?.enabled !== true)
    return null

  const root = props.virtualScroll?.scrollRoot
  const resolved = typeof root === 'function' ? root() : root
  return unwrapVirtualScrollRoot(resolved)
}

function unwrapVirtualScrollRoot(value: unknown): HTMLElement | null {
  if (!value)
    return null

  if (typeof HTMLElement !== 'undefined' && value instanceof HTMLElement)
    return value

  if (typeof value === 'object' && 'value' in value)
    return unwrapVirtualScrollRoot((value as { value: unknown }).value)

  if (typeof value === 'object' && '$el' in value)
    return unwrapVirtualScrollRoot((value as { $el: unknown }).$el)

  return null
}

const {
  isClient,
  renderAsFragment,
  debugPerformanceEnabled,
  resolvedShowTooltips,
  resolvedHtmlPolicy,
  inheritedSmoothStreaming,
  ownsTypewriterCursor,
} = useResolvedRendererOptions(rendererProps)
const {
  resolveViewportRoot,
  resolveScrollContainer,
  isReverseFlexScrollRoot,
  getNormalizedScrollTop,
  getOffsetTopWithinRoot,
} = useViewportRoot(containerRef, {
  isClient,
  scrollRoot: resolveVirtualScrollRoot,
})
provide('markstreamShowTooltips', resolvedShowTooltips)
provide('markstreamHtmlPolicy', resolvedHtmlPolicy)
provide('markstreamTypewriter', typewriterEnabled)
provide('markstreamFade', computed(() => rendererProps.fade !== false))
provide('markstreamTypewriterCursor', computed(() => true))
provide('markstreamTextStreamState', textStreamState)
provide('markstreamStreamVersion', streamRenderVersion)
provide('markstreamParseOptions', computed(() => rendererProps.parseOptions))
provide('markstreamCustomMarkdownIt', computed(() => rendererProps.customMarkdownIt))

const {
  smoothStreamingEnabled,
  renderContent,
  requestedFinal,
  effectiveFinal,
} = useSmoothStreamingBridge(rendererProps, {
  isClient,
  inheritedSmoothStreaming,
})
const stableLayoutInitiallyFinal = requestedFinal.value === true
provide('markstreamSmoothStreaming', smoothStreamingEnabled)
const contentStreamingTailActive = ref(false)
const continuousStreamingObserved = ref(false)
const hasObservedNonFinalContent = ref(false)
let previousContentStreamValue = ''
let hasSeenContentStreamValue = false
let contentStreamingTailIdleTimer: number | null = null

function clearContentStreamingTailIdleTimer() {
  if (!isClient || contentStreamingTailIdleTimer == null)
    return
  window.clearTimeout(contentStreamingTailIdleTimer)
  contentStreamingTailIdleTimer = null
}

function markContentStreamingTailActive() {
  contentStreamingTailActive.value = true
  continuousStreamingObserved.value = true
  if (!isClient)
    return

  clearContentStreamingTailIdleTimer()
  contentStreamingTailIdleTimer = window.setTimeout(() => {
    contentStreamingTailIdleTimer = null
    if (effectiveFinal.value === true || props.nodes?.length)
      return
    clearPendingHeightMeasurements()
    contentStreamingTailActive.value = false
    measureTrackedNodeHeights()
  }, CONTENT_STREAMING_TAIL_IDLE_MS)
}

function clearContentStreamingTailActive() {
  contentStreamingTailActive.value = false
  clearContentStreamingTailIdleTimer()
}

watch(
  [() => rendererProps.indexKey, () => rendererProps.customId],
  () => {
    clearContentStreamingTailActive()
    continuousStreamingObserved.value = false
    hasObservedNonFinalContent.value = !props.nodes?.length
      && requestedFinal.value !== true
      && Boolean(props.content)
    previousContentStreamValue = renderContent.value ?? ''
    hasSeenContentStreamValue = previousContentStreamValue.length > 0
  },
  { flush: 'sync' },
)

watch(
  [() => props.content, () => props.nodes, requestedFinal],
  ([content, nodes, finalRequested]) => {
    if (!nodes?.length && finalRequested !== true && Boolean(content))
      hasObservedNonFinalContent.value = true
  },
  { flush: 'sync', immediate: true },
)

watch(
  [renderContent, () => props.nodes, requestedFinal],
  ([content, nodes, finalRequested]) => {
    const nextContent = content ?? ''

    if (nodes?.length || finalRequested === true) {
      clearContentStreamingTailActive()
      continuousStreamingObserved.value = false
      previousContentStreamValue = nextContent
      hasSeenContentStreamValue = true
      return
    }

    if (nextContent.length > 0)
      hasObservedNonFinalContent.value = true

    if (!hasSeenContentStreamValue) {
      previousContentStreamValue = nextContent
      hasSeenContentStreamValue = true
      return
    }

    if (previousContentStreamValue && nextContent.length > previousContentStreamValue.length && nextContent.startsWith(previousContentStreamValue)) {
      markContentStreamingTailActive()
    }
    else if (nextContent.length < previousContentStreamValue.length || !nextContent.startsWith(previousContentStreamValue)) {
      clearContentStreamingTailActive()
      continuousStreamingObserved.value = false
    }

    previousContentStreamValue = nextContent
  },
  { flush: 'sync', immediate: true },
)

function logPerf(label: string, data: Record<string, unknown>) {
  if (!debugPerformanceEnabled.value)
    return

  const layoutReads = takeLayoutReadStats()
  console.info(`[markstream-vue][perf] ${label}`, layoutReads
    ? { ...data, layoutReads }
    : data)
}

const layoutReadCounts = new Map<string, number>()
const layoutReadFrameCounts = new Map<string, number>()
let layoutReadFrameScheduled = false
let maxLayoutReadsPerFrame = 0

interface BenchmarkLayoutReadPerformance {
  total: number
  maxPerFrame: number
  byLabel: Record<string, number>
  currentFrameTotal?: number
  frameScheduled?: boolean
}

type BenchmarkLayoutReadWindow = Window & {
  __markstreamLayoutReadPerformance?: BenchmarkLayoutReadPerformance
}

function getMapTotal(map: Map<string, number>) {
  let total = 0
  for (const count of map.values())
    total += count
  return total
}

function toSortedRecord(map: Map<string, number>) {
  return Object.fromEntries(
    Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  )
}

function flushLayoutReadFrameCounts() {
  maxLayoutReadsPerFrame = Math.max(maxLayoutReadsPerFrame, getMapTotal(layoutReadFrameCounts))
  layoutReadFrameCounts.clear()
  layoutReadFrameScheduled = false
}

function scheduleLayoutReadFrameFlush() {
  if (layoutReadFrameScheduled)
    return

  layoutReadFrameScheduled = true
  if (isClient && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(flushLayoutReadFrameCounts)
    return
  }

  if (typeof queueMicrotask === 'function') {
    queueMicrotask(flushLayoutReadFrameCounts)
    return
  }

  setTimeout(flushLayoutReadFrameCounts, 0)
}

function getBenchmarkLayoutReadPerformance() {
  if (!isClient || typeof window === 'undefined')
    return null

  const target = window as BenchmarkLayoutReadWindow
  if (target.__markstreamLayoutReadPerformance)
    return target.__markstreamLayoutReadPerformance

  const created: BenchmarkLayoutReadPerformance = {
    total: 0,
    maxPerFrame: 0,
    byLabel: {},
  }
  target.__markstreamLayoutReadPerformance = created
  return created
}

function flushBenchmarkLayoutReadFrame(state: BenchmarkLayoutReadPerformance) {
  state.maxPerFrame = Math.max(
    Number(state.maxPerFrame || 0),
    Number(state.currentFrameTotal || 0),
  )
  state.currentFrameTotal = 0
  state.frameScheduled = false
}

function publishBenchmarkLayoutRead(label: string) {
  const performance = getBenchmarkLayoutReadPerformance()
  if (!performance)
    return

  performance.total = Number(performance.total || 0) + 1
  performance.byLabel[label] = Number(performance.byLabel[label] || 0) + 1
  performance.currentFrameTotal = Number(performance.currentFrameTotal || 0) + 1

  if (performance.frameScheduled)
    return

  performance.frameScheduled = true
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => flushBenchmarkLayoutReadFrame(performance))
    return
  }

  if (typeof queueMicrotask === 'function') {
    queueMicrotask(() => flushBenchmarkLayoutReadFrame(performance))
    return
  }

  setTimeout(() => flushBenchmarkLayoutReadFrame(performance), 0)
}

function recordLayoutRead(label: string) {
  if (!debugPerformanceEnabled.value)
    return

  layoutReadCounts.set(label, (layoutReadCounts.get(label) ?? 0) + 1)
  layoutReadFrameCounts.set(label, (layoutReadFrameCounts.get(label) ?? 0) + 1)
  publishBenchmarkLayoutRead(label)
  scheduleLayoutReadFrameFlush()
}

function readLayout<T>(label: string, read: () => T): T {
  recordLayoutRead(label)
  return read()
}

function takeLayoutReadStats() {
  if (!debugPerformanceEnabled.value)
    return null

  const total = getMapTotal(layoutReadCounts)
  const currentFrameTotal = getMapTotal(layoutReadFrameCounts)
  const maxPerFrame = Math.max(maxLayoutReadsPerFrame, currentFrameTotal)
  if (total <= 0 && maxPerFrame <= 0)
    return null

  const snapshot = {
    total,
    maxPerFrame,
    byLabel: toSortedRecord(layoutReadCounts),
  }

  layoutReadCounts.clear()
  layoutReadFrameCounts.clear()
  maxLayoutReadsPerFrame = 0

  return snapshot
}
const instanceMsgId = rendererProps.customId
  ? `renderer-${rendererProps.customId}`
  : `renderer-${Date.now()}-${Math.random().toString(36).slice(2)}`
const mathBlockMinHeightCache = createMathBlockMinHeightCache(instanceMsgId)
const mathBlockCacheScope = instanceMsgId
provideMathBlockMinHeightCache(mathBlockMinHeightCache)
const customComponentsMap = useCustomNodeComponents(() => rendererProps.customId)
const {
  effectiveCustomHtmlTagsSet,
  mergedParseOptions,
  parsedNodes,
  getParsedNodesDirtyStartIndex,
  getParsedNodesRevision,
} = useMarkdownParsing(rendererProps, {
  instanceMsgId,
  renderContent,
  effectiveFinal,
  smoothStreamingEnabled,
  debugPerformanceEnabled,
  customComponentsMap,
  logPerf,
})

watch(
  parsedNodes,
  () => {
    // Only clear the shared math minHeight cache on non-streaming content
    // changes (dataset replacement, content rewrite, etc.). During streaming
    // appends (contentStreamingTailActive=true), the cache is preserved so
    // that virtualization remount of stable-prefix math blocks can restore
    // their previously measured heights without re-reading offsetHeight.
    if (!contentStreamingTailActive.value)
      mathBlockMinHeightCache.clear()
    streamRenderVersion.value += 1
    // Streaming commits only change the dirty tail; let the fallback height
    // prefix rebuild incrementally from the parser's dirty start instead of
    // forcing a full O(N) rebuild on every commit.
    if (heightModelReady)
      markFallbackHeightPrefixDirty(getParsedNodesDirtyStart(parsedNodes.value.length))
  },
  { immediate: true },
)
const nestedRendererProps = computed<Partial<NodeRendererProps>>(() => ({
  customId: rendererProps.customId,
  customHtmlTags: mergedParseOptions.value.customHtmlTags,
  parseOptions: rendererProps.parseOptions,
  customMarkdownIt: rendererProps.customMarkdownIt,
  htmlPolicy: resolvedHtmlPolicy.value,
  viewportPriority: rendererProps.viewportPriority,
  viewportPriorityOptions: resolvedViewportPriorityOptions.value,
  mode: resolvedMode.value,
  domMode: rendererProps.domMode,
  codeBlockStream: rendererProps.codeBlockStream,
  codeBlockDarkTheme: rendererProps.codeBlockDarkTheme,
  codeBlockLightTheme: rendererProps.codeBlockLightTheme,
  renderCodeBlocksAsPre: resolvedRenderCodeBlocksAsPre.value,
  codeBlockMinWidth: rendererProps.codeBlockMinWidth,
  codeBlockMaxWidth: rendererProps.codeBlockMaxWidth,
  codeBlockOptions: rendererProps.codeBlockOptions,
  codeBlockProps: rendererProps.codeBlockProps,
  mermaidProps: rendererProps.mermaidProps,
  d2Props: rendererProps.d2Props,
  infographicProps: rendererProps.infographicProps,
  showTooltips: resolvedShowTooltips.value,
  themes: rendererProps.themes,
  isDark: rendererProps.isDark,
  typewriter: typewriterEnabled.value,
  smoothStreamingOptions: rendererProps.smoothStreamingOptions,
  parseCoalesceMs: rendererProps.parseCoalesceMs,
  fade: rendererProps.fade,
}))
provide('markstreamNestedRendererProps', nestedRendererProps)
const parsedNodesIdentity = computed(() => parsedNodes.value)
const parsedNodeCount = computed(() => parsedNodes.value.length)
const paragraphProbeNode = ref<ParsedNode | null>(null)
const listItemProbeNode = ref<ParsedNode | null>(null)
const listProbeNode = ref<ParsedNode | null>(null)
const headingProbeNodes = ref<Record<number, ParsedNode | null> | null>(null)
const isNestedListItemRenderer = props.indexKey != null && String(props.indexKey).startsWith('list-item-')
const initialHeightExperimentConfig = (!isNestedListItemRenderer && rendererProps.customId)
  ? getHeightEstimationExperiment(rendererProps.customId)
  : null
const heightExperimentConfig = computed(() => {
  if (!initialHeightExperimentConfig)
    return null
  void heightEstimationExperimentRevision.value
  return getHeightEstimationExperiment(rendererProps.customId)
})
const heightExperimentDomRequired = computed(() => Boolean(
  !renderAsFragment.value
  && rendererProps.customId
  && !isNestedListItemRenderer
  && heightExperimentConfig.value?.enabled,
))
const heightExperimentEnabled = computed(() => Boolean(
  isClient
  && heightExperimentDomRequired.value,
))
const virtualScrollRequested = computed(() => Boolean(
  !renderAsFragment.value
  && props.virtualScroll?.enabled,
))
const hostVirtualScrollDomRequired = computed(() => virtualScrollRequested.value)
const virtualScrollMounted = ref(false)
onMounted(() => {
  virtualScrollMounted.value = true
})

const virtualScrollEnabled = computed(() => Boolean(
  isClient
  && virtualScrollRequested.value,
))

// Children such as CodeBlockNode must not mutate the outer scrollTop when the
// host virtualizer / Markdown virtual-scroll contract already owns anchoring.
provide('markstreamHostScrollManaged', virtualScrollEnabled)
const virtualScrollDomEnabled = computed(() => Boolean(
  virtualScrollMounted.value
  && virtualScrollEnabled.value,
))
const heightEstimationActive = computed(() => heightExperimentEnabled.value || virtualScrollEnabled.value)
const heightEstimationDomActive = computed(() => heightExperimentEnabled.value || virtualScrollDomEnabled.value)
const textEstimationEnabled = computed(() => {
  return heightEstimationActive.value
    && heightExperimentConfig.value?.textEstimation !== false
})
function getMeasuredContainerWidth() {
  if (measuredContainerWidth.value > 0)
    return measuredContainerWidth.value
  const width = readLayout(
    'getMeasuredContainerWidth.clientWidth',
    () => containerRef.value?.clientWidth || 0,
  )
  return Number.isFinite(width) && width > 0 ? width : 0
}

const experimentProbeWidth = computed(() => {
  const measured = getMeasuredContainerWidth()
  return measured > 0 ? Math.max(1, Math.round(measured)) : 640
})
const finalRestoreAutoVirtualEnabled = computed(() => {
  return effectiveFinal.value === true
    && !virtualScrollRequested.value
    && (resolvedMode.value === 'chat' || resolvedMode.value === 'minimal')
    && !hasOwnRendererProp('maxLiveNodes')
    && !hasOwnRendererProp('liveNodeBuffer')
    && !props.nodes?.length
    && !hasObservedNonFinalContent.value
    && (rendererProps.maxLiveNodes ?? 0) <= 0
})
const maxLiveNodesResolved = computed(() => {
  if (finalRestoreAutoVirtualEnabled.value)
    return FINAL_RESTORE_AUTO_MAX_LIVE_NODES
  return Math.max(1, rendererProps.maxLiveNodes ?? 320)
})
const liveNodeBufferResolved = computed(() => {
  if (finalRestoreAutoVirtualEnabled.value)
    return FINAL_RESTORE_AUTO_LIVE_NODE_BUFFER
  return Math.max(0, rendererProps.liveNodeBuffer ?? 60)
})
const virtualizationEnabled = computed(() => {
  if (renderAsFragment.value)
    return false
  if (rendererProps.nodeVirtual === false)
    return false
  if ((rendererProps.maxLiveNodes ?? 0) <= 0 && !finalRestoreAutoVirtualEnabled.value)
    return false
  if (rendererProps.nodeVirtual === true)
    return parsedNodes.value.length > 0
  return parsedNodes.value.length > maxLiveNodesResolved.value
})
const shouldMeasureNodeHeights = computed(() => virtualizationEnabled.value || heightExperimentEnabled.value || virtualScrollEnabled.value)
// Viewport priority is used to defer heavy work (stream-diffs/Mermaid/KaTeX) until
// nodes approach the viewport. Node-level deferral is controlled separately
// via `deferNodes`.
const heavyViewportPriorityEnabled = computed(() => rendererProps.viewportPriority !== false)
const viewportPriorityEnabled = computed(() => {
  if (!heavyViewportPriorityEnabled.value)
    return false
  if (viewportPriorityAutoDisabled.value)
    return false
  return true
})
provideOffscreenHeavyNodeDeferral(computed(() =>
  heavyViewportPriorityEnabled.value,
))
const deferNodesDomRequired = computed(() => {
  if (renderAsFragment.value)
    return false
  if (rendererProps.deferNodesUntilVisible === false)
    return false
  if ((rendererProps.maxLiveNodes ?? 0) <= 0)
    return false
  if (virtualizationEnabled.value)
    return false
  if (parsedNodes.value.length > MAX_DEFERRED_NODE_COUNT)
    return false
  return rendererProps.viewportPriority !== false
})
// Provide viewport-priority registrar so heavy nodes can defer work until visible
const registerNodeVisibility = provideViewportPriority(
  target => resolveViewportRoot(target?.parentElement ?? containerRef.value ?? null),
  heavyViewportPriorityEnabled,
)
const {
  requestFrame,
  cancelFrame,
  hasIdleCallback,
  isTestEnv,
} = useSchedulerPlatform({
  isClient,
})
const forceFullRenderFinalContent = computed(() => effectiveFinal.value === true && !virtualScrollRequested.value)
const {
  resolvedBatchSize,
  resolvedInitialBatch,
  batchingEnabled,
  incrementalRenderingActive,
  renderedCount,
  previousRenderContext,
  adaptiveBatchSize,
  previousBatchConfig,
} = useBatchRenderingState(rendererProps, {
  isClient,
  isTestEnv,
  renderAsFragment,
  forceFullRenderFinalContent,
  continuousStreaming: computed(() => continuousStreamingObserved.value && effectiveFinal.value !== true),
})
const incrementalRenderingDomRequired = computed(() => {
  return !renderAsFragment.value
    && rendererProps.batchRendering !== false
    && resolvedBatchSize.value > 0
    && !isTestEnv
    && (rendererProps.maxLiveNodes ?? 0) <= 0
    && !forceFullRenderFinalContent.value
})
const placeholderHeightEstimationActive = computed(() => incrementalRenderingDomRequired.value)
const nodeHeightEstimationActive = computed(() => heightEstimationActive.value || placeholderHeightEstimationActive.value)
const codeBlockEstimationEnabled = computed(() => {
  return nodeHeightEstimationActive.value
    && heightExperimentConfig.value?.codeBlockEstimation !== false
})
const nodeSlotElements = new Map<number, HTMLElement | null>()
/**
 * Snapshot of the visibility-registration inputs an element was last
 * registered under. `setNodeSlotElement` re-runs for every rendered node on
 * every streaming commit (Vue 3.5 re-invokes function refs on every patch);
 * when the element is unchanged AND every input that drives registration is
 * unchanged, the existing registration (observer handle / watch / fallback
 * timer / visible state) is still valid and the per-commit re-registration
 * churn can be skipped.
 */
const nodeSlotRegistrationKeys = new Map<number, string>()
const nodeContentResizeObserverTargets = new Map<number, HTMLElement>()
const nodeContentResizeObserverIndexes = new WeakMap<Element, number>()
let nodeContentResizeObserver: ResizeObserver | null = null
const codeBlockRenderCache: Array<{ signature: readonly unknown[], node: ParsedNode } | undefined> = []
watch(
  () => parsedNodes.value.length,
  (length) => {
    if (codeBlockRenderCache.length > length)
      codeBlockRenderCache.length = length
  },
)
// Height signatures per node index, stored in a flat array so stale-range
// scans can start at the parser's dirty start instead of walking the whole
// measured set on every streaming commit. `undefined` = no signature yet.
const nodeHeightSignatures: Array<string | undefined> = []
const EMPTY_ESTIMATED_NODE_HEIGHTS: Array<EstimatedNodeHeight | null> = []
let estimatedNodeHeightsCache: Array<EstimatedNodeHeight | null> = []
let estimatedNodeHeightsContext: unknown[] = []
let estimatedNodeHeightsParserRevision = -1
const estimatedNodeHeightsState = shallowRef<readonly (EstimatedNodeHeight | null)[]>(EMPTY_ESTIMATED_NODE_HEIGHTS)
const estimatedHeightDirtyIndices = new Set<number>()
const estimatedHeightMutationRevision = ref(0)
let estimatedHeightMutationDepth = 0
const nodeSlotVersion = ref(0)
const sortedNodeSlots = computed(() => {
  // Track a manual version so we only rebuild when slots change.
  void nodeSlotVersion.value
  return Array.from(nodeSlotElements.entries()).sort((a, b) => a[0] - b[0])
})
const scrollRootElement = ref<HTMLElement | null>(null)
const activeVirtualBottomAnchor = ref<Extract<MarkstreamVirtualAnchor, { type: 'bottom' }> | null>(null)
let virtualBottomRestoreRaf: number | null = null
let virtualBottomRestoreScrollGuardUntil = 0
let virtualBottomRestoreScrollGuardTarget: number | null = null

function guardVirtualBottomProgrammaticScroll(target: number) {
  virtualBottomRestoreScrollGuardUntil = getVirtualNow() + 120
  virtualBottomRestoreScrollGuardTarget = target
}

function consumeVirtualBottomProgrammaticScrollGuard(box: { scrollTop: number }) {
  if (getVirtualNow() >= virtualBottomRestoreScrollGuardUntil) {
    virtualBottomRestoreScrollGuardTarget = null
    return false
  }

  const guardedTarget = virtualBottomRestoreScrollGuardTarget
  if (guardedTarget == null)
    return true

  const guarded = Math.abs(box.scrollTop - guardedTarget) <= 2
  if (!guarded)
    virtualBottomRestoreScrollGuardTarget = null

  return guarded
}

let heightModel: ReturnType<typeof useHeightModel>

function markFallbackHeightPrefixDirty(fromIndex?: number) {
  heightModel.markFallbackHeightPrefixDirty(fromIndex)
}

function getFallbackNodeHeight(index: number) {
  return heightModel.getFallbackNodeHeight(index)
}

function estimateHeightRange(start: number, end: number) {
  return heightModel.estimateHeightRange(start, end)
}

function estimateIndexForOffset(offsetPx: number) {
  return heightModel.estimateIndexForOffset(offsetPx)
}

function estimateIndexForOffsetFromEnd(offsetPx: number) {
  return heightModel.estimateIndexForOffsetFromEnd(offsetPx)
}

function getEstimatedNodeHeightCount() {
  return heightModel.getEstimatedNodeHeightCount()
}

const {
  activeRestoreAnchor,
  getRelativeScrollTopWithinContainer,
  setRelativeScrollTopWithinContainer,
  resolveAnchorOffset,
  clearRestoreReconcile,
  scheduleRestoreReconcile,
  captureRestoreAnchor,
  restoreAnchor,
  getAnchorDrift,
} = useScrollRestore({
  isClient,
  containerRef,
  parsedNodeCount,

  requestFrame,
  cancelFrame,

  resolveScrollContainer: () => scrollRootElement.value || resolveScrollContainer(),
  getNormalizedScrollTop,
  getOffsetTopWithinRoot,
  isReverseFlexScrollRoot,

  estimateIndexForOffset,
  estimateHeightRange,
  getFallbackNodeHeight,
  clamp,
})
const {
  nodeHeights,
  heightStats,
  heightTreeSize,
  heightSumTree,
  heightKnownTree,
  averageNodeHeight,
  resetHeightMeasurements: resetMeasuredHeightMeasurements,
  pruneHeightMeasurements: pruneMeasuredHeightMeasurements,
  rebuildHeightTrees,
  syncHeightTreeSize,
  recordNodeHeight: recordMeasuredNodeHeight,
  removeNodeHeights: removeMeasuredNodeHeights,
  exportHeightCache,
  importHeightCache: importMeasuredHeightCache,
  fenwickRangeSum,
} = useHeightMeasurements({
  onHeightRecorded: (index) => {
    markFallbackHeightPrefixDirty(index ?? 0)
    if (virtualScrollEnabled.value)
      resetVirtualSettleConfirmation()
    if (activeRestoreAnchor.value)
      scheduleRestoreReconcile()
    if (activeVirtualBottomAnchor.value)
      scheduleVirtualBottomRestoreReconcile()
    scheduleVirtualMetricsEmit('node-resize')
  },
})

function markEstimatedNodeHeightDirty(index: number) {
  if (Number.isInteger(index) && index >= 0)
    estimatedHeightDirtyIndices.add(index)
}

function markEstimatedNodeHeightsDirty(indices: Iterable<number>) {
  for (const index of indices)
    markEstimatedNodeHeightDirty(Number(index))
}

// Mutate nodeHeights through this wrapper so estimatedNodeHeightsCache stays coherent.
function runEstimatedHeightMutation<T>(callback: () => T) {
  estimatedHeightMutationDepth++
  let shouldNotify = true
  try {
    const result = callback()
    shouldNotify = result !== false
    return result
  }
  finally {
    estimatedHeightMutationDepth--
    if (estimatedHeightMutationDepth === 0 && shouldNotify)
      estimatedHeightMutationRevision.value++
  }
}

function resetEstimatedNodeHeightCache() {
  estimatedNodeHeightsCache = []
  estimatedNodeHeightsContext = []
  estimatedNodeHeightsParserRevision = -1
  estimatedHeightDirtyIndices.clear()
  estimatedNodeHeightsState.value = EMPTY_ESTIMATED_NODE_HEIGHTS
}

function resetHeightMeasurements() {
  resetEstimatedNodeHeightCache()
  runEstimatedHeightMutation(() => resetMeasuredHeightMeasurements())
  nodeHeightSignatures.length = 0
}

function rememberNodeHeightSignature(index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= parsedNodes.value.length)
    return

  nodeHeightSignatures[index] = getNodeHeightCacheSignature(index)
}

function forgetNodeHeightSignatures(indices: Iterable<number>) {
  for (const index of indices) {
    if (Number.isInteger(index) && index >= 0 && index < nodeHeightSignatures.length)
      nodeHeightSignatures[index] = undefined
  }
}

function recordNodeHeight(
  index: number,
  height: number,
  options: { allowShrink?: boolean } = {},
) {
  runEstimatedHeightMutation(() => recordNodeHeightCore(index, height, options))
}

function recordNodeHeightCore(
  index: number,
  height: number,
  options: { allowShrink?: boolean } = {},
) {
  const before = nodeHeights[index]
  markEstimatedNodeHeightDirty(index)
  recordMeasuredNodeHeight(index, height, options)
  const after = nodeHeights[index]
  if (Object.is(before, after)) {
    estimatedHeightDirtyIndices.delete(index)
    return false
  }

  if (after && after > 0)
    rememberNodeHeightSignature(index)
  else if (before && index < nodeHeightSignatures.length)
    nodeHeightSignatures[index] = undefined

  return true
}

function getNodeLayoutHeight(
  index: number,
  contentEl: HTMLElement,
) {
  const contentElHeight = readLayout('getNodeLayoutHeight.content.offsetHeight', () => contentEl.offsetHeight)
  // The content element always wraps the node payload, so a positive content
  // height already pins the slot's border-box height (slot padding relies on
  // margin collapse inside the flow-root content, not on the slot element).
  // Reusing the first read skips the redundant slot offsetHeight probe that
  // previously ran on every measurement.
  if (contentElHeight > 0)
    return contentElHeight

  const slotHeight = readLayout(
    'getNodeLayoutHeight.slot.offsetHeight',
    () => nodeSlotElements.get(index)?.offsetHeight ?? 0,
  )
  return slotHeight
}

function removeNodeHeights(
  indices: Iterable<number>,
  options: { notify?: boolean } = {},
) {
  const list = Array.from(indices, Number)
  markEstimatedNodeHeightsDirty(list)
  let removed = 0
  runEstimatedHeightMutation(() => {
    removed = removeMeasuredNodeHeights(list, options)
    return removed > 0
  })
  if (removed > 0) {
    forgetNodeHeightSignatures(list)
  }
  else {
    for (const index of list)
      estimatedHeightDirtyIndices.delete(index)
  }
  return removed
}

function importHeightCache(
  cache: MarkstreamHeightCache,
  options: { mode?: 'replace' | 'merge' } = {},
) {
  if (options.mode !== 'merge')
    resetEstimatedNodeHeightCache()
  else
    markEstimatedNodeHeightsDirty(cache.map(entry => entry.index))
  runEstimatedHeightMutation(() => importMeasuredHeightCache(cache, options))
  seedCurrentNodeHeightSignatures()
}

function pruneHeightMeasurements(size: number) {
  resetEstimatedNodeHeightCache()
  runEstimatedHeightMutation(() => pruneMeasuredHeightMeasurements(size))
}
const deferNodes = computed(() => {
  return deferNodesDomRequired.value && viewportPriorityEnabled.value
})
const measuredContainerWidthActive = computed(() => {
  return heightEstimationActive.value
    || incrementalRenderingDomRequired.value
    || (deferNodes.value && parsedNodes.value.length > resolvedInitialBatch.value)
})
const incrementalRenderingConfigured = computed(() => {
  return !renderAsFragment.value
    && rendererProps.batchRendering !== false
    && resolvedBatchSize.value > 0
    && (rendererProps.maxLiveNodes ?? 0) <= 0
})
const stableLayoutDomEnabled = computed(() => {
  return !renderAsFragment.value
    && stableLayoutInitiallyFinal
    && effectiveFinal.value === true
    && !virtualizationEnabled.value
    && !virtualScrollRequested.value
    && !heightExperimentDomRequired.value
    && !deferNodes.value
    && !incrementalRenderingConfigured.value
})
const shouldObserveSlots = computed(() => !!registerNodeVisibility && deferNodes.value)

/**
 * Serialized snapshot of every input that drives the slot visibility
 * registration. When it is unchanged for a given element, the existing
 * registration (observer handle / watch / fallback timer / visible state)
 * remains valid and `setNodeSlotElement` can skip re-registration.
 */
// Serialized snapshot of every input that drives the slot visibility
// registration. When it is unchanged for a given element, the existing
// registration (observer handle / watch / fallback timer / visible state)
// remains valid and `setNodeSlotElement` can skip re-registration. Cached as a
// computed: the same inputs previously produced a fresh join('|') string per
// slot per re-render (Vue 3.5 re-invokes function refs on every patch), which
// was O(N) string allocations per streaming commit.
const nodeSlotRegistrationKey = computed(() => [
  shouldObserveSlots.value,
  deferNodes.value,
  virtualizationEnabled.value,
  viewportPriorityAutoDisabled.value,
  viewportPriorityMaxTargets.value,
  viewportPriorityRootMargin.value,
  resolvedInitialBatch.value,
  Boolean(registerNodeVisibility),
].join('|'))
const scrollListenerEnabled = computed(() => virtualizationEnabled.value || virtualScrollEnabled.value)
const {
  focusIndex,
  liveRange,
  updateLiveRange,
} = useLiveRangeState(rendererProps, {
  parsedNodeCount,
  virtualizationEnabled,
  maxLiveNodesResolved,
  liveNodeBufferResolved,
  clamp,
})
const nodeContentElements = new Map<number, HTMLElement | null>()
const nodeContentVersions = new Map<number, number>()
/**
 * Snapshot of the parsed node an element was last registered with. Function
 * refs are re-invoked on every patch in Vue 3.5 (even with a stable callback),
 * so `setNodeContentRef` runs once per rendered node per streaming commit.
 * When both the element and the parsed node reference (plus its in-place
 * `loading` snapshot) are unchanged, the node content is byte-identical and
 * the measurement/observer re-registration can be skipped entirely.
 */
const nodeContentRegistration = new Map<number, { el: HTMLElement, node: ParsedNode | undefined, loading: unknown }>()
const nodeContentDeferredMeasureTimers = new Map<number, number[]>()
const finalHeightConvergenceTimers: number[] = []
const pendingHeightMeasurements = new Map<number, { height: number, allowShrink: boolean, version: number, el: HTMLElement }>()
/** Maximum interval between full re-measure passes before metrics emission. */
const METRICS_FULL_SCAN_INTERVAL_MS = 120
// Below this many pending height records, flushVirtualMetricsEmit lets the
// already-scheduled rAF write them back in one batch instead of force-flushing
// (cancelling the rAF) on every emission.
const PENDING_HEIGHT_FORCE_FLUSH_THRESHOLD = 8
let lastFullMetricsScanAt = -Infinity
const activeHeightSettlingTimers = new Set<number>()
const heightSettlingTimerVersion = ref(0)
let heightSettlingTimerVersionQueued = false
const pendingHeightSettlingTaskCount = computed(() => {
  void heightSettlingTimerVersion.value
  return activeHeightSettlingTimers.size
})

interface PendingAsyncNodeRecord {
  index: number
  sessionKey: string
  threadKey?: string
  layoutEpochKey: string
}

const pendingAsyncNodeCounts = new Map<string, number>()
const pendingAsyncNodeRecords = new Map<string, PendingAsyncNodeRecord>()
const pendingAsyncNodeVersion = ref(0)
// O(1) counter kept in sync by the increment/decrement/prune/clear paths;
// the version ref still drives the computed's re-evaluation semantics.
let pendingAsyncNodeTotal = 0
const pendingAsyncNodeCount = computed(() => {
  void pendingAsyncNodeVersion.value
  return pendingAsyncNodeTotal
})
let heightMeasurementRaf: number | null = null

const desiredRenderedCount = computed(() => {
  if (!virtualizationEnabled.value)
    return parsedNodes.value.length
  const overscan = liveNodeBufferResolved.value
  const windowEnd = Math.max(liveRange.end + overscan, resolvedInitialBatch.value)
  const target = Math.min(parsedNodes.value.length, windowEnd)
  return Math.max(renderedCount.value, target)
})

function bumpHeightSettlingTimerVersion() {
  if (heightSettlingTimerVersionQueued)
    return

  heightSettlingTimerVersionQueued = true
  queueMicrotask(() => {
    heightSettlingTimerVersionQueued = false
    heightSettlingTimerVersion.value += 1
  })
}

function scheduleHeightSettlingTimer(
  delay: number,
  task: () => void,
  reason: MarkstreamVirtualReason = 'node-resize',
) {
  if (!isClient || typeof window === 'undefined')
    return null

  const timer = window.setTimeout(() => {
    if (activeHeightSettlingTimers.delete(timer))
      bumpHeightSettlingTimerVersion()

    try {
      task()
    }
    finally {
      scheduleVirtualMetricsEmit(reason)
    }
  }, Math.max(0, delay))

  activeHeightSettlingTimers.add(timer)
  bumpHeightSettlingTimerVersion()
  return timer
}

function clearHeightSettlingTimer(timer: number | null | undefined) {
  if (!isClient || timer == null)
    return

  if (activeHeightSettlingTimers.delete(timer))
    bumpHeightSettlingTimerVersion()

  window.clearTimeout(timer)
}

function clearAllHeightSettlingTimers() {
  if (isClient && typeof window !== 'undefined') {
    for (const timer of activeHeightSettlingTimers)
      window.clearTimeout(timer)
  }

  if (activeHeightSettlingTimers.size) {
    activeHeightSettlingTimers.clear()
    bumpHeightSettlingTimerVersion()
  }

  finalHeightConvergenceTimers.length = 0
  nodeContentDeferredMeasureTimers.clear()
}

function ensureExperimentProbeNodes() {
  if (paragraphProbeNode.value && listItemProbeNode.value && listProbeNode.value && headingProbeNodes.value?.[1])
    return

  const paragraph = markRaw({
    type: 'paragraph',
    children: [{ type: 'text', content: 'Probe paragraph text', raw: 'Probe paragraph text' }],
    raw: 'Probe paragraph text',
  }) as ParsedNode
  const listItem = markRaw({
    type: 'list_item',
    children: [paragraph],
    raw: '- Probe paragraph text',
  }) as ParsedNode
  const list = markRaw({
    type: 'list',
    ordered: false,
    items: [listItem],
    raw: '- Probe paragraph text',
  }) as ParsedNode

  paragraphProbeNode.value = paragraph
  listItemProbeNode.value = listItem
  listProbeNode.value = list
  const headings: Record<number, ParsedNode | null> = {
    1: null,
    2: null,
    3: null,
    4: null,
    5: null,
    6: null,
  }
  for (let level = 1; level <= 6; level++) {
    headings[level] = markRaw({
      type: 'heading',
      level,
      text: 'Probe heading',
      children: [{ type: 'text', content: 'Probe heading', raw: 'Probe heading' }],
      raw: `${'#'.repeat(level)} Probe heading`,
    }) as ParsedNode
  }
  headingProbeNodes.value = headings
}

function setParagraphProbeWrapper(el: HTMLElement | null) {
  paragraphProbeWrapperRef.value = el
}

function setListItemProbeWrapper(el: HTMLElement | null) {
  listItemProbeWrapperRef.value = el
}

function setListProbeWrapper(el: HTMLElement | null) {
  listProbeWrapperRef.value = el
}

const {
  cancelScheduledFocusSync,
  scheduleFocusSync,
} = useFocusSyncScheduler({
  isClient,
  containerRef,
  virtualizationEnabled,
  requestFrame,
  cancelFrame,
  syncFocusToScroll,
})

const {
  visibleNodeIndices,
  nodeVisibilityHandles,
  nodeVisibilityWatchStops,
  nodeVisibilityFallbackTimers,
  clearVisibilityFallback,
  markNodeVisible,
  cleanupNodeVisibility,
  destroyNodeVisibilityState,
} = useNodeVisibilityState({
  isClient,
  shouldTrackVisibleNodeIndices: () => deferNodes.value,
  shouldCleanupNodeVisibility: () => virtualizationEnabled.value,
  onNodeMarkedVisible: (index) => {
    if (virtualizationEnabled.value)
      scheduleFocusSync()
    else
      focusIndex.value = clamp(index, 0, Math.max(0, parsedNodes.value.length - 1))
  },
  onNodeVisibilityCleaned: (index) => {
    if (nodeSlotElements.delete(index))
      bumpNodeSlotVersion()
  },
})

const {
  cleanupScrollListener,
  setupScrollListener,
} = useScrollListener({
  isClient,
  virtualizationEnabled,
  listenerEnabled: scrollListenerEnabled,
  scrollRootElement,
  resolveScrollContainer,
  scheduleFocusSync,
  onScroll: handleVirtualScrollRootScroll,
  requestFrame,
  cancelFrame,
  getScrollTop: (root) => {
    const doc = root.ownerDocument || containerRef.value?.ownerDocument || document
    const isViewportRoot = root === doc.documentElement
      || root === doc.body
      || root === doc.scrollingElement

    return readLayout('scrollListener.getScrollTop', () => getNormalizedScrollTop(root, doc, isViewportRoot))
  },
})

function syncFocusToScroll(force = false) {
  if (!virtualizationEnabled.value)
    return
  const root = scrollRootElement.value || resolveScrollContainer()
  if (!root)
    return
  const doc = root.ownerDocument || containerRef.value?.ownerDocument || document
  const view = doc?.defaultView || (typeof window !== 'undefined' ? window : null)
  const isViewportRoot = root === doc?.documentElement || root === doc?.body

  const total = parsedNodes.value.length
  if (total <= 0)
    return

  const reverseFlex = !isViewportRoot && total > 0 && isReverseFlexScrollRoot(root)
  if (reverseFlex) {
    // In reverse-flex scroll roots (chat UIs), `scrollTop` is effectively the
    // distance from the bottom (often 0 when pinned). Estimating focus from
    // the end keeps the virtual window responsive while scrolling upward
    // through large spacers.
    const viewportHeight = readLayout('syncFocusToScroll.clientHeight', () => root.clientHeight || 0)
    const raw = readLayout('syncFocusToScroll.scrollTop', () => root.scrollTop)
    // Some browsers report negative scrollTop with `flex-direction: column-reverse`.
    const distanceFromBottom = raw < 0 ? -raw : raw
    const offsetFromBottom = Math.max(0, distanceFromBottom) + Math.max(0, viewportHeight) * 0.5
    const estimated = estimateIndexForOffsetFromEnd(offsetFromBottom)
    const next = clamp(estimated, 0, Math.max(0, total - 1))
    applyScrollFocusIndex(next, force)
    return
  }

  const estimated = estimateFocusIndexFromScroll(root, doc, view, isViewportRoot)
  if (estimated != null) {
    applyScrollFocusIndex(estimated, force)
    return
  }

  const rootRect = !isViewportRoot
    ? readLayout('syncFocusToScroll.root.getBoundingClientRect', () => root.getBoundingClientRect())
    : null
  const viewportTop = isViewportRoot ? 0 : rootRect!.top
  const viewportBottom = isViewportRoot
    ? readLayout('syncFocusToScroll.viewport.clientHeight', () => view?.innerHeight ?? root.clientHeight ?? 0)
    : rootRect!.bottom
  const entries = sortedNodeSlots.value
  let firstVisible: number | null = null
  let lastVisible: number | null = null
  for (const [index, el] of entries) {
    if (!el)
      continue
    const rect = readLayout('syncFocusToScroll.slot.getBoundingClientRect', () => el.getBoundingClientRect())
    if (rect.bottom <= viewportTop || rect.top >= viewportBottom)
      continue
    if (firstVisible == null)
      firstVisible = index
    lastVisible = index
  }
  if (firstVisible == null || lastVisible == null) {
    const container = containerRef.value
    if (!container)
      return
    const rootRect = isViewportRoot
      ? { top: 0 }
      : readLayout('syncFocusToScroll.fallback.root.getBoundingClientRect', () => root.getBoundingClientRect())
    const rootScrollTop = readLayout('syncFocusToScroll.fallback.scrollTop', () => getNormalizedScrollTop(root, doc, isViewportRoot))
    const relativeScrollTop = isViewportRoot
      ? (() => {
          // For viewport scrolling, estimate how far we've scrolled into the
          // container by its visual position (negative top means we've scrolled
          // past it).
          const containerRect = readLayout('syncFocusToScroll.fallback.container.getBoundingClientRect', () => container.getBoundingClientRect())
          const rel = (isViewportRoot ? 0 : rootRect.top) - containerRect.top
          return Math.max(0, rel)
        })()
      : (() => {
          const offsetTop = getOffsetTopWithinRoot(container, root)
          return Math.max(0, rootScrollTop - offsetTop)
        })()
    const viewportHeight = isViewportRoot
      ? readLayout('syncFocusToScroll.fallback.viewport.clientHeight', () => view?.innerHeight ?? doc?.documentElement?.clientHeight ?? root.clientHeight ?? 0)
      : readLayout('syncFocusToScroll.fallback.root.clientHeight', () => root.clientHeight)
    const targetOffset = relativeScrollTop + Math.max(0, viewportHeight) * 0.5
    const estimated = estimateIndexForOffset(targetOffset)
    applyScrollFocusIndex(clamp(estimated, 0, Math.max(0, parsedNodes.value.length - 1)), true)
    return
  }
  const midpoint = Math.round((firstVisible + lastVisible) / 2)
  applyScrollFocusIndex(midpoint, force)
}

function applyScrollFocusIndex(index: number, force = false) {
  const next = clamp(index, 0, Math.max(0, parsedNodes.value.length - 1))
  if (!force && Math.abs(next - focusIndex.value) <= 1)
    return

  focusIndex.value = next
  updateLiveRange()
}

function estimateFocusIndexFromScroll(
  root: HTMLElement,
  doc: Document,
  view: Window | null,
  isViewportRoot: boolean,
) {
  const container = containerRef.value
  if (!container)
    return null

  const viewportTop = isViewportRoot
    ? 0
    : readLayout('syncFocusToScroll.model.root.getBoundingClientRect', () => root.getBoundingClientRect().top)
  const containerTop = readLayout('syncFocusToScroll.model.container.getBoundingClientRect', () => container.getBoundingClientRect().top)
  const relativeScrollTop = Math.max(0, viewportTop - containerTop)
  const viewportHeight = isViewportRoot
    ? readLayout('syncFocusToScroll.model.viewport.clientHeight', () => view?.innerHeight ?? doc.documentElement?.clientHeight ?? root.clientHeight ?? 0)
    : readLayout('syncFocusToScroll.model.root.clientHeight', () => root.clientHeight)
  const targetOffset = relativeScrollTop + Math.max(0, viewportHeight) * 0.5
  const estimated = estimateIndexForOffset(targetOffset)
  return clamp(estimated, 0, Math.max(0, parsedNodes.value.length - 1))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getParsedNodesDirtyStart(total = parsedNodes.value.length) {
  const dirtyStartIndex = getParsedNodesDirtyStartIndex()
  if (!Number.isInteger(dirtyStartIndex) || dirtyStartIndex < 0)
    return total

  return clamp(dirtyStartIndex, 0, total)
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

function setHeadingProbeWrapper(level: number, el: HTMLElement | null) {
  if (level < 1 || level > 6)
    return
  headingProbeWrapperRefs[level] = el
}

function readSimpleTextProbeProfile() {
  if (!heightEstimationActive.value || typeof window === 'undefined') {
    simpleTextProbeProfile.value = createEmptySimpleTextProbeProfile()
    markFallbackHeightPrefixDirty()
    return
  }

  const nextProfile = createEmptySimpleTextProbeProfile()
  const paragraphRoot = getProbeRoot(paragraphProbeWrapperRef.value)
  const paragraphTextEl = getProbeElement(paragraphRoot, '.paragraph-node')
  nextProfile.paragraph = buildBlockTextProfile(paragraphProbeWrapperRef.value, paragraphTextEl, 'pre-wrap')

  const listItemRoot = getProbeRoot(listItemProbeWrapperRef.value)
  const listItemTextEl = listItemRoot?.querySelector('.paragraph-node') as HTMLElement | null
  nextProfile.listItem = buildBlockTextProfile(listItemProbeWrapperRef.value, listItemTextEl, 'pre-wrap')

  const listHeight = readLayout('readSimpleTextProbeProfile.list.offsetHeight', () => listProbeWrapperRef.value?.offsetHeight ?? 0)
  const listItemHeight = readLayout('readSimpleTextProbeProfile.listItem.offsetHeight', () => listItemProbeWrapperRef.value?.offsetHeight ?? 0)
  nextProfile.listWrapperOverhead = Math.max(0, listHeight - listItemHeight)

  for (let level = 1; level <= 6; level++) {
    const headingRoot = getProbeRoot(headingProbeWrapperRefs[level])
    const headingTextEl = getProbeElement(headingRoot, `h${level}`)
    nextProfile.headings[level] = buildBlockTextProfile(headingProbeWrapperRefs[level], headingTextEl, 'pre-wrap')
  }

  simpleTextProbeProfile.value = nextProfile
  markFallbackHeightPrefixDirty()
}

function updateMeasuredContainerWidth() {
  if (!measuredContainerWidthActive.value || typeof ResizeObserver === 'undefined') {
    measuredContainerWidth.value = 0
    return
  }
  const width = readLayout('updateMeasuredContainerWidth.clientWidth', () => containerRef.value?.clientWidth ?? 0)
  measuredContainerWidth.value = width > 0 ? width : 0
}

let containerResizeObserver: ResizeObserver | null = null

function cleanupContainerResizeObserver() {
  containerResizeObserver?.disconnect()
  containerResizeObserver = null
}

function setupContainerResizeObserver() {
  cleanupContainerResizeObserver()
  if (!measuredContainerWidthActive.value || !containerRef.value || typeof ResizeObserver === 'undefined')
    return
  containerResizeObserver = new ResizeObserver(() => {
    updateMeasuredContainerWidth()
    if (!heightEstimationActive.value)
      return
    if (activeRestoreAnchor.value)
      scheduleRestoreReconcile()
    if (activeVirtualBottomAnchor.value)
      scheduleVirtualBottomRestoreReconcile()
    scheduleVirtualMetricsEmit('resize')
  })
  containerResizeObserver.observe(containerRef.value)
}

const codeBlockComponent = computed(() => {
  if (resolvedRenderCodeBlocksAsPre.value)
    return PreCodeBlockAsync
  return CodeBlockNodeAsync
})

function resolveCodeBlockRendererKind(node: ParsedNode) {
  if (node.type !== 'code_block')
    return null
  const component = getNodeComponent(node, getCodeBlockLanguage(node))
  if (component === PreCodeBlockAsync)
    return 'pre'
  if (component === codeBlockComponent.value || component === CodeBlockNodeAsync)
    return 'stream-diffs'
  return null
}

function resolveCodeBlockShowHeader() {
  const showHeader = rendererProps.codeBlockProps?.showHeader
  return showHeader !== false
}

function resolveCodeBlockShowCopyButton() {
  return rendererProps.codeBlockProps?.showCopyButton !== false
}

function resolveCodeBlockShowLineNumbers() {
  const value = rendererProps.codeBlockProps?.showLineNumbers
  return typeof value === 'boolean'
    ? value
    : rendererProps.codeBlockOptions?.disableLineNumbers !== true
}

function isParagraphTextEstimateAffectedByCustomComponent(node: ParsedNode) {
  if (!customComponentsMap.value.paragraph)
    return false

  return node.type === 'paragraph' || node.type === 'list_item' || node.type === 'list'
}

function estimateNodeHeight(node: ParsedNode, index: number, width: number) {
  const measuredHeight = nodeHeights[index]
  const hasMeasuredHeight = typeof measuredHeight === 'number' && measuredHeight > 0

  if (
    textEstimationEnabled.value
    && !hasMeasuredHeight
    && !isParagraphTextEstimateAffectedByCustomComponent(node)
  ) {
    const estimatedText = estimateSimpleTextBlockHeight(node, width, simpleTextProbeProfile.value)
    if (estimatedText)
      return estimatedText
  }

  if (codeBlockEstimationEnabled.value && !hasMeasuredHeight && node.type === 'code_block') {
    const rendererKind = resolveCodeBlockRendererKind(node)
    if (rendererKind === 'stream-diffs' || rendererKind === 'pre') {
      return estimateCodeBlockHeight(node, {
        rendererKind,
        codeBlockOptions: rendererProps.codeBlockOptions,
        showHeader: resolveCodeBlockShowHeader(),
        showLineNumbers: resolveCodeBlockShowLineNumbers(),
        width,
        diffStyle: rendererProps.codeBlockOptions?.diffStyle,
      })
    }
  }

  return null
}

function getEstimatedNodeHeightContext(width: number) {
  const visual = resolvePreCodeVisualOptions(rendererProps.codeBlockOptions)
  return [
    Math.round(width),
    textEstimationEnabled.value,
    codeBlockEstimationEnabled.value,
    simpleTextProbeProfile.value,
    visual.fontSize,
    visual.lineHeight,
    visual.fontFamily,
    visual.padding,
    visual.paddingBottom,
    visual.maxHeight,
    visual.tabSize,
    visual.overflow,
    rendererProps.codeBlockOptions?.diffStyle ?? 'split',
    resolveCodeBlockShowLineNumbers(),
    resolveCodeBlockShowHeader(),
    resolveCodeBlockShowCopyButton(),
    resolvedRenderCodeBlocksAsPre.value,
    customComponentsMap.value,
    heightEstimationExperimentRevision.value,
  ]
}

function hasSameEstimatedNodeHeightContext(previous: unknown[], next: unknown[]) {
  return previous.length === next.length
    && previous.every((value, index) => Object.is(value, next[index]))
}

watchEffect(() => {
  void estimatedHeightMutationRevision.value
  if (estimatedHeightMutationDepth > 0)
    return

  const nodes = parsedNodes.value
  const parserRevision = getParsedNodesRevision()
  if (!nodes.length || !nodeHeightEstimationActive.value) {
    estimatedNodeHeightsCache = []
    estimatedNodeHeightsContext = []
    estimatedNodeHeightsParserRevision = -1
    estimatedHeightDirtyIndices.clear()
    estimatedNodeHeightsState.value = EMPTY_ESTIMATED_NODE_HEIGHTS
    return
  }

  const width = measuredContainerWidth.value || readLayout('estimatedNodeHeights.clientWidth', () => containerRef.value?.clientWidth || 0)
  if (!Number.isFinite(width) || width <= 0) {
    estimatedNodeHeightsCache = []
    estimatedNodeHeightsContext = []
    estimatedNodeHeightsParserRevision = -1
    estimatedHeightDirtyIndices.clear()
    estimatedNodeHeightsState.value = EMPTY_ESTIMATED_NODE_HEIGHTS
    return
  }

  const context = getEstimatedNodeHeightContext(width)
  const canReuseCache = estimatedNodeHeightsCache.length <= nodes.length
    && hasSameEstimatedNodeHeightContext(estimatedNodeHeightsContext, context)
  const parserDirtyStart = canReuseCache && estimatedNodeHeightsParserRevision === parserRevision
    ? nodes.length
    : canReuseCache ? getParsedNodesDirtyStart(nodes.length) : 0
  const dirtyIndices = canReuseCache
    ? Array.from(estimatedHeightDirtyIndices)
    : []

  estimatedNodeHeightsCache.length = nodes.length
  for (let index = parserDirtyStart; index < nodes.length; index++)
    estimatedNodeHeightsCache[index] = estimateNodeHeight(nodes[index]!, index, width)

  for (const index of dirtyIndices) {
    if (index >= 0 && index < nodes.length && index < parserDirtyStart)
      estimatedNodeHeightsCache[index] = estimateNodeHeight(nodes[index]!, index, width)
  }

  estimatedHeightDirtyIndices.clear()
  estimatedNodeHeightsContext = context
  estimatedNodeHeightsParserRevision = parserRevision
  estimatedNodeHeightsState.value = estimatedNodeHeightsCache
  triggerRef(estimatedNodeHeightsState)
}, { flush: 'sync' })

const estimatedNodeHeights = computed(() => estimatedNodeHeightsState.value)

heightModel = useHeightModel({
  parsedNodes,
  nodeHeights,
  heightStats,
  heightTreeSize,
  heightSumTree,
  heightKnownTree,
  averageNodeHeight,
  heightEstimationActive,
  estimatedNodeHeights,
  getContainerWidth: getMeasuredContainerWidth,
  shouldCacheStaticFallbackHeight: () => !props.nodes?.length,
  hasCustomParagraphComponent: () => Boolean(customComponentsMap.value.paragraph),
  getPrefixCacheKeyParts: () => {
    const width = measuredContainerWidth.value || readLayout('getFallbackHeightPrefix.clientWidth', () => containerRef.value?.clientWidth || 0)
    const widthBucket = getHeightCacheWidthBucket(width)
    const measurementKey = props.virtualScroll?.measurementKey == null
      ? ''
      : String(props.virtualScroll.measurementKey)

    // Structural configuration only. Content/measurement changes invalidate
    // via markFallbackHeightPrefixDirty(index) instead of this key, so
    // streaming appends rebuild the prefix incrementally (O(dirty tail))
    // rather than forcing a full O(N) rebuild on every commit.
    return [
      measurementKey,
      widthBucket,
      heightEstimationActive.value ? 1 : 0,
      heightEstimationExperimentRevision.value,
      customComponentsMap.value.paragraph ? 1 : 0,
    ]
  },
  fenwickRangeSum,
})
heightModelReady = true

watch(
  () => parsedNodes.value.length,
  (length, previousLength) => {
    // Dataset shrinks and resets invalidate the whole prefix; streaming
    // appends only need the dirty tail recomputed.
    markFallbackHeightPrefixDirty(
      previousLength != null && length >= previousLength
        ? getParsedNodesDirtyStart(length)
        : 0,
    )
    if (length <= 0) {
      resetHeightMeasurements()
      return
    }
    if (length < heightTreeSize.value)
      pruneHeightMeasurements(length)
    // Streaming appends grow the Fenwick trees incrementally instead of
    // rebuilding them (and re-allocating O(N) arrays) on every commit.
    syncHeightTreeSize(length)
  },
  { immediate: true },
)

const visibleNodes = computed(() => {
  // Use the full `parsedNodes` list to build the visible window so that
  // placeholders and spacer heights represent the entire dataset even when
  // only a subset of nodes has been fully rendered so far.
  if (!virtualizationEnabled.value)
    return parsedNodes.value.map((node, index) => ({ node, index }))
  const total = parsedNodes.value.length
  const start = clamp(liveRange.start, 0, total)
  const end = clamp(liveRange.end, start, total)
  return parsedNodes.value.slice(start, end).map((node, idx) => ({
    node,
    index: start + idx,
  }))
})

const topSpacerHeight = computed(() => {
  if (!virtualizationEnabled.value)
    return 0
  // Estimate height from the start up to the live window start based on
  // recorded heights or averages for the full parsedNodes list.
  return estimateHeightRange(0, Math.min(liveRange.start, parsedNodes.value.length))
})

const bottomSpacerHeight = computed(() => {
  if (!virtualizationEnabled.value)
    return 0
  // Estimate height after the live window end up to the total number of
  // parsed nodes. This ensures the scrollable area matches the full
  // dataset even when not all nodes are currently rendered.
  const total = parsedNodes.value.length
  const end = Math.min(liveRange.end, total)
  return estimateHeightRange(end, total)
})

function buildVirtualHeightSummary(): VirtualHeightSummary {
  return heightModel.buildVirtualHeightSummary({
    topSpacerHeight: topSpacerHeight.value,
    bottomSpacerHeight: bottomSpacerHeight.value,
    width: getCurrentVirtualWidth(),
  })
}

function buildExperimentReport() {
  const nodes = parsedNodes.value
  const summary = buildVirtualHeightSummary()

  return {
    ...summary,
    probe: {
      paragraphReady: Boolean(simpleTextProbeProfile.value.paragraph),
      listItemReady: Boolean(simpleTextProbeProfile.value.listItem),
      listWrapperOverhead: simpleTextProbeProfile.value.listWrapperOverhead,
      headingReadyLevels: Object.entries(simpleTextProbeProfile.value.headings)
        .filter(([, value]) => Boolean(value))
        .map(([level]) => Number(level)),
    },
    nodes: nodes.map((node, index) => ({
      index,
      type: node.type,
      estimateKind: estimatedNodeHeights.value[index]?.kind ?? null,
      rendererKind: estimatedNodeHeights.value[index]?.rendererKind ?? null,
      estimatedHeight: estimatedNodeHeights.value[index]?.height ?? null,
      estimatedContentHeight: estimatedNodeHeights.value[index]?.contentHeight ?? null,
      measuredHeight: nodeHeights[index] ?? null,
    })),
  }
}

function getCurrentIndexPrefix() {
  if (props.indexKey != null)
    return String(props.indexKey)

  if (virtualScrollRequested.value)
    return `virtual-${getVirtualSessionKey()}`

  return 'markdown-renderer'
}

function resolveLifecycleNodeIndex(indexKey: string | number) {
  const key = String(indexKey)
  const prefix = `${getCurrentIndexPrefix()}-`
  if (!key.startsWith(prefix))
    return null

  const match = key.slice(prefix.length).match(/^(\d+)(?:$|-)/)
  if (!match)
    return null

  const index = Number(match[1])
  if (!Number.isInteger(index) || index < 0 || index >= parsedNodes.value.length)
    return null

  return index
}

function getVirtualSessionKey() {
  const explicit = props.virtualScroll?.sessionKey
  if (explicit != null && explicit !== '')
    return String(explicit)

  return String(props.indexKey ?? rendererProps.customId ?? instanceMsgId)
}

function getVirtualThreadKey() {
  const key = props.virtualScroll?.threadKey
  return key == null || key === '' ? undefined : String(key)
}

const rendererSessionIdentity = computed(() => getVirtualThreadKey()
  ?? String(props.indexKey ?? rendererProps.customId ?? instanceMsgId))

function isSameVirtualThreadKey(threadKey: string | undefined) {
  return (threadKey ?? '') === (getVirtualThreadKey() ?? '')
}

function getVirtualRendererLayoutKey() {
  return buildVirtualRendererLayoutKey({
    renderCodeBlocksAsPre: resolvedRenderCodeBlocksAsPre.value,
    isDark: rendererProps.isDark,
    codeBlockStream: rendererProps.codeBlockStream,
    codeBlockMinWidth: rendererProps.codeBlockMinWidth,
    codeBlockMaxWidth: rendererProps.codeBlockMaxWidth,
    codeBlockOptions: rendererProps.codeBlockOptions,
    codeBlockProps: rendererProps.codeBlockProps,
  })
}

function getVirtualMeasurementKey() {
  return buildVirtualMeasurementKey(
    props.virtualScroll?.measurementKey,
    getVirtualRendererLayoutKey(),
  )
}

function getCurrentVirtualWidth() {
  return getMeasuredContainerWidth()
}

const virtualLayoutWidthBucket = computed(() => {
  return getHeightCacheWidthBucket(getCurrentVirtualWidth())
})

const virtualLayoutEpochKey = computed(() => {
  return [
    getVirtualMeasurementKey(),
    virtualLayoutWidthBucket.value,
  ].join('\u0000')
})

const batchDatasetKey = computed(() => {
  if (virtualScrollRequested.value) {
    return [
      'virtual',
      getVirtualThreadKey() ?? '',
      getVirtualSessionKey(),
      virtualLayoutEpochKey.value,
    ].join('\u0000')
  }

  return props.indexKey
})

function bumpAsyncNodeVersion() {
  pendingAsyncNodeVersion.value += 1
}

function getPendingAsyncNodeRecord(index: number): PendingAsyncNodeRecord {
  return {
    index,
    sessionKey: getVirtualSessionKey(),
    threadKey: getVirtualThreadKey(),
    layoutEpochKey: virtualLayoutEpochKey.value,
  }
}

function isUsablePendingAsyncNodeRecord(record: PendingAsyncNodeRecord | undefined) {
  if (!record)
    return false

  if (!Number.isInteger(record.index) || record.index < 0 || record.index >= parsedNodes.value.length)
    return false

  return record.sessionKey === getVirtualSessionKey()
    && record.threadKey === getVirtualThreadKey()
    && record.layoutEpochKey === virtualLayoutEpochKey.value
}

function resolveLifecycleNodeIndexForPendingKey(indexKey: string | number) {
  const key = String(indexKey)
  const record = pendingAsyncNodeRecords.get(key)

  if (record)
    return isUsablePendingAsyncNodeRecord(record) ? record.index : null

  return resolveLifecycleNodeIndex(key)
}

function hasPendingAsyncNodeKey(indexKey: string | number) {
  return pendingAsyncNodeCounts.has(String(indexKey))
}

function incrementPendingAsyncNodeKey(key: string, index: number) {
  const previousRecord = pendingAsyncNodeRecords.get(key)
  if (previousRecord && isUsablePendingAsyncNodeRecord(previousRecord)) {
    pendingAsyncNodeCounts.set(
      key,
      Math.max(0, pendingAsyncNodeCounts.get(key) ?? 0) + 1,
    )
    pendingAsyncNodeTotal += 1
    bumpAsyncNodeVersion()
    scheduleVirtualMetricsEmit('async-node')
    return
  }

  pendingAsyncNodeCounts.set(key, 1)
  pendingAsyncNodeTotal += 1
  pendingAsyncNodeRecords.set(key, getPendingAsyncNodeRecord(index))
  bumpAsyncNodeVersion()

  scheduleVirtualMetricsEmit('async-node')
}

function pruneStalePendingAsyncNodeKeys(reason: MarkstreamVirtualReason = 'async-node') {
  let changed = false

  for (const [key, record] of Array.from(pendingAsyncNodeRecords.entries())) {
    if (isUsablePendingAsyncNodeRecord(record))
      continue

    pendingAsyncNodeTotal -= Math.max(0, pendingAsyncNodeCounts.get(key) ?? 0)
    pendingAsyncNodeRecords.delete(key)
    pendingAsyncNodeCounts.delete(key)
    changed = true
  }

  if (!changed)
    return

  bumpAsyncNodeVersion()
  scheduleVirtualMetricsEmit(reason)
}

function decrementPendingAsyncNodeKey(key: string) {
  const previous = pendingAsyncNodeCounts.get(key) ?? 0
  if (previous <= 0)
    return false

  if (previous <= 1) {
    pendingAsyncNodeCounts.delete(key)
    pendingAsyncNodeRecords.delete(key)
  }
  else {
    pendingAsyncNodeCounts.set(key, previous - 1)
  }
  pendingAsyncNodeTotal = Math.max(0, pendingAsyncNodeTotal - 1)
  bumpAsyncNodeVersion()

  if (previous === 1) {
    scheduleVirtualMetricsEmit('async-node')
  }

  return true
}

function clearPendingAsyncNodeKeysForIndex(index: number) {
  const nodeKey = `${getCurrentIndexPrefix()}-${index}`
  let changed = false

  for (const key of Array.from(pendingAsyncNodeCounts.keys())) {
    const record = pendingAsyncNodeRecords.get(key)
    const belongsToIndex = record?.index === index
      || key === nodeKey
      || key.startsWith(`${nodeKey}-`)

    if (belongsToIndex) {
      pendingAsyncNodeTotal -= Math.max(0, pendingAsyncNodeCounts.get(key) ?? 0)
      pendingAsyncNodeCounts.delete(key)
      pendingAsyncNodeRecords.delete(key)
      changed = true
    }
  }

  if (changed) {
    bumpAsyncNodeVersion()
    scheduleVirtualMetricsEmit('async-node')
  }
}

function clearAllPendingAsyncNodeKeys(reason: MarkstreamVirtualReason = 'async-node') {
  if (!pendingAsyncNodeCounts.size && !pendingAsyncNodeRecords.size)
    return

  pendingAsyncNodeTotal = 0
  pendingAsyncNodeCounts.clear()
  pendingAsyncNodeRecords.clear()
  bumpAsyncNodeVersion()
  scheduleVirtualMetricsEmit(reason)
}

const parentNodeLifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY, null)

const localNodeLifecycle: MarkstreamNodeLifecycle = {
  reportHeight(indexKey, height) {
    if (!virtualScrollEnabled.value)
      return

    const index = resolveLifecycleNodeIndexForPendingKey(indexKey)
    if (index == null)
      return

    const currentEl = nodeContentElements.get(index)
    if (!currentEl)
      return

    const measuredHeight = Number(height)
    const wrapperHeight = getNodeLayoutHeight(index, currentEl)
    const nextHeight = Number.isFinite(measuredHeight) && measuredHeight > 0
      ? Math.max(measuredHeight, wrapperHeight || 0)
      : wrapperHeight

    recordNodeHeight(index, nextHeight)
  },
  markPending(indexKey) {
    if (!virtualScrollEnabled.value)
      return

    const index = resolveLifecycleNodeIndex(indexKey)
    if (index == null)
      return

    const key = String(indexKey)
    incrementPendingAsyncNodeKey(key, index)
  },
  markSettled(indexKey) {
    if (!virtualScrollEnabled.value)
      return

    const key = String(indexKey)
    const index = resolveLifecycleNodeIndexForPendingKey(indexKey)
    if (index == null && !hasPendingAsyncNodeKey(key))
      return

    if (!decrementPendingAsyncNodeKey(key))
      return

    // Measure only the settled node instead of re-scanning every mounted
    // element: each settle previously triggered a full-height pass, which
    // compounded into the settle measurement storm.
    if (index != null) {
      const el = nodeContentElements.get(index)
      if (el)
        measureNodeHeight(index, el)
    }
  },
}

const providedNodeLifecycle: MarkstreamNodeLifecycle = {
  reportHeight(indexKey, height) {
    localNodeLifecycle.reportHeight(indexKey, height)
    parentNodeLifecycle?.reportHeight(indexKey, height)
  },
  markPending(indexKey) {
    localNodeLifecycle.markPending(indexKey)
    parentNodeLifecycle?.markPending(indexKey)
  },
  markSettled(indexKey) {
    localNodeLifecycle.markSettled(indexKey)
    parentNodeLifecycle?.markSettled(indexKey)
  },
}

provide(MARKSTREAM_NODE_LIFECYCLE_KEY, providedNodeLifecycle)

function getVisibleDomHeight(preMeasuredHeight?: number) {
  // Prefer the total captured by the same-pass measureTrackedNodeHeights()
  // scan: reusing those readings skips a second
  // full offsetHeight sweep of nodeContentElements within the same emission.
  // Fall back to a fresh DOM scan when this frame skipped the full pass.
  if (preMeasuredHeight !== undefined)
    return preMeasuredHeight

  let total = 0

  for (const el of nodeContentElements.values())
    total += readLayout('getVisibleDomHeight.offsetHeight', () => el.offsetHeight)

  return total
}

function getVirtualizedDomLogicalHeight() {
  let total = topSpacerHeight.value + bottomSpacerHeight.value

  for (const el of nodeSlotElements.values()) {
    if (!el)
      continue

    total += Math.max(0, readLayout('getVirtualizedDomLogicalHeight.offsetHeight', () => el.offsetHeight || 0))
  }

  return Math.ceil(Math.max(0, total))
}

function getPlausibleVirtualizedContainerHeight(modelHeight: number, domHeight: number) {
  if (modelHeight <= 0 || domHeight <= 0)
    return 0

  // Accept small real DOM drift, but reject stale container scrollHeight.
  const driftBudget = Math.max(512, modelHeight * 0.05)
  return domHeight <= modelHeight + driftBudget
    ? Math.ceil(domHeight)
    : 0
}

let imperativeVirtualSettleSessionKey: string | null = null
let imperativeVirtualSettleThreadKey: string | undefined
let lastManualSettleSignature: string | null = null

function hasManualSettleSignal(token: unknown) {
  return token !== false && token != null && token !== ''
}

function hasMountedVirtualWindowContent() {
  if (!virtualizationEnabled.value)
    return true

  const total = parsedNodes.value.length
  const start = clamp(liveRange.start, 0, total)
  const end = clamp(liveRange.end, start, total)

  if (start >= end)
    return true

  for (let index = start; index < end; index++) {
    if (!nodeSlotElements.has(index))
      return false

    if (shouldRenderNode(index) && !nodeContentElements.has(index))
      return false
  }

  return true
}

function hasRenderedDesiredNodes() {
  if (virtualizationEnabled.value)
    return hasMountedVirtualWindowContent()

  return renderedCount.value >= desiredRenderedCount.value
}

function isInternalLayoutSettled() {
  return effectiveFinal.value === true
    && !contentStreamingTailActive.value
    && pendingAsyncNodeCount.value === 0
    && activeHeightSettlingTimers.size === 0
    && pendingHeightMeasurements.size === 0
    && heightMeasurementRaf == null
    && hasRenderedDesiredNodes()
}

function isHostSettleConfirmed() {
  if (props.virtualScroll?.settleMode !== 'manual')
    return true

  if (
    imperativeVirtualSettleSessionKey === getVirtualSessionKey()
    && imperativeVirtualSettleThreadKey === getVirtualThreadKey()
  ) {
    return true
  }

  const token = props.virtualScroll?.settledToken
  if (!hasManualSettleSignal(token))
    return false

  return lastManualSettleSignature === getManualSettleSignature(token)
}

function isLayoutSettled() {
  return isInternalLayoutSettled() && isHostSettleConfirmed()
}

function resolveVirtualPhase(phase?: MarkstreamVirtualPhase): MarkstreamVirtualPhase {
  if (phase)
    return phase
  if (effectiveFinal.value !== true)
    return parsedNodes.value.length > 0 ? 'streaming' : 'estimating'
  if (!hasRenderedDesiredNodes() || pendingHeightMeasurements.size > 0 || heightMeasurementRaf != null)
    return 'measuring'
  return isLayoutSettled() ? 'settled' : 'settling'
}

function resolveVirtualConfidence(
  phase: MarkstreamVirtualPhase,
  report: Pick<VirtualHeightSummary, 'totalNodes' | 'measuredCount' | 'estimatedCount'>,
) {
  if (report.totalNodes <= 0)
    return phase === 'final' ? 'final' : 'estimate'

  if (report.measuredCount >= report.totalNodes)
    return phase === 'final' ? 'final' : 'measured'

  if (report.measuredCount > 0 || report.estimatedCount > 0)
    return 'mixed'

  return 'estimate'
}

function getVirtualMetrics(
  reason: MarkstreamVirtualReason = 'manual',
  phase?: MarkstreamVirtualPhase,
  preMeasuredVisibleDomHeight?: number,
): MarkstreamVirtualMetrics {
  const summary = buildVirtualHeightSummary()
  const resolvedPhase = resolveVirtualPhase(phase)

  return {
    sessionKey: getVirtualSessionKey(),
    threadKey: getVirtualThreadKey(),
    phase: resolvedPhase,
    nodeCount: summary.totalNodes,
    liveRange: { start: liveRange.start, end: liveRange.end },
    renderedCount: renderedCount.value,
    measuredCount: summary.measuredCount,
    estimatedCount: summary.estimatedCount,
    averageNodeHeight: summary.averageNodeHeight,
    topSpacerHeight: summary.topSpacerHeight,
    bottomSpacerHeight: summary.bottomSpacerHeight,
    visibleDomHeight: getVisibleDomHeight(preMeasuredVisibleDomHeight),
    totalHeight: getRendererLogicalHeight(summary),
    width: summary.width,
    final: effectiveFinal.value === true,
    stable: isLayoutSettled(),
    confidence: resolveVirtualConfidence(resolvedPhase, summary),
    reason,
  }
}

function getScrollBox() {
  const root = scrollRootElement.value || resolveScrollContainer()
  const container = containerRef.value
  if (!root || !container)
    return null

  const doc = root.ownerDocument || container.ownerDocument || document
  const isViewportRoot = root === doc.documentElement
    || root === doc.body
    || root === doc.scrollingElement
  const scrollTop = readLayout('getScrollBox.scrollTop', () => getNormalizedScrollTop(root, doc, isViewportRoot))
  const scrollHeight = readLayout('getScrollBox.scrollHeight', () => isViewportRoot
    ? Math.max(doc.documentElement?.scrollHeight ?? 0, doc.body?.scrollHeight ?? 0, root.scrollHeight ?? 0)
    : root.scrollHeight)
  const clientHeight = readLayout('getScrollBox.clientHeight', () => isViewportRoot
    ? (doc.documentElement?.clientHeight || root.clientHeight || 0)
    : root.clientHeight)

  return {
    root,
    doc,
    isViewportRoot,
    scrollTop,
    scrollHeight,
    clientHeight,
  }
}

function getRendererLogicalHeight(summary?: VirtualHeightSummary) {
  const total = parsedNodes.value.length
  const modelHeight = Math.max(0, estimateHeightRange(0, total))
  const offsetHeight = readLayout('getRendererLogicalHeight.offsetHeight', () => containerRef.value?.offsetHeight ?? 0)
  const domHeight = Math.max(
    0,
    offsetHeight > 0
      ? offsetHeight
      : readLayout('getRendererLogicalHeight.scrollHeight', () => containerRef.value?.scrollHeight ?? 0),
  )

  if (total <= 0)
    return Math.ceil(offsetHeight)

  if (virtualizationEnabled.value) {
    if (modelHeight > 0) {
      return Math.max(
        1,
        Math.ceil(modelHeight),
        getVirtualizedDomLogicalHeight(),
        getPlausibleVirtualizedContainerHeight(modelHeight, domHeight),
      )
    }

    return Math.max(1, Math.ceil(domHeight))
  }

  if (virtualScrollEnabled.value) {
    const hasModelHeight = modelHeight > 0
      || heightStats.count > 0
      // Reuse the estimated count that buildVirtualHeightSummary already
      // computed for this metrics emission; calling the O(N) scan again here
      // would double the full estimates walk on every virtual-scroll frame.
      || (summary?.estimatedCount ?? getEstimatedNodeHeightCount()) > 0

    if (!hasModelHeight)
      return Math.ceil(domHeight)

    if (incrementalRenderingActive.value && renderedCount.value < total) {
      return Math.max(
        1,
        Math.ceil(domHeight),
        Math.ceil(modelHeight),
      )
    }

    // Non-internal-virtualized mode mounts the full renderer DOM, so the outer
    // virtualizer must not receive less than the actual DOM box.
    return Math.max(
      1,
      Math.ceil(domHeight),
      Math.ceil(modelHeight),
    )
  }

  return Math.max(
    1,
    Math.ceil(domHeight),
    Math.ceil(modelHeight),
  )
}

function getViewportBottomInRoot(box: NonNullable<ReturnType<typeof getScrollBox>>) {
  return box.isViewportRoot
    ? box.clientHeight
    : readLayout('getViewportBottomInRoot.getBoundingClientRect', () => box.root.getBoundingClientRect().bottom)
}

function getVirtualViewportRect(box: NonNullable<ReturnType<typeof getScrollBox>>) {
  if (box.isViewportRoot) {
    return {
      top: 0,
      bottom: box.clientHeight,
    }
  }

  const rect = readLayout('getVirtualViewportRect.getBoundingClientRect', () => box.root.getBoundingClientRect())
  return {
    top: rect.top,
    bottom: rect.bottom,
  }
}

function getRendererBottomDistanceFromViewport(
  box: NonNullable<ReturnType<typeof getScrollBox>>,
) {
  const container = containerRef.value
  if (!container)
    return null

  const containerRect = readLayout('getRendererBottomDistanceFromViewport.getBoundingClientRect', () => container.getBoundingClientRect())
  const viewportBottom = getViewportBottomInRoot(box)

  return viewportBottom - containerRect.bottom
}

function captureBottomVirtualAnchor(): MarkstreamVirtualAnchor | null {
  const box = getScrollBox()
  const container = containerRef.value
  if (!box || !container)
    return null

  const scrollRootDistanceFromBottom = Math.max(
    0,
    box.scrollHeight - box.scrollTop - box.clientHeight,
  )
  if (scrollRootDistanceFromBottom > BOTTOM_ANCHOR_SCROLL_ROOT_MAX_DISTANCE_PX)
    return null

  const rendererBottomDistance = getRendererBottomDistanceFromViewport(box)
  if (rendererBottomDistance == null)
    return null

  const rendererBottomIsNearViewportBottom
    = rendererBottomDistance >= -8
      && rendererBottomDistance <= BOTTOM_ANCHOR_CAPTURE_MAX_DISTANCE_PX

  if (!rendererBottomIsNearViewportBottom)
    return null

  return {
    type: 'bottom',
    distanceFromBottomPx: Math.max(0, rendererBottomDistance),
  }
}

function isRendererNearVirtualViewport(extraMarginPx = 64) {
  const box = getScrollBox()
  const container = containerRef.value

  if (!box || !container)
    return false

  const viewport = getVirtualViewportRect(box)
  const rect = readLayout('isRendererNearVirtualViewport.getBoundingClientRect', () => container.getBoundingClientRect())

  return rect.bottom >= viewport.top - extraMarginPx
    && rect.top <= viewport.bottom + extraMarginPx
}

function createFallbackNodeAnchor(): MarkstreamVirtualAnchor | null {
  const total = parsedNodes.value.length

  if (total <= 0)
    return null

  return {
    type: 'node',
    nodeIndex: clamp(focusIndex.value, 0, Math.max(0, total - 1)),
    offsetWithinNodePx: 0,
  }
}

interface CapturedVirtualAnchorResult {
  anchor: MarkstreamVirtualAnchor
  captured: boolean
}

function captureVirtualAnchor(
  options: {
    allowFallback?: boolean
    requireViewport?: boolean
  } = {},
): CapturedVirtualAnchorResult | null {
  const requireViewport = options.requireViewport !== false
  const nearViewport = isRendererNearVirtualViewport()

  if (requireViewport && !nearViewport)
    return null

  const bottomAnchor = captureBottomVirtualAnchor()
  if (bottomAnchor) {
    return {
      anchor: bottomAnchor,
      captured: true,
    }
  }

  const anchor = captureRestoreAnchor()
  if (anchor) {
    return {
      anchor: {
        type: 'node',
        nodeIndex: anchor.nodeIndex,
        offsetWithinNodePx: anchor.offsetWithinNodePx,
      },
      captured: nearViewport,
    }
  }

  if (options.allowFallback === true) {
    const fallback = createFallbackNodeAnchor()
    return fallback
      ? {
          anchor: fallback,
          captured: false,
        }
      : null
  }

  return null
}

function hashVirtualString(input: string) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

function hashVirtualPartInto(seed: number, part: string) {
  let hash = seed
  for (let i = 0; i < part.length; i++) {
    hash ^= part.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  hash ^= 0x1F
  hash = Math.imul(hash, 16777619)
  return hash
}

const HEIGHT_CACHE_SIGNATURE_MAX_DEPTH = 6
const HEIGHT_CACHE_SIGNATURE_MAX_ARRAY_ITEMS = 160
const HEIGHT_CACHE_SIGNATURE_MAX_STRING_CHARS = 8192
const HEIGHT_CACHE_STRUCTURAL_KEYS = new Set([
  'children',
  'items',
  'header',
  'rows',
  'cells',
  'attrs',
  'data',
  'term',
  'definition',
])

function signatureString(value: string) {
  const source = value.length > HEIGHT_CACHE_SIGNATURE_MAX_STRING_CHARS
    ? `${value.slice(0, HEIGHT_CACHE_SIGNATURE_MAX_STRING_CHARS)}...${value.length}`
    : value

  return `${value.length}:${hashVirtualString(source)}`
}

function stableHeightSignatureValue(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): string {
  if (value == null || typeof value === 'number' || typeof value === 'boolean')
    return String(value)

  if (typeof value === 'string')
    return `s:${signatureString(value)}`

  if (typeof value === 'function')
    return 'fn'

  if (typeof value !== 'object')
    return typeof value

  if (seen.has(value))
    return 'cycle'

  if (depth >= HEIGHT_CACHE_SIGNATURE_MAX_DEPTH)
    return 'max-depth'

  seen.add(value)

  try {
    if (Array.isArray(value)) {
      if (value.length <= HEIGHT_CACHE_SIGNATURE_MAX_ARRAY_ITEMS) {
        const signatures: string[] = []
        for (let i = 0; i < value.length; i++)
          signatures.push(stableHeightSignatureValue(value[i], seen, depth + 1))

        return `a:${value.length}:${signatures.join(',')}`
      }

      const headParts: string[] = []
      const tailParts: string[] = []
      const tailStart = Math.max(0, value.length - 32)
      let aggregateHash = 2166136261

      for (let i = 0; i < value.length; i++) {
        const signature = stableHeightSignatureValue(value[i], seen, depth + 1)
        aggregateHash = hashVirtualPartInto(aggregateHash, signature)

        if (i < 32)
          headParts.push(signature)
        if (i >= tailStart)
          tailParts.push(signature)
      }

      return [
        `a:${value.length}`,
        `h=${headParts.join(',')}`,
        `t=${tailParts.join(',')}`,
        `all=${(aggregateHash >>> 0).toString(36)}`,
      ].join(':')
    }

    const record = value as Record<string, unknown>
    const keys = Object.keys(record)
      .filter((key) => {
        const field = record[key]

        if (key === 'parent' || key === 'el' || key === 'component')
          return false

        if (
          field == null
          || typeof field === 'string'
          || typeof field === 'number'
          || typeof field === 'boolean'
        ) {
          return true
        }

        return HEIGHT_CACHE_STRUCTURAL_KEYS.has(key)
      })
      .sort()

    return `o:${keys.length}:${keys
      .map(key => `${key}=${stableHeightSignatureValue(record[key], seen, depth + 1)}`)
      .join(';')}`
  }
  finally {
    seen.delete(value)
  }
}

let virtualContentHashRevision = -1
let virtualContentHashCache = ''
let virtualContentHashPrefixHashes: number[] = [2166136261]

function getNodeHeightCacheSignature(index: number) {
  const node = parsedNodes.value[index]
  if (!node)
    return ''

  return hashVirtualString(stableHeightSignatureValue(node))
}

function hashVirtualSignatureInto(seed: number, signature: string) {
  let hash = seed
  for (let index = 0; index < signature.length; index++) {
    hash ^= signature.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function getVirtualContentHash() {
  const revision = streamRenderVersion.value
  if (virtualContentHashRevision === revision)
    return virtualContentHashCache

  const total = parsedNodes.value.length
  let startIndex = getParsedNodesDirtyStart(total)

  if (
    virtualContentHashRevision !== revision - 1
    || startIndex > total
    || virtualContentHashPrefixHashes.length < startIndex + 1
  ) {
    startIndex = 0
  }

  if (startIndex === 0) {
    virtualContentHashPrefixHashes = [2166136261]
  }
  else {
    virtualContentHashPrefixHashes.length = startIndex + 1
  }

  for (let index = startIndex; index < total; index++) {
    const signature = getNodeHeightCacheSignature(index)
    virtualContentHashPrefixHashes[index + 1] = hashVirtualSignatureInto(
      virtualContentHashPrefixHashes[index] ?? 2166136261,
      signature,
    )
  }

  virtualContentHashPrefixHashes.length = total + 1
  virtualContentHashCache = ((virtualContentHashPrefixHashes[total] ?? 2166136261) >>> 0).toString(36)
  virtualContentHashRevision = revision
  return virtualContentHashCache
}

function exportVirtualHeightCache(): MarkstreamHeightCache {
  const cache = exportHeightCache()
    .map((entry): MarkstreamHeightCache[number] | null => {
      const node = parsedNodes.value[entry.index] as any
      if (!node)
        return null

      return {
        ...entry,
        nodeType: String(node.type ?? ''),
        signature: getNodeHeightCacheSignature(entry.index),
      }
    })
    .filter((entry): entry is MarkstreamHeightCache[number] => Boolean(entry))

  return limitVirtualHeightCache(cache)
}

function getVirtualHeightCacheLimit() {
  const raw = Number(props.virtualScroll?.heightCacheLimit ?? 5000)

  if (!Number.isFinite(raw) || raw <= 0)
    return Number.POSITIVE_INFINITY

  return Math.max(1, Math.trunc(raw))
}

function limitVirtualHeightCache(cache: MarkstreamHeightCache): MarkstreamHeightCache {
  const limit = getVirtualHeightCacheLimit()

  if (!Number.isFinite(limit) || cache.length <= limit)
    return cache

  const keep = new Map<number, MarkstreamHeightCache[number]>()
  const add = (entry: MarkstreamHeightCache[number] | undefined) => {
    if (!entry || keep.size >= limit)
      return

    keep.set(entry.index, entry)
  }

  const total = parsedNodes.value.length
  const aroundStart = clamp(
    liveRange.start - liveNodeBufferResolved.value * 2,
    0,
    total,
  )
  const aroundEnd = clamp(
    liveRange.end + liveNodeBufferResolved.value * 2,
    aroundStart,
    total,
  )

  for (const entry of cache) {
    if (entry.index >= aroundStart && entry.index < aroundEnd)
      add(entry)
  }

  const step = Math.max(1, Math.ceil(cache.length / limit))
  for (let i = 0; i < cache.length && keep.size < limit; i += step)
    add(cache[i])

  for (let i = cache.length - 1; i >= 0 && keep.size < limit; i -= step)
    add(cache[i])

  return Array.from(keep.values())
    .sort((a, b) => a.index - b.index)
    .slice(0, limit)
}

function isHeightCacheEntryCompatible(entry: MarkstreamHeightCache[number]) {
  const node = parsedNodes.value[entry.index] as any
  if (!node)
    return false

  if (entry.nodeType && entry.nodeType !== String(node.type ?? ''))
    return false

  if (entry.signature && entry.signature !== getNodeHeightCacheSignature(entry.index))
    return false

  return true
}

function captureVirtualStateFromMetrics(
  metrics: MarkstreamVirtualMetrics,
  options: {
    includeHeightCache?: boolean
    includeContentHash?: boolean
    allowAnchorFallback?: boolean
    requireViewport?: boolean
    includeEmptyState?: boolean
  } = {},
): MarkstreamVirtualState | null {
  const includeHeightCache = options.includeHeightCache === true
  const includeContentHash = options.includeContentHash ?? includeHeightCache
  const heightCache = includeHeightCache
    ? exportVirtualHeightCache()
    : []
  const capturedAnchor = captureVirtualAnchor({
    allowFallback: options.allowAnchorFallback === true,
    requireViewport: options.requireViewport,
  })

  if (!capturedAnchor && !heightCache.length && options.includeEmptyState !== true)
    return null

  return {
    sessionKey: metrics.sessionKey,
    threadKey: metrics.threadKey,
    ...(capturedAnchor
      ? {
          anchor: capturedAnchor.anchor,
          anchorCaptured: capturedAnchor.captured,
        }
      : {
          anchorCaptured: false,
        }),
    metrics,
    width: metrics.width,
    contentHash: includeContentHash ? getVirtualContentHash() : undefined,
    measurementKey: getVirtualMeasurementKey() || undefined,
    heightCache: heightCache.length ? heightCache : undefined,
  }
}

function captureVirtualState(options: MarkstreamCaptureVirtualStateOptions = {}) {
  return captureVirtualStateFromMetrics(getVirtualMetrics('manual'), {
    includeHeightCache: true,
    includeContentHash: true,
    allowAnchorFallback: options.allowFallbackAnchor === true,
    requireViewport: options.requireViewport === true,
    includeEmptyState: options.includeEmptyState ?? true,
  })
}

function setNormalizedScrollTop(root: HTMLElement, doc: Document, targetNormalized: number) {
  setNormalizedElementScrollTop(root, doc, targetNormalized, {
    isReverseFlexScrollRoot,
    getNormalizedScrollTop,
  })
}

function getRendererBottomOffsetWithinRoot(
  box: NonNullable<ReturnType<typeof getScrollBox>>,
) {
  const container = containerRef.value
  if (!container)
    return null

  const rendererTop = getOffsetTopWithinRoot(container, box.root)
  const total = parsedNodes.value.length
  const offsetHeight = readLayout('getRendererBottomOffsetWithinRoot.offsetHeight', () => container.offsetHeight || 0)
  const domHeight = Math.max(
    0,
    offsetHeight > 0
      ? offsetHeight
      : total > 0
        ? readLayout('getRendererBottomOffsetWithinRoot.scrollHeight', () => container.scrollHeight || 0)
        : 0,
  )
  const logicalHeight = getRendererLogicalHeight()

  return rendererTop + Math.max(domHeight, logicalHeight)
}

function applyBottomVirtualAnchor(anchor: Extract<MarkstreamVirtualAnchor, { type: 'bottom' }>) {
  const box = getScrollBox()
  if (!box)
    return

  const rendererBottom = getRendererBottomOffsetWithinRoot(box)
  if (rendererBottom == null)
    return

  const distance = Math.max(0, anchor.distanceFromBottomPx)

  // Keep renderer bottom `distance` px above viewport bottom.
  const target = Math.max(
    0,
    rendererBottom - box.clientHeight - distance,
  )

  guardVirtualBottomProgrammaticScroll(target)

  if (box.isViewportRoot) {
    box.doc.defaultView?.scrollTo?.(0, target)
    return
  }

  setNormalizedScrollTop(box.root, box.doc, target)
}

const virtualBottomRestoreTimers: number[] = []

function clearVirtualBottomRestoreTimers() {
  if (!isClient)
    return

  if (virtualBottomRestoreRaf != null) {
    cancelFrame?.(virtualBottomRestoreRaf)
    virtualBottomRestoreRaf = null
  }

  while (virtualBottomRestoreTimers.length) {
    const timer = virtualBottomRestoreTimers.pop()
    if (timer != null)
      window.clearTimeout(timer)
  }
}

function clearActiveVirtualBottomAnchor(reason?: MarkstreamVirtualReason) {
  const hadAnchor = Boolean(activeVirtualBottomAnchor.value)
  activeVirtualBottomAnchor.value = null
  virtualBottomRestoreScrollGuardUntil = 0
  virtualBottomRestoreScrollGuardTarget = null
  clearVirtualBottomRestoreTimers()

  if (hadAnchor && reason)
    scheduleVirtualMetricsEmit(reason)
}

function scheduleVirtualBottomRestoreReconcile() {
  if (!activeVirtualBottomAnchor.value || !isClient)
    return

  if (virtualBottomRestoreRaf != null)
    return

  const run = () => {
    virtualBottomRestoreRaf = null

    const anchor = activeVirtualBottomAnchor.value
    if (anchor)
      applyBottomVirtualAnchor(anchor)
  }

  virtualBottomRestoreRaf = requestFrame
    ? requestFrame(run)
    : null

  if (virtualBottomRestoreRaf == null)
    run()
}

function handleVirtualScrollRootScroll() {
  const anchor = activeVirtualBottomAnchor.value
  if (!anchor)
    return

  const box = getScrollBox()
  if (!box)
    return

  if (consumeVirtualBottomProgrammaticScrollGuard(box))
    return

  const rendererBottomDistance = getRendererBottomDistanceFromViewport(box)
  if (rendererBottomDistance == null) {
    clearActiveVirtualBottomAnchor('restore')
    return
  }

  if (
    rendererBottomDistance < -BOTTOM_ANCHOR_RELEASE_THRESHOLD_PX
    || (
      Math.abs(
        Math.max(0, rendererBottomDistance) - Math.max(0, anchor.distanceFromBottomPx),
      ) > BOTTOM_ANCHOR_RELEASE_THRESHOLD_PX
    )
  ) {
    clearActiveVirtualBottomAnchor('restore')
  }
}

function restoreVirtualAnchor(anchor: MarkstreamVirtualAnchor) {
  const apply = () => {
    if (anchor.type === 'node') {
      clearActiveVirtualBottomAnchor()

      restoreAnchor({
        nodeIndex: anchor.nodeIndex,
        offsetWithinNodePx: anchor.offsetWithinNodePx,
      })
      return
    }

    clearRestoreReconcile()
    activeRestoreAnchor.value = null
    activeVirtualBottomAnchor.value = anchor
    clearVirtualBottomRestoreTimers()

    applyBottomVirtualAnchor(anchor)

    if (!isClient)
      return

    for (const delay of [0, 120, 280, 480]) {
      virtualBottomRestoreTimers.push(window.setTimeout(() => {
        const activeAnchor = activeVirtualBottomAnchor.value
        if (activeAnchor)
          applyBottomVirtualAnchor(activeAnchor)
      }, delay))
    }
  }

  if (primeVirtualWindowForAnchor(anchor)) {
    void nextTick(apply)
    return
  }

  apply()
}

function primeVirtualWindowForAnchor(anchor: MarkstreamVirtualAnchor) {
  if (!virtualizationEnabled.value)
    return false

  const total = parsedNodes.value.length
  if (total <= 0)
    return false

  focusIndex.value = anchor.type === 'node'
    ? clamp(anchor.nodeIndex, 0, total - 1)
    : total - 1

  updateLiveRange()
  return true
}

function getBoundedHeightCache(
  cache: MarkstreamHeightCache,
  options: {
    requireCompatibilityMetadata?: boolean
    requireSignature?: boolean
  } = {},
) {
  const length = parsedNodes.value.length
  if (length <= 0)
    return []

  return cache.filter((entry) => {
    if (!Number.isInteger(entry.index) || entry.index < 0 || entry.index >= length)
      return false

    if (!Number.isFinite(entry.height) || entry.height <= 0)
      return false

    if (options.requireSignature && !entry.signature)
      return false

    if (options.requireCompatibilityMetadata && !entry.nodeType && !entry.signature)
      return false

    return isHeightCacheEntryCompatible(entry)
  })
}

function canReuseHeightCacheForWidth(savedWidth: number | null | undefined) {
  const currentWidth = getCurrentVirtualWidth()
  const currentBucket = getHeightCacheWidthBucket(currentWidth)
  const savedBucket = getHeightCacheWidthBucket(savedWidth)

  if (currentBucket === UNKNOWN_HEIGHT_CACHE_WIDTH_BUCKET)
    return false

  if (savedBucket === UNKNOWN_HEIGHT_CACHE_WIDTH_BUCKET)
    return false

  return currentBucket === savedBucket
}

function getVirtualStateSavedWidth(state: MarkstreamVirtualState | null | undefined) {
  const explicitWidth = Number(state?.width)
  if (Number.isFinite(explicitWidth) && explicitWidth > 0)
    return explicitWidth

  const metricsWidth = Number(state?.metrics?.width)
  if (Number.isFinite(metricsWidth) && metricsWidth > 0)
    return metricsWidth

  return null
}

function canRestoreVirtualStateCache(state: MarkstreamVirtualState) {
  if (state.sessionKey !== getVirtualSessionKey())
    return false

  if (!isSameVirtualThreadKey(state.threadKey))
    return false

  if ((state.measurementKey ?? '') !== getVirtualMeasurementKey())
    return false

  if (!canReuseHeightCacheForWidth(getVirtualStateSavedWidth(state)))
    return false

  if (!hasRestoreCacheCompatibilityMetadata(state))
    return false

  return true
}

function getRestoreContentHashMatch(state: MarkstreamVirtualState) {
  return Boolean(
    state.contentHash
    && state.contentHash === getVirtualContentHash(),
  )
}

function shouldRequireRestoreEntrySignature(state: MarkstreamVirtualState) {
  return !getRestoreContentHashMatch(state)
}

function hasRestoreCacheCompatibilityMetadata(state: MarkstreamVirtualState) {
  const cache = state.heightCache
  if (!cache?.length)
    return false

  if (getRestoreContentHashMatch(state))
    return cache.some(entry => Boolean(entry.nodeType || entry.signature))

  return cache.some(entry => Boolean(entry.signature))
}

function canReuseStandaloneHeightCache() {
  const cacheWidth = props.virtualScroll?.heightCacheWidth
  return canReuseHeightCacheForWidth(cacheWidth)
}

let lastImportedVirtualHeightCacheSignature: string | null = null
let lastImportedVirtualHeightCacheSource: 'restore' | 'standalone' | null = null
let lastAppliedVirtualRestoreSignature: string | null = null
let pendingImperativeVirtualRestoreState: MarkstreamVirtualState | null = null
let pendingImperativeVirtualRestoreOptions:
  { restoreAnchor: boolean, restoreToken: string, allowUncapturedAnchor: boolean } | null = null
let warnedStandaloneHeightCacheWithoutSignature = false

function warnStandaloneHeightCacheIgnored(reason: string) {
  if (
    warnedStandaloneHeightCacheWithoutSignature
    || typeof console === 'undefined'
    || !isDevEnv
  ) {
    return
  }

  warnedStandaloneHeightCacheWithoutSignature = true
  console.warn(
    `[markstream-vue] virtualScroll.heightCache ignored: ${reason}. `
    + 'Use heightCache exported from virtual-state-change/render-settled, '
    + 'and pass heightCacheWidth from the same state.',
  )
}

function getHeightCacheSignature(cache: MarkstreamHeightCache) {
  const payload = cache
    .map((entry) => {
      return [
        entry.index,
        Math.round(entry.height * 10),
        entry.nodeType ?? '',
        entry.signature ?? '',
      ].join('\u0002')
    })
    .join('\u0001')

  const widthBucket = getHeightCacheWidthBucket(getCurrentVirtualWidth())

  return [
    getVirtualThreadKey() ?? '',
    getVirtualSessionKey(),
    getVirtualMeasurementKey(),
    parsedNodes.value.length,
    widthBucket,
    cache.length,
    hashVirtualString(payload),
  ].join(':')
}

function tryImportVirtualHeightCache(cache = props.virtualScroll?.heightCache) {
  if (!virtualScrollEnabled.value || !cache?.length)
    return false

  if (parsedNodes.value.length <= 0)
    return false

  if (!canReuseStandaloneHeightCache())
    return false

  const boundedCache = getBoundedHeightCache(cache, {
    requireSignature: true,
  })

  if (!boundedCache.length) {
    warnStandaloneHeightCacheIgnored(
      'standalone heightCache entries must include compatible signature metadata',
    )
    return false
  }

  const signature = getHeightCacheSignature(boundedCache)
  if (signature === lastImportedVirtualHeightCacheSignature) {
    lastImportedVirtualHeightCacheSource = 'standalone'
    return true
  }

  importHeightCache(boundedCache, { mode: 'merge' })
  markFallbackHeightPrefixDirty()
  lastImportedVirtualHeightCacheSignature = signature
  lastImportedVirtualHeightCacheSource = 'standalone'
  resetVirtualMetricsEventDedupes()
  scheduleVirtualMetricsEmit('restore')
  return true
}

function getVirtualRestoreAnchorToken() {
  const token = props.virtualScroll?.restoreAnchor

  if (token == null || token === false)
    return null

  return token === true ? 'true' : String(token)
}

function getVirtualAnchorRestoreSignature(
  state: MarkstreamVirtualState,
  token: string,
) {
  const anchor = state.anchor
  const anchorKey = !anchor
    ? 'none'
    : anchor.type === 'bottom'
      ? `bottom:${Math.round(anchor.distanceFromBottomPx)}`
      : `node:${anchor.nodeIndex}:${Math.round(anchor.offsetWithinNodePx)}`

  return [
    getVirtualThreadKey() ?? '',
    getVirtualSessionKey(),
    getVirtualMeasurementKey(),
    virtualLayoutWidthBucket.value,
    token,
    anchorKey,
  ].join(':')
}

function applyVirtualRestoreState(
  state: MarkstreamVirtualState | null | undefined,
  options: {
    restoreAnchor?: boolean
    restoreToken?: string
    allowUncapturedAnchor?: boolean
  } = {},
) {
  if (!virtualScrollEnabled.value || !state)
    return false

  if (state.sessionKey !== getVirtualSessionKey())
    return false

  if (!isSameVirtualThreadKey(state.threadKey))
    return false

  if (parsedNodes.value.length <= 0)
    return false

  const wantsCacheImport = Boolean(state.heightCache?.length)
  const waitingForCacheWidth = wantsCacheImport && !hasKnownVirtualWidth()
  const restorableAnchor = state.anchor && (
    state.anchorCaptured !== false
    || options.allowUncapturedAnchor === true
  )
    ? state.anchor
    : null
  const wantsAnchorRestore = options.restoreAnchor === true && Boolean(restorableAnchor)
  const waitingForAnchorWidth = wantsAnchorRestore
    && !hasKnownVirtualWidth()
    && Number(getVirtualStateSavedWidth(state)) > 0
  let importedCache = false

  if (state.heightCache?.length && canRestoreVirtualStateCache(state)) {
    const boundedCache = getBoundedHeightCache(state.heightCache, {
      requireCompatibilityMetadata: !state.contentHash,
      requireSignature: shouldRequireRestoreEntrySignature(state),
    })

    if (boundedCache.length) {
      importHeightCache(boundedCache, { mode: 'merge' })
      markFallbackHeightPrefixDirty()
      lastImportedVirtualHeightCacheSignature = getHeightCacheSignature(boundedCache)
      lastImportedVirtualHeightCacheSource = 'restore'
      resetVirtualMetricsEventDedupes()
      importedCache = true
    }
  }

  if (waitingForCacheWidth || waitingForAnchorWidth)
    return false

  if (!options.restoreAnchor) {
    if (importedCache)
      scheduleVirtualMetricsEmit('restore')

    return true
  }

  if (!restorableAnchor) {
    if (importedCache)
      scheduleVirtualMetricsEmit('restore')

    return true
  }

  const restoreToken = options.restoreToken ?? 'imperative'
  const signature = getVirtualAnchorRestoreSignature(state, restoreToken)

  if (lastAppliedVirtualRestoreSignature === signature) {
    if (importedCache)
      scheduleVirtualMetricsEmit('restore')

    return true
  }

  lastAppliedVirtualRestoreSignature = signature
  restoreVirtualAnchor(restorableAnchor)
  scheduleVirtualMetricsEmit('restore')
  return true
}

function hasKnownVirtualWidth() {
  const width = getCurrentVirtualWidth()
  return Number.isFinite(width) && width > 0
}

function shouldKeepPendingVirtualRestoreState(state: MarkstreamVirtualState) {
  if (state.sessionKey !== getVirtualSessionKey())
    return false

  if (!isSameVirtualThreadKey(state.threadKey))
    return false

  if (parsedNodes.value.length <= 0)
    return true

  if (state.heightCache?.length && !hasKnownVirtualWidth())
    return true

  if (state.anchor && Number(getVirtualStateSavedWidth(state)) > 0 && !hasKnownVirtualWidth())
    return true

  return false
}

function restoreVirtualState(
  state: MarkstreamVirtualState,
  options: {
    restoreAnchor?: boolean
    restoreToken?: string | number | boolean
    allowUncapturedAnchor?: boolean
  } = {},
) {
  const restoreAnchorOption = options.restoreAnchor === true
  const restoreToken = options.restoreToken == null
    ? 'imperative'
    : String(options.restoreToken)

  pendingImperativeVirtualRestoreState = state
  pendingImperativeVirtualRestoreOptions = {
    restoreAnchor: restoreAnchorOption,
    restoreToken,
    allowUncapturedAnchor: options.allowUncapturedAnchor === true,
  }

  const applied = applyVirtualRestoreState(state, {
    restoreAnchor: restoreAnchorOption,
    restoreToken,
    allowUncapturedAnchor: options.allowUncapturedAnchor === true,
  })

  if (applied || !shouldKeepPendingVirtualRestoreState(state)) {
    pendingImperativeVirtualRestoreState = null
    pendingImperativeVirtualRestoreOptions = null
  }
}

function seedCurrentNodeHeightSignatures() {
  nodeHeightSignatures.length = 0
  for (const rawIndex of Object.keys(nodeHeights)) {
    const index = Number(rawIndex)
    if (Number.isInteger(index) && index >= 0 && index < parsedNodes.value.length)
      rememberNodeHeightSignature(index)
  }
}

function invalidateChangedNodeHeights(reason: MarkstreamVirtualReason = 'content') {
  if (!virtualScrollEnabled.value)
    return

  const staleIndices: number[] = []
  const total = parsedNodes.value.length
  const dirtyStartIndex = getParsedNodesDirtyStart(total)

  // Scan only the dirty range instead of the whole signature set: streaming
  // appends never mutate stable-prefix nodes, so their signatures stay valid
  // without re-hashing. Entries past `total` signify nodes that disappeared.
  const lastSignedIndex = nodeHeightSignatures.length - 1
  const scanEnd = Math.max(total - 1, lastSignedIndex)

  for (let index = dirtyStartIndex; index <= scanEnd; index++) {
    if (index >= total) {
      if (index <= lastSignedIndex && nodeHeightSignatures[index] !== undefined)
        staleIndices.push(index)
      continue
    }

    const signature = getNodeHeightCacheSignature(index)
    const previousSignature = nodeHeightSignatures[index]

    if (previousSignature != null && previousSignature !== signature)
      staleIndices.push(index)

    nodeHeightSignatures[index] = signature
  }

  if (lastSignedIndex >= total) {
    for (let index = total; index <= lastSignedIndex; index++)
      nodeHeightSignatures[index] = undefined
    nodeHeightSignatures.length = total
  }

  if (!staleIndices.length)
    return

  removeNodeHeights(staleIndices, { notify: false })
  markFallbackHeightPrefixDirty(dirtyStartIndex)
  resetVirtualSettleConfirmation()

  if (activeRestoreAnchor.value)
    scheduleRestoreReconcile()
  if (activeVirtualBottomAnchor.value)
    scheduleVirtualBottomRestoreReconcile()

  scheduleVirtualMetricsEmit(reason)
}

function forceFlushPendingHeightMeasurements() {
  if (heightMeasurementRaf != null) {
    cancelFrame?.(heightMeasurementRaf)
    heightMeasurementRaf = null
  }
  flushPendingHeightMeasurements()
}

function waitForVirtualFrame() {
  if (!isClient || isTestEnv)
    return Promise.resolve()

  return new Promise<void>((resolve) => {
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | null = null
    const finish = () => {
      if (settled)
        return
      settled = true
      if (timeout != null)
        window.clearTimeout(timeout)
      resolve()
    }

    if (requestFrame) {
      requestFrame(finish)
      timeout = window.setTimeout(finish, 50)
      return
    }
    timeout = window.setTimeout(finish, 0)
  })
}

function waitForVirtualTimeout(timeoutMs: number) {
  if (!isClient || timeoutMs <= 0)
    return Promise.resolve()
  return new Promise<void>(resolve => window.setTimeout(resolve, timeoutMs))
}

async function forceMeasure(reason: MarkstreamVirtualReason = 'manual') {
  await nextTick()
  await waitForVirtualFrame()

  measureTrackedNodeHeights()
  forceFlushPendingHeightMeasurements()

  await nextTick()

  const metrics = getVirtualMetrics(reason)
  emitVirtualMetricsNow(metrics, true)
  return metrics
}

function isSameVirtualSession(
  sessionKey: string,
  threadKey = getVirtualThreadKey(),
  layoutEpochKey = virtualLayoutEpochKey.value,
) {
  return getVirtualSessionKey() === sessionKey
    && getVirtualThreadKey() === threadKey
    && virtualLayoutEpochKey.value === layoutEpochKey
}

async function settle(options: {
  frames?: number
  timeoutMs?: number
  reason?: MarkstreamVirtualReason
  expectedSettledTokenKey?: string
  flushPendingTimers?: boolean
} = {}) {
  const sessionKeyAtStart = getVirtualSessionKey()
  const threadKeyAtStart = getVirtualThreadKey()
  const layoutEpochKeyAtStart = virtualLayoutEpochKey.value
  const frames = options.frames ?? 2
  const timeoutMs = options.timeoutMs ?? 120
  const reason = options.reason ?? 'manual'
  const expectedSettledTokenKey = options.expectedSettledTokenKey
  const shouldFinalizeSettlingTimers = options.flushPendingTimers === true
  const staleBaseMetrics = getVirtualMetrics(reason)
  const staleMetrics = (): MarkstreamVirtualMetrics => ({
    ...staleBaseMetrics,
    phase: staleBaseMetrics.final ? 'settling' : staleBaseMetrics.phase,
    stable: false,
    confidence: staleBaseMetrics.confidence === 'final'
      ? 'mixed'
      : staleBaseMetrics.confidence,
    reason,
  })
  const isSameSettleContext = () => {
    return isSameVirtualSession(sessionKeyAtStart, threadKeyAtStart, layoutEpochKeyAtStart)
      && (
        expectedSettledTokenKey == null
        || getManualSettleTokenKey() === expectedSettledTokenKey
      )
  }

  for (let i = 0; i < frames; i++) {
    await nextTick()
    if (!isSameSettleContext())
      return staleMetrics()

    await waitForVirtualFrame()
    if (!isSameSettleContext())
      return staleMetrics()

    measureTrackedNodeHeights()
    forceFlushPendingHeightMeasurements()
  }

  await waitForVirtualTimeout(timeoutMs)
  if (!isSameSettleContext())
    return staleMetrics()

  if (shouldFinalizeSettlingTimers)
    clearAllHeightSettlingTimers()

  measureTrackedNodeHeights()
  forceFlushPendingHeightMeasurements()

  if (!isSameSettleContext())
    return staleMetrics()

  const internallySettled = isInternalLayoutSettled()

  if (internallySettled) {
    imperativeVirtualSettleSessionKey = sessionKeyAtStart
    imperativeVirtualSettleThreadKey = threadKeyAtStart

    if (
      props.virtualScroll?.settleMode === 'manual'
      && expectedSettledTokenKey != null
      && hasManualSettleSignal(props.virtualScroll?.settledToken)
      && getManualSettleTokenKey() === expectedSettledTokenKey
    ) {
      lastManualSettleSignature = getManualSettleSignature(
        props.virtualScroll.settledToken,
      )
    }
  }

  const finalPhase = isSameSettleContext()
    && internallySettled
    && isHostSettleConfirmed()
  const metrics = getVirtualMetrics(reason, finalPhase ? 'final' : undefined)
  emitVirtualMetricsNow(metrics, true)
  return metrics
}

function scrollToNode(
  index: number,
  align: 'start' | 'center' | 'end' | 'nearest' = 'start',
) {
  clearActiveVirtualBottomAnchor()
  clearRestoreReconcile()

  const total = parsedNodes.value.length
  if (total <= 0)
    return

  const boundedIndex = clamp(index, 0, total - 1)

  const apply = () => {
    const nodeTop = resolveAnchorOffset({
      nodeIndex: boundedIndex,
      offsetWithinNodePx: 0,
    })
    const nodeHeight = getFallbackNodeHeight(boundedIndex)
    const box = getScrollBox()
    const viewportHeight = box?.clientHeight ?? 0
    const current = getRelativeScrollTopWithinContainer()

    let target = nodeTop
    if (align === 'center') {
      target = nodeTop - viewportHeight / 2 + nodeHeight / 2
    }
    else if (align === 'end') {
      target = nodeTop - viewportHeight + nodeHeight
    }
    else if (align === 'nearest' && current != null) {
      if (nodeTop >= current && nodeTop + nodeHeight <= current + viewportHeight)
        return
      target = nodeTop < current ? nodeTop : nodeTop - viewportHeight + nodeHeight
    }

    setRelativeScrollTopWithinContainer(Math.max(0, target))
    scheduleFocusSync({ immediate: true })
    if (virtualizationEnabled.value) {
      focusIndex.value = boundedIndex
      updateLiveRange()
    }
  }

  if (virtualizationEnabled.value) {
    focusIndex.value = boundedIndex
    updateLiveRange()
    void nextTick(apply)
    return
  }

  apply()
}

let pendingVirtualMetricsReason: MarkstreamVirtualReason = 'content'
let virtualMetricsEmitRaf: number | null = null
let virtualMetricsEmitTimer: number | null = null
let lastVirtualEmitAt = 0
let lastEmittedVirtualMetrics: MarkstreamVirtualMetrics | null = null
let lastEmittedVirtualStateKey: string | null = null
let lastSettledVirtualEventKey: string | null = null
let lastFinalVirtualEventKey: string | null = null

interface VirtualStateEmitCandidate {
  state: MarkstreamVirtualState | null
}

function getVirtualNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function shouldEmitVirtualMetrics(metrics: MarkstreamVirtualMetrics) {
  const previous = lastEmittedVirtualMetrics
  if (!previous)
    return true

  const threshold = props.virtualScroll?.heightDiffThresholdPx ?? 1

  return Math.abs(metrics.totalHeight - previous.totalHeight) > threshold
    || metrics.sessionKey !== previous.sessionKey
    || metrics.phase !== previous.phase
    || metrics.stable !== previous.stable
    || metrics.final !== previous.final
    || metrics.threadKey !== previous.threadKey
    || metrics.nodeCount !== previous.nodeCount
    || metrics.measuredCount !== previous.measuredCount
    || metrics.width !== previous.width
}

function getManualSettleTokenKey(token: unknown = props.virtualScroll?.settledToken) {
  return stringifyVirtualToken(token)
}

function getVirtualMetricsEventKey(
  phase: 'settled' | 'final',
  metrics: MarkstreamVirtualMetrics,
) {
  return [
    phase,
    metrics.sessionKey,
    metrics.threadKey ?? '',
    getVirtualMeasurementKey(),
    getVirtualContentHash(),
    stringifyVirtualToken(props.virtualScroll?.settledToken),
    Math.round(metrics.totalHeight),
    Math.round(metrics.width),
  ].join('\u0000')
}

function resetVirtualMetricsEventDedupes() {
  lastSettledVirtualEventKey = null
  lastFinalVirtualEventKey = null
  lastEmittedVirtualStateKey = null
}

function getVirtualAnchorEventKey(anchor: MarkstreamVirtualAnchor) {
  if (anchor.type === 'bottom')
    return `bottom:${Math.round(anchor.distanceFromBottomPx)}`

  return `node:${anchor.nodeIndex}:${Math.round(anchor.offsetWithinNodePx)}`
}

function getVirtualStateHeightCacheSignature(state: MarkstreamVirtualState) {
  const cache = state.heightCache
  if (!cache?.length)
    return ''

  return getHeightCacheSignature(cache)
}

function getVirtualStateEventKey(state: MarkstreamVirtualState) {
  const metrics = state.metrics
  const anchorKey = state.anchor
    ? getVirtualAnchorEventKey(state.anchor)
    : 'none'

  return [
    state.sessionKey,
    state.threadKey ?? '',
    state.measurementKey ?? getVirtualMeasurementKey(),
    state.contentHash ?? '',
    getVirtualStateHeightCacheSignature(state),
    anchorKey,
    state.anchorCaptured ? 1 : 0,
    metrics.liveRange.start,
    metrics.liveRange.end,
    metrics.renderedCount,
    metrics.nodeCount,
    Math.round(metrics.totalHeight),
    Math.round(metrics.width),
    metrics.phase,
    metrics.stable ? 1 : 0,
  ].join('\u0000')
}

function shouldEmitVirtualState(state: MarkstreamVirtualState, force = false) {
  if (force)
    return true

  const key = getVirtualStateEventKey(state)
  return key !== lastEmittedVirtualStateKey
}

function getVirtualStateForEmit(
  metrics: MarkstreamVirtualMetrics,
  force = false,
): VirtualStateEmitCandidate {
  if (force || metrics.stable || metrics.phase === 'final') {
    const state = captureVirtualStateFromMetrics(metrics, {
      includeHeightCache: true,
    })

    return {
      state,
    }
  }

  return {
    state: captureVirtualStateFromMetrics(metrics),
  }
}

function shouldDelayVirtualMetricsUntilDom(force = false) {
  return !force
    && virtualScrollRequested.value
    && !virtualScrollDomEnabled.value
}

function emitVirtualMetricsNow(metrics: MarkstreamVirtualMetrics, force = false) {
  if (!virtualScrollEnabled.value)
    return
  if (shouldDelayVirtualMetricsUntilDom(force))
    return

  const shouldEmitHeight = force || shouldEmitVirtualMetrics(metrics)
  const candidate = getVirtualStateForEmit(metrics, force)
  const state = candidate.state
  const shouldEmitState = Boolean(
    state && (shouldEmitHeight || shouldEmitVirtualState(state, force)),
  )

  if (shouldEmitHeight) {
    emitHeightChange(metrics)
    lastEmittedVirtualMetrics = metrics
    lastVirtualEmitAt = getVirtualNow()
  }

  if (state && shouldEmitState) {
    emitVirtualStateChange(state)
    if (state.anchor)
      emitAnchorChange(state.anchor)
    lastEmittedVirtualStateKey = getVirtualStateEventKey(state)
  }

  if (metrics.stable) {
    const eventKey = getVirtualMetricsEventKey('settled', metrics)

    if (eventKey !== lastSettledVirtualEventKey) {
      lastSettledVirtualEventKey = eventKey

      const settledState = captureVirtualStateFromMetrics(metrics, {
        includeHeightCache: true,
      })
      if (settledState) {
        emitVirtualStateChange(settledState)
        lastEmittedVirtualStateKey = getVirtualStateEventKey(settledState)
      }

      emitRenderSettled(metrics)
    }
  }

  if (metrics.phase === 'final') {
    const eventKey = getVirtualMetricsEventKey('final', metrics)

    if (eventKey !== lastFinalVirtualEventKey) {
      lastFinalVirtualEventKey = eventKey

      const finalState = captureVirtualStateFromMetrics(metrics, {
        includeHeightCache: true,
      })
      if (finalState) {
        emitVirtualStateChange(finalState)
        lastEmittedVirtualStateKey = getVirtualStateEventKey(finalState)
      }

      emitRenderFinal(metrics)
    }
  }
}

function flushVirtualStateBeforeUnmount() {
  if (!virtualScrollEnabled.value)
    return

  try {
    measureTrackedNodeHeights()
    forceFlushPendingHeightMeasurements()

    const metrics = getVirtualMetrics('manual')

    if (shouldEmitVirtualMetrics(metrics)) {
      emitHeightChange(metrics)
      lastEmittedVirtualMetrics = metrics
      lastVirtualEmitAt = getVirtualNow()
    }

    const state = captureVirtualStateFromMetrics(metrics, {
      includeHeightCache: true,
      includeContentHash: true,
      allowAnchorFallback: false,
      requireViewport: true,
      includeEmptyState: true,
    })

    if (state) {
      emitVirtualStateChange(state)

      if (state.anchor)
        emitAnchorChange(state.anchor)

      lastEmittedVirtualStateKey = getVirtualStateEventKey(state)
    }
  }
  catch {
    // Unmount cleanup must never throw.
  }
}

watch(
  virtualScrollDomEnabled,
  (enabled) => {
    if (enabled)
      scheduleVirtualMetricsEmit('content')
  },
  { flush: 'post' },
)

function clearVirtualMetricsSchedule() {
  if (virtualMetricsEmitRaf != null) {
    cancelFrame?.(virtualMetricsEmitRaf)
    virtualMetricsEmitRaf = null
  }
  if (virtualMetricsEmitTimer != null && isClient) {
    window.clearTimeout(virtualMetricsEmitTimer)
    virtualMetricsEmitTimer = null
  }
}

function flushVirtualMetricsEmit() {
  virtualMetricsEmitRaf = null
  virtualMetricsEmitTimer = null
  // Full re-measure at most once per METRICS_FULL_SCAN_INTERVAL_MS instead of
  // on every emission: consumers of the emitted height/metrics state depend on
  // fresh measurements, and benchmark bisection showed dropping the scan
  // entirely ballooned scroll-phase DOM retention (~3.5k -> ~30k nodes).
  // Throttling to a 120ms window keeps the freshness contract while cutting
  // the settle-phase full-scan rate by ~75% (emits run up to ~30/s).
  const now = getVirtualNow()
  let measuredVisibleDomHeight: number | undefined
  if (now - lastFullMetricsScanAt >= METRICS_FULL_SCAN_INTERVAL_MS) {
    lastFullMetricsScanAt = now
    // One physical pass feeds both the height model and the emitted
    // visibleDomHeight, instead of measureTrackedNodeHeights() plus a second
    // O(N) offsetHeight sweep inside getVisibleDomHeight().
    measuredVisibleDomHeight = measureTrackedNodeHeights()
  }
  // Force-flush only when a meaningful batch accumulated or no flush is
  // scheduled; tiny pending batches let the pending rAF flush naturally,
  // keeping measurement writes coalesced into one layout pass per frame.
  if (pendingHeightMeasurements.size > PENDING_HEIGHT_FORCE_FLUSH_THRESHOLD || heightMeasurementRaf == null)
    forceFlushPendingHeightMeasurements()
  emitVirtualMetricsNow(getVirtualMetrics(pendingVirtualMetricsReason, undefined, measuredVisibleDomHeight))
}

function scheduleVirtualMetricsEmit(reason: MarkstreamVirtualReason) {
  if (!virtualScrollEnabled.value)
    return

  pendingVirtualMetricsReason = reason
  if (virtualMetricsEmitRaf != null || virtualMetricsEmitTimer != null)
    return

  const interval = Math.max(0, props.virtualScroll?.emitIntervalMs ?? 32)
  const waitMs = Math.max(0, interval - (getVirtualNow() - lastVirtualEmitAt))
  const scheduleFrame = () => {
    virtualMetricsEmitTimer = null
    virtualMetricsEmitRaf = requestFrame
      ? requestFrame(flushVirtualMetricsEmit)
      : null

    if (virtualMetricsEmitRaf == null)
      flushVirtualMetricsEmit()
  }

  if (isClient && waitMs > 0) {
    virtualMetricsEmitTimer = window.setTimeout(scheduleFrame, waitMs)
    return
  }

  scheduleFrame()
}

defineExpose<MarkstreamRendererHandle>({
  getVirtualMetrics,
  captureVirtualState,
  restoreVirtualState,
  forceMeasure,
  settle,
  scrollToNode,
})

function bumpNodeSlotVersion() {
  nodeSlotVersion.value += 1
}

function shouldRenderNode(index: number) {
  // Respect incremental rendering budget only when incremental batching
  // is active (virtualization disabled). Otherwise render immediately.
  if (incrementalRenderingActive.value && index >= renderedCount.value) {
    const node = parsedNodes.value[index]
    // A heading or paragraph can be immediately followed by the active heavy node.
    const isFinalCatchUpTail = requestedFinal.value === true
      && effectiveFinal.value !== true
      && index >= parsedNodes.value.length - 2
    const canDefer = node?.type === 'code_block'
      || node?.type === 'image'
      || node?.type === 'mermaid'
      || node?.type === 'infographic'
    if (!isFinalCatchUpTail || canDefer)
      return false
  }
  if (!deferNodes.value)
    return true
  if (index < resolvedInitialBatch.value)
    return true
  if (
    contentStreamingTailActive.value
    && effectiveFinal.value !== true
    && !props.nodes?.length
    && index >= parsedNodes.value.length - liveNodeBufferResolved.value
  ) {
    return true
  }
  return visibleNodeIndices.value.has(index)
}

function destroyNodeHandle(index: number) {
  const stopWatchingVisibility = nodeVisibilityWatchStops.get(index)
  if (stopWatchingVisibility) {
    stopWatchingVisibility()
    nodeVisibilityWatchStops.delete(index)
  }
  const handle = nodeVisibilityHandles.get(index)
  if (handle) {
    handle.destroy()
    nodeVisibilityHandles.delete(index)
  }
  clearVisibilityFallback(index)
}

function setNodeSlotElement(index: number, el: HTMLElement | null) {
  let slotsChanged = false
  if (el) {
    const prev = nodeSlotElements.get(index)
    if (prev === el && nodeSlotRegistrationKeys.get(index) === nodeSlotRegistrationKey.value) {
      // Same element re-passed on a re-render with unchanged registration
      // inputs: the existing visibility registration (observer handle, watch,
      // fallback timer, visible state) is still valid, so skip the per-commit
      // re-registration work entirely.
      return
    }
    nodeSlotElements.set(index, el)
    if (prev !== el)
      slotsChanged = true
  }
  else if (nodeSlotElements.delete(index)) {
    slotsChanged = true
  }
  if (slotsChanged)
    bumpNodeSlotVersion()
  if (!el)
    clearVisibilityFallback(index)

  if (!shouldObserveSlots.value || !registerNodeVisibility) {
    destroyNodeHandle(index)
    // No visibility registration is needed in this state (stable per config),
    // so record it and let the same-element guard skip future re-invocations.
    // Only record for a live element; unmounts (el === null) must not leave a
    // stale key behind for an index that no longer has a slot.
    if (el)
      nodeSlotRegistrationKeys.set(index, nodeSlotRegistrationKey.value)
    else
      nodeSlotRegistrationKeys.delete(index)
    if (el && deferNodes.value)
      markNodeVisible(index, true)
    return
  }

  if (
    !virtualizationEnabled.value
    && deferNodes.value
    && !viewportPriorityAutoDisabled.value
    && nodeVisibilityHandles.size >= viewportPriorityMaxTargets.value
  ) {
    autoDisableViewportPriority('too-many-targets')
    if (!shouldObserveSlots.value || !registerNodeVisibility) {
      destroyNodeHandle(index)
      nodeSlotRegistrationKeys.set(index, nodeSlotRegistrationKey.value)
      if (el)
        markNodeVisible(index, true)
      return
    }
  }

  if (index < resolvedInitialBatch.value && !virtualizationEnabled.value) {
    destroyNodeHandle(index)
    nodeSlotRegistrationKeys.set(index, nodeSlotRegistrationKey.value)
    markNodeVisible(index, true)
    return
  }

  if (visibleNodeIndices.value.has(index)) {
    destroyNodeHandle(index)
    nodeSlotRegistrationKeys.set(index, nodeSlotRegistrationKey.value)
    markNodeVisible(index, true)
    return
  }

  if (!el) {
    destroyNodeHandle(index)
    nodeSlotRegistrationKeys.delete(index)
    return
  }

  destroyNodeHandle(index)
  const handle = registerNodeVisibility(el, { rootMargin: viewportPriorityRootMargin.value })
  if (!handle) {
    nodeSlotRegistrationKeys.delete(index)
    return
  }
  nodeVisibilityHandles.set(index, handle)
  nodeSlotRegistrationKeys.set(index, nodeSlotRegistrationKey.value)
  markNodeVisible(index, handle.isVisible.value)
  if (deferNodes.value)
    scheduleVisibilityFallback(index)
  let stopWatchingVisibility: (() => void) | null = null
  stopWatchingVisibility = watch(
    () => handle.isVisible.value,
    (visible) => {
      if (!visible)
        return
      clearVisibilityFallback(index)
      markNodeVisible(index, true)
      stopWatchingVisibility?.()
      nodeVisibilityWatchStops.delete(index)
      // Once visibility is confirmed we can release the handle reference so
      // long-lived renders (no virtualization) do not leak observers.
      if (nodeVisibilityHandles.get(index) === handle)
        nodeVisibilityHandles.delete(index)
      try {
        handle.destroy()
      }
      catch {}
    },
    { immediate: true },
  )
  nodeVisibilityWatchStops.set(index, stopWatchingVisibility)

  if (virtualizationEnabled.value)
    scheduleFocusSync()
}

function flushPendingHeightMeasurements() {
  heightMeasurementRaf = null

  runEstimatedHeightMutation(() => {
    let changed = false
    for (const [index, pending] of pendingHeightMeasurements) {
      pendingHeightMeasurements.delete(index)
      if (nodeContentElements.get(index) !== pending.el)
        continue
      if (nodeContentVersions.get(index) !== pending.version)
        continue
      changed = recordNodeHeightCore(index, pending.height, { allowShrink: pending.allowShrink }) || changed
    }
    return changed
  })
}

function clearPendingHeightMeasurements() {
  if (heightMeasurementRaf != null) {
    cancelFrame?.(heightMeasurementRaf)
    heightMeasurementRaf = null
  }
  pendingHeightMeasurements.clear()
}

function bumpNodeContentVersion(index: number) {
  const next = (nodeContentVersions.get(index) ?? 0) + 1
  nodeContentVersions.set(index, next)
  return next
}

function queueNodeHeightRecord(index: number, el: HTMLElement, height: number) {
  if (!Number.isFinite(height) || height <= 0)
    return
  if (nodeContentElements.get(index) !== el)
    return

  const version = nodeContentVersions.get(index)
  if (version == null)
    return
  const node = parsedNodes.value[index] as (ParsedNode & { loading?: boolean }) | undefined
  const isContentStreamingTail = contentStreamingTailActive.value
    && effectiveFinal.value !== true
    && !props.nodes?.length
    && index >= parsedNodes.value.length - 2
  const allowShrink = !(node?.loading === true || isContentStreamingTail)
  const previous = pendingHeightMeasurements.get(index)
  const combinedAllowShrink = previous
    ? previous.allowShrink && allowShrink
    : allowShrink
  const nextHeight = previous && !combinedAllowShrink
    ? Math.max(previous.height, height)
    : height

  pendingHeightMeasurements.set(index, {
    height: nextHeight,
    allowShrink: combinedAllowShrink,
    version,
    el,
  })

  if (heightMeasurementRaf != null)
    return

  heightMeasurementRaf = requestFrame
    ? requestFrame(flushPendingHeightMeasurements)
    : null

  if (heightMeasurementRaf == null)
    flushPendingHeightMeasurements()
}

function measureNodeHeight(index: number, el: HTMLElement) {
  queueNodeHeightRecord(index, el, getNodeLayoutHeight(index, el))
}

function measureTrackedNodeHeights() {
  let visibleDomHeight = 0
  for (const [index, el] of nodeContentElements) {
    const height = getNodeLayoutHeight(index, el)
    visibleDomHeight += height
    queueNodeHeightRecord(index, el, height)
  }
  return visibleDomHeight
}

function getNodeContentResizeObserver() {
  if (nodeContentResizeObserver || typeof ResizeObserver === 'undefined')
    return nodeContentResizeObserver

  nodeContentResizeObserver = new ResizeObserver((entries) => {
    if (!entries.length) {
      measureTrackedNodeHeights()
      return
    }

    for (const entry of entries) {
      const index = nodeContentResizeObserverIndexes.get(entry.target)
      const el = nodeContentResizeObserverTargets.get(index ?? -1)
      if (index != null && el)
        measureNodeHeight(index, el)
    }
  })
  return nodeContentResizeObserver
}

function unobserveNodeContentElement(index: number) {
  const previous = nodeContentResizeObserverTargets.get(index)
  if (!previous)
    return

  nodeContentResizeObserver?.unobserve(previous)
  nodeContentResizeObserverIndexes.delete(previous)
  nodeContentResizeObserverTargets.delete(index)
}

function disconnectNodeContentResizeObserver() {
  nodeContentResizeObserver?.disconnect()
  nodeContentResizeObserver = null
  nodeContentResizeObserverTargets.clear()
}

function clearFinalHeightConvergenceTimers() {
  while (finalHeightConvergenceTimers.length) {
    const timer = finalHeightConvergenceTimers.pop()
    clearHeightSettlingTimer(timer)
  }
}

function scheduleFinalHeightConvergence() {
  if (!isClient || !effectiveFinal.value || !nodeContentElements.size)
    return

  // ResizeObserver covers layout changes without element re-registration. If
  // it is unavailable, keep all fallback convergence rounds.
  clearFinalHeightConvergenceTimers()
  for (const delay of nodeContentResizeObserver ? [80] : [80, 240, 640]) {
    const timer = scheduleHeightSettlingTimer(delay, () => {
      for (const [index, el] of nodeContentElements) {
        if (el)
          measureNodeHeight(index, el)
      }
    }, 'final')

    if (timer != null)
      finalHeightConvergenceTimers.push(timer)
  }
}

function setNodeContentRef(index: number, el: HTMLElement | null) {
  if (el) {
    const node = parsedNodes.value[index]
    const registered = nodeContentRegistration.get(index)
    if (
      registered
      && registered.el === el
      && registered.node === node
      && registered.loading === (node as { loading?: unknown } | undefined)?.loading
    ) {
      // Same element + same parsed node re-passed on a re-render. Vue re-invokes
      // function refs on every patch, so without this guard each streaming
      // commit would re-run the measurement/observer registration for every
      // rendered node (deleting pending measurements, bumping versions,
      // unobserving/re-observing, and forcing an offsetHeight read).
      return
    }
  }

  if (!el)
    clearPendingAsyncNodeKeysForIndex(index)

  pendingHeightMeasurements.delete(index)
  bumpNodeContentVersion(index)
  const previousTimers = nodeContentDeferredMeasureTimers.get(index)
  if (previousTimers) {
    for (const id of previousTimers)
      clearHeightSettlingTimer(id)
    nodeContentDeferredMeasureTimers.delete(index)
  }
  unobserveNodeContentElement(index)
  if (!el || !shouldMeasureNodeHeights.value) {
    nodeContentElements.delete(index)
    nodeContentVersions.delete(index)
    nodeContentRegistration.delete(index)
    return
  }
  nodeContentElements.set(index, el)
  nodeContentRegistration.set(index, {
    el,
    node: parsedNodes.value[index],
    loading: (parsedNodes.value[index] as { loading?: unknown } | undefined)?.loading,
  })
  const measure = () => {
    measureNodeHeight(index, el)
  }
  queueMicrotask(measure)
  const observer = getNodeContentResizeObserver()
  if (observer) {
    nodeContentResizeObserverTargets.set(index, el)
    nodeContentResizeObserverIndexes.set(el, index)
    observer.observe(el)
  }
  if (typeof window !== 'undefined') {
    const deferredMeasureDelays = parsedNodes.value[index]?.type === 'code_block'
      ? [16, 80, 240, 800]
      : effectiveFinal.value
        ? [80]
        : []

    if (deferredMeasureDelays.length) {
      const timers = deferredMeasureDelays
        .map(delay => scheduleHeightSettlingTimer(delay, measure, 'node-resize'))
        .filter((timer): timer is number => timer != null)

      if (timers.length)
        nodeContentDeferredMeasureTimers.set(index, timers)
    }
  }
}

watch(
  () => shouldMeasureNodeHeights.value,
  (enabled) => {
    if (enabled) {
      // Re-enabling measurement needs a fresh registration pass: existing
      // snapshots were taken while measurement was off and their elements were
      // never observed by the (new) resize observer.
      nodeContentRegistration.clear()
      return
    }
    disconnectNodeContentResizeObserver()
    for (const timers of nodeContentDeferredMeasureTimers.values()) {
      for (const id of timers)
        clearHeightSettlingTimer(id)
    }
    nodeContentDeferredMeasureTimers.clear()
    nodeContentVersions.clear()
    clearFinalHeightConvergenceTimers()
    clearPendingHeightMeasurements()
  },
  { immediate: true },
)

watch(
  effectiveFinal,
  (final) => {
    if (final)
      scheduleFinalHeightConvergence()
    scheduleVirtualMetricsEmit(final ? 'final' : 'content')
  },
)

// Throttled version of scheduleVirtualMetricsEmit for high-frequency watchers
// This prevents excessive metric emission during rapid state changes
const throttledScheduleMetricsForContent = throttle(
  () => scheduleVirtualMetricsEmit('content'),
  16, // At most once per frame (16.67ms)
)

const throttledScheduleMetricsForBatch = throttle(
  () => scheduleVirtualMetricsEmit('batch'),
  16,
)

watch(
  [() => parsedNodes.value.length, () => renderedCount.value],
  () => {
    if (activeVirtualBottomAnchor.value)
      scheduleVirtualBottomRestoreReconcile()

    throttledScheduleMetricsForContent()
  },
  { flush: 'post', immediate: true },
)

watch(
  [() => liveRange.start, () => liveRange.end],
  () => {
    throttledScheduleMetricsForBatch()
  },
  { flush: 'post' },
)

const VIEWPORT_FALLBACK_DELAY = 1800
const VIEWPORT_FALLBACK_MARGIN_PX = 500

function scheduleVisibilityFallback(index: number) {
  if (!isClient || !deferNodes.value)
    return
  clearVisibilityFallback(index)
  // Spread timers a bit so long documents don't cause a thundering herd.
  const jitter = (index % 17) * 23
  const timer = window.setTimeout(() => {
    nodeVisibilityFallbackTimers.delete(index)
    if (!deferNodes.value)
      return
    if (visibleNodeIndices.value.has(index))
      return
    const el = nodeSlotElements.get(index)
    if (!el)
      return

    const root = resolveScrollContainer(el)
    const doc = el.ownerDocument || document
    const view = doc.defaultView || window
    const isViewportRoot = !root || root === doc.documentElement || root === doc.body
    const rootRect = !isViewportRoot && root
      ? readLayout('nodeVisibilityFallback.root.getBoundingClientRect', () => root.getBoundingClientRect())
      : null
    const viewportTop = isViewportRoot ? 0 : rootRect!.top
    const viewportBottom = isViewportRoot
      ? readLayout('nodeVisibilityFallback.clientHeight', () => view.innerHeight ?? root?.clientHeight ?? 0)
      : rootRect!.bottom
    const rect = readLayout('nodeVisibilityFallback.node.getBoundingClientRect', () => el.getBoundingClientRect())
    const nearViewport = rect.bottom >= (viewportTop - VIEWPORT_FALLBACK_MARGIN_PX)
      && rect.top <= (viewportBottom + VIEWPORT_FALLBACK_MARGIN_PX)

    // Only force-render when we're reasonably close to the viewport. If the
    // element is far away we leave it to the IO callback to avoid creating
    // an always-running timer loop for large documents.
    if (nearViewport)
      markNodeVisible(index, true)
  }, VIEWPORT_FALLBACK_DELAY + jitter)
  nodeVisibilityFallbackTimers.set(index, timer)
}

function autoDisableViewportPriority(reason: 'too-many-targets') {
  if (viewportPriorityAutoDisabled.value)
    return
  viewportPriorityAutoDisabled.value = true
  if (isDevEnv && typeof console !== 'undefined')
    console.warn('[markstream-vue] viewportPriority auto-disabled:', reason)

  destroyNodeVisibilityState()
}

const {
  cleanupBatchScheduler,
} = useBatchRenderingScheduler({
  props: rendererProps,
  isClient,
  isTestEnv,
  parsedNodesIdentity,
  parsedNodeCount,
  desiredRenderedCount,
  datasetKey: batchDatasetKey,
  batchingEnabled,
  incrementalRenderingActive,
  resolvedBatchSize,
  resolvedInitialBatch,
  renderedCount,
  adaptiveBatchSize,
  previousRenderContext,
  previousBatchConfig,
  requestFrame,
  cancelFrame,
  hasIdleCallback,
  cleanupNodeVisibility,
  onDatasetKeyChanged: (total) => {
    clearPendingHeightMeasurements()
    resetHeightMeasurements()
    markFallbackHeightPrefixDirty()
    resetVirtualMetricsEventDedupes()
    if (total > 0)
      rebuildHeightTrees(total)
  },
  onDatasetChanged: () => {
    if (virtualizationEnabled.value)
      scheduleFocusSync({ immediate: true })
  },
})

watch(
  [
    scrollListenerEnabled,
    virtualizationEnabled,
    () => containerRef.value,
    () => resolveVirtualScrollRoot(),
  ],
  ([listenerEnabled, virtualized]) => {
    if (!listenerEnabled) {
      cleanupScrollListener()
      cancelScheduledFocusSync()
      return
    }

    setupScrollListener()

    if (virtualized)
      scheduleFocusSync({ immediate: true })
    else
      cancelScheduledFocusSync()
  },
  { flush: 'post', immediate: true },
)

// Some scroll containers (e.g. `flex-direction: column-reverse` chat lists)
// report `scrollTop=0` when visually at the bottom. To avoid a blank initial
// viewport in virtualized mode, resync focus after the DOM has committed.
//
// Three watchers fire on every streaming commit (parsedNodes.length x2 and
// renderedCount) and each called scheduleFocusSync({ immediate: true }),
// which cancels any pending sync and runs syncFocusToScroll synchronously —
// up to 3 synchronous layout reads per commit. Deduplicate them into a single
// per-frame sync so a commit pays for one focus sync instead of three. The
// focus target is computed from the same state, so the final scroll position
// is identical.
let pendingCommitFocusSync = false

function scheduleCommitFocusSync() {
  if (!virtualizationEnabled.value || !isClient || pendingCommitFocusSync)
    return
  pendingCommitFocusSync = true
  if (requestFrame) {
    requestFrame(() => {
      pendingCommitFocusSync = false
      scheduleFocusSync({ immediate: true })
    })
  }
  else {
    queueMicrotask(() => {
      pendingCommitFocusSync = false
      scheduleFocusSync({ immediate: true })
    })
  }
}

watch(
  [() => parsedNodes.value.length, () => virtualizationEnabled.value],
  ([length, enabled]) => {
    if (!enabled || !length || !isClient)
      return
    scheduleCommitFocusSync()
  },
  { flush: 'post' },
)

watch(
  heightEstimationActive,
  (enabled) => {
    if (!enabled)
      return
    ensureExperimentProbeNodes()
  },
  { immediate: true },
)

watch(
  [() => containerRef.value, measuredContainerWidthActive],
  () => {
    if (!measuredContainerWidthActive.value) {
      cleanupContainerResizeObserver()
      measuredContainerWidth.value = 0
      return
    }
    updateMeasuredContainerWidth()
    setupContainerResizeObserver()
  },
  { immediate: true },
)

watch(
  [
    heightEstimationActive,
    experimentProbeWidth,
    virtualLayoutEpochKey,
  ],
  async () => {
    if (!heightEstimationActive.value) {
      simpleTextProbeProfile.value = createEmptySimpleTextProbeProfile()
      markFallbackHeightPrefixDirty()
      return
    }
    await nextTick()
    readSimpleTextProbeProfile()
  },
  { flush: 'post', immediate: true },
)

watch(
  () => parsedNodes.value.length,
  () => {
    if (virtualizationEnabled.value)
      scheduleCommitFocusSync()
  },
)

watch(
  [heightEstimationActive, measuredContainerWidth],
  () => {
    markFallbackHeightPrefixDirty()
    if (virtualizationEnabled.value)
      scheduleFocusSync({ immediate: true })
    if (activeRestoreAnchor.value)
      scheduleRestoreReconcile()
    if (activeVirtualBottomAnchor.value)
      scheduleVirtualBottomRestoreReconcile()
    scheduleVirtualMetricsEmit('resize')
  },
  { immediate: false },
)

watch(
  () => deferNodes.value,
  (enabled) => {
    if (!enabled) {
      destroyNodeVisibilityState()
      if (virtualizationEnabled.value) {
        scheduleFocusSync({ immediate: true })
      }
      else {
        for (const [index, el] of nodeSlotElements) {
          if (el)
            markNodeVisible(index, true)
        }
      }
      return
    }
    for (const [index, el] of nodeSlotElements)
      setNodeSlotElement(index, el)
  },
  { immediate: false },
)

watch(
  [
    viewportPriorityRootMargin,
    viewportPriorityMaxTargets,
    () => resolveVirtualScrollRoot(),
  ],
  () => {
    registerNodeVisibility.refresh?.()
    for (const [index, el] of nodeSlotElements)
      setNodeSlotElement(index, el)
  },
  { immediate: false },
)

watch(
  [() => rendererProps.viewportPriority, () => parsedNodes.value.length, viewportPriorityMaxTargets],
  ([enabled, length, maxTargets]) => {
    if (enabled === false) {
      viewportPriorityAutoDisabled.value = false
      return
    }
    if (
      viewportPriorityAutoDisabled.value
      && (length <= VIEWPORT_PRIORITY_RECOVERY_COUNT || length <= maxTargets)
    ) {
      viewportPriorityAutoDisabled.value = false
      for (const [index, el] of nodeSlotElements)
        setNodeSlotElement(index, el)
    }
  },
)

watch(
  () => renderedCount.value,
  () => {
    // Keep this synchronous: batch rendering grows renderedCount batch by
    // batch, and a bottom-pinned anchor must follow each batch immediately.
    // Deferring to the next frame lets the scroll position drift for a frame.
    if (virtualizationEnabled.value)
      scheduleFocusSync({ immediate: true })
  },
)

watch(
  [focusIndex, maxLiveNodesResolved, liveNodeBufferResolved, () => parsedNodes.value.length, virtualizationEnabled],
  () => {
    updateLiveRange()
  },
  { immediate: true },
)

let autoSettledVirtualSignature: string | null = null
let manualSettleInFlight = false
let lastVirtualLayoutEpochKey: string | null = null

function resetVirtualSettleConfirmation() {
  autoSettledVirtualSignature = null
  imperativeVirtualSettleSessionKey = null
  imperativeVirtualSettleThreadKey = undefined
  lastManualSettleSignature = null
  resetVirtualMetricsEventDedupes()
}

function getAutoVirtualSettleSignature() {
  const total = parsedNodes.value.length

  return [
    getVirtualThreadKey() ?? '',
    getVirtualSessionKey(),
    getVirtualMeasurementKey(),
    virtualLayoutWidthBucket.value,
    total,
    Math.round(estimateHeightRange(0, total)),
    Math.round(getCurrentVirtualWidth()),
    heightStats.count,
    Math.round(heightStats.total),
  ].join(':')
}

function resetVirtualSessionMeasurements() {
  clearPendingHeightMeasurements()
  resetHeightMeasurements()
  markFallbackHeightPrefixDirty()
  nodeHeightSignatures.length = 0

  const total = parsedNodes.value.length
  if (total > 0)
    rebuildHeightTrees(total)

  seedCurrentNodeHeightSignatures()
}

function resetVirtualSessionRuntimeState() {
  clearVirtualMetricsSchedule()
  clearAllHeightSettlingTimers()
  lastEmittedVirtualMetrics = null
  lastImportedVirtualHeightCacheSignature = null
  lastImportedVirtualHeightCacheSource = null
  lastAppliedVirtualRestoreSignature = null
  pendingImperativeVirtualRestoreState = null
  pendingImperativeVirtualRestoreOptions = null
  manualSettleInFlight = false
  resetVirtualSettleConfirmation()

  clearAllPendingAsyncNodeKeys('restore')

  clearRestoreReconcile()
  clearActiveVirtualBottomAnchor()
}

function resetVirtualLayoutMeasurements(reason: MarkstreamVirtualReason = 'resize') {
  clearPendingHeightMeasurements()
  resetHeightMeasurements()
  markFallbackHeightPrefixDirty()
  nodeHeightSignatures.length = 0

  const total = parsedNodes.value.length
  if (total > 0)
    rebuildHeightTrees(total)

  seedCurrentNodeHeightSignatures()

  lastImportedVirtualHeightCacheSignature = null
  lastImportedVirtualHeightCacheSource = null
  lastAppliedVirtualRestoreSignature = null
  lastEmittedVirtualMetrics = null
  manualSettleInFlight = false
  resetVirtualSettleConfirmation()

  tryImportVirtualHeightCache()

  void nextTick(() => {
    measureTrackedNodeHeights()

    if (activeRestoreAnchor.value)
      scheduleRestoreReconcile()
    if (activeVirtualBottomAnchor.value)
      scheduleVirtualBottomRestoreReconcile()

    scheduleVirtualMetricsEmit(reason)
  })
}

watch(
  virtualScrollEnabled,
  (enabled, previous) => {
    if (enabled === previous)
      return

    if (!enabled) {
      resetVirtualSessionRuntimeState()
      clearVirtualMetricsSchedule()
      return
    }

    resetVirtualSessionRuntimeState()
    resetVirtualSessionMeasurements()
    lastVirtualLayoutEpochKey = virtualLayoutEpochKey.value
    scheduleVirtualMetricsEmit('content')
  },
  { flush: 'post' },
)

watch(
  [virtualScrollEnabled, virtualLayoutEpochKey],
  ([enabled, epochKey]) => {
    if (!enabled) {
      lastVirtualLayoutEpochKey = null
      return
    }

    if (lastVirtualLayoutEpochKey == null) {
      lastVirtualLayoutEpochKey = epochKey
      return
    }

    if (lastVirtualLayoutEpochKey === epochKey)
      return

    lastVirtualLayoutEpochKey = epochKey
    resetVirtualLayoutMeasurements('resize')
  },
  { flush: 'post', immediate: true },
)

watch(
  [virtualScrollEnabled, () => getVirtualSessionKey(), () => getVirtualThreadKey()],
  ([enabled]) => {
    if (!enabled)
      return

    resetVirtualSessionRuntimeState()
    resetVirtualSessionMeasurements()
    clearAllPendingAsyncNodeKeys('content')
    scheduleVirtualMetricsEmit('content')
  },
)

watch(
  [
    virtualScrollEnabled,
    () => getVirtualSessionKey(),
    () => getVirtualThreadKey(),
    virtualLayoutEpochKey,
    () => parsedNodes.value.length,
  ],
  ([enabled]) => {
    if (enabled)
      pruneStalePendingAsyncNodeKeys('async-node')
  },
  { flush: 'post' },
)

watch(
  [
    virtualScrollEnabled,
    () => props.virtualScroll?.sessionKey,
    () => props.virtualScroll?.measurementKey,
    () => props.indexKey,
    () => streamRenderVersion.value,
  ],
  ([enabled]) => {
    if (enabled) {
      resetVirtualMetricsEventDedupes()
      invalidateChangedNodeHeights('content')
    }
  },
  { flush: 'post', immediate: true },
)

watch(
  [
    virtualScrollEnabled,
    () => parsedNodes.value.length,
    () => getVirtualSessionKey(),
    () => getVirtualThreadKey(),
  ],
  ([enabled, length, sessionKey, threadKey], [previousEnabled, previousLength, previousSessionKey, previousThreadKey]) => {
    if (!enabled || !previousEnabled)
      return

    if (sessionKey !== previousSessionKey || threadKey !== previousThreadKey)
      return

    if (length !== previousLength)
      resetVirtualSettleConfirmation()
  },
  { flush: 'post' },
)

watch(
  [
    virtualScrollEnabled,
    () => props.virtualScroll?.heightCache,
    () => props.virtualScroll?.heightCacheWidth,
    () => props.virtualScroll?.restoreState,
    () => props.virtualScroll?.measurementKey,
    () => parsedNodes.value.length,
    () => getVirtualSessionKey(),
    measuredContainerWidth,
  ],
  () => {
    tryImportVirtualHeightCache()
  },
  { flush: 'post', immediate: true },
)

watch(
  [
    virtualScrollEnabled,
    () => props.virtualScroll?.restoreState,
    () => props.virtualScroll?.restoreAnchor,
    () => props.virtualScroll?.measurementKey,
    () => parsedNodes.value.length,
    () => getVirtualSessionKey(),
    measuredContainerWidth,
  ],
  async ([enabled, state]) => {
    if (!enabled || !state)
      return

    await nextTick()

    const restoreToken = getVirtualRestoreAnchorToken()
    applyVirtualRestoreState(state, {
      restoreAnchor: restoreToken != null,
      restoreToken: restoreToken ?? undefined,
    })
  },
  { flush: 'post', immediate: true },
)

watch(
  [virtualScrollEnabled, measuredContainerWidth, () => props.virtualScroll?.restoreState, () => props.virtualScroll?.measurementKey],
  ([enabled]) => {
    if (!enabled)
      return

    const state = props.virtualScroll?.restoreState
    if (!state || !lastImportedVirtualHeightCacheSignature)
      return

    if (lastImportedVirtualHeightCacheSource !== 'restore')
      return

    if (canRestoreVirtualStateCache(state))
      return

    resetVirtualSessionMeasurements()
    lastImportedVirtualHeightCacheSignature = null
    lastImportedVirtualHeightCacheSource = null
    scheduleVirtualMetricsEmit('resize')
  },
  { flush: 'post' },
)

watch(
  [
    virtualScrollEnabled,
    () => parsedNodes.value.length,
    () => getVirtualSessionKey(),
    measuredContainerWidth,
  ],
  async ([enabled]) => {
    const state = pendingImperativeVirtualRestoreState
    const options = pendingImperativeVirtualRestoreOptions
    if (!enabled || !state)
      return

    await nextTick()

    const applied = applyVirtualRestoreState(state, {
      restoreAnchor: options?.restoreAnchor === true,
      restoreToken: options?.restoreToken ?? 'imperative',
      allowUncapturedAnchor: options?.allowUncapturedAnchor === true,
    })

    if (applied || !shouldKeepPendingVirtualRestoreState(state)) {
      pendingImperativeVirtualRestoreState = null
      pendingImperativeVirtualRestoreOptions = null
    }
  },
  { flush: 'post', immediate: true },
)

watch(
  [
    virtualScrollEnabled,
    effectiveFinal,
    () => props.virtualScroll?.settleMode,
    () => getVirtualSessionKey(),
    () => getVirtualThreadKey(),
    virtualLayoutEpochKey,
    pendingAsyncNodeCount,
    pendingHeightSettlingTaskCount,
    () => renderedCount.value,
    desiredRenderedCount,
    () => heightStats.count,
    () => heightStats.total,
  ],
  ([enabled, final, settleMode]) => {
    if (!enabled || final !== true || settleMode === 'manual')
      return
    if (!isLayoutSettled())
      return

    const signature = getAutoVirtualSettleSignature()

    if (autoSettledVirtualSignature === signature)
      return

    autoSettledVirtualSignature = signature

    void settle({ reason: 'final' }).then((metrics) => {
      if (!metrics.stable && autoSettledVirtualSignature === signature)
        autoSettledVirtualSignature = null
    })
  },
  { flush: 'post', immediate: true },
)

function getManualSettleSignature(token: unknown) {
  return [
    getVirtualThreadKey() ?? '',
    getVirtualSessionKey(),
    getVirtualMeasurementKey(),
    virtualLayoutWidthBucket.value,
    getManualSettleTokenKey(token),
    parsedNodes.value.length,
    Math.round(estimateHeightRange(0, parsedNodes.value.length)),
    Math.round(getCurrentVirtualWidth()),
    heightStats.count,
    Math.round(heightStats.total),
  ].join(':')
}

async function runManualSettleIfReady() {
  const token = props.virtualScroll?.settledToken
  const tokenKeyAtStart = getManualSettleTokenKey(token)
  const sessionKeyAtStart = getVirtualSessionKey()
  const threadKeyAtStart = getVirtualThreadKey()
  const layoutEpochKeyAtStart = virtualLayoutEpochKey.value

  if (!virtualScrollEnabled.value)
    return
  if (props.virtualScroll?.settleMode !== 'manual')
    return
  if (!hasManualSettleSignal(token))
    return

  if (!isInternalLayoutSettled()) {
    scheduleVirtualMetricsEmit('manual')
    return
  }

  const signature = getManualSettleSignature(token)
  if (signature === lastManualSettleSignature || manualSettleInFlight)
    return

  manualSettleInFlight = true
  try {
    const metrics = await settle({
      reason: 'manual',
      expectedSettledTokenKey: tokenKeyAtStart,
    })
    const tokenStillCurrent = getManualSettleTokenKey() === tokenKeyAtStart

    if (
      isSameVirtualSession(sessionKeyAtStart, threadKeyAtStart, layoutEpochKeyAtStart)
      && metrics.sessionKey === sessionKeyAtStart
      && metrics.threadKey === threadKeyAtStart
      && tokenStillCurrent
      && metrics.stable
      && metrics.phase === 'final'
    ) {
      lastManualSettleSignature = getManualSettleSignature(
        props.virtualScroll?.settledToken,
      )
    }
  }
  finally {
    manualSettleInFlight = false

    await nextTick()
    const currentToken = props.virtualScroll?.settledToken
    const currentSignature = hasManualSettleSignal(currentToken)
      ? getManualSettleSignature(currentToken)
      : ''

    if (
      isSameVirtualSession(sessionKeyAtStart, threadKeyAtStart, layoutEpochKeyAtStart)
      && currentSignature
      && lastManualSettleSignature !== currentSignature
    ) {
      void runManualSettleIfReady()
    }
  }
}

watch(
  [
    virtualScrollEnabled,
    effectiveFinal,
    () => props.virtualScroll?.settleMode,
    () => props.virtualScroll?.settledToken,
    () => getVirtualSessionKey(),
    () => getVirtualThreadKey(),
    virtualLayoutEpochKey,
    pendingAsyncNodeCount,
    pendingHeightSettlingTaskCount,
    () => renderedCount.value,
    desiredRenderedCount,
    () => parsedNodes.value.length,
    () => heightStats.count,
    () => heightStats.total,
  ],
  () => {
    void runManualSettleIfReady()
  },
  { flush: 'post', immediate: true },
)

watch(
  [() => parsedNodes.value.length, virtualizationEnabled, maxLiveNodesResolved, liveNodeBufferResolved, () => liveRange.start, () => liveRange.end],
  ([length, virtualization, maxLiveNodes, buffer, start, end]) => {
    if (!debugPerformanceEnabled.value)
      return
    logPerf('virtualization', {
      nodes: length,
      virtualization,
      maxLiveNodes,
      buffer,
      focusIndex: focusIndex.value,
      scroll: virtualization
        ? (() => {
            const root = scrollRootElement.value || resolveScrollContainer()
            if (!root)
              return null
            return {
              reverse: isReverseFlexScrollRoot(root),
              scrollTop: Math.round(root.scrollTop),
              scrollTopAbs: Math.round(Math.abs(root.scrollTop)),
              scrollHeight: Math.round(root.scrollHeight),
              clientHeight: Math.round(root.clientHeight),
            }
          })()
        : null,
      liveRange: { start, end },
      rendered: renderedCount.value,
    })
  },
)

watch(
  [() => rendererProps.customId],
  ([customId], _prev, onCleanup) => {
    if (!customId || isNestedListItemRenderer)
      return
    const cleanup = registerHeightEstimationRendererController(customId, {
      captureRestoreAnchor,
      restoreAnchor,
      getAnchorDrift,
      getReport: buildExperimentReport,
    })
    onCleanup(() => {
      cleanup()
    })
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  flushVirtualStateBeforeUnmount()
  cleanupBatchScheduler()
  destroyNodeVisibilityState()
  clearContentStreamingTailIdleTimer()
  disconnectNodeContentResizeObserver()
  for (const timers of nodeContentDeferredMeasureTimers.values()) {
    for (const id of timers)
      clearHeightSettlingTimer(id)
  }
  nodeContentDeferredMeasureTimers.clear()
  nodeContentVersions.clear()
  nodeHeightSignatures.length = 0
  clearFinalHeightConvergenceTimers()
  clearPendingHeightMeasurements()
  cleanupContainerResizeObserver()
  clearRestoreReconcile()
  clearActiveVirtualBottomAnchor()
  clearVirtualMetricsSchedule()
  cleanupScrollListener()
  cancelScheduledFocusSync()
})

const MermaidBlockNodeInnerAsync = defineAsyncComponent({
  loader: async () => {
    try {
      const mod = await import('../../components/MermaidBlockNode')
      return mod.default
    }
    catch (e) {
      console.warn(
        '[markstream-vue] Optional peer dependencies for MermaidBlockNode are missing. Falling back to preformatted code rendering. To enable Mermaid rendering, please install "mermaid".',
        e,
      )
      return PreCodeNode
    }
  },
  loadingComponent: MermaidBlockNodeLoading,
  delay: 0,
})
const MermaidBlockNodeAsync = withViewportDeferredLoading(
  'ViewportDeferredMermaidBlockNode',
  MermaidBlockNodeInnerAsync,
  MermaidBlockNodeLoading,
)

const InfographicBlockNodeInnerAsync = defineAsyncComponent({
  loader: async () => {
    try {
      const mod = await import('../../components/InfographicBlockNode')
      return mod.default
    }
    catch (e) {
      console.warn(
        '[markstream-vue] Failed to load InfographicBlockNode. Showing the Infographic source fallback. To enable Infographic rendering, install "@antv/infographic" and configure setInfographicLoader with a dynamic loader.',
        e,
      )
      return InfographicBlockNodeLoading
    }
  },
  loadingComponent: InfographicBlockNodeLoading,
  delay: 0,
})
const InfographicBlockNodeAsync = withViewportDeferredLoading(
  'ViewportDeferredInfographicBlockNode',
  InfographicBlockNodeInnerAsync,
  InfographicBlockNodeLoading,
)

const D2BlockNodeInnerAsync = defineAsyncComponent(async () => {
  try {
    const mod = await import('../../components/D2BlockNode')
    return mod.default
  }
  catch (e) {
    console.warn(
      '[markstream-vue] Optional peer dependencies for D2BlockNode are missing. Falling back to preformatted code rendering. To enable D2 rendering, please install "@terrastruct/d2".',
      e,
    )
    return PreCodeNode
  }
})
const D2BlockNodeAsync = withViewportDeferredLoading(
  'ViewportDeferredD2BlockNode',
  D2BlockNodeInnerAsync,
  PreCodeNode,
)

// 组件映射表
const nodeComponents: Partial<CustomComponents> = {
  text: TextNode,
  paragraph: ParagraphNode,
  heading: HeadingNode,
  code_block: CodeBlockNodeAsync,
  list: ListNode,
  list_item: ListItemNode,
  blockquote: BlockquoteNode,
  table: TableNode,
  definition_list: DefinitionListNode,
  footnote: FootnoteNode,
  footnote_reference: FootnoteReferenceNode,
  footnote_anchor: FootnoteAnchorNode,
  admonition: AdmonitionNode,
  vmr_container: VmrContainerNode,
  hardbreak: HardBreakNode,
  link: LinkNode,
  image: ImageNode,
  thematic_break: ThematicBreakNode,
  math_inline: MathInlineNodeAsync,
  math_block: MathBlockNodeAsync,
  strong: StrongNode,
  emphasis: EmphasisNode,
  strikethrough: StrikethroughNode,
  highlight: HighlightNode,
  insert: InsertNode,
  subscript: SubscriptNode,
  superscript: SuperscriptNode,
  emoji: EmojiNode,
  checkbox: CheckboxNode,
  checkbox_input: CheckboxNode,
  inline_code: InlineCodeNode,
  html_inline: HtmlInlineNode,
  reference: ReferenceNode,
  html_block: HtmlBlockNode,
  // 可以添加更多节点类型
  // 例如:custom_node: CustomNode,
}
const indexPrefix = computed(() => getCurrentIndexPrefix())
const codeBlockExtraProps = computed(() => getCodeBlockExtraProps(rendererProps.codeBlockProps))
const builtinCodeBlockExtraProps = computed(() =>
  getCodeBlockExtraProps(rendererProps.codeBlockProps),
)
const codeBlockBindings = computed(() => ({
  // streaming behavior control for CodeBlockNode
  stream: rendererProps.codeBlockStream,
  darkTheme: rendererProps.codeBlockDarkTheme,
  lightTheme: rendererProps.codeBlockLightTheme,
  themes: rendererProps.themes,
  minWidth: rendererProps.codeBlockMinWidth,
  maxWidth: rendererProps.codeBlockMaxWidth,
  ...(typeof resolvedShowTooltips.value === 'boolean' ? { showTooltips: resolvedShowTooltips.value } : {}),
  ...builtinCodeBlockExtraProps.value,
  codeBlockOptions: rendererProps.codeBlockOptions,
}))

const customCodeBlockBindings = computed(() => ({
  ...codeBlockBindings.value,
  ...codeBlockExtraProps.value,
  codeBlockOptions: rendererProps.codeBlockOptions,
}))

function pickBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}

function pickPositiveNumber(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined
}

const preCodeBlockBindings = computed(() => {
  const source = (rendererProps.codeBlockProps || {}) as Record<string, unknown>
  const bindings: Record<string, unknown> = {}

  const showLineNumbers = pickBoolean(source.showLineNumbers)
  bindings.showLineNumbers = showLineNumbers
    ?? (rendererProps.codeBlockOptions?.disableLineNumbers !== true)

  bindings.showHeader = pickBoolean(source.showHeader) ?? true
  bindings.showCopyButton = pickBoolean(source.showCopyButton) ?? true
  const showTooltips = pickBoolean(source.showTooltips) ?? resolvedShowTooltips.value
  if (typeof showTooltips === 'boolean')
    bindings.showTooltips = showTooltips

  bindings.codeBlockOptions = rendererProps.codeBlockOptions
  bindings.isDark = rendererProps.isDark
  bindings.darkTheme = source.darkTheme ?? rendererProps.codeBlockDarkTheme
  bindings.lightTheme = source.lightTheme ?? rendererProps.codeBlockLightTheme
  bindings.theme = source.theme
  bindings.themes = source.themes ?? rendererProps.themes

  const diffInline = pickBoolean(source.diffInline)
  if (diffInline !== undefined)
    bindings.diffInline = diffInline

  if (source.diffHideUnchangedRegions !== undefined)
    bindings.diffHideUnchangedRegions = source.diffHideUnchangedRegions

  const reservedHeightPx = pickPositiveNumber(source.reservedHeightPx)
  if (reservedHeightPx !== undefined)
    bindings.reservedHeightPx = reservedHeightPx

  return bindings
})

const mermaidBindings = computed(() => ({
  ...(rendererProps.mermaidProps || {}),
}))
const d2Bindings = computed(() => ({
  ...(rendererProps.d2Props || {}),
}))
const infographicBindings = computed(() => ({
  ...(rendererProps.infographicProps || {}),
}))
const nonCodeBindings = computed(() => ({
  typewriter: typewriterEnabled.value,
  fade: rendererProps.fade,
  // Forward customHtmlTags for non-whitelisted tag detection in child components
  customHtmlTags: mergedParseOptions.value.customHtmlTags,
}))
const linkBindings = computed(() => ({
  ...nonCodeBindings.value,
  ...(typeof resolvedShowTooltips.value === 'boolean' ? { showTooltip: resolvedShowTooltips.value } : {}),
}))
const listBindings = computed(() => ({
  ...nonCodeBindings.value,
  ...(typeof resolvedShowTooltips.value === 'boolean' ? { showTooltips: resolvedShowTooltips.value } : {}),
}))
const blockquoteBindings = computed(() => ({
  ...nonCodeBindings.value,
  ...(typeof resolvedShowTooltips.value === 'boolean' ? { showTooltips: resolvedShowTooltips.value } : {}),
}))
const tableBindings = computed(() => ({
  ...nonCodeBindings.value,
  ...(typeof resolvedShowTooltips.value === 'boolean' ? { showTooltips: resolvedShowTooltips.value } : {}),
}))

function getCodeBlockRenderNode(node: ParsedNode, index: number) {
  if (node.type !== 'code_block') {
    codeBlockRenderCache[index] = undefined
    return node
  }

  const codeBlockNode = node as RuntimeCodeBlockNode
  const signature = [
    codeBlockNode.language,
    codeBlockNode.loading,
    codeBlockNode.diff,
    codeBlockNode.code,
    codeBlockNode.originalCode,
    codeBlockNode.updatedCode,
    codeBlockNode.raw,
    codeBlockNode.startLine,
    codeBlockNode.endLine,
    codeBlockNode.sourceMap?.startLine,
    codeBlockNode.sourceMap?.endLine,
  ] as const

  const cached = codeBlockRenderCache[index]
  if (cached && signature.every((value, signatureIndex) => value === cached.signature[signatureIndex]))
    return cached.node

  const cloned = { ...codeBlockNode } as ParsedNode
  codeBlockRenderCache[index] = { signature, node: cloned }
  return cloned
}

function isCustomTagComponent(node: ParsedNode, component: unknown) {
  const type = String(node.type)
  return !isReservedNodeComponentKey(type) && customComponentsMap.value[type] === component
}

function hasSlotChildren(node: ParsedNode) {
  return Array.isArray((node as any).children) && (node as any).children.length > 0
}

interface RenderedItemLike {
  index: number
  node: ParsedNode
  /** Loading value captured from the source node when cached props were built. */
  sourceLoading: unknown
  component: unknown
  bindings: Record<string, unknown>
  customBindings: Record<string, unknown>
  /** Pre-merged props for the standard (non-custom) component in full DOM mode. */
  nodeProps: Record<string, unknown>
  /** Pre-merged props for a custom node component in full DOM mode. */
  customNodeProps: Record<string, unknown>
  /** Pre-merged props for the render-as-fragment branch (adds click/mouse delegation handlers). */
  fragmentNodeProps: Record<string, unknown>
  /** Pre-merged props for a custom node component in render-as-fragment mode. */
  customFragmentNodeProps: Record<string, unknown>
  /** Pre-merged props for minimal DOM mode (adds raw mouseover/mouseout emitters). */
  minimalNodeProps: Record<string, unknown>
  rendersCustomNode: boolean
  hasSlotChildren: boolean
  slotContent: string
  isCodeBlock: boolean
  indexKey: string
  vnodeKey: string
}

interface RenderedItemCacheEntry {
  signature: unknown[]
  item: RenderedItemLike
}

// P1-6: cache the fully-built render item per parsed node reference. The
// parser reuses the same node objects for the stable prefix across streaming
// commits, so unchanged nodes hit this cache and skip all per-node work
// (bindings assembly, html-tag routing, preview height estimation, object
// allocation). The signature covers every reactive input the derivation
// reads; any of them changing forces a rebuild.
const renderedItemCache = new WeakMap<object, RenderedItemCacheEntry>()
const previewHeightEstimateCache = new WeakMap<object, { code: string, height: number }>()

// Non-virtualized render items, kept aligned with `parsedNodes`. Stable
// prefix entries are reused across streaming commits (only the dirty tail is
// rebuilt), which removes the per-commit O(N) signature build + WeakMap
// lookup + object allocation for the whole document.
const renderedItemsNonVirtual: RenderedItemLike[] = []
// Source node each non-virtualized cache entry was built from. Code blocks are
// rendered from a shallow clone (not the source node), so this parallel array
// lets the identity scan distinguish a parser-reused source node (same object,
// clean) from an externally supplied replacement node (new object, dirty)
// without comparing against the clone in the item.
const renderedItemSourceNodes: Array<ParsedNode | undefined> = []
let lastRenderedItemGlobalSignature: readonly unknown[] | null = null
// Array instance returned by the `renderedItems` computed on its last
// evaluation. Reused verbatim on no-op commits so Vue skips the v-for re-render
// instead of diffing a freshly sliced array of identical items.
let lastRenderedItemsArray: RenderedItemLike[] = []

/**
 * Signature of all renderer-level (node-independent) inputs a rendered item
 * derives from. Shared by every item; when it changes, the whole item list
 * must be rebuilt. Returns a stable array instance while the inputs are
 * unchanged so per-item comparisons collapse to a reference check.
 */
function getRenderedItemGlobalSignature(): readonly unknown[] {
  const values = [
    resolvedRenderCodeBlocksAsPre.value,
    customComponentsMap.value,
    effectiveCustomHtmlTagsSet.value,
    resolvedHtmlPolicy.value,
    rendererSessionIdentity.value,
    indexPrefix.value,
    mathBlockCacheScope,
    codeBlockComponent.value,
    // Item props are pre-merged (frozen) at build time, so inputs that used to
    // be read live in the template must invalidate the per-item cache when
    // they change.
    rendererProps.customId,
    rendererProps.isDark,
    preCodeBlockBindings.value,
    codeBlockBindings.value,
    customCodeBlockBindings.value,
    mermaidBindings.value,
    infographicBindings.value,
    d2Bindings.value,
    nonCodeBindings.value,
    linkBindings.value,
    listBindings.value,
    blockquoteBindings.value,
    tableBindings.value,
    // Height-estimation configuration leaks into every item's
    // `estimatedHeight`; fold it in so estimation changes rebuild all items.
    heightEstimationActive.value,
    heightEstimationExperimentRevision.value,
    measuredContainerWidth.value,
  ]
  if (lastRenderedItemGlobalSignature && hasSameRenderedItemSignature(lastRenderedItemGlobalSignature, values))
    return lastRenderedItemGlobalSignature
  lastRenderedItemGlobalSignature = values
  return values
}

function getMemoizedPreviewHeight(
  node: ParsedNode,
  estimate: (code: string) => number,
) {
  const code = String((node as RuntimeCodeBlockNode)?.code ?? '')
  const cached = previewHeightEstimateCache.get(node)
  if (cached && cached.code === code)
    return cached.height
  const height = estimate(code)
  previewHeightEstimateCache.set(node, { code, height })
  return height
}

function hasSameRenderedItemSignature(previous: readonly unknown[], next: readonly unknown[]) {
  if (previous.length !== next.length)
    return false
  for (let i = 0; i < previous.length; i++) {
    if (!Object.is(previous[i], next[i]))
      return false
  }
  return true
}

function buildRenderedItemSignature(node: ParsedNode, index: number, globalSignature: readonly unknown[]) {
  const estimatedHeight = heightEstimationActive.value ? estimatedNodeHeights.value[index] : null
  const codeBlock = node.type === 'code_block' ? node as RuntimeCodeBlockNode : null
  // Loading may be updated in place on externally supplied or parser-reused
  // nodes. Include the primitive snapshot so virtualized cache lookups rebuild
  // the pre-merged props when that visible state changes.
  // Code-block render nodes are shallow clones. Include their payload fields
  // in the cache signature as well; otherwise a parser-reused source node can
  // receive new code while the rendered-item cache still returns the old
  // clone, dropping characters on the final smooth-streaming commit.
  return [
    index,
    (node as { loading?: unknown }).loading,
    codeBlock?.language,
    codeBlock?.code,
    codeBlock?.raw,
    codeBlock?.originalCode,
    codeBlock?.updatedCode,
    codeBlock?.diff,
    codeBlock?.startLine,
    codeBlock?.endLine,
    codeBlock?.sourceMap?.startLine,
    codeBlock?.sourceMap?.endLine,
    estimatedHeight,
    globalSignature,
  ]
}

/**
 * Build (or reuse from the WeakMap cache) the render item for one node.
 * The per-node signature tracks index, loading, estimated height and the
 * renderer-global signature so unchanged nodes skip all derivation work.
 */
function buildRenderedItem(item: { node: ParsedNode, index: number }, globalSignature: readonly unknown[]) {
  const cacheSignature = buildRenderedItemSignature(item.node, item.index, globalSignature)
  const cachedItem = renderedItemCache.get(item.node)
  if (cachedItem && hasSameRenderedItemSignature(cachedItem.signature, cacheSignature))
    return cachedItem.item

  // Reuse the previous shallow clone for code blocks unless the visible
  // payload changed, so parent recomputations do not churn stream-diffs props.
  let node = getCodeBlockRenderNode(item.node, item.index)
  const language = getCodeBlockLanguage(node)
  let component = getNodeComponent(node, language)

  // When an html_block or html_inline node resolved to its default
  // component, check whether the node's tag matches a registered custom
  // component AND is listed in customHtmlTags.  This handles pre-parsed
  // nodes (via the `nodes` prop) that were not parsed with
  // `customHtmlTags`, so their type is still `html_block`/`html_inline`
  // but the tag references a known custom component.
  if (
    (node.type === 'html_block' || node.type === 'html_inline')
    && component === nodeComponents[node.type]
  ) {
    const htmlNode = node as RuntimeHtmlNode
    const tag = String(htmlNode.tag ?? '').trim().toLowerCase()
      || getHtmlTagFromContent(htmlNode.content)
    if (tag) {
      const customComponents = customComponentsMap.value
      const customForTag = customComponents[tag]

      // Check if tag is whitelisted in customHtmlTags
      if (effectiveCustomHtmlTagsSet.value.has(tag) && customForTag) {
        component = customForTag
        node = {
          ...htmlNode,
          type: tag,
          tag,
          content: stripCustomHtmlWrapper(htmlNode.content, tag),
        } as ParsedNode
      }
      else if (shouldRenderUnknownHtmlTagAsText(htmlNode.content ?? htmlNode.raw, tag)) {
        const rawContent = String(htmlNode.content ?? htmlNode.raw ?? '')

        if (node.type === 'html_inline') {
          component = TextNode
          node = {
            type: 'text',
            content: rawContent,
            raw: rawContent,
          } as ParsedNode
        }
        else {
          component = ParagraphNode
          node = {
            type: 'paragraph',
            children: [{ type: 'text', content: rawContent, raw: rawContent }],
            raw: rawContent,
          } as ParsedNode
        }
      }
    }
  }

  const usesPreCodeBindings = node.type === 'code_block'
    && resolvedRenderCodeBlocksAsPre.value
    && component === PreCodeBlockAsync
    && !getCustomCodeLanguageComponent(customComponentsMap.value, language)
  let bindings = { ...getBindingsFor(node, language, component) } as Record<string, unknown>
  const estimatedHeight = heightEstimationActive.value ? estimatedNodeHeights.value[item.index] : null
  if (node.type === 'code_block' && estimatedHeight?.kind === 'code-block') {
    if (usesPreCodeBindings) {
      bindings = {
        ...bindings,
        reservedHeightPx: estimatedHeight.contentHeight,
      }
    }
    else {
      bindings = {
        ...bindings,
        estimatedHeightPx: estimatedHeight.height,
        estimatedContentHeightPx: estimatedHeight.contentHeight,
        estimatedDiffInline: estimatedHeight.diffInline,
      }
    }
  }
  if (
    !usesPreCodeBindings
    && node.type === 'code_block'
    && language === 'mermaid'
    && parsePositiveNumber(bindings.estimatedPreviewHeightPx) == null
  ) {
    bindings = {
      ...bindings,
      estimatedPreviewHeightPx: clampMermaidPreviewHeight(
        getMemoizedPreviewHeight(node, estimateMermaidPreviewHeight),
      ),
    }
  }
  if (
    !usesPreCodeBindings
    && node.type === 'code_block'
    && language === 'infographic'
    && parsePositiveNumber(bindings.estimatedPreviewHeightPx) == null
  ) {
    bindings = {
      ...bindings,
      estimatedPreviewHeightPx: clampInfographicPreviewHeight(
        getMemoizedPreviewHeight(node, estimateInfographicPreviewHeight),
      ),
    }
  }
  if (node.type === 'math_block') {
    bindings = {
      ...bindings,
      cacheScope: mathBlockCacheScope,
    }
  }

  const rendersCustomNode = isCustomTagComponent(node, component)
  const customAttrs = rendersCustomNode
    ? getCustomNodeAttrs(node as any, resolvedHtmlPolicy.value)
    : undefined
  const loading = (node as unknown as { loading?: unknown }).loading
  const indexKey = `${indexPrefix.value}-${item.index}`
  const baseNodeProps = {
    node,
    loading,
    'index-key': indexKey,
    ...(node.type === 'reference'
      ? { 'data-markstream-reference-id': String((node as any).id) }
      : {}),
  }
  const globalNodeProps = {
    'custom-id': rendererProps.customId,
    'is-dark': rendererProps.isDark,
  }
  const copyEvents: { onCopy: typeof emitCodeCopy, onHandleArtifactClick: typeof handleArtifactClick } = {
    onCopy: emitCodeCopy,
    onHandleArtifactClick: handleArtifactClick,
  }
  const fragmentEvents = {
    onClick: handleContainerClick,
    onMouseover: handleFragmentMouseover,
    onMouseout: handleFragmentMouseout,
  }
  const minimalEvents = {
    onMouseover: emitMouseoverRaw,
    onMouseout: emitMouseoutRaw,
  }
  const customBindings = {
    ...(customAttrs ?? {}),
    ...bindings,
  }
  // Preserve the old template compiler's mergeProps semantics while caching
  // the result: ordinary props keep source order, and colliding class/style or
  // onX listeners are merged instead of overwritten by object spread. Kebab
  // keys also preserve fallthrough attrs such as TextNode's `index-key`.
  const nodeProps = mergeProps(baseNodeProps, bindings, globalNodeProps, copyEvents)
  const customNodeProps = mergeProps(customBindings, baseNodeProps, globalNodeProps, copyEvents)

  const renderedItem: RenderedItemLike = {
    node,
    sourceLoading: loading,
    index: item.index,
    component,
    bindings,
    customBindings,
    nodeProps,
    customNodeProps,
    fragmentNodeProps: mergeProps(nodeProps, fragmentEvents),
    customFragmentNodeProps: mergeProps(customNodeProps, fragmentEvents),
    minimalNodeProps: mergeProps(nodeProps, minimalEvents),
    rendersCustomNode,
    hasSlotChildren: hasSlotChildren(node),
    slotContent: String((node as any).content ?? ''),
    isCodeBlock: node.type === 'code_block',
    indexKey,
    vnodeKey: `${rendererSessionIdentity.value}\u0000${item.index}\u0000${node.type}`,
  }
  renderedItemCache.set(item.node, { signature: cacheSignature, item: renderedItem })
  return renderedItem
}

const renderedItems = computed(() => {
  // Capture the previous signature BEFORE getRenderedItemGlobalSignature
  // refreshes the module-level cache, otherwise the comparison below would
  // always see the just-stored value and never detect global changes.
  const previousGlobalSignature = lastRenderedItemGlobalSignature
  // Compute the renderer-global signature ONCE per evaluation and reuse the
  // same array instance for every node. Passing it down avoids rebuilding the
  // 24-element signature array + compare per dirty node (and per visible node
  // in the virtualized path) on every streaming commit.
  const globalSignature = getRenderedItemGlobalSignature()
  const globalChanged = previousGlobalSignature !== globalSignature
  lastRenderedItemGlobalSignature = globalSignature

  if (virtualizationEnabled.value)
    return visibleNodes.value.map(item => buildRenderedItem(item, globalSignature))

  const nodes = parsedNodes.value
  const total = nodes.length
  let truncated = false
  if (renderedItemsNonVirtual.length > total) {
    // eslint-disable-next-line vue/no-side-effects-in-computed-properties -- In-place truncation of the module-level incremental item cache; not a reactive side effect.
    renderedItemsNonVirtual.length = total
    // eslint-disable-next-line vue/no-side-effects-in-computed-properties -- In-place truncation of the parallel source-node cache; not a reactive side effect.
    renderedItemSourceNodes.length = total
    truncated = true
  }

  // Find the first index whose cached item no longer matches its parsed node
  // by identity or loading snapshot. Stable-prefix nodes are reused by the
  // parser across streaming commits, while consumers may update loading in
  // place; both checks stay O(N) primitive/reference comparisons.
  //
  // Code blocks are rendered from a shallow clone (getCodeBlockRenderNode), so
  // their cached item's node is the clone, never the source node. Comparing
  // against the clone cache instead keeps the scan O(dirty tail): the clone is
  // only recreated when the visible payload (language/loading/diff/code/raw/
  // sourceMap) changes, so clone identity proves the item is fresh. Without
  // this, any code block made the cached node !== source node, so the scan
  // always fell back to the first code block and forced a full item rebuild +
  // fresh array every streaming commit (defeating the no-op array reuse below).
  const cache = renderedItemsNonVirtual
  const identityLimit = Math.min(cache.length, total)
  let dirtyStart = globalChanged ? 0 : identityLimit
  if (!globalChanged) {
    for (let index = 0; index < identityLimit; index++) {
      const sourceNode = nodes[index]!
      if (sourceNode.type === 'code_block') {
        // Code blocks are rendered from a shallow clone (getCodeBlockRenderNode),
        // so their cached item's node is the clone, never the source node. The
        // clone is only recreated when the visible payload changes, so clone
        // identity + source-node identity + loading snapshot together prove the
        // item is fresh. Without this, any code block made the cached node !==
        // source node, so the scan always fell back to the first code block and
        // forced a full item rebuild + fresh array every streaming commit
        // (defeating the no-op array reuse below).
        if (
          cache[index]?.node !== codeBlockRenderCache[index]?.node
          || renderedItemSourceNodes[index] !== sourceNode
          || !Object.is(cache[index]?.sourceLoading, (sourceNode as { loading?: unknown }).loading)
        ) {
          dirtyStart = index
          break
        }
      }
      else if (
        cache[index]?.node !== sourceNode
        || !Object.is(cache[index]?.sourceLoading, (sourceNode as { loading?: unknown }).loading)
      ) {
        dirtyStart = index
        break
      }
    }
  }

  // No-op commit: every parsed node still matches its cached rendered item by
  // identity (the parser reused every node object) and the cache was not
  // truncated, so the item list is byte-identical to the last returned one.
  // Returning the exact array instance lets Vue skip the keyed v-for diff
  // entirely instead of re-running it over a freshly sliced array of the same
  // items (which also re-invokes every slot/content function ref in the
  // template).
  if (!truncated && dirtyStart === total)
    return lastRenderedItemsArray

  for (let index = dirtyStart; index < total; index++) {
    cache[index] = buildRenderedItem({ node: nodes[index]!, index }, globalSignature)
    // eslint-disable-next-line vue/no-side-effects-in-computed-properties -- In-place maintenance of the parallel source-node cache; not a reactive side effect.
    renderedItemSourceNodes[index] = nodes[index]!
  }

  // New array identity so Vue re-renders; prefix entries are shared objects,
  // so the keyed v-for diff resolves them without re-creating anything.
  const next = cache.slice()
  lastRenderedItemsArray = next
  return next
})

function getCodeBlockLanguage(node: ParsedNode) {
  return node?.type === 'code_block'
    ? String((node as RuntimeCodeBlockNode).language ?? '').trim().toLowerCase()
    : ''
}

function getPreviewBindingsFor(
  source: { value: Record<string, any> },
  node: ParsedNode,
  estimate: (code: string) => number,
  clamp: (height: number, minHeight?: number, maxHeight?: number | null) => number,
) {
  const bindings = { ...source.value } as Record<string, any>
  if (parsePositiveNumber(bindings.estimatedPreviewHeightPx) == null) {
    bindings.estimatedPreviewHeightPx = clamp(
      getMemoizedPreviewHeight(node, estimate),
      undefined,
      bindings.maxHeight === 'none' ? null : (parsePositiveNumber(bindings.maxHeight) ?? undefined),
    )
  }
  return bindings
}

function getMermaidBindingsFor(node: ParsedNode) {
  return getPreviewBindingsFor(mermaidBindings, node, estimateMermaidPreviewHeight, clampMermaidPreviewHeight)
}

function getInfographicBindingsFor(node: ParsedNode) {
  return getPreviewBindingsFor(infographicBindings, node, estimateInfographicPreviewHeight, clampInfographicPreviewHeight)
}

// Decide which component to use for a given node. Ensure that code blocks
// with language `mermaid` are rendered with `MermaidBlockNode` (unless a
// custom component named `mermaid` is registered for the given customId).
function getNodeComponent(node: ParsedNode, language?: string) {
  if (!node)
    return FallbackComponent
  const customComponents = customComponentsMap.value
  const customForType = customComponents[String(node.type)]
  if (node.type === 'code_block') {
    const lang = language ?? getCodeBlockLanguage(node)
    const customForLanguage = lang
      ? getCustomCodeLanguageComponent(customComponents, lang)
      : undefined
    if (customForLanguage)
      return customForLanguage

    if (resolvedRenderCodeBlocksAsPre.value) {
      const customCodeBlock = customComponents.code_block
      return customCodeBlock || PreCodeBlockAsync
    }

    // Keep Mermaid blocks routed to MermaidBlockNode unless a specific
    // `mermaid` override is provided.
    if (lang === 'mermaid') {
      const customMermaid = customComponents.mermaid
      return customMermaid || MermaidBlockNodeAsync
    }

    // Keep Infographic blocks routed to InfographicBlockNode unless a specific
    // `infographic` override is provided.
    if (lang === 'infographic') {
      const customInfographic = customComponents.infographic
      return customInfographic || InfographicBlockNodeAsync
    }

    if (lang === 'd2' || lang === 'd2lang') {
      const customD2 = customComponents.d2
      return customD2 || D2BlockNodeAsync
    }

    if (customForType)
      return customForType

    // Honor a custom `code_block` component if the consumer registered one
    // via `setCustomComponents(customId, { code_block: MyComponent })`.
    const customCodeBlock = customComponents.code_block
    if (customCodeBlock)
      return customCodeBlock

    return codeBlockComponent.value
  }

  if (customForType)
    return customForType

  return nodeComponents[String(node.type)] || FallbackComponent
}

function getBindingsFor(node: ParsedNode, language?: string, component?: unknown) {
  const lang = language ?? getCodeBlockLanguage(node)
  if (node.type === 'code_block') {
    const customLanguageComponent = lang
      ? getCustomCodeLanguageComponent(customComponentsMap.value, lang)
      : undefined

    if (
      component
      && resolvedRenderCodeBlocksAsPre.value
      && !customLanguageComponent
      && component === PreCodeBlockAsync
    ) {
      return preCodeBlockBindings.value
    }

    if (component && lang && component === customLanguageComponent) {
      if (lang === 'mermaid')
        return getMermaidBindingsFor(node)

      if (lang === 'infographic')
        return getInfographicBindingsFor(node)

      if (lang === 'd2' || lang === 'd2lang')
        return d2Bindings.value

      return customCodeBlockBindings.value
    }

    if (component && component === customComponentsMap.value.code_block)
      return customCodeBlockBindings.value
  }

  if (lang === 'mermaid')
    return getMermaidBindingsFor(node)

  if (lang === 'infographic')
    return getInfographicBindingsFor(node)

  if (lang === 'd2' || lang === 'd2lang')
    return d2Bindings.value

  if (node.type === 'link')
    return linkBindings.value

  if (node.type === 'list')
    return listBindings.value

  if (node.type === 'blockquote')
    return blockquoteBindings.value

  if (node.type === 'table')
    return tableBindings.value

  return node.type === 'code_block'
    ? codeBlockBindings.value
    : nonCodeBindings.value
}

function handleContainerClick(event: MouseEvent) {
  const target = event.target instanceof Element
    ? event.target.closest<HTMLElement>('[data-markstream-reference-id]')
    : null
  const boundary = event.currentTarget
  const referenceId = target && boundary instanceof Element && boundary.contains(target)
    ? target.dataset.markstreamReferenceId
    : undefined
  emit('click', event, referenceId)
}

function handleContainerMouseover(event: MouseEvent) {
  const target = (event.target as HTMLElement | null)?.closest('[data-node-index]')
  if (!target)
    return
  emit('mouseover', event)
}

function handleContainerMouseout(event: MouseEvent) {
  const target = (event.target as HTMLElement | null)?.closest('[data-node-index]')
  if (!target)
    return
  emit('mouseout', event)
}

function handleFragmentMouseover(event: MouseEvent) {
  emit('mouseover', event)
}

function handleFragmentMouseout(event: MouseEvent) {
  emit('mouseout', event)
}

const typewriterCursorRef = ref<HTMLElement | null>(null)
const showTypewriterCursor = ref(false)
const simpleTypewriterCursorTarget = ref<HTMLElement | null>(null)
const minimalDomActive = computed(() => {
  if (rendererProps.domMode !== 'minimal')
    return false
  if (renderAsFragment.value)
    return false
  if (rendererProps.fade !== false)
    return false
  if (typewriterEnabled.value || showTypewriterCursor.value)
    return false
  if (incrementalRenderingDomRequired.value)
    return false
  if (
    virtualizationEnabled.value
    || hostVirtualScrollDomRequired.value
    || heightExperimentDomRequired.value
    || deferNodesDomRequired.value
  ) {
    return false
  }
  return Object.keys(customComponentsMap.value).length === 0
})
let typewriterCursorTimeout: ReturnType<typeof setTimeout> | undefined
let typewriterCursorRaf: number | null = null
let typewriterCursorRafVersion = 0
let lastTypewriterContentLength = 0
let lastTypewriterVisibleLength = 0
const TYPEWRITER_SIMPLE_CURSOR_TARGET_CLASS = 'typewriter-simple-cursor-target'
const TYPEWRITER_CURSOR_EXCLUDED_NODE_TYPE_LIST = [
  'code_block',
  'admonition',
  'table',
  'math_block',
  'html_block',
  'image',
  'thematic_break',
] as const
const TYPEWRITER_CURSOR_EXCLUDED_NODE_TYPES: ReadonlySet<string> = new Set(TYPEWRITER_CURSOR_EXCLUDED_NODE_TYPE_LIST)
const TYPEWRITER_CURSOR_EXCLUDED_SELECTOR = [
  '.typewriter-cursor',
  '.height-estimation-probes',
  ...TYPEWRITER_CURSOR_EXCLUDED_NODE_TYPE_LIST.map(type => `[data-node-type="${type}"]`),
  'script',
  'style',
].join(',')

function shouldSkipTypewriterCursorForNode(node: unknown) {
  if (!node || typeof node !== 'object')
    return false
  const type = (node as Record<string, unknown>).type
  return typeof type === 'string' && TYPEWRITER_CURSOR_EXCLUDED_NODE_TYPES.has(type)
}

function shouldShowTypewriterCursorForCurrentNodes() {
  const lastNode = parsedNodes.value[parsedNodes.value.length - 1]
  return !shouldSkipTypewriterCursorForNode(lastNode)
}

function getNodeTextLength(node: unknown): number {
  if (!node || typeof node !== 'object')
    return 0

  const record = node as Record<string, unknown>
  const direct = record.raw ?? record.content ?? record.code
  if (typeof direct === 'string')
    return direct.length

  const children = record.children
  if (Array.isArray(children))
    return children.reduce((total, child) => total + getNodeTextLength(child), 0)

  const items = record.items
  if (Array.isArray(items))
    return items.reduce((total, item) => total + getNodeTextLength(item), 0)

  return 0
}

function getTypewriterContentLength() {
  if (props.nodes?.length)
    return props.nodes.reduce((total, node) => total + getNodeTextLength(node), 0)
  // Use raw content length, not renderContent (which may be the paced-out
  // visible portion when smooth streaming is active).  The cursor should
  // appear as long as the source content is growing, even if the visible
  // stream hasn't caught up yet.
  return (props.content ?? '').length
}

function getTypewriterVisibleLength() {
  if (props.nodes?.length)
    return props.nodes.reduce((total, node) => total + getNodeTextLength(node), 0)
  return renderContent.value.length
}

function clearTypewriterCursorTimeout() {
  if (!typewriterCursorTimeout)
    return
  clearTimeout(typewriterCursorTimeout)
  typewriterCursorTimeout = undefined
}

function clearTypewriterCursorRaf() {
  typewriterCursorRafVersion += 1

  if (typewriterCursorRaf == null)
    return

  cancelFrame?.(typewriterCursorRaf)
  typewriterCursorRaf = null
}

function hideTypewriterCursorElement() {
  clearTypewriterCursorRaf()
  clearSimpleTypewriterCursorTarget()
  if (typewriterCursorRef.value)
    typewriterCursorRef.value.style.visibility = 'hidden'
}

function isAcceptedTypewriterCursorTextNode(node: Node): node is Text {
  if (node.nodeType !== Node.TEXT_NODE)
    return false

  const text = node.textContent ?? ''
  if (!text.trim())
    return false

  const parent = node.parentElement
  if (!parent)
    return false

  return !parent.closest(TYPEWRITER_CURSOR_EXCLUDED_SELECTOR)
}

function getLastTextNode(root: HTMLElement) {
  let current: Node | null = root.lastChild

  while (current) {
    if (isAcceptedTypewriterCursorTextNode(current))
      return current

    if (current.nodeType === Node.ELEMENT_NODE) {
      const element = current as Element
      if (!element.matches(TYPEWRITER_CURSOR_EXCLUDED_SELECTOR) && element.lastChild) {
        current = element.lastChild
        continue
      }
    }

    while (current && current !== root && !current.previousSibling)
      current = current.parentNode

    if (!current || current === root)
      break

    current = current.previousSibling
  }

  return null
}

function getTypewriterCursorTextTarget() {
  const items = renderedItems.value
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]
    if (!item || shouldSkipTypewriterCursorForNode(item.node) || !shouldRenderNode(item.index))
      continue

    const slot = nodeSlotElements.get(item.index)
    if (!slot)
      continue

    const text = getLastTextNode(slot)
    if (text)
      return text
  }

  return null
}

function clearSimpleTypewriterCursorTarget() {
  if (!simpleTypewriterCursorTarget.value)
    return

  simpleTypewriterCursorTarget.value.classList.remove(TYPEWRITER_SIMPLE_CURSOR_TARGET_CLASS)
  simpleTypewriterCursorTarget.value = null
}

function getSimpleTypewriterCursorElement(text: Text) {
  const textNodeElement = text.parentElement?.closest('.text-node')
  if (textNodeElement instanceof HTMLElement)
    return textNodeElement
  return text.parentElement
}

function updateSimpleTypewriterCursorTarget() {
  if (resolvedTypewriterCursorMode.value !== 'simple' || !isClient || !showTypewriterCursor.value || !containerRef.value) {
    clearSimpleTypewriterCursorTarget()
    return
  }

  const text = getTypewriterCursorTextTarget()
  const target = text ? getSimpleTypewriterCursorElement(text) : null
  if (target === simpleTypewriterCursorTarget.value)
    return

  clearSimpleTypewriterCursorTarget()
  if (!target)
    return

  target.classList.add(TYPEWRITER_SIMPLE_CURSOR_TARGET_CLASS)
  simpleTypewriterCursorTarget.value = target
}

function updateTypewriterCursorPosition() {
  if (resolvedTypewriterCursorMode.value !== 'precise')
    return
  if (!isClient || !showTypewriterCursor.value || !containerRef.value || !typewriterCursorRef.value)
    return

  const root = containerRef.value
  const cursor = typewriterCursorRef.value
  cursor.style.visibility = 'hidden'
  const lastText = getTypewriterCursorTextTarget()
  if (!lastText)
    return

  let left = 0
  let top = 0
  let height = 20
  let measured = false

  if (lastText?.textContent) {
    const end = lastText.textContent.length
    const range = document.createRange()
    range.setStart(lastText, Math.max(0, end - 1))
    range.setEnd(lastText, end)
    const rects = typeof range.getClientRects === 'function'
      ? range.getClientRects()
      : undefined
    const rect = rects?.[rects.length - 1] ?? lastText.parentElement?.getBoundingClientRect()

    if (rect) {
      const rootRect = readLayout('typewriterCursor.root.getBoundingClientRect', () => root.getBoundingClientRect())
      left = rect.right - rootRect.left + root.scrollLeft
      top = rect.top - rootRect.top + root.scrollTop
      height = rect.height || height
      measured = true
    }
    range.detach()
  }

  if (!measured)
    return

  cursor.style.transform = `translate(${Math.max(0, left)}px, ${Math.max(0, top)}px)`
  cursor.style.height = `${height}px`
  cursor.style.visibility = 'visible'
}

function scheduleTypewriterCursorPositionUpdate() {
  if (resolvedTypewriterCursorMode.value !== 'precise')
    return
  if (!isClient || !showTypewriterCursor.value)
    return
  if (typewriterCursorRaf != null)
    return

  const version = typewriterCursorRafVersion
  const run = () => {
    typewriterCursorRaf = null
    if (version !== typewriterCursorRafVersion)
      return
    updateTypewriterCursorPosition()
  }

  if (requestFrame) {
    typewriterCursorRaf = requestFrame(run)
    return
  }

  run()
}

watch(
  [renderContent, () => props.content, () => props.nodes, () => rendererProps.typewriter, effectiveFinal],
  async () => {
    if (!isClient || renderAsFragment.value || !ownsTypewriterCursor.value)
      return

    // Typewriter is off (the default): the cursor is never shown, so none of
    // the per-commit work below (recursive node text length traversal, cursor
    // element updates) is needed. Skip it entirely instead of running the
    // callback and bailing out mid-way.
    if (!typewriterEnabled.value) {
      if (
        showTypewriterCursor.value
        || typewriterCursorTimeout
        || typewriterCursorRaf != null
        || simpleTypewriterCursorTarget.value
        || typewriterCursorRef.value
      ) {
        showTypewriterCursor.value = false
        clearTypewriterCursorTimeout()
        hideTypewriterCursorElement()
      }
      return
    }

    // When the stream is final (and effective — smooth streaming has caught up),
    // hide the cursor immediately.
    if (effectiveFinal.value) {
      showTypewriterCursor.value = false
      clearTypewriterCursorTimeout()
      hideTypewriterCursorElement()
      return
    }

    if (props.nodes?.length) {
      showTypewriterCursor.value = false
      clearTypewriterCursorTimeout()
      hideTypewriterCursorElement()
      // Cursor is disabled in nodes mode; keep the baseline on content so
      // switching back to content mode can show it again.
      lastTypewriterContentLength = (props.content ?? '').length
      lastTypewriterVisibleLength = renderContent.value.length
      return
    }

    const nextLength = getTypewriterContentLength()
    const nextVisibleLength = getTypewriterVisibleLength()
    const cursorAllowed = shouldShowTypewriterCursorForCurrentNodes()
    const sourceGrowing = nextLength > lastTypewriterContentLength
    const visibleGrowing = nextVisibleLength > lastTypewriterVisibleLength
    if (!typewriterEnabled.value || !cursorAllowed || (!sourceGrowing && !visibleGrowing)) {
      if (!typewriterEnabled.value || !cursorAllowed) {
        showTypewriterCursor.value = false
        hideTypewriterCursorElement()
      }
      lastTypewriterContentLength = nextLength
      lastTypewriterVisibleLength = nextVisibleLength
      return
    }

    lastTypewriterContentLength = nextLength
    lastTypewriterVisibleLength = nextVisibleLength
    showTypewriterCursor.value = true
    if (resolvedTypewriterCursorMode.value === 'precise' && typewriterCursorRef.value)
      typewriterCursorRef.value.style.visibility = 'hidden'
    clearTypewriterCursorTimeout()
    await nextTick()
    if (resolvedTypewriterCursorMode.value === 'simple') {
      updateSimpleTypewriterCursorTarget()
    }
    else {
      clearSimpleTypewriterCursorTarget()
      scheduleTypewriterCursorPositionUpdate()
    }
    typewriterCursorTimeout = setTimeout(() => {
      typewriterCursorTimeout = undefined
      showTypewriterCursor.value = false
    }, 3000)
  },
  { flush: 'post', immediate: true },
)

watch(
  showTypewriterCursor,
  async (visible) => {
    if (!visible) {
      hideTypewriterCursorElement()
      return
    }
    await nextTick()
    if (resolvedTypewriterCursorMode.value === 'simple') {
      updateSimpleTypewriterCursorTarget()
      return
    }
    clearSimpleTypewriterCursorTarget()
    if (resolvedTypewriterCursorMode.value === 'precise')
      scheduleTypewriterCursorPositionUpdate()
  },
  { flush: 'post' },
)

watch(
  resolvedTypewriterCursorMode,
  async () => {
    if (!isClient || renderAsFragment.value || !ownsTypewriterCursor.value || !showTypewriterCursor.value)
      return

    await nextTick()
    if (resolvedTypewriterCursorMode.value === 'simple') {
      clearTypewriterCursorRaf()
      updateSimpleTypewriterCursorTarget()
      return
    }

    clearSimpleTypewriterCursorTarget()
    if (resolvedTypewriterCursorMode.value === 'precise') {
      scheduleTypewriterCursorPositionUpdate()
      return
    }

    hideTypewriterCursorElement()
  },
  { flush: 'post' },
)

watch(
  [() => renderedCount.value, () => liveRange.start, () => liveRange.end],
  async () => {
    if (!isClient || renderAsFragment.value || !ownsTypewriterCursor.value || !showTypewriterCursor.value)
      return

    await nextTick()
    if (resolvedTypewriterCursorMode.value === 'simple') {
      updateSimpleTypewriterCursorTarget()
      return
    }
    clearSimpleTypewriterCursorTarget()
    if (resolvedTypewriterCursorMode.value === 'precise')
      scheduleTypewriterCursorPositionUpdate()
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  clearTypewriterCursorTimeout()
  clearTypewriterCursorRaf()
  clearSimpleTypewriterCursorTarget()
  mathBlockMinHeightCache.clear()
})
</script>

<template>
  <template v-if="renderAsFragment">
    <template
      v-for="item in renderedItems"
      :key="item.vnodeKey"
    >
      <component
        :is="item.component"
        v-if="item.rendersCustomNode"
        v-bind="item.customFragmentNodeProps"
      >
        <NodeRenderer
          v-if="item.hasSlotChildren"
          v-bind="nestedRendererProps"
          :nodes="(item.node as any).children"
          :index-key="item.indexKey"
          :batch-rendering="false"
          :defer-nodes-until-visible="false"
          :render-as-fragment="true"
        />
        <NodeRenderer
          v-else-if="item.slotContent"
          v-bind="nestedRendererProps"
          :content="item.slotContent"
          :final="!item.node.loading"
          :index-key="`${item.indexKey}-content`"
          :smooth-streaming="false"
          :batch-rendering="false"
          :defer-nodes-until-visible="false"
          :render-as-fragment="true"
        />
      </component>
      <component
        :is="item.component"
        v-else
        v-bind="item.fragmentNodeProps"
      />
    </template>
  </template>
  <div
    v-else
    ref="containerRef"
    class="markstream-vue markdown-renderer"
    :class="[
      { dark: rendererProps.isDark },
      { virtualized: virtualizationEnabled },
      { 'virtual-scroll-coordinated': virtualScrollDomEnabled },
      { 'stable-layout': stableLayoutDomEnabled },
      { 'typewriter-simple-cursor': showTypewriterCursor && resolvedTypewriterCursorMode === 'simple' },
    ]"
    :data-custom-id="rendererProps.customId"
    @click="handleContainerClick"
    @mouseover="handleContainerMouseover"
    @mouseout="handleContainerMouseout"
  >
    <template v-if="heightEstimationDomActive || virtualizationEnabled">
      <HeightEstimationProbes
        v-if="heightEstimationDomActive"
        :width="experimentProbeWidth"
        :flow-root="virtualizationEnabled || virtualScrollDomEnabled"
        :paragraph-node="paragraphProbeNode"
        :list-item-node="listItemProbeNode"
        :list-node="listProbeNode"
        :heading-nodes="headingProbeNodes"
        :set-paragraph-wrapper="setParagraphProbeWrapper"
        :set-list-item-wrapper="setListItemProbeWrapper"
        :set-list-wrapper="setListProbeWrapper"
        :set-heading-wrapper="setHeadingProbeWrapper"
      />
      <div
        v-if="virtualizationEnabled"
        class="node-spacer"
        :style="{ height: `${topSpacerHeight}px` }"
        aria-hidden="true"
      />
    </template>
    <template v-if="minimalDomActive">
      <template v-for="item in renderedItems" :key="item.vnodeKey">
        <component
          :is="item.component"
          v-if="shouldRenderNode(item.index)"
          v-bind="item.minimalNodeProps"
        />
      </template>
    </template>
    <template v-else>
      <template v-for="item in renderedItems" :key="item.vnodeKey">
        <div
          :ref="el => setNodeSlotElement(item.index, el as HTMLElement | null)"
          class="node-slot"
          :data-node-index="item.index"
          :data-node-type="item.node.type"
        >
          <div
            v-if="shouldRenderNode(item.index)"
            :ref="el => setNodeContentRef(item.index, el as HTMLElement | null)"
            class="node-content"
          >
            <!-- Skip wrapping code_block nodes in transitions to avoid touching stream-diffs internals -->
            <transition
              v-if="!item.isCodeBlock"
              name="fade"
              :css="rendererProps.fade !== false"
              :appear="rendererProps.fade !== false && requestedFinal !== true"
            >
              <component
                :is="item.component"
                v-if="item.rendersCustomNode"
                v-bind="item.customNodeProps"
              >
                <NodeRenderer
                  v-if="item.hasSlotChildren"
                  v-bind="nestedRendererProps"
                  :nodes="(item.node as any).children"
                  :index-key="item.indexKey"
                  :batch-rendering="false"
                  :defer-nodes-until-visible="false"
                  :render-as-fragment="true"
                />
                <NodeRenderer
                  v-else-if="item.slotContent"
                  v-bind="nestedRendererProps"
                  :content="item.slotContent"
                  :final="!item.node.loading"
                  :index-key="`${item.indexKey}-content`"
                  :smooth-streaming="false"
                  :batch-rendering="false"
                  :defer-nodes-until-visible="false"
                  :render-as-fragment="true"
                />
              </component>
              <component
                :is="item.component"
                v-else
                v-bind="item.nodeProps"
              />
            </transition>

            <component
              :is="item.component"
              v-else-if="item.rendersCustomNode"
              v-bind="item.customNodeProps"
            >
              <NodeRenderer
                v-if="item.hasSlotChildren"
                v-bind="nestedRendererProps"
                :nodes="(item.node as any).children"
                :index-key="item.indexKey"
                :batch-rendering="false"
                :defer-nodes-until-visible="false"
                :render-as-fragment="true"
              />
              <NodeRenderer
                v-else-if="item.slotContent"
                v-bind="nestedRendererProps"
                :content="item.slotContent"
                :final="!item.node.loading"
                :index-key="`${item.indexKey}-content`"
                :smooth-streaming="false"
                :batch-rendering="false"
                :defer-nodes-until-visible="false"
                :render-as-fragment="true"
              />
            </component>
            <component
              :is="item.component"
              v-else
              v-bind="item.nodeProps"
            />
          </div>
          <div
            v-else
            class="node-placeholder"
            :style="{ height: `${getFallbackNodeHeight(item.index)}px` }"
          />
        </div>
      </template>
    </template>
    <span
      v-if="showTypewriterCursor && resolvedTypewriterCursorMode === 'precise'"
      ref="typewriterCursorRef"
      class="typewriter-cursor"
      aria-hidden="true"
    />
    <div
      v-if="virtualizationEnabled"
      class="node-spacer"
      :style="{ height: `${bottomSpacerHeight}px` }"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
.markdown-renderer {
  position: relative;
  /* 防止内容更新时的布局抖动 */
  contain: layout;
   /* 优化不可见时的渲染成本 */
  content-visibility: auto;
  contain-intrinsic-size: 800px 600px;
  contain-intrinsic-size: auto 800px auto 600px;
}

.markdown-renderer.virtualized,
.markdown-renderer.virtual-scroll-coordinated {
  /* When virtualization is active, `content-visibility: auto` can keep the
     whole subtree unpainted until the scroll container dispatches a scroll
     event in some layouts (e.g. complex chat shells). The virtual window
     already limits DOM cost, so keep it visible to avoid a blank first paint. */
  content-visibility: visible;
  contain-intrinsic-size: auto;
}

.markdown-renderer.stable-layout {
  content-visibility: visible;
  contain-intrinsic-size: none;
}

.node-slot {
  width: 100%;
}

.node-content {
  width: 100%;
}

.markdown-renderer.virtualized .node-slot,
.markdown-renderer.virtualized .node-content,
.markdown-renderer.virtual-scroll-coordinated .node-slot,
.markdown-renderer.virtual-scroll-coordinated .node-content {
  display: flow-root;
}

.node-placeholder {
  width: 100%;
  min-height: 1rem;
  margin: 0.25rem 0;
}

.node-placeholder:first-child {
  margin-top: 0;
}

.node-spacer {
  width: 100%;
}

.unknown-node {
  color: hsl(var(--ms-muted-foreground));
  font-style: italic;
  margin: var(--ms-flow-paragraph-y) 0;
}

.typewriter-cursor {
  position: absolute;
  left: 0;
  top: 0;
  display: inline-block;
  width: 0.55em;
  height: 1em;
  margin-left: 0.08em;
  vertical-align: -0.12em;
  border-right: 2px solid currentColor;
  pointer-events: none;
  visibility: hidden;
  animation: typewriter-cursor-blink 1s steps(1, end) infinite;
}

@keyframes typewriter-cursor-blink {
  0%, 49% {
    opacity: 1;
  }
  50%, 100% {
    opacity: 0;
  }
}
</style>

<style>
/* Lightweight typewriter cursor for simple mode. */
.markstream-vue.typewriter-simple-cursor .typewriter-simple-cursor-target::after {
  content: "";
  display: inline-block;
  width: 0.55em;
  height: 1em;
  margin-left: 0.08em;
  vertical-align: -0.12em;
  border-right: 2px solid currentColor;
  pointer-events: none;
  animation: typewriter-cursor-blink 1s steps(1, end) infinite;
}

@media (prefers-reduced-motion: reduce) {
  .markstream-vue.typewriter-simple-cursor .typewriter-simple-cursor-target::after {
    animation: none;
  }
}

/* Global (unscoped) CSS for enter animations */
.markstream-vue .fade-enter-from {
  opacity: 0;
}
.markstream-vue .fade-enter-active {
  transition: opacity var(--fade-duration, 280ms)
    var(--fade-ease, cubic-bezier(0.33, 0, 0.67, 1));
  will-change: opacity;
}
.markstream-vue .fade-enter-to {
  opacity: 1;
}
</style>
