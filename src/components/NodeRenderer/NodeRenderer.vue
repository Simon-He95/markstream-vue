<script setup lang="ts">
import type { ParsedNode } from 'stream-markdown-parser'
import type { CustomComponents } from '../../types'
import type { CodeBlockPreviewPayload } from '../../types/component-props'
import type {
  MarkstreamCaptureVirtualStateOptions,
  MarkstreamHeightCache,
  MarkstreamNodeLifecycle,
  MarkstreamRendererHandle,
  MarkstreamVirtualAnchor,
  MarkstreamVirtualMetrics,
  MarkstreamVirtualPhase,
  MarkstreamVirtualReason,
  MarkstreamVirtualState,
  NodeRendererCodeRenderer,
  NodeRendererMode,
  NodeRendererProps,
} from '../../types/node-renderer-props'
import { getHighlightRegistrationKey, normalizeShikiLanguage } from 'markstream-core'
import { computed, defineAsyncComponent, getCurrentInstance, inject, markRaw, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, watch } from 'vue'
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
import ReferenceNode from '../../components/ReferenceNode'
import StrikethroughNode from '../../components/StrikethroughNode'
import StrongNode from '../../components/StrongNode'
import SubscriptNode from '../../components/SubscriptNode'
import SuperscriptNode from '../../components/SuperscriptNode'
import TableNode from '../../components/TableNode'
import TextNode from '../../components/TextNode'
import ThematicBreakNode from '../../components/ThematicBreakNode'
import VmrContainerNode from '../../components/VmrContainerNode'
import { provideViewportPriority } from '../../composables/viewportPriority'
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
import { isDevEnvironment } from '../../utils/devEnv'
import { clampInfographicPreviewHeight, clampMermaidPreviewHeight, estimateInfographicPreviewHeight, estimateMermaidPreviewHeight, parsePositiveNumber } from '../../utils/diagramHeight'
import { getCustomNodeAttrs, getHtmlTagFromContent, shouldRenderUnknownHtmlTagAsText, stripCustomHtmlWrapper } from '../../utils/htmlRenderer'
import { normalizeLanguageIdentifier } from '../../utils/languageIcon'
import { isReservedNodeComponentKey, useCustomNodeComponents } from '../../utils/nodeComponents'
import { MARKSTREAM_NODE_LIFECYCLE_KEY } from '../../utils/nodeLifecycle'
import { setNormalizedElementScrollTop } from '../../utils/normalizedScroll'
import HtmlBlockNode from '../HtmlBlockNode/HtmlBlockNode.vue'
import HtmlInlineNode from '../HtmlInlineNode/HtmlInlineNode.vue'
import { createMathBlockMinHeightCache, provideMathBlockMinHeightCache } from '../MathBlockNode/minHeightCache'
import { CodeBlockNodeAsync, CodeBlockNodeLoading, MathBlockNodeAsync, MathInlineNodeAsync } from './asyncComponent'
import { useBatchRenderingScheduler } from './composables/useBatchRenderingScheduler'
import { useBatchRenderingState } from './composables/useBatchRenderingState'
import { useFocusSyncScheduler } from './composables/useFocusSyncScheduler'
import { useHeightMeasurements } from './composables/useHeightMeasurements'
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
import { InfographicBlockNodeLoading } from './InfographicBlockNodeLoading'
import { MermaidBlockNodeLoading } from './MermaidBlockNodeLoading'

type RuntimeCodeBlockNode = ParsedNode & {
  type: 'code_block'
  language?: string
  loading?: boolean
  diff?: boolean
  code?: string
  originalCode?: string
  updatedCode?: string
  raw?: string
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
  deferNodesUntilVisible: undefined,
  nodeVirtual: undefined,
})

const emit = defineEmits<{
  (e: 'copy', code: string): void
  (e: 'handleArtifactClick', payload: CodeBlockPreviewPayload): void
  (e: 'click', event: MouseEvent): void
  (e: 'mouseover', event: MouseEvent): void
  (e: 'mouseout', event: MouseEvent): void
  (e: 'virtual-state-change', payload: MarkstreamVirtualState): void
  (e: 'height-change', payload: MarkstreamVirtualMetrics): void
  (e: 'render-settled', payload: MarkstreamVirtualMetrics): void
  (e: 'render-final', payload: MarkstreamVirtualMetrics): void
  (e: 'anchor-change', payload: MarkstreamVirtualAnchor): void
}>()

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

const RENDERER_MODE_DEFAULTS: Record<NodeRendererMode, Pick<
  NodeRendererProps,
  | 'showTooltips'
  | 'fade'
  | 'batchRendering'
  | 'initialRenderBatchSize'
  | 'renderBatchSize'
  | 'renderBatchDelay'
  | 'renderBatchBudgetMs'
  | 'renderBatchIdleTimeoutMs'
  | 'deferNodesUntilVisible'
  | 'maxLiveNodes'
  | 'liveNodeBuffer'
  | 'nodeVirtual'
>> = {
  docs: {
    showTooltips: true,
    fade: true,
    batchRendering: true,
    initialRenderBatchSize: 40,
    renderBatchSize: 80,
    renderBatchDelay: 16,
    renderBatchBudgetMs: 6,
    renderBatchIdleTimeoutMs: 120,
    deferNodesUntilVisible: true,
    maxLiveNodes: 220,
    liveNodeBuffer: 60,
    nodeVirtual: 'auto',
  },
  chat: {
    showTooltips: false,
    fade: false,
    batchRendering: true,
    initialRenderBatchSize: 16,
    renderBatchSize: 16,
    renderBatchDelay: 8,
    renderBatchBudgetMs: 4,
    renderBatchIdleTimeoutMs: 120,
    deferNodesUntilVisible: true,
    maxLiveNodes: 0,
    liveNodeBuffer: 0,
    nodeVirtual: 'auto',
  },
  minimal: {
    showTooltips: false,
    fade: false,
    batchRendering: true,
    initialRenderBatchSize: 16,
    renderBatchSize: 16,
    renderBatchDelay: 8,
    renderBatchBudgetMs: 4,
    renderBatchIdleTimeoutMs: 120,
    deferNodesUntilVisible: true,
    maxLiveNodes: 0,
    liveNodeBuffer: 0,
    nodeVirtual: 'auto',
  },
}

function normalizeRendererMode(value: unknown): NodeRendererMode {
  return value === 'chat' || value === 'minimal' || value === 'docs'
    ? value
    : 'docs'
}

const resolvedMode = computed<NodeRendererMode>(() => normalizeRendererMode(resolveRendererProp('mode')))
const resolvedCodeRenderer = computed<NodeRendererCodeRenderer>(() => {
  const renderCodeBlocksAsPre = resolveRendererProp('renderCodeBlocksAsPre')
  const codeRenderer = resolveRendererProp('codeRenderer')

  if (renderCodeBlocksAsPre === true)
    return 'pre'

  if (
    codeRenderer === 'pre'
    || codeRenderer === 'shiki'
    || codeRenderer === 'monaco'
  ) {
    return codeRenderer
  }

  if (renderCodeBlocksAsPre === false)
    return 'monaco'

  return resolvedMode.value === 'docs' ? 'monaco' : 'pre'
})
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
  get htmlPolicy() { return resolveRendererProp('htmlPolicy') },
  get viewportPriority() { return resolveRendererProp('viewportPriority') },
  get codeBlockStream() { return resolveRendererProp('codeBlockStream') },
  get codeBlockDarkTheme() { return resolveRendererProp('codeBlockDarkTheme') },
  get codeBlockLightTheme() { return resolveRendererProp('codeBlockLightTheme') },
  get codeBlockMonacoOptions() { return resolveRendererProp('codeBlockMonacoOptions') },
  get codeRenderer() { return resolveRendererProp('codeRenderer') },
  get renderCodeBlocksAsPre() { return resolveRendererProp('renderCodeBlocksAsPre') },
  get codeBlockMinWidth() { return resolveRendererProp('codeBlockMinWidth') },
  get codeBlockMaxWidth() { return resolveRendererProp('codeBlockMaxWidth') },
  get codeBlockProps() { return resolveRendererProp('codeBlockProps') },
  get mermaidProps() { return resolveRendererProp('mermaidProps') },
  get d2Props() { return resolveRendererProp('d2Props') },
  get infographicProps() { return resolveRendererProp('infographicProps') },
  get showTooltips() { return resolvedShowTooltipsProp.value },
  get themes() { return resolveRendererProp('themes') },
  get langs() { return resolveRendererProp('langs') },
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
const CONTENT_STREAMING_TAIL_IDLE_MS = 1200
const HEIGHT_CACHE_WIDTH_BUCKET_PX = 32
const UNKNOWN_HEIGHT_CACHE_WIDTH_BUCKET = -1
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
const experimentContainerWidth = ref(0)
const simpleTextProbeProfile = ref(createEmptySimpleTextProbeProfile())
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
const typewriterEnabled = computed(() => rendererProps.typewriter !== false)
const isSimpleTypewriterCursor = computed(() => rendererProps.typewriter === 'simple')
const isPreciseTypewriterCursor = computed(() => typewriterEnabled.value && !isSimpleTypewriterCursor.value)
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
  effectiveFinal,
} = useSmoothStreamingBridge(rendererProps, {
  isClient,
  inheritedSmoothStreaming,
})
provide('markstreamSmoothStreaming', smoothStreamingEnabled)
const contentStreamingTailActive = ref(false)
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
  [renderContent, () => props.nodes, effectiveFinal],
  ([content, nodes, final]) => {
    const nextContent = content ?? ''

    if (nodes?.length || final === true) {
      clearContentStreamingTailActive()
      previousContentStreamValue = nextContent
      hasSeenContentStreamValue = true
      return
    }

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

function recordLayoutRead(label: string) {
  if (!debugPerformanceEnabled.value)
    return

  layoutReadCounts.set(label, (layoutReadCounts.get(label) ?? 0) + 1)
  layoutReadFrameCounts.set(label, (layoutReadFrameCounts.get(label) ?? 0) + 1)
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
const mathBlockCacheScope = computed(() => `${instanceMsgId}:${streamRenderVersion.value}`)
provideMathBlockMinHeightCache(mathBlockMinHeightCache)
const customComponentsMap = useCustomNodeComponents(() => rendererProps.customId)
const {
  effectiveCustomHtmlTagsSet,
  mergedParseOptions,
  parsedNodes,
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
    mathBlockMinHeightCache.clear()
    streamRenderVersion.value += 1
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
  mode: resolvedMode.value,
  codeRenderer: resolvedCodeRenderer.value,
  codeBlockStream: rendererProps.codeBlockStream,
  codeBlockDarkTheme: rendererProps.codeBlockDarkTheme,
  codeBlockLightTheme: rendererProps.codeBlockLightTheme,
  codeBlockMonacoOptions: rendererProps.codeBlockMonacoOptions,
  renderCodeBlocksAsPre: rendererProps.renderCodeBlocksAsPre,
  codeBlockMinWidth: rendererProps.codeBlockMinWidth,
  codeBlockMaxWidth: rendererProps.codeBlockMaxWidth,
  codeBlockProps: rendererProps.codeBlockProps,
  mermaidProps: rendererProps.mermaidProps,
  d2Props: rendererProps.d2Props,
  infographicProps: rendererProps.infographicProps,
  showTooltips: resolvedShowTooltips.value,
  themes: rendererProps.themes,
  langs: rendererProps.langs,
  isDark: rendererProps.isDark,
  typewriter: rendererProps.typewriter,
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
const heightExperimentEnabled = computed(() => Boolean(
  isClient
  && !renderAsFragment.value
  && rendererProps.customId
  && !isNestedListItemRenderer
  && heightExperimentConfig.value?.enabled,
))
const virtualScrollRequested = computed(() => Boolean(
  !renderAsFragment.value
  && props.virtualScroll?.enabled,
))
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
const codeBlockEstimationEnabled = computed(() => {
  return heightEstimationActive.value
    && heightExperimentConfig.value?.codeBlockEstimation !== false
})
function getMeasuredContainerWidth() {
  const width = experimentContainerWidth.value || readLayout(
    'getMeasuredContainerWidth.clientWidth',
    () => containerRef.value?.clientWidth || 0,
  )
  return Number.isFinite(width) && width > 0 ? width : 0
}

const experimentProbeWidth = computed(() => {
  const measured = getMeasuredContainerWidth()
  return measured > 0 ? Math.max(1, Math.round(measured)) : 640
})
const maxLiveNodesResolved = computed(() => Math.max(1, rendererProps.maxLiveNodes ?? 320))
const virtualizationEnabled = computed(() => {
  if (renderAsFragment.value)
    return false
  if (rendererProps.nodeVirtual === false)
    return false
  if ((rendererProps.maxLiveNodes ?? 0) <= 0)
    return false
  if (rendererProps.nodeVirtual === true)
    return parsedNodes.value.length > 0
  return parsedNodes.value.length > maxLiveNodesResolved.value
})
const shouldMeasureNodeHeights = computed(() => virtualizationEnabled.value || heightExperimentEnabled.value || virtualScrollEnabled.value)
// Viewport priority is used to defer heavy work (Monaco/Mermaid/KaTeX) until
// nodes approach the viewport. Node-level deferral is controlled separately
// via `deferNodes`.
const viewportPriorityEnabled = computed(() => {
  if (rendererProps.viewportPriority === false)
    return false
  if (viewportPriorityAutoDisabled.value)
    return false
  return true
})
// Provide viewport-priority registrar so heavy nodes can defer work until visible
const registerNodeVisibility = provideViewportPriority(
  target => resolveViewportRoot(target ?? containerRef.value ?? null),
  viewportPriorityEnabled,
)
const {
  requestFrame,
  cancelFrame,
  hasIdleCallback,
  isTestEnv,
} = useSchedulerPlatform({
  isClient,
})
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
})
const nodeSlotElements = new Map<number, HTMLElement | null>()
const nodeContentResizeObserverTargets = new Map<number, HTMLElement>()
const nodeContentResizeObserverIndexes = new WeakMap<Element, number>()
let nodeContentResizeObserver: ResizeObserver | null = null
const codeBlockRenderCache = new WeakMap<object, { signature: string, node: ParsedNode }>()
const nodeHeightSignatures = new Map<number, string>()
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
  pruneHeightMeasurements,
  rebuildHeightTrees,
  recordNodeHeight: recordMeasuredNodeHeight,
  removeNodeHeights: removeMeasuredNodeHeights,
  exportHeightCache,
  importHeightCache: importMeasuredHeightCache,
  fenwickRangeSum,
} = useHeightMeasurements({
  onHeightRecorded: () => {
    markFallbackHeightPrefixDirty()
    if (virtualScrollEnabled.value)
      resetVirtualSettleConfirmation()
    if (activeRestoreAnchor.value)
      scheduleRestoreReconcile()
    if (activeVirtualBottomAnchor.value)
      scheduleVirtualBottomRestoreReconcile()
    scheduleVirtualMetricsEmit('node-resize')
  },
})

function resetHeightMeasurements() {
  resetMeasuredHeightMeasurements()
  nodeHeightSignatures.clear()
}

function rememberNodeHeightSignature(index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= parsedNodes.value.length)
    return

  nodeHeightSignatures.set(index, getNodeHeightCacheSignature(index))
}

function forgetNodeHeightSignatures(indices: Iterable<number>) {
  for (const index of indices)
    nodeHeightSignatures.delete(index)
}

function recordNodeHeight(
  index: number,
  height: number,
  options: { allowShrink?: boolean } = {},
) {
  const before = nodeHeights[index]
  recordMeasuredNodeHeight(index, height, options)
  const after = nodeHeights[index]

  if (after && after > 0)
    rememberNodeHeightSignature(index)
  else if (before)
    nodeHeightSignatures.delete(index)
}

function getNodeLayoutHeight(index: number, contentEl: HTMLElement) {
  const slotHeight = readLayout(
    'getNodeLayoutHeight.slot.offsetHeight',
    () => nodeSlotElements.get(index)?.offsetHeight ?? 0,
  )
  return slotHeight > 0
    ? slotHeight
    : readLayout('getNodeLayoutHeight.content.offsetHeight', () => contentEl.offsetHeight)
}

function removeNodeHeights(
  indices: Iterable<number>,
  options: { notify?: boolean } = {},
) {
  const list = Array.from(indices, Number)
  const removed = removeMeasuredNodeHeights(list, options)
  if (removed > 0)
    forgetNodeHeightSignatures(list)
  return removed
}

function importHeightCache(
  cache: MarkstreamHeightCache,
  options: { mode?: 'replace' | 'merge' } = {},
) {
  importMeasuredHeightCache(cache, options)
  seedCurrentNodeHeightSignatures()
}
const deferNodes = computed(() => {
  if (renderAsFragment.value)
    return false
  if (rendererProps.deferNodesUntilVisible === false)
    return false
  // In the incremental/batched mode (`maxLiveNodes <= 0`), placeholders are
  // driven by the batch scheduler rather than viewport deferral.
  if ((rendererProps.maxLiveNodes ?? 0) <= 0)
    return false
  // When virtualization is active, the virtual window already limits DOM work.
  // Keep rendering immediate within that window (no placeholders).
  if (virtualizationEnabled.value)
    return false
  // Avoid registering too many observer targets in non-virtualized mode.
  if (parsedNodes.value.length > MAX_DEFERRED_NODE_COUNT)
    return false
  return viewportPriorityEnabled.value
})
const shouldObserveSlots = computed(() => !!registerNodeVisibility && (deferNodes.value || virtualizationEnabled.value))
const scrollListenerEnabled = computed(() => virtualizationEnabled.value || virtualScrollEnabled.value)
const {
  liveNodeBufferResolved,
  focusIndex,
  liveRange,
  updateLiveRange,
} = useLiveRangeState(rendererProps, {
  parsedNodeCount,
  virtualizationEnabled,
  maxLiveNodesResolved,
  clamp,
})
const nodeContentElements = new Map<number, HTMLElement | null>()
const nodeContentVersions = new Map<number, number>()
const nodeContentDeferredMeasureTimers = new Map<number, number[]>()
const finalHeightConvergenceTimers: number[] = []
const pendingHeightMeasurements = new Map<number, { height: number, allowShrink: boolean, version: number, el: HTMLElement }>()
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
const pendingAsyncNodeCount = computed(() => {
  void pendingAsyncNodeVersion.value

  let total = 0
  for (const count of pendingAsyncNodeCounts.values())
    total += Math.max(0, count)

  return total
})
let heightMeasurementRaf: number | null = null
let fallbackHeightPrefixDirty = true
let fallbackHeightPrefixCache: number[] = [0]
let fallbackHeightPrefixCacheKey = ''

function markFallbackHeightPrefixDirty() {
  fallbackHeightPrefixDirty = true
}

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

function getHeadingProbeNode(level: number) {
  return headingProbeNodes.value?.[level] ?? null
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
    if (force || Math.abs(next - focusIndex.value) > 1) {
      focusIndex.value = next
      updateLiveRange()
    }
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
    focusIndex.value = clamp(estimated, 0, Math.max(0, parsedNodes.value.length - 1))
    updateLiveRange()
    return
  }
  const midpoint = Math.round((firstVisible + lastVisible) / 2)
  if (!force && Math.abs(midpoint - focusIndex.value) <= 1)
    return
  focusIndex.value = clamp(midpoint, 0, Math.max(0, parsedNodes.value.length - 1))
  updateLiveRange()
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
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

function updateExperimentContainerWidth() {
  if (!heightEstimationActive.value) {
    experimentContainerWidth.value = 0
    return
  }
  const width = readLayout('updateExperimentContainerWidth.clientWidth', () => containerRef.value?.clientWidth ?? 0)
  experimentContainerWidth.value = width > 0 ? width : 0
}

let experimentResizeObserver: ResizeObserver | null = null

function cleanupExperimentResizeObserver() {
  experimentResizeObserver?.disconnect()
  experimentResizeObserver = null
}

function setupExperimentResizeObserver() {
  cleanupExperimentResizeObserver()
  if (!heightEstimationActive.value || !containerRef.value || typeof ResizeObserver === 'undefined')
    return
  experimentResizeObserver = new ResizeObserver(() => {
    updateExperimentContainerWidth()
    if (activeRestoreAnchor.value)
      scheduleRestoreReconcile()
    if (activeVirtualBottomAnchor.value)
      scheduleVirtualBottomRestoreReconcile()
    scheduleVirtualMetricsEmit('resize')
  })
  experimentResizeObserver.observe(containerRef.value)
}

const MarkdownCodeBlockNodeAsync = defineAsyncComponent({
  loader: async () => {
    const mod = await import('../MarkdownCodeBlockNode')
    return mod.default
  },
  loadingComponent: CodeBlockNodeLoading,
  delay: 0,
  suspensible: false,
})

function isMarkdownCodeBlockComponent(component: unknown) {
  return component === MarkdownCodeBlockNodeAsync
}

const codeBlockComponent = computed(() => {
  if (resolvedCodeRenderer.value === 'pre')
    return PreCodeNode
  if (resolvedCodeRenderer.value === 'shiki')
    return MarkdownCodeBlockNodeAsync
  return CodeBlockNodeAsync
})

function resolveCodeBlockRendererKind(node: ParsedNode) {
  if (node.type !== 'code_block')
    return null
  const component = getNodeComponent(node, getCodeBlockLanguage(node))
  if (isMarkdownCodeBlockComponent(component))
    return 'markdown'
  if (component === PreCodeNode)
    return 'pre'
  if (component === codeBlockComponent.value || component === CodeBlockNodeAsync)
    return 'monaco'
  return null
}

function resolveCodeBlockShowHeader() {
  const showHeader = rendererProps.codeBlockProps?.showHeader
  return showHeader !== false
}

const estimatedNodeHeights = computed(() => {
  const nodes = parsedNodes.value
  if (!nodes.length || !heightEstimationActive.value)
    return nodes.map(() => null)

  const width = experimentContainerWidth.value || readLayout('estimatedNodeHeights.clientWidth', () => containerRef.value?.clientWidth || 0)
  if (!Number.isFinite(width) || width <= 0)
    return nodes.map(() => null)

  return nodes.map((node, index) => {
    const measuredHeight = nodeHeights[index]
    const hasMeasuredHeight = typeof measuredHeight === 'number' && measuredHeight > 0

    if (textEstimationEnabled.value && !hasMeasuredHeight) {
      const estimatedText = estimateSimpleTextBlockHeight(node, width, simpleTextProbeProfile.value)
      if (estimatedText)
        return estimatedText
    }

    if (codeBlockEstimationEnabled.value && node.type === 'code_block') {
      const rendererKind = resolveCodeBlockRendererKind(node)
      if (rendererKind === 'monaco' || rendererKind === 'markdown' || rendererKind === 'pre') {
        return estimateCodeBlockHeight(node, {
          rendererKind,
          monacoOptions: rendererProps.codeBlockMonacoOptions,
          showHeader: resolveCodeBlockShowHeader(),
        })
      }
    }

    return null
  })
})

function getFallbackNodeHeight(index: number) {
  const measured = nodeHeights[index]
  if (Number.isFinite(measured) && measured > 0)
    return measured

  const estimated = estimatedNodeHeights.value[index]?.height
  if (Number.isFinite(estimated) && estimated > 0)
    return estimated

  return Math.max(
    averageNodeHeight.value,
    getStaticNodeHeightFallback(index),
  )
}

function getStaticNodeHeightFallback(index: number) {
  const node = parsedNodes.value[index] as any
  if (!node || typeof node !== 'object')
    return 32

  const type = String(node.type ?? '')
  const width = getMeasuredContainerWidth() || 640

  switch (type) {
    case 'heading':
      return 44

    case 'paragraph':
      return estimateTextFallbackHeight(
        String(node.raw ?? node.content ?? ''),
        width,
        34,
      )

    case 'list': {
      const items = Array.isArray(node.items) ? node.items.length : 1
      return Math.max(48, items * 30 + 12)
    }

    case 'list_item':
      return estimateTextFallbackHeight(
        String(node.raw ?? node.content ?? ''),
        width,
        34,
      )

    case 'blockquote':
      return estimateTextFallbackHeight(
        String(node.raw ?? node.content ?? ''),
        width,
        56,
      )

    case 'table': {
      const rowCount = Array.isArray(node.rows)
        ? node.rows.length
        : Array.isArray(node.children)
          ? node.children.length
          : 3
      return Math.max(120, rowCount * 38 + 48)
    }

    case 'code_block':
      return estimateTextFallbackHeight(
        String(node.code ?? node.raw ?? ''),
        width,
        96,
        20,
      )

    case 'math_block':
      return 72

    case 'image':
      return 220

    case 'admonition':
    case 'vmr_container':
    case 'html_block':
      return estimateTextFallbackHeight(
        String(node.raw ?? node.content ?? ''),
        width,
        96,
      )

    case 'thematic_break':
      return 24

    default:
      return estimateTextFallbackHeight(
        String(node.raw ?? node.content ?? ''),
        width,
        40,
      )
  }
}

function estimateTextFallbackHeight(
  text: string,
  width: number,
  minHeight: number,
  lineHeight = 22,
) {
  const source = String(text ?? '')
  if (!source)
    return minHeight

  const charsPerLine = Math.max(18, Math.floor(Math.max(320, width) / 8))
  const hardLines = source.split(/\r?\n/).length
  const softLines = Math.ceil(source.length / charsPerLine)
  const lines = Math.max(1, hardLines, softLines)

  return Math.max(minHeight, Math.ceil(lines * lineHeight + 12))
}

function getHeightCacheWidthBucket(width: unknown) {
  const numeric = Number(width)
  if (!Number.isFinite(numeric) || numeric <= 0)
    return UNKNOWN_HEIGHT_CACHE_WIDTH_BUCKET

  return Math.round(numeric / HEIGHT_CACHE_WIDTH_BUCKET_PX)
}

function getFallbackHeightPrefix() {
  const total = parsedNodes.value.length
  const width = experimentContainerWidth.value || readLayout('getFallbackHeightPrefix.clientWidth', () => containerRef.value?.clientWidth || 0)
  const widthBucket = getHeightCacheWidthBucket(width)
  const measurementKey = props.virtualScroll?.measurementKey == null
    ? ''
    : String(props.virtualScroll.measurementKey)
  const key = [
    total,
    heightStats.count,
    Math.round(heightStats.total),
    Math.round(averageNodeHeight.value * 100),
    measurementKey,
    widthBucket,
    heightEstimationActive.value ? 1 : 0,
    heightEstimationExperimentRevision.value,
    streamRenderVersion.value,
  ].join(':')

  if (!fallbackHeightPrefixDirty && fallbackHeightPrefixCacheKey === key)
    return fallbackHeightPrefixCache

  const prefix = new Array<number>(total + 1)
  prefix[0] = 0

  for (let i = 0; i < total; i++) {
    prefix[i + 1] = prefix[i] + (
      heightEstimationActive.value
        ? getFallbackNodeHeight(i)
        : (nodeHeights[i] ?? averageNodeHeight.value)
    )
  }

  fallbackHeightPrefixCache = prefix
  fallbackHeightPrefixCacheKey = key
  fallbackHeightPrefixDirty = false

  return prefix
}

function estimateHeightRangeFromPrefix(start: number, end: number) {
  const total = parsedNodes.value.length
  const boundedStart = clamp(Math.trunc(start), 0, total)
  const boundedEnd = clamp(Math.trunc(end), boundedStart, total)
  if (boundedStart >= boundedEnd)
    return 0

  const prefix = getFallbackHeightPrefix()
  return (prefix[boundedEnd] ?? 0) - (prefix[boundedStart] ?? 0)
}

function estimateIndexForOffsetFromPrefix(offsetPx: number) {
  const nodes = parsedNodes.value
  const total = nodes.length
  if (total <= 0)
    return 0
  if (offsetPx <= 0)
    return 0

  const prefix = getFallbackHeightPrefix()
  const totalHeight = prefix[total] ?? 0
  if (offsetPx >= totalHeight)
    return total - 1

  let low = 0
  let high = total - 1
  let answer = total - 1

  while (low <= high) {
    const mid = (low + high) >> 1
    const midEnd = prefix[mid + 1] ?? 0

    if (midEnd >= offsetPx) {
      answer = mid
      high = mid - 1
    }
    else {
      low = mid + 1
    }
  }

  return answer
}

watch(
  () => parsedNodes.value.length,
  (length) => {
    markFallbackHeightPrefixDirty()
    if (length <= 0) {
      resetHeightMeasurements()
      return
    }
    if (length < heightTreeSize.value)
      pruneHeightMeasurements(length)
    if (length !== heightTreeSize.value)
      rebuildHeightTrees(length)
  },
  { immediate: true },
)

function estimateHeightRange(start: number, end: number) {
  if (start >= end)
    return 0
  if (heightEstimationActive.value) {
    return estimateHeightRangeFromPrefix(start, end)
  }
  if (heightTreeSize.value !== parsedNodes.value.length) {
    let total = 0
    for (let i = start; i < end; i++)
      total += nodeHeights[i] ?? averageNodeHeight.value
    return total
  }
  const sumTree = heightSumTree.value
  const countTree = heightKnownTree.value
  if (!sumTree.length || !countTree.length) {
    let total = 0
    for (let i = start; i < end; i++)
      total += nodeHeights[i] ?? averageNodeHeight.value
    return total
  }
  const sumKnown = fenwickRangeSum(sumTree, start, end)
  const countKnown = fenwickRangeSum(countTree, start, end)
  const unknownCount = (end - start) - countKnown
  return sumKnown + unknownCount * averageNodeHeight.value
}

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

interface VirtualHeightSummary {
  totalNodes: number
  measuredCount: number
  estimatedCount: number
  averageNodeHeight: number
  topSpacerHeight: number
  bottomSpacerHeight: number
  estimatedTotalHeight: number
  width: number
}

function getEstimatedNodeHeightCount() {
  if (!heightEstimationActive.value)
    return 0

  let count = 0
  const estimates = estimatedNodeHeights.value
  for (let i = 0; i < estimates.length; i++) {
    if (!estimates[i])
      continue

    const measuredHeight = nodeHeights[i]
    if (Number.isFinite(measuredHeight) && measuredHeight > 0)
      continue

    count++
  }
  return count
}

function buildVirtualHeightSummary(): VirtualHeightSummary {
  const totalNodes = parsedNodes.value.length

  return {
    totalNodes,
    measuredCount: heightStats.count,
    estimatedCount: getEstimatedNodeHeightCount(),
    averageNodeHeight: averageNodeHeight.value,
    topSpacerHeight: topSpacerHeight.value,
    bottomSpacerHeight: bottomSpacerHeight.value,
    estimatedTotalHeight: estimateHeightRange(0, totalNodes),
    width: getCurrentVirtualWidth(),
  }
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

function isSameVirtualThreadKey(threadKey: string | undefined) {
  return (threadKey ?? '') === (getVirtualThreadKey() ?? '')
}

function getHostVirtualMeasurementKey() {
  const key = props.virtualScroll?.measurementKey
  return key == null ? '' : String(key)
}

function getVirtualRendererLayoutKey() {
  const renderer = resolvedCodeRenderer.value
  const monaco = renderer === 'monaco' ? rendererProps.codeBlockMonacoOptions : undefined
  const codeProps = rendererProps.codeBlockProps as Record<string, unknown> | undefined
  const includeShikiCodeOptions = renderer === 'shiki'

  return [
    rendererProps.isDark ? 'dark' : 'light',
    renderer === 'monaco'
      ? 'code-rich'
      : renderer === 'pre'
        ? 'code-pre'
        : 'code-shiki',
    rendererProps.codeBlockStream === false ? 'code-static' : 'code-stream',
    stringifyVirtualToken(rendererProps.codeBlockMinWidth),
    stringifyVirtualToken(rendererProps.codeBlockMaxWidth),
    ...(includeShikiCodeOptions
      ? [getHighlightRegistrationKey(
          (codeProps?.themes ?? rendererProps.themes) as readonly unknown[] | undefined,
          (codeProps?.langs ?? rendererProps.langs) as readonly unknown[] | undefined,
        )]
      : []),
    stringifyVirtualToken(monaco?.fontSize),
    stringifyVirtualToken(monaco?.lineHeight),
    stringifyVirtualToken(monaco?.fontFamily),
    stringifyVirtualToken(monaco?.tabSize),
    stringifyVirtualToken(monaco?.MAX_HEIGHT),
    stringifyVirtualToken(monaco?.wordWrap),
    stringifyVirtualToken(monaco?.wrappingIndent),
    stringifyVirtualToken(monaco?.padding),
    stringifyVirtualToken(codeProps?.showHeader),
    stringifyVirtualToken(codeProps?.showCopyButton),
    stringifyVirtualToken(codeProps?.showExpandButton),
    stringifyVirtualToken(codeProps?.showPreviewButton),
    stringifyVirtualToken(codeProps?.showCollapseButton),
    stringifyVirtualToken(codeProps?.showFontSizeButtons),
  ].join('\u0000')
}

function getVirtualMeasurementKey() {
  return [
    getHostVirtualMeasurementKey(),
    getVirtualRendererLayoutKey(),
  ].join('\u0000')
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
    bumpAsyncNodeVersion()
    scheduleVirtualMetricsEmit('async-node')
    return
  }

  pendingAsyncNodeCounts.set(key, 1)
  pendingAsyncNodeRecords.set(key, getPendingAsyncNodeRecord(index))
  bumpAsyncNodeVersion()

  scheduleVirtualMetricsEmit('async-node')
}

function pruneStalePendingAsyncNodeKeys(reason: MarkstreamVirtualReason = 'async-node') {
  let changed = false

  for (const [key, record] of Array.from(pendingAsyncNodeRecords.entries())) {
    if (isUsablePendingAsyncNodeRecord(record))
      continue

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

    if (index != null)
      measureTrackedNodeHeights()
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

function getVisibleDomHeight() {
  let total = 0

  for (const el of nodeContentElements.values())
    total += readLayout('getVisibleDomHeight.offsetHeight', () => el?.offsetHeight ?? 0)

  return Math.ceil(Math.max(0, total))
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
    visibleDomHeight: getVisibleDomHeight(),
    totalHeight: getRendererLogicalHeight(),
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

function getRendererLogicalHeight() {
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
      || getEstimatedNodeHeightCount() > 0

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

function getNodeHeightCacheSignature(index: number) {
  const node = parsedNodes.value[index]
  if (!node)
    return ''

  return hashVirtualString(stableHeightSignatureValue(node))
}

function getVirtualContentHash() {
  const revision = streamRenderVersion.value
  if (virtualContentHashRevision === revision)
    return virtualContentHashCache

  let hash = 2166136261

  for (let i = 0; i < parsedNodes.value.length; i++) {
    const signature = getNodeHeightCacheSignature(i)
    for (let j = 0; j < signature.length; j++) {
      hash ^= signature.charCodeAt(j)
      hash = Math.imul(hash, 16777619)
    }
  }

  virtualContentHashCache = (hash >>> 0).toString(36)
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
  nodeHeightSignatures.clear()
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

  for (const index of Array.from(nodeHeightSignatures.keys())) {
    if (index >= total) {
      staleIndices.push(index)
      continue
    }

    const signature = getNodeHeightCacheSignature(index)
    const previousSignature = nodeHeightSignatures.get(index)

    if (previousSignature != null && previousSignature !== signature)
      staleIndices.push(index)

    nodeHeightSignatures.set(index, signature)
  }

  for (const index of Array.from(nodeHeightSignatures.keys())) {
    if (index >= total)
      nodeHeightSignatures.delete(index)
  }

  if (!staleIndices.length)
    return

  removeNodeHeights(staleIndices, { notify: false })
  markFallbackHeightPrefixDirty()
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

function stringifyVirtualToken(value: unknown) {
  if (value == null)
    return ''

  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  }
  catch {
    return String(value)
  }
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
  if (shouldForceMeasureBeforeVirtualMetrics(pendingVirtualMetricsReason)) {
    measureTrackedNodeHeights()
    forceFlushPendingHeightMeasurements()
  }
  emitVirtualMetricsNow(getVirtualMetrics(pendingVirtualMetricsReason))
}

function shouldForceMeasureBeforeVirtualMetrics(reason: MarkstreamVirtualReason) {
  if (pendingHeightMeasurements.size > 0 || heightMeasurementRaf != null)
    return true

  switch (reason) {
    case 'node-resize':
    case 'async-node':
    case 'resize':
    case 'restore':
    case 'final':
    case 'manual':
      return true

    case 'batch':
    case 'content':
    default:
      return false
  }
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

function estimateIndexForOffset(offsetPx: number) {
  if (offsetPx <= 0)
    return 0
  const nodes = parsedNodes.value
  if (heightEstimationActive.value) {
    return estimateIndexForOffsetFromPrefix(offsetPx)
  }
  if (heightTreeSize.value === nodes.length && heightSumTree.value.length && heightKnownTree.value.length) {
    const avg = averageNodeHeight.value
    const sumTree = heightSumTree.value
    const countTree = heightKnownTree.value
    const prefix = (endExclusive: number) => {
      if (endExclusive <= 0)
        return 0
      const sumKnown = fenwickRangeSum(sumTree, 0, endExclusive)
      const countKnown = fenwickRangeSum(countTree, 0, endExclusive)
      return sumKnown + (endExclusive - countKnown) * avg
    }
    let low = 0
    let high = nodes.length - 1
    let ans = nodes.length - 1
    while (low <= high) {
      const mid = (low + high) >> 1
      const height = prefix(mid + 1)
      if (height >= offsetPx) {
        ans = mid
        high = mid - 1
      }
      else {
        low = mid + 1
      }
    }
    return ans
  }
  let remaining = offsetPx
  for (let i = 0; i < nodes.length; i++) {
    const height = nodeHeights[i] ?? averageNodeHeight.value
    if (remaining <= height)
      return i
    remaining -= height
  }
  return Math.max(0, nodes.length - 1)
}

function estimateIndexForOffsetFromEnd(offsetPx: number) {
  const nodes = parsedNodes.value
  if (!nodes.length)
    return 0
  if (offsetPx <= 0)
    return Math.max(0, nodes.length - 1)
  if (heightEstimationActive.value) {
    const prefix = getFallbackHeightPrefix()
    const totalHeight = prefix[nodes.length] ?? 0
    return estimateIndexForOffsetFromPrefix(Math.max(0, totalHeight - offsetPx))
  }
  if (heightTreeSize.value === nodes.length) {
    const totalHeight = estimateHeightRange(0, nodes.length)
    const target = Math.max(0, totalHeight - offsetPx)
    return estimateIndexForOffset(target)
  }
  let remaining = offsetPx
  for (let i = nodes.length - 1; i >= 0; i--) {
    const height = nodeHeights[i] ?? averageNodeHeight.value
    if (remaining <= height)
      return i
    remaining -= height
  }
  return 0
}

function bumpNodeSlotVersion() {
  nodeSlotVersion.value += 1
}

function shouldRenderNode(index: number) {
  // Respect incremental rendering budget only when incremental batching
  // is active (virtualization disabled). Otherwise render immediately.
  if (incrementalRenderingActive.value && index >= renderedCount.value)
    return false
  if (!deferNodes.value)
    return true
  if (index < resolvedInitialBatch.value)
    return true
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
    if (el)
      markNodeVisible(index, true)
    return
  }

  if (
    !virtualizationEnabled.value
    && deferNodes.value
    && !viewportPriorityAutoDisabled.value
    && nodeVisibilityHandles.size >= MAX_VIEWPORT_OBSERVER_TARGETS
  ) {
    autoDisableViewportPriority('too-many-targets')
    if (!shouldObserveSlots.value || !registerNodeVisibility) {
      destroyNodeHandle(index)
      if (el)
        markNodeVisible(index, true)
      return
    }
  }

  if (index < resolvedInitialBatch.value && !virtualizationEnabled.value) {
    destroyNodeHandle(index)
    markNodeVisible(index, true)
    return
  }

  if (visibleNodeIndices.value.has(index)) {
    destroyNodeHandle(index)
    markNodeVisible(index, true)
    return
  }

  if (!el) {
    destroyNodeHandle(index)
    return
  }

  destroyNodeHandle(index)
  const handle = registerNodeVisibility(el, { rootMargin: '400px' })
  if (!handle)
    return
  nodeVisibilityHandles.set(index, handle)
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

  for (const [index, pending] of pendingHeightMeasurements) {
    pendingHeightMeasurements.delete(index)
    if (nodeContentElements.get(index) !== pending.el)
      continue
    if (nodeContentVersions.get(index) !== pending.version)
      continue
    recordNodeHeight(index, pending.height, { allowShrink: pending.allowShrink })
  }
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
  for (const [index, el] of nodeContentElements) {
    if (el)
      measureNodeHeight(index, el)
  }
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

  clearFinalHeightConvergenceTimers()
  for (const delay of [80, 240, 640]) {
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
    return
  }
  nodeContentElements.set(index, el)
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
    if (enabled)
      return
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

watch(
  [() => parsedNodes.value.length, () => renderedCount.value],
  () => {
    if (activeVirtualBottomAnchor.value)
      scheduleVirtualBottomRestoreReconcile()

    scheduleVirtualMetricsEmit('content')
  },
  { flush: 'post', immediate: true },
)

watch(
  [() => liveRange.start, () => liveRange.end],
  () => {
    scheduleVirtualMetricsEmit('batch')
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
watch(
  [() => parsedNodes.value.length, () => virtualizationEnabled.value],
  async ([length, enabled]) => {
    if (!enabled || !length || !isClient)
      return
    await nextTick()
    scheduleFocusSync({ immediate: true })
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
  [() => containerRef.value, heightEstimationActive],
  () => {
    if (!heightEstimationActive.value) {
      cleanupExperimentResizeObserver()
      experimentContainerWidth.value = 0
      return
    }
    updateExperimentContainerWidth()
    setupExperimentResizeObserver()
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
      scheduleFocusSync({ immediate: true })
  },
)

watch(
  [heightEstimationActive, experimentContainerWidth],
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
      for (const [index, el] of nodeSlotElements) {
        if (el)
          markNodeVisible(index, true)
      }
      return
    }
    for (const [index, el] of nodeSlotElements)
      setNodeSlotElement(index, el)
  },
  { immediate: false },
)

watch(
  [() => rendererProps.viewportPriority, () => parsedNodes.value.length],
  ([enabled, length]) => {
    if (enabled === false) {
      viewportPriorityAutoDisabled.value = false
      return
    }
    if (viewportPriorityAutoDisabled.value && length <= VIEWPORT_PRIORITY_RECOVERY_COUNT)
      viewportPriorityAutoDisabled.value = false
  },
)

watch(
  () => renderedCount.value,
  () => {
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
  nodeHeightSignatures.clear()

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
  nodeHeightSignatures.clear()

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
    experimentContainerWidth,
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
    experimentContainerWidth,
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
  [virtualScrollEnabled, experimentContainerWidth, () => props.virtualScroll?.restoreState, () => props.virtualScroll?.measurementKey],
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
    experimentContainerWidth,
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
  nodeHeightSignatures.clear()
  clearFinalHeightConvergenceTimers()
  clearPendingHeightMeasurements()
  cleanupExperimentResizeObserver()
  clearRestoreReconcile()
  clearActiveVirtualBottomAnchor()
  clearVirtualMetricsSchedule()
  cleanupScrollListener()
  cancelScheduledFocusSync()
})

const MermaidBlockNodeAsync = defineAsyncComponent({
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

const InfographicBlockNodeAsync = defineAsyncComponent({
  loader: async () => {
    try {
      const mod = await import('../../components/InfographicBlockNode')
      return mod.default
    }
    catch (e) {
      console.warn(
        '[markstream-vue] Failed to load InfographicBlockNode. Falling back to preformatted code rendering. To enable Infographic rendering, install "@antv/infographic" and configure setInfographicLoader with a dynamic loader.',
        e,
      )
      return PreCodeNode
    }
  },
  loadingComponent: InfographicBlockNodeLoading,
  delay: 0,
})

const D2BlockNodeAsync = defineAsyncComponent(async () => {
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
  getCodeBlockExtraProps(rendererProps.codeBlockProps, { omit: ['langs'] }),
)
const codeBlockBindings = computed(() => ({
  // streaming behavior control for CodeBlockNode / MarkdownCodeBlockNode
  stream: rendererProps.codeBlockStream,
  darkTheme: rendererProps.codeBlockDarkTheme,
  lightTheme: rendererProps.codeBlockLightTheme,
  monacoOptions: rendererProps.codeBlockMonacoOptions,
  themes: rendererProps.themes,
  langs: resolvedCodeRenderer.value === 'shiki' ? rendererProps.langs : undefined,
  minWidth: rendererProps.codeBlockMinWidth,
  maxWidth: rendererProps.codeBlockMaxWidth,
  ...(typeof resolvedShowTooltips.value === 'boolean' ? { showTooltips: resolvedShowTooltips.value } : {}),
  ...builtinCodeBlockExtraProps.value,
}))

const customCodeBlockBindings = computed(() => ({
  ...codeBlockBindings.value,
  langs: rendererProps.langs,
  ...codeBlockExtraProps.value,
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
  if (showLineNumbers !== undefined)
    bindings.showLineNumbers = showLineNumbers

  const diffInline = pickBoolean(source.diffInline)
  if (diffInline !== undefined)
    bindings.diffInline = diffInline

  const reservedHeightPx = pickPositiveNumber(source.reservedHeightPx)
  if (reservedHeightPx !== undefined)
    bindings.reservedHeightPx = reservedHeightPx

  return bindings
})

const shikiCodeBlockBindings = computed(() => {
  return {
    stream: rendererProps.codeBlockStream,
    darkTheme: rendererProps.codeBlockDarkTheme,
    lightTheme: rendererProps.codeBlockLightTheme,
    themes: rendererProps.themes,
    langs: rendererProps.langs,
    minWidth: rendererProps.codeBlockMinWidth,
    maxWidth: rendererProps.codeBlockMaxWidth,
    ...(typeof resolvedShowTooltips.value === 'boolean'
      ? { showTooltips: resolvedShowTooltips.value }
      : {}),
    ...codeBlockExtraProps.value,
  }
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

function getCodeBlockRenderNode(node: ParsedNode) {
  if (node.type !== 'code_block')
    return node

  const codeBlockNode = node as RuntimeCodeBlockNode
  const signature = [
    String(codeBlockNode.language ?? ''),
    String(codeBlockNode.loading ?? ''),
    String(codeBlockNode.diff ?? ''),
    String(codeBlockNode.code ?? ''),
    String(codeBlockNode.originalCode ?? ''),
    String(codeBlockNode.updatedCode ?? ''),
    String(codeBlockNode.raw ?? ''),
  ].join('\u0000')

  const cached = codeBlockRenderCache.get(codeBlockNode)
  if (cached && cached.signature === signature)
    return cached.node

  const cloned = { ...codeBlockNode } as ParsedNode
  codeBlockRenderCache.set(codeBlockNode, { signature, node: cloned })
  return cloned
}

function isCustomTagComponent(node: ParsedNode, component: unknown) {
  const type = String(node.type)
  return !isReservedNodeComponentKey(type) && customComponentsMap.value[type] === component
}

function hasSlotChildren(node: ParsedNode) {
  return Array.isArray((node as any).children) && (node as any).children.length > 0
}

const renderedItems = computed(() => {
  return visibleNodes.value.map((item) => {
    // Reuse the previous shallow clone for code blocks unless the visible
    // payload changed, so parent recomputations do not churn Monaco props.
    let node = getCodeBlockRenderNode(item.node)
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
      && resolvedCodeRenderer.value === 'pre'
      && component === PreCodeNode
      && !getCustomCodeLanguageComponent(customComponentsMap.value, language)
    let bindings = { ...getBindingsFor(node, language, component) } as Record<string, unknown>
    const estimatedHeight = estimatedNodeHeights.value[item.index]
    if (node.type === 'code_block' && estimatedHeight?.kind === 'code-block') {
      if (usesPreCodeBindings) {
        bindings = {
          ...bindings,
          reservedHeightPx: estimatedHeight.height ?? estimatedHeight.contentHeight,
        }
      }
      else {
        bindings = {
          ...bindings,
          estimatedHeightPx: estimatedHeight.height,
          estimatedContentHeightPx: estimatedHeight.contentHeight,
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
          estimateMermaidPreviewHeight(String((node as RuntimeCodeBlockNode).code ?? '')),
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
          estimateInfographicPreviewHeight(String((node as RuntimeCodeBlockNode).code ?? '')),
        ),
      }
    }
    if (node.type === 'math_block') {
      bindings = {
        ...bindings,
        cacheScope: mathBlockCacheScope.value,
      }
    }

    const rendersCustomNode = isCustomTagComponent(node, component)
    const customAttrs = rendersCustomNode
      ? getCustomNodeAttrs(node as any, resolvedHtmlPolicy.value)
      : undefined

    return {
      ...item,
      node,
      component,
      bindings,
      customBindings: {
        ...(customAttrs ?? {}),
        ...bindings,
      },
      rendersCustomNode,
      hasSlotChildren: hasSlotChildren(node),
      slotContent: String((node as any).content ?? ''),
      isCodeBlock: node.type === 'code_block',
      indexKey: `${indexPrefix.value}-${item.index}`,
    }
  })
})

function getCodeBlockLanguage(node: ParsedNode) {
  return node?.type === 'code_block'
    ? String((node as RuntimeCodeBlockNode).language ?? '').trim().toLowerCase()
    : ''
}

function getCustomCodeLanguageComponent(
  customComponents: Record<string, unknown>,
  language: string,
) {
  const raw = language.trim().toLowerCase()
  if (!raw)
    return undefined

  for (const key of [raw, normalizeLanguageIdentifier(raw), normalizeShikiLanguage(raw)]) {
    const component = key && customComponents[key]
    if (component)
      return component
  }

  return undefined
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
      estimate(String((node as RuntimeCodeBlockNode)?.code ?? '')),
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

    if (resolvedCodeRenderer.value === 'pre') {
      const customCodeBlock = customComponents.code_block
      return customCodeBlock || PreCodeNode
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
      && resolvedCodeRenderer.value === 'pre'
      && !customLanguageComponent
      && component === PreCodeNode
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

    if (isMarkdownCodeBlockComponent(component))
      return shikiCodeBlockBindings.value
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
  emit('click', event)
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
let typewriterCursorTimeout: ReturnType<typeof setTimeout> | undefined
let typewriterCursorRaf: number | null = null
let typewriterCursorRafVersion = 0
let lastTypewriterContentLength = 0
let lastTypewriterVisibleLength = 0
let lastTypewriterCursorMode = 'off'
let simpleTypewriterCursorElement: HTMLElement | null = null
const SIMPLE_TYPEWRITER_CURSOR_ATTR = 'data-typewriter-simple-cursor'
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

function clearSimpleTypewriterCursorElement() {
  simpleTypewriterCursorElement?.removeAttribute(SIMPLE_TYPEWRITER_CURSOR_ATTR)
  simpleTypewriterCursorElement = null
}

function hideTypewriterCursorElement() {
  clearTypewriterCursorRaf()
  clearSimpleTypewriterCursorElement()
  if (typewriterCursorRef.value)
    typewriterCursorRef.value.style.visibility = 'hidden'
}

function showSimpleTypewriterCursorElement() {
  clearTypewriterCursorRaf()
  clearSimpleTypewriterCursorElement()

  const text = getTypewriterCursorTextTarget()
  const parent = text?.parentElement
  const target = parent?.closest<HTMLElement>('.text-node, .inline-code') ?? parent
  if (!target)
    return

  target.setAttribute(SIMPLE_TYPEWRITER_CURSOR_ATTR, 'true')
  simpleTypewriterCursorElement = target
}

function showPreciseTypewriterCursorElement() {
  clearSimpleTypewriterCursorElement()
  if (typewriterCursorRef.value)
    typewriterCursorRef.value.style.visibility = 'hidden'
  scheduleTypewriterCursorPositionUpdate()
}

function getTypewriterCursorMode() {
  if (!typewriterEnabled.value)
    return 'off'
  return isSimpleTypewriterCursor.value ? 'simple' : 'precise'
}

function showCurrentTypewriterCursorElement() {
  if (isSimpleTypewriterCursor.value) {
    showSimpleTypewriterCursorElement()
    return
  }

  showPreciseTypewriterCursorElement()
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

function updateTypewriterCursorPosition() {
  if (!isClient || !isPreciseTypewriterCursor.value || !showTypewriterCursor.value || !containerRef.value || !typewriterCursorRef.value)
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
  if (!isClient || !isPreciseTypewriterCursor.value || !showTypewriterCursor.value)
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
    const cursorMode = getTypewriterCursorMode()
    const cursorModeChanged = cursorMode !== lastTypewriterCursorMode
    if (!typewriterEnabled.value || !cursorAllowed || (!sourceGrowing && !visibleGrowing)) {
      if (!typewriterEnabled.value || !cursorAllowed) {
        showTypewriterCursor.value = false
        hideTypewriterCursorElement()
      }
      else if (cursorModeChanged && showTypewriterCursor.value) {
        await nextTick()
        showCurrentTypewriterCursorElement()
      }
      lastTypewriterContentLength = nextLength
      lastTypewriterVisibleLength = nextVisibleLength
      lastTypewriterCursorMode = cursorMode
      return
    }

    lastTypewriterContentLength = nextLength
    lastTypewriterVisibleLength = nextVisibleLength
    lastTypewriterCursorMode = cursorMode
    showTypewriterCursor.value = true
    clearTypewriterCursorTimeout()
    await nextTick()
    showCurrentTypewriterCursorElement()
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
    showCurrentTypewriterCursorElement()
  },
  { flush: 'post' },
)

watch(
  [() => renderedCount.value, () => liveRange.start, () => liveRange.end],
  async () => {
    if (!isClient || renderAsFragment.value || !ownsTypewriterCursor.value || !showTypewriterCursor.value)
      return

    await nextTick()
    if (isSimpleTypewriterCursor.value) {
      showSimpleTypewriterCursorElement()
      return
    }

    if (!isPreciseTypewriterCursor.value)
      return

    scheduleTypewriterCursorPositionUpdate()
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  clearTypewriterCursorTimeout()
  clearTypewriterCursorRaf()
  clearSimpleTypewriterCursorElement()
  mathBlockMinHeightCache.clear()
})
</script>

<template>
  <template v-if="renderAsFragment">
    <template
      v-for="item in renderedItems"
      :key="item.index"
    >
      <component
        :is="item.component"
        v-if="item.rendersCustomNode"
        v-bind="item.customBindings"
        :node="item.node"
        :loading="item.node.loading"
        :index-key="item.indexKey"
        :custom-id="rendererProps.customId"
        :is-dark="rendererProps.isDark"
        @click="handleContainerClick"
        @mouseover="handleFragmentMouseover"
        @mouseout="handleFragmentMouseout"
        @copy="emit('copy', $event)"
        @handle-artifact-click="emit('handleArtifactClick', $event)"
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
        :node="item.node"
        :loading="item.node.loading"
        :index-key="item.indexKey"
        v-bind="item.bindings"
        :custom-id="rendererProps.customId"
        :is-dark="rendererProps.isDark"
        @click="handleContainerClick"
        @mouseover="handleFragmentMouseover"
        @mouseout="handleFragmentMouseout"
        @copy="emit('copy', $event)"
        @handle-artifact-click="emit('handleArtifactClick', $event)"
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
    ]"
    :data-custom-id="rendererProps.customId"
    @click="handleContainerClick"
    @mouseover="handleContainerMouseover"
    @mouseout="handleContainerMouseout"
  >
    <template v-if="heightEstimationDomActive || virtualizationEnabled">
      <div
        v-if="heightEstimationDomActive"
        class="height-estimation-probes"
        :style="{ width: `${experimentProbeWidth}px` }"
        aria-hidden="true"
      >
        <div ref="paragraphProbeWrapperRef" class="node-content" data-probe="paragraph">
          <ParagraphNode
            :node="paragraphProbeNode as any"
            index-key="probe-paragraph"
          />
        </div>
        <div ref="listItemProbeWrapperRef" class="node-content" data-probe="list-item">
          <ul class="m-0 p-0">
            <ListItemNode
              :node="listItemProbeNode as any"
              index-key="probe-list-item"
            />
          </ul>
        </div>
        <div ref="listProbeWrapperRef" class="node-content" data-probe="list">
          <ListNode
            :node="listProbeNode as any"
            index-key="probe-list"
          />
        </div>
        <div
          v-for="level in 6"
          :key="`probe-heading-${level}`"
          :ref="el => setHeadingProbeWrapper(level, el as HTMLElement | null)"
          class="node-content"
          :data-probe="`heading-${level}`"
        >
          <HeadingNode
            :node="getHeadingProbeNode(level) as any"
            :index-key="`probe-heading-${level}`"
          />
        </div>
      </div>
      <div
        v-if="virtualizationEnabled"
        class="node-spacer"
        :style="{ height: `${topSpacerHeight}px` }"
        aria-hidden="true"
      />
    </template>
    <template v-for="item in renderedItems" :key="item.index">
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
          <!-- Skip wrapping code_block nodes in transitions to avoid touching Monaco editor internals -->
          <transition
            v-if="!item.isCodeBlock"
            name="fade"
            :css="rendererProps.fade !== false"
            :appear="rendererProps.fade !== false"
          >
            <component
              :is="item.component"
              v-if="item.rendersCustomNode"
              v-bind="item.customBindings"
              :node="item.node"
              :loading="item.node.loading"
              :index-key="item.indexKey"
              :custom-id="rendererProps.customId"
              :is-dark="rendererProps.isDark"
              @copy="emit('copy', $event)"
              @handle-artifact-click="emit('handleArtifactClick', $event)"
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
              :node="item.node"
              :loading="item.node.loading"
              :index-key="item.indexKey"
              v-bind="item.bindings"
              :custom-id="rendererProps.customId"
              :is-dark="rendererProps.isDark"
              @copy="emit('copy', $event)"
              @handle-artifact-click="emit('handleArtifactClick', $event)"
            />
          </transition>

          <component
            :is="item.component"
            v-else-if="item.rendersCustomNode"
            v-bind="item.customBindings"
            :node="item.node"
            :loading="item.node.loading"
            :index-key="item.indexKey"
            :custom-id="rendererProps.customId"
            :is-dark="rendererProps.isDark"
            @copy="emit('copy', $event)"
            @handle-artifact-click="emit('handleArtifactClick', $event)"
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
            :node="item.node"
            :loading="item.node.loading"
            :index-key="item.indexKey"
            v-bind="item.bindings"
            :custom-id="rendererProps.customId"
            :is-dark="rendererProps.isDark"
            @copy="emit('copy', $event)"
            @handle-artifact-click="emit('handleArtifactClick', $event)"
          />
        </div>
        <div
          v-else
          class="node-placeholder"
          :style="{ height: `${getFallbackNodeHeight(item.index)}px` }"
        />
      </div>
    </template>
    <span
      v-if="showTypewriterCursor && isPreciseTypewriterCursor"
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

.height-estimation-probes {
  position: absolute;
  left: -100000px;
  top: 0;
  visibility: hidden;
  pointer-events: none;
  overflow: hidden;
  z-index: -1;
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
  border-radius: var(--ms-radius);
  background-image: linear-gradient(90deg, var(--loading-shimmer), transparent, var(--loading-shimmer));
  background-size: 200% 100%;
  animation: node-placeholder-shimmer 1.1s ease-in-out infinite;
}

.node-placeholder:first-child {
  margin-top: 0;
}

@keyframes node-placeholder-shimmer {
  from {
    background-position: 200% 0%;
  }
  to {
    background-position: -200% 0%;
  }
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

.markdown-renderer :deep([data-typewriter-simple-cursor="true"])::after {
  content: '';
  display: inline-block;
  width: 0.55em;
  height: 1em;
  margin-left: 0.08em;
  vertical-align: -0.12em;
  border-right: 2px solid currentColor;
  pointer-events: none;
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
