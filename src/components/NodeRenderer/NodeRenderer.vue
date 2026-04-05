<script setup lang="ts">
import type { MarkdownIt, ParsedNode } from 'stream-markdown-parser'
import type { VisibilityHandle } from '../../composables/viewportPriority'
import type { CustomComponents } from '../../types'
import type { NodeRendererProps } from '../../types/node-renderer-props'
import { getMarkdown, mergeCustomHtmlTags, parseMarkdownToStructure, resolveCustomHtmlTags } from 'stream-markdown-parser'
import { computed, defineAsyncComponent, markRaw, nextTick, onBeforeUnmount, provide, reactive, ref, useAttrs, watch } from 'vue'
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
import { getHtmlTagFromContent, shouldRenderUnknownHtmlTagAsText, stripCustomHtmlWrapper } from '../../utils/htmlRenderer'
import { customComponentsRevision, getCustomNodeComponents } from '../../utils/nodeComponents'
import HtmlBlockNode from '../HtmlBlockNode/HtmlBlockNode.vue'
import HtmlInlineNode from '../HtmlInlineNode/HtmlInlineNode.vue'
import MarkdownCodeBlockNode from '../MarkdownCodeBlockNode'
import { MathBlockNodeAsync, MathInlineNodeAsync } from './asyncComponent'
import FallbackComponent from './FallbackComponent.vue'

// 组件接收的 props
// 增加用于统一设置所有 code_block 主题和 Monaco 选项的外部 API
interface IdleDeadlineLike {
  timeRemaining?: () => number
}

type RendererAttrs = Record<string, unknown> & {
  'showTooltips'?: unknown
  'show-tooltips'?: unknown
}

type RendererParseOptions = NonNullable<NodeRendererProps['parseOptions']>
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

const props = withDefaults(defineProps<NodeRendererProps>(), {
  codeBlockStream: true,
  showTooltips: true,
  typewriter: true,
  batchRendering: true,
  debugPerformance: false,
  initialRenderBatchSize: 40,
  renderBatchSize: 80,
  renderBatchDelay: 16,
  renderBatchBudgetMs: 6,
  renderBatchIdleTimeoutMs: 120,
  deferNodesUntilVisible: true,
  maxLiveNodes: 320,
  liveNodeBuffer: 60,
})

// 定义事件
const emit = defineEmits(['copy', 'handleArtifactClick', 'click', 'mouseover', 'mouseout'])
const MAX_DEFERRED_NODE_COUNT = 900
const MAX_VIEWPORT_OBSERVER_TARGETS = 640
const VIEWPORT_PRIORITY_RECOVERY_COUNT = 200

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
const SCROLL_PARENT_OVERFLOW_RE = /auto|scroll|overlay/i
const isClient = typeof window !== 'undefined'
const debugPerformanceEnabled = computed(() => props.debugPerformance && isClient && typeof console !== 'undefined')
const attrs = useAttrs() as RendererAttrs
const textStreamState = new Map<string, string>()
const streamRenderVersion = ref(0)
const experimentContainerWidth = ref(0)
const simpleTextProbeProfile = ref(createEmptySimpleTextProbeProfile())
const resolvedShowTooltips = computed<boolean | undefined>(() => {
  if (typeof props.showTooltips === 'boolean')
    return props.showTooltips
  const raw = attrs.showTooltips ?? attrs['show-tooltips']
  if (raw === '' || raw === true || raw === 'true')
    return true
  if (raw === false || raw === 'false')
    return false
  return undefined
})
provide('markstreamShowTooltips', resolvedShowTooltips)
provide('markstreamTypewriter', computed(() => props.typewriter !== false))
provide('markstreamTextStreamState', textStreamState)
provide('markstreamStreamVersion', streamRenderVersion)

watch(
  [() => props.content, () => props.nodes],
  () => {
    streamRenderVersion.value += 1
  },
  { immediate: true },
)

function logPerf(label: string, data: Record<string, unknown>) {
  if (!debugPerformanceEnabled.value)
    return
  console.info(`[markstream-vue][perf] ${label}`, data)
}

function hasOverflowScrollStyle(style: CSSStyleDeclaration | null | undefined) {
  if (!style)
    return false
  const overflowY = (style.overflowY || '').toLowerCase()
  const overflow = (style.overflow || '').toLowerCase()
  return SCROLL_PARENT_OVERFLOW_RE.test(overflowY) || SCROLL_PARENT_OVERFLOW_RE.test(overflow)
}

function isActuallyScrollableElement(element: HTMLElement) {
  const verticalOverflow = Math.ceil(element.scrollHeight) > Math.ceil(element.clientHeight) + 1
  const horizontalOverflow = Math.ceil(element.scrollWidth) > Math.ceil(element.clientWidth) + 1
  return verticalOverflow || horizontalOverflow
}

function resolveViewportRoot(node?: HTMLElement | null) {
  if (typeof window === 'undefined')
    return null
  const base = node ?? containerRef.value
  if (!base)
    return null
  const doc = base.ownerDocument || document
  const rootScrollable = doc.scrollingElement || doc.documentElement
  let current: HTMLElement | null = base
  while (current) {
    if (current === doc.body || current === rootScrollable)
      break
    const style = window.getComputedStyle(current)
    if (hasOverflowScrollStyle(style) && isActuallyScrollableElement(current))
      return current
    current = current.parentElement
  }
  return null
}
const instanceMsgId = props.customId
  ? `renderer-${props.customId}`
  : `renderer-${Date.now()}-${Math.random().toString(36).slice(2)}`
const defaultMd = getMarkdown(instanceMsgId)
const customTagCache = new Map<string, MarkdownIt>()
const customComponentsMap = computed<Partial<CustomComponents>>(() => {
  void customComponentsRevision.value
  return getCustomNodeComponents(props.customId)
})
const effectiveCustomHtmlTags = computed(() => mergeCustomHtmlTags(props.customHtmlTags, props.parseOptions?.customHtmlTags))
const mdBase = computed(() => {
  const { key, tags } = resolveCustomHtmlTags(effectiveCustomHtmlTags.value)
  if (!key)
    return defaultMd
  const cached = customTagCache.get(key)
  if (cached)
    return cached
  const md = getMarkdown(instanceMsgId, { customHtmlTags: tags })
  customTagCache.set(key, md)
  return md
})
const mdInstance = computed(() => {
  const base = mdBase.value
  return props.customMarkdownIt
    ? props.customMarkdownIt(base)
    : base
})

const mergedParseOptions = computed(() => {
  const base = (props.parseOptions ?? {}) as RendererParseOptions
  const resolvedFinal = props.final ?? base.final
  const merged = effectiveCustomHtmlTags.value
  const hasFinal = resolvedFinal != null
  const hasCustom = merged.length > 0

  if (!hasFinal && !hasCustom)
    return base

  return {
    ...base,
    ...(hasFinal ? { final: resolvedFinal } : {}),
    ...(hasCustom ? { customHtmlTags: merged } : {}),
  } as RendererParseOptions
})

// Set of effective custom HTML tags (normalised to lowercase).
// Used in `renderedItems` to coerce pre-parsed html_block/html_inline nodes
// whose tag matches a registered custom component.
const effectiveCustomHtmlTagsSet = computed<Set<string>>(() => {
  const arr = mergedParseOptions.value.customHtmlTags ?? []
  return new Set(arr.map(t => String(t).trim().toLowerCase()).filter(Boolean))
})

const parsedNodes = computed<ParsedNode[]>(() => {
  // 解析 content 字符串为节点数组
  // If the consumer passed an explicit `nodes` array, return a shallow
  // copy so the computed value has a new identity whenever the caller
  // replaces or mutates the array in-place. This ensures the watchers
  // that rely on `parsedNodes` will run and update rendering even when
  // the array length doesn't change.
  if (props.nodes?.length)
    return markRaw((props.nodes as unknown as ParsedNode[]).slice())
  if (props.content) {
    // Prefer an explicitly passed `markdown` prop, then a globally
    // provided markdown via `setGlobalMarkdown`, otherwise fall back
    // to the legacy `getMarkdown()` factory.
    const parseStart = debugPerformanceEnabled.value ? performance.now() : 0
    const parsed = parseMarkdownToStructure(props.content, mdInstance.value, mergedParseOptions.value)
    if (debugPerformanceEnabled.value) {
      logPerf('parse(sync)', {
        ms: Math.round(performance.now() - parseStart),
        nodes: parsed.length,
        contentLength: props.content.length,
      })
    }
    return markRaw(parsed)
  }
  return []
})
const paragraphProbeNode = ref<ParsedNode | null>(null)
const listItemProbeNode = ref<ParsedNode | null>(null)
const listProbeNode = ref<ParsedNode | null>(null)
const headingProbeNodes = ref<Record<number, ParsedNode | null> | null>(null)
const isNestedListItemRenderer = props.indexKey != null && String(props.indexKey).startsWith('list-item-')
const initialHeightExperimentConfig = (!isNestedListItemRenderer && props.customId)
  ? getHeightEstimationExperiment(props.customId)
  : null
const heightExperimentConfig = computed(() => {
  if (!initialHeightExperimentConfig)
    return null
  void heightEstimationExperimentRevision.value
  return getHeightEstimationExperiment(props.customId)
})
const heightExperimentEnabled = computed(() => Boolean(
  isClient
  && props.customId
  && !isNestedListItemRenderer
  && heightExperimentConfig.value?.enabled,
))
const textEstimationEnabled = computed(() => heightExperimentEnabled.value && heightExperimentConfig.value?.textEstimation !== false)
const codeBlockEstimationEnabled = computed(() => heightExperimentEnabled.value && heightExperimentConfig.value?.codeBlockEstimation !== false)
const experimentProbeWidth = computed(() => Math.max(320, experimentContainerWidth.value || containerRef.value?.clientWidth || 640))
const maxLiveNodesResolved = computed(() => Math.max(1, props.maxLiveNodes ?? 320))
const virtualizationEnabled = computed(() => {
  if ((props.maxLiveNodes ?? 0) <= 0)
    return false
  return parsedNodes.value.length > maxLiveNodesResolved.value
})
const shouldMeasureNodeHeights = computed(() => virtualizationEnabled.value || heightExperimentEnabled.value)
// Viewport priority is used to defer heavy work (Monaco/Mermaid/KaTeX) until
// nodes approach the viewport. Node-level deferral is controlled separately
// via `deferNodes`.
const viewportPriorityEnabled = computed(() => {
  if (props.viewportPriority === false)
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
const requestFrame = isClient && typeof window.requestAnimationFrame === 'function'
  ? window.requestAnimationFrame.bind(window)
  : null
const cancelFrame = isClient && typeof window.cancelAnimationFrame === 'function'
  ? window.cancelAnimationFrame.bind(window)
  : null
const processEnv = typeof globalThis !== 'undefined' && 'process' in globalThis
  ? (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
  : undefined
const isTestEnv = processEnv?.NODE_ENV === 'test'
const hasIdleCallback = isClient && typeof window.requestIdleCallback === 'function'
const resolvedBatchSize = computed(() => {
  const size = Math.trunc(props.renderBatchSize ?? 80)
  return Number.isFinite(size) ? Math.max(0, size) : 0
})
const resolvedInitialBatch = computed(() => {
  const initial = Math.trunc(props.initialRenderBatchSize ?? resolvedBatchSize.value)
  if (!Number.isFinite(initial))
    return resolvedBatchSize.value
  return Math.max(0, initial)
})
const batchingEnabled = computed(() => props.batchRendering !== false && resolvedBatchSize.value > 0 && isClient && !isTestEnv)
const renderedCount = ref(0)
const previousRenderContext = ref<{ key: typeof props.indexKey, total: number }>({
  key: props.indexKey,
  total: 0,
})
const adaptiveBatchSize = ref(Math.max(1, resolvedBatchSize.value || 1))
const visibleNodeIndices = ref<Set<number>>(new Set())
const nodeVisibilityHandles = new Map<number, VisibilityHandle>()
const nodeVisibilityWatchStops = new Map<number, () => void>()
const nodeVisibilityFallbackTimers = new Map<number, number>()
const nodeSlotElements = new Map<number, HTMLElement | null>()
const nodeContentResizeObservers = new Map<number, ResizeObserver>()
const codeBlockRenderCache = new WeakMap<object, { signature: string, node: ParsedNode }>()
const nodeSlotVersion = ref(0)
const sortedNodeSlots = computed(() => {
  // Track a manual version so we only rebuild when slots change.
  void nodeSlotVersion.value
  return Array.from(nodeSlotElements.entries()).sort((a, b) => a[0] - b[0])
})
const heightTreeSize = ref(0)
const heightSumTree = ref<number[]>([])
const heightKnownTree = ref<number[]>([])
const scrollRootElement = ref<HTMLElement | null>(null)
const activeRestoreAnchor = ref<{ nodeIndex: number, offsetWithinNodePx: number } | null>(null)
let restoreReconcileRaf: number | null = null
let restoreReconcileTimers: number[] = []
let detachScrollHandler: (() => void) | null = null
let pendingFocusSync: { id: number | ReturnType<typeof setTimeout>, viaTimeout: boolean } | null = null
const deferNodes = computed(() => {
  if (props.deferNodesUntilVisible === false)
    return false
  // In the incremental/batched mode (`maxLiveNodes <= 0`), placeholders are
  // driven by the batch scheduler rather than viewport deferral.
  if ((props.maxLiveNodes ?? 0) <= 0)
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
const incrementalRenderingActive = computed(() => batchingEnabled.value && (props.maxLiveNodes ?? 0) <= 0)
const previousBatchConfig = ref({
  batchSize: resolvedBatchSize.value,
  initial: resolvedInitialBatch.value,
  delay: props.renderBatchDelay ?? 16,
  enabled: incrementalRenderingActive.value,
})
const shouldObserveSlots = computed(() => !!registerNodeVisibility && (deferNodes.value || virtualizationEnabled.value))
const liveNodeBufferResolved = computed(() => Math.max(0, props.liveNodeBuffer ?? 60))
const focusIndex = ref(0)
const liveRange = reactive({ start: 0, end: 0 })
const nodeContentElements = new Map<number, HTMLElement | null>()
const nodeContentDeferredMeasureTimers = new Map<number, number[]>()
const desiredRenderedCount = computed(() => {
  if (!virtualizationEnabled.value)
    return parsedNodes.value.length
  const overscan = liveNodeBufferResolved.value
  const windowEnd = Math.max(liveRange.end + overscan, resolvedInitialBatch.value)
  const target = Math.min(parsedNodes.value.length, windowEnd)
  return Math.max(renderedCount.value, target)
})

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

function resolveScrollContainer(node?: HTMLElement | null) {
  const resolved = resolveViewportRoot(node ?? containerRef.value ?? null)
  if (resolved)
    return resolved
  const host = node?.ownerDocument ?? containerRef.value?.ownerDocument ?? (typeof document !== 'undefined' ? document : null)
  return host?.scrollingElement as HTMLElement || host?.documentElement || null
}

function isReverseFlexScrollRoot(root: HTMLElement) {
  if (!isClient)
    return false
  try {
    const style = window.getComputedStyle(root)
    const display = (style.display || '').toLowerCase()
    if (!display.includes('flex'))
      return false
    const dir = (style.flexDirection || '').toLowerCase()
    return dir.endsWith('reverse')
  }
  catch {
    return false
  }
}

function getNormalizedScrollTop(root: HTMLElement, doc: Document, isViewportRoot: boolean) {
  if (isViewportRoot)
    return (doc?.documentElement?.scrollTop ?? doc?.body?.scrollTop ?? 0)
  const raw = root.scrollTop
  if (!isReverseFlexScrollRoot(root))
    return raw
  const distanceFromBottom = raw < 0 ? -raw : raw
  const max = Math.max(0, (root.scrollHeight ?? 0) - (root.clientHeight ?? 0))
  return max - distanceFromBottom
}

function getOffsetTopWithinRoot(node: HTMLElement, root: HTMLElement) {
  let current: HTMLElement | null = node
  let total = 0
  let guard = 0
  while (current && current !== root && guard++ < 64) {
    total += current.offsetTop || 0
    current = current.offsetParent as HTMLElement | null
  }
  return total
}

function cleanupScrollListener() {
  if (detachScrollHandler) {
    detachScrollHandler()
    detachScrollHandler = null
  }
  scrollRootElement.value = null
}

function setupScrollListener() {
  if (!isClient || !virtualizationEnabled.value)
    return
  const root = resolveScrollContainer()
  if (!root || scrollRootElement.value === root)
    return
  cleanupScrollListener()
  const handler = () => scheduleFocusSync()
  root.addEventListener('scroll', handler, { passive: true })
  scrollRootElement.value = root
  detachScrollHandler = () => {
    root.removeEventListener('scroll', handler)
  }
}

function cancelScheduledFocusSync() {
  if (!pendingFocusSync)
    return
  const win = containerRef.value?.ownerDocument?.defaultView ?? (typeof window !== 'undefined' ? window : null)
  if (pendingFocusSync.viaTimeout)
    win ? win.clearTimeout(pendingFocusSync.id as number) : clearTimeout(pendingFocusSync.id as ReturnType<typeof setTimeout>)
  else
    cancelFrame?.(pendingFocusSync.id as number)
  pendingFocusSync = null
}

function scheduleFocusSync(options: { immediate?: boolean } = {}) {
  if (!virtualizationEnabled.value)
    return
  if (!isClient) {
    syncFocusToScroll(true)
    return
  }
  if (options.immediate) {
    cancelScheduledFocusSync()
    syncFocusToScroll(true)
    return
  }
  if (pendingFocusSync)
    return
  const run = () => {
    pendingFocusSync = null
    syncFocusToScroll()
  }
  if (requestFrame) {
    pendingFocusSync = { id: requestFrame(run), viaTimeout: false }
  }
  else {
    const win = containerRef.value?.ownerDocument?.defaultView ?? (typeof window !== 'undefined' ? window : null)
    const timeoutId = win ? win.setTimeout(run, 16) : setTimeout(run, 16)
    pendingFocusSync = { id: timeoutId, viaTimeout: true }
  }
}

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
    const viewportHeight = root.clientHeight || 0
    const raw = root.scrollTop
    // Some browsers report negative scrollTop with `flex-direction: column-reverse`.
    const distanceFromBottom = raw < 0 ? -raw : raw
    const offsetFromBottom = Math.max(0, distanceFromBottom) + Math.max(0, viewportHeight) * 0.5
    const estimated = estimateIndexForOffsetFromEnd(offsetFromBottom)
    const next = clamp(estimated, 0, Math.max(0, total - 1))
    if (force || Math.abs(next - focusIndex.value) > 1)
      focusIndex.value = next
    return
  }

  const rootRect = !isViewportRoot ? root.getBoundingClientRect() : null
  const viewportTop = isViewportRoot ? 0 : rootRect!.top
  const viewportBottom = isViewportRoot
    ? (view?.innerHeight ?? root.clientHeight ?? 0)
    : rootRect!.bottom
  const entries = sortedNodeSlots.value
  let firstVisible: number | null = null
  let lastVisible: number | null = null
  for (const [index, el] of entries) {
    if (!el)
      continue
    const rect = el.getBoundingClientRect()
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
    const rootRect = isViewportRoot ? { top: 0 } : root.getBoundingClientRect()
    const rootScrollTop = getNormalizedScrollTop(root, doc, isViewportRoot)
    const relativeScrollTop = isViewportRoot
      ? (() => {
          // For viewport scrolling, estimate how far we've scrolled into the
          // container by its visual position (negative top means we've scrolled
          // past it).
          const containerRect = container.getBoundingClientRect()
          const rel = (isViewportRoot ? 0 : rootRect.top) - containerRect.top
          return Math.max(0, rel)
        })()
      : (() => {
          const offsetTop = getOffsetTopWithinRoot(container, root)
          return Math.max(0, rootScrollTop - offsetTop)
        })()
    const viewportHeight = isViewportRoot
      ? (view?.innerHeight ?? doc?.documentElement?.clientHeight ?? root.clientHeight ?? 0)
      : root.clientHeight
    const targetOffset = relativeScrollTop + Math.max(0, viewportHeight) * 0.5
    const estimated = estimateIndexForOffset(targetOffset)
    focusIndex.value = clamp(estimated, 0, Math.max(0, parsedNodes.value.length - 1))
    return
  }
  const midpoint = Math.round((firstVisible + lastVisible) / 2)
  if (!force && Math.abs(midpoint - focusIndex.value) <= 1)
    return
  focusIndex.value = clamp(midpoint, 0, Math.max(0, parsedNodes.value.length - 1))
}
function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
function updateLiveRange() {
  const total = parsedNodes.value.length
  if (!virtualizationEnabled.value || total === 0) {
    liveRange.start = 0
    liveRange.end = total
    return
  }
  const windowSize = Math.min(maxLiveNodesResolved.value, total)
  const buffer = liveNodeBufferResolved.value
  const desiredStart = clamp(focusIndex.value - buffer, 0, Math.max(0, total - windowSize))
  liveRange.start = desiredStart
  liveRange.end = Math.min(total, desiredStart + windowSize)
}

const nodeHeights = reactive<Record<number, number>>({})
const heightStats = reactive({ total: 0, count: 0 })

function resetHeightMeasurements() {
  for (const key of Object.keys(nodeHeights))
    delete nodeHeights[Number(key)]
  heightStats.total = 0
  heightStats.count = 0
  heightTreeSize.value = 0
  heightSumTree.value = []
  heightKnownTree.value = []
}

function pruneHeightMeasurements(size: number) {
  if (size <= 0) {
    resetHeightMeasurements()
    return
  }

  let total = 0
  let count = 0
  for (const [rawIndex, rawHeight] of Object.entries(nodeHeights)) {
    const index = Number(rawIndex)
    const height = Number(rawHeight)
    if (!Number.isFinite(index) || index < 0 || index >= size || !Number.isFinite(height) || height <= 0) {
      delete nodeHeights[index]
      continue
    }
    total += height
    count++
  }
  heightStats.total = total
  heightStats.count = count
}

function fenwickUpdate(tree: number[], index: number, delta: number) {
  for (let i = index + 1; i < tree.length; i += i & -i)
    tree[i] += delta
}

function fenwickQuery(tree: number[], index: number) {
  let sum = 0
  for (let i = index + 1; i > 0; i -= i & -i)
    sum += tree[i]
  return sum
}

function fenwickRangeSum(tree: number[], start: number, end: number) {
  if (end <= start)
    return 0
  const endSum = fenwickQuery(tree, end - 1)
  if (start <= 0)
    return endSum
  return endSum - fenwickQuery(tree, start - 1)
}

function rebuildHeightTrees(size: number) {
  heightTreeSize.value = size
  const sumTree = new Array(size + 1).fill(0)
  const countTree = new Array(size + 1).fill(0)
  for (const [rawIndex, rawHeight] of Object.entries(nodeHeights)) {
    const index = Number(rawIndex)
    const height = Number(rawHeight)
    if (!Number.isFinite(index) || index < 0 || index >= size)
      continue
    if (!Number.isFinite(height) || height <= 0)
      continue
    fenwickUpdate(sumTree, index, height)
    fenwickUpdate(countTree, index, 1)
  }
  heightSumTree.value = sumTree
  heightKnownTree.value = countTree
}

function recordNodeHeight(index: number, height: number) {
  if (!Number.isFinite(height) || height <= 0)
    return
  const previous = nodeHeights[index]
  nodeHeights[index] = height
  if (previous) {
    heightStats.total += height - previous
  }
  else {
    heightStats.total += height
    heightStats.count++
  }
  if (heightTreeSize.value > index) {
    const sumTree = heightSumTree.value
    const countTree = heightKnownTree.value
    if (sumTree.length && countTree.length) {
      if (previous) {
        const delta = height - previous
        if (delta !== 0)
          fenwickUpdate(sumTree, index, delta)
      }
      else {
        fenwickUpdate(sumTree, index, height)
        fenwickUpdate(countTree, index, 1)
      }
    }
  }
  if (activeRestoreAnchor.value)
    scheduleRestoreReconcile()
}

const averageNodeHeight = computed(() => {
  return heightStats.count > 0 ? Math.max(12, heightStats.total / heightStats.count) : 32
})

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
  if (!heightExperimentEnabled.value || typeof window === 'undefined') {
    simpleTextProbeProfile.value = createEmptySimpleTextProbeProfile()
    return
  }

  const nextProfile = createEmptySimpleTextProbeProfile()
  const paragraphRoot = getProbeRoot(paragraphProbeWrapperRef.value)
  const paragraphTextEl = getProbeElement(paragraphRoot, '.paragraph-node')
  nextProfile.paragraph = buildBlockTextProfile(paragraphProbeWrapperRef.value, paragraphTextEl, 'pre-wrap')

  const listItemRoot = getProbeRoot(listItemProbeWrapperRef.value)
  const listItemTextEl = listItemRoot?.querySelector('.paragraph-node') as HTMLElement | null
  nextProfile.listItem = buildBlockTextProfile(listItemProbeWrapperRef.value, listItemTextEl, 'pre-wrap')

  const listHeight = listProbeWrapperRef.value?.offsetHeight ?? 0
  const listItemHeight = listItemProbeWrapperRef.value?.offsetHeight ?? 0
  nextProfile.listWrapperOverhead = Math.max(0, listHeight - listItemHeight)

  for (let level = 1; level <= 6; level++) {
    const headingRoot = getProbeRoot(headingProbeWrapperRefs[level])
    const headingTextEl = getProbeElement(headingRoot, `h${level}`)
    nextProfile.headings[level] = buildBlockTextProfile(headingProbeWrapperRefs[level], headingTextEl, 'pre-wrap')
  }

  simpleTextProbeProfile.value = nextProfile
}

function updateExperimentContainerWidth() {
  if (!heightExperimentEnabled.value) {
    experimentContainerWidth.value = 0
    return
  }
  const width = containerRef.value?.clientWidth ?? 0
  experimentContainerWidth.value = width > 0 ? width : 0
}

let experimentResizeObserver: ResizeObserver | null = null

function cleanupExperimentResizeObserver() {
  experimentResizeObserver?.disconnect()
  experimentResizeObserver = null
}

function setupExperimentResizeObserver() {
  cleanupExperimentResizeObserver()
  if (!heightExperimentEnabled.value || !containerRef.value || typeof ResizeObserver === 'undefined')
    return
  experimentResizeObserver = new ResizeObserver(() => {
    updateExperimentContainerWidth()
    if (activeRestoreAnchor.value)
      scheduleRestoreReconcile()
  })
  experimentResizeObserver.observe(containerRef.value)
}

// 异步按需加载 CodeBlock 组件；失败时退回为 InlineCodeNode（内联代码渲染）
const CodeBlockNodeAsync = defineAsyncComponent(async () => {
  try {
    const mod = await import('../../components/CodeBlockNode/CodeBlockNode.vue')
    return mod.default
  }
  catch (e) {
    console.warn(
      '[markstream-vue] Optional peer dependencies for CodeBlockNode are missing. Falling back to inline-code rendering (no Monaco). To enable full code block features, please install "stream-monaco".',
      e,
    )
    return PreCodeNode
  }
})

const codeBlockComponent = computed(() => props.renderCodeBlocksAsPre ? PreCodeNode : CodeBlockNodeAsync)

function resolveCodeBlockRendererKind(node: ParsedNode) {
  if (node.type !== 'code_block')
    return null
  const component = getNodeComponent(node, getCodeBlockLanguage(node))
  if (component === MarkdownCodeBlockNode)
    return 'markdown'
  if (component === PreCodeNode)
    return 'pre'
  if (component === codeBlockComponent.value || component === CodeBlockNodeAsync)
    return 'monaco'
  return null
}

function resolveCodeBlockShowHeader() {
  const showHeader = props.codeBlockProps?.showHeader
  return showHeader !== false
}

const estimatedNodeHeights = computed(() => {
  const nodes = parsedNodes.value
  if (!nodes.length || !heightExperimentEnabled.value)
    return nodes.map(() => null)

  const width = experimentContainerWidth.value || containerRef.value?.clientWidth || 0
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
      if (rendererKind === 'monaco' || rendererKind === 'markdown') {
        return estimateCodeBlockHeight(node, {
          rendererKind,
          monacoOptions: props.codeBlockMonacoOptions,
          showHeader: resolveCodeBlockShowHeader(),
        })
      }
    }

    return null
  })
})

function getFallbackNodeHeight(index: number) {
  return nodeHeights[index] ?? estimatedNodeHeights.value[index]?.height ?? averageNodeHeight.value
}

function getRelativeScrollTopWithinContainer() {
  const root = scrollRootElement.value || resolveScrollContainer()
  const container = containerRef.value
  if (!root || !container)
    return null
  const doc = root.ownerDocument || container.ownerDocument || document
  const isViewportRoot = root === doc.documentElement || root === doc.body || root === doc.scrollingElement
  if (isViewportRoot) {
    const containerRect = container.getBoundingClientRect()
    return Math.max(0, -containerRect.top)
  }
  return Math.max(0, getNormalizedScrollTop(root, doc, false) - getOffsetTopWithinRoot(container, root))
}

function setRelativeScrollTopWithinContainer(target: number) {
  const root = scrollRootElement.value || resolveScrollContainer()
  const container = containerRef.value
  if (!root || !container)
    return
  const next = Math.max(0, target)
  const doc = root.ownerDocument || container.ownerDocument || document
  const view = doc.defaultView || (typeof window !== 'undefined' ? window : null)
  const isViewportRoot = root === doc.documentElement || root === doc.body || root === doc.scrollingElement
  if (isViewportRoot) {
    const current = getNormalizedScrollTop(root, doc, true)
    const containerDocTop = current + container.getBoundingClientRect().top
    view?.scrollTo?.(0, Math.max(0, containerDocTop + next))
    return
  }
  root.scrollTop = getOffsetTopWithinRoot(container, root) + next
}

function resolveAnchorOffset(anchor: { nodeIndex: number, offsetWithinNodePx: number }) {
  const boundedIndex = clamp(anchor.nodeIndex, 0, Math.max(0, parsedNodes.value.length - 1))
  return estimateHeightRange(0, boundedIndex) + Math.max(0, anchor.offsetWithinNodePx)
}

function clearRestoreReconcile() {
  if (restoreReconcileRaf != null) {
    cancelFrame?.(restoreReconcileRaf)
    restoreReconcileRaf = null
  }
  if (isClient) {
    for (const timer of restoreReconcileTimers)
      window.clearTimeout(timer)
  }
  restoreReconcileTimers = []
}

function applyRestoreAnchor(anchor: { nodeIndex: number, offsetWithinNodePx: number }) {
  setRelativeScrollTopWithinContainer(resolveAnchorOffset(anchor))
}

function scheduleRestoreReconcile() {
  if (!activeRestoreAnchor.value || !isClient)
    return
  if (restoreReconcileRaf != null)
    return
  restoreReconcileRaf = requestFrame
    ? requestFrame(() => {
        restoreReconcileRaf = null
        if (activeRestoreAnchor.value)
          applyRestoreAnchor(activeRestoreAnchor.value)
      })
    : null
  if (restoreReconcileRaf == null && activeRestoreAnchor.value)
    applyRestoreAnchor(activeRestoreAnchor.value)
}

function captureRestoreAnchor() {
  const relativeScrollTop = getRelativeScrollTopWithinContainer()
  const total = parsedNodes.value.length
  if (relativeScrollTop == null || total <= 0)
    return null
  const nodeIndex = clamp(estimateIndexForOffset(relativeScrollTop + 1), 0, total - 1)
  const nodeStart = estimateHeightRange(0, nodeIndex)
  const nodeHeight = getFallbackNodeHeight(nodeIndex)
  return {
    nodeIndex,
    offsetWithinNodePx: clamp(relativeScrollTop - nodeStart, 0, Math.max(0, nodeHeight - 1)),
  }
}

function restoreAnchor(anchor: { nodeIndex: number, offsetWithinNodePx: number }) {
  activeRestoreAnchor.value = {
    nodeIndex: clamp(anchor.nodeIndex, 0, Math.max(0, parsedNodes.value.length - 1)),
    offsetWithinNodePx: Math.max(0, anchor.offsetWithinNodePx),
  }
  clearRestoreReconcile()
  applyRestoreAnchor(activeRestoreAnchor.value)
  if (!isClient)
    return
  for (const delay of [0, 120, 280, 480]) {
    restoreReconcileTimers.push(window.setTimeout(() => {
      if (activeRestoreAnchor.value)
        applyRestoreAnchor(activeRestoreAnchor.value)
    }, delay))
  }
}

function getAnchorDrift(anchor: { nodeIndex: number, offsetWithinNodePx: number }) {
  const relativeScrollTop = getRelativeScrollTopWithinContainer()
  if (relativeScrollTop == null)
    return null
  return relativeScrollTop - resolveAnchorOffset(anchor)
}

watch(
  () => parsedNodes.value.length,
  (length) => {
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
  if (heightExperimentEnabled.value) {
    let total = 0
    for (let i = start; i < end; i++)
      total += getFallbackNodeHeight(i)
    return total
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

function buildExperimentReport() {
  const nodes = parsedNodes.value
  return {
    totalNodes: nodes.length,
    measuredCount: heightStats.count,
    estimatedCount: estimatedNodeHeights.value.filter(Boolean).length,
    averageNodeHeight: averageNodeHeight.value,
    topSpacerHeight: topSpacerHeight.value,
    bottomSpacerHeight: bottomSpacerHeight.value,
    estimatedTotalHeight: estimateHeightRange(0, nodes.length),
    width: experimentContainerWidth.value || containerRef.value?.clientWidth || 0,
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

function estimateIndexForOffset(offsetPx: number) {
  if (offsetPx <= 0)
    return 0
  const nodes = parsedNodes.value
  if (heightExperimentEnabled.value) {
    let remaining = offsetPx
    for (let i = 0; i < nodes.length; i++) {
      const height = getFallbackNodeHeight(i)
      if (remaining <= height)
        return i
      remaining -= height
    }
    return Math.max(0, nodes.length - 1)
  }
  if (heightTreeSize.value === nodes.length && heightSumTree.value.length && heightKnownTree.value.length) {
    const avg = averageNodeHeight.value
    const sumTree = heightSumTree.value
    const countTree = heightKnownTree.value
    const prefix = (endExclusive: number) => {
      if (endExclusive <= 0)
        return 0
      const sumKnown = fenwickQuery(sumTree, endExclusive - 1)
      const countKnown = fenwickQuery(countTree, endExclusive - 1)
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
  if (heightExperimentEnabled.value) {
    let remaining = offsetPx
    for (let i = nodes.length - 1; i >= 0; i--) {
      const height = getFallbackNodeHeight(i)
      if (remaining <= height)
        return i
      remaining -= height
    }
    return 0
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

function setNodeVisibleState(index: number, visible: boolean) {
  const current = visibleNodeIndices.value
  const hasIndex = current.has(index)
  if (visible) {
    if (hasIndex)
      return
    const next = new Set(current)
    next.add(index)
    visibleNodeIndices.value = next
    return
  }
  if (!hasIndex)
    return
  const next = new Set(current)
  next.delete(index)
  visibleNodeIndices.value = next
}

function resetNodeVisibleState() {
  if (visibleNodeIndices.value.size === 0)
    return
  visibleNodeIndices.value = new Set()
}

function cleanupNodeVisibility(maxIndex: number) {
  if (!nodeVisibilityHandles.size)
    return
  // When virtualization is disabled the DOM retains every slot, so keep
  // observers intact; they will be cleaned up when the slot unmounts.
  if (!virtualizationEnabled.value)
    return
  let slotsChanged = false
  for (const [index, handle] of nodeVisibilityHandles) {
    if (index >= maxIndex) {
      handle.destroy()
      nodeVisibilityHandles.delete(index)
      if (deferNodes.value)
        setNodeVisibleState(index, false)
      clearVisibilityFallback(index)
      if (nodeSlotElements.delete(index))
        slotsChanged = true
    }
  }
  if (slotsChanged)
    bumpNodeSlotVersion()
}

function markNodeVisible(index: number, visible: boolean) {
  if (deferNodes.value)
    setNodeVisibleState(index, visible)
  if (visible) {
    if (virtualizationEnabled.value)
      scheduleFocusSync()
    else
      focusIndex.value = clamp(index, 0, Math.max(0, parsedNodes.value.length - 1))
  }
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

function setNodeContentRef(index: number, el: HTMLElement | null) {
  const previousTimers = nodeContentDeferredMeasureTimers.get(index)
  if (previousTimers) {
    for (const id of previousTimers)
      window.clearTimeout(id)
    nodeContentDeferredMeasureTimers.delete(index)
  }
  const previousObserver = nodeContentResizeObservers.get(index)
  if (previousObserver) {
    previousObserver.disconnect()
    nodeContentResizeObservers.delete(index)
  }
  if (!el || !shouldMeasureNodeHeights.value) {
    nodeContentElements.delete(index)
    return
  }
  nodeContentElements.set(index, el)
  const measure = () => {
    recordNodeHeight(index, el.offsetHeight)
  }
  queueMicrotask(measure)
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      measure()
    })
    observer.observe(el)
    nodeContentResizeObservers.set(index, observer)
  }
  if (parsedNodes.value[index]?.type === 'code_block' && typeof window !== 'undefined') {
    nodeContentDeferredMeasureTimers.set(index, [
      window.setTimeout(measure, 16),
      window.setTimeout(measure, 80),
      window.setTimeout(measure, 240),
      window.setTimeout(measure, 800),
    ])
  }
}

watch(
  () => shouldMeasureNodeHeights.value,
  (enabled) => {
    if (enabled)
      return
    for (const observer of nodeContentResizeObservers.values())
      observer.disconnect()
    nodeContentResizeObservers.clear()
    for (const timers of nodeContentDeferredMeasureTimers.values()) {
      for (const id of timers)
        window.clearTimeout(id)
    }
    nodeContentDeferredMeasureTimers.clear()
  },
  { immediate: true },
)

let batchRaf: number | null = null
let batchTimeout: number | null = null
let batchPending = false
let pendingIncrement: number | null = null
let batchIdle: number | null = null
const VIEWPORT_FALLBACK_DELAY = 1800
const VIEWPORT_FALLBACK_MARGIN_PX = 500

function cancelBatchTimers() {
  if (!isClient)
    return
  if (batchRaf != null) {
    cancelFrame?.(batchRaf)
    batchRaf = null
  }
  if (batchTimeout != null) {
    window.clearTimeout(batchTimeout)
    batchTimeout = null
  }
  if (batchIdle != null && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(batchIdle)
    batchIdle = null
  }
  batchPending = false
  pendingIncrement = null
}

function clearVisibilityFallback(index: number) {
  if (!isClient)
    return
  const timer = nodeVisibilityFallbackTimers.get(index)
  if (timer != null) {
    window.clearTimeout(timer)
    nodeVisibilityFallbackTimers.delete(index)
  }
}

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
    const rootRect = !isViewportRoot && root ? root.getBoundingClientRect() : null
    const viewportTop = isViewportRoot ? 0 : rootRect!.top
    const viewportBottom = isViewportRoot
      ? (view.innerHeight ?? root?.clientHeight ?? 0)
      : rootRect!.bottom
    const rect = el.getBoundingClientRect()
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
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV && typeof console !== 'undefined')
    console.warn('[markstream-vue] viewportPriority auto-disabled:', reason)

  for (const handle of nodeVisibilityHandles.values())
    handle.destroy()
  nodeVisibilityHandles.clear()
  if (isClient) {
    for (const timer of nodeVisibilityFallbackTimers.values())
      window.clearTimeout(timer)
  }
  nodeVisibilityFallbackTimers.clear()
  resetNodeVisibleState()
}

function scheduleBatch(increment: number, opts: { immediate?: boolean } = {}) {
  if (!incrementalRenderingActive.value)
    return
  const target = desiredRenderedCount.value
  if (renderedCount.value >= target)
    return

  const amount = Math.max(1, increment)
  const run = (deadline?: IdleDeadlineLike) => {
    batchRaf = null
    batchTimeout = null
    batchIdle = null
    batchPending = false
    const applied = pendingIncrement != null ? pendingIncrement : amount
    pendingIncrement = null
    const budgetMs = Math.max(2, props.renderBatchBudgetMs ?? 6)

    const applyAndMeasure = (size: number) => {
      const start = typeof performance !== 'undefined' ? performance.now() : Date.now()
      renderedCount.value = Math.min(target, renderedCount.value + Math.max(1, size))
      cleanupNodeVisibility(renderedCount.value)
      const end = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const elapsed = end - start
      adjustAdaptiveBatchSize(elapsed)
      return elapsed
    }

    let nextSize = applied
    while (true) {
      applyAndMeasure(nextSize)
      if (renderedCount.value >= target)
        break
      if (!deadline)
        break
      const remaining = typeof deadline.timeRemaining === 'function'
        ? deadline.timeRemaining()
        : 0
      if (remaining <= budgetMs * 0.5)
        break
      nextSize = Math.max(1, Math.round(adaptiveBatchSize.value))
    }

    if (renderedCount.value < target)
      queueNextBatch()
  }

  if (!isClient || opts.immediate) {
    run()
    return
  }

  const delay = Math.max(0, props.renderBatchDelay ?? 16)
  pendingIncrement = pendingIncrement != null ? Math.max(pendingIncrement, amount) : amount
  if (batchPending)
    return
  batchPending = true

  if (!isTestEnv && hasIdleCallback && window.requestIdleCallback) {
    const timeout = Math.max(0, props.renderBatchIdleTimeoutMs ?? 120)
    batchIdle = window.requestIdleCallback((deadline) => {
      run(deadline)
    }, { timeout })
    return
  }

  if (!requestFrame || isTestEnv) {
    batchTimeout = window.setTimeout(() => run(), delay)
    return
  }
  batchRaf = requestFrame(() => {
    if (delay === 0) {
      run()
      return
    }
    batchTimeout = window.setTimeout(() => run(), delay)
  })
}

function queueNextBatch() {
  if (!incrementalRenderingActive.value)
    return
  const dynamicSize = batchingEnabled.value
    ? Math.max(1, Math.round(adaptiveBatchSize.value))
    : Math.max(1, resolvedBatchSize.value)
  scheduleBatch(dynamicSize)
}

function adjustAdaptiveBatchSize(elapsed: number) {
  if (!incrementalRenderingActive.value)
    return
  const budget = Math.max(2, props.renderBatchBudgetMs ?? 6)
  const maxSize = Math.max(1, resolvedBatchSize.value || 1)
  const minSize = Math.max(1, Math.floor(maxSize / 4))
  if (elapsed > budget * 1.2) {
    adaptiveBatchSize.value = Math.max(minSize, Math.floor(adaptiveBatchSize.value * 0.7))
  }
  else if (elapsed < budget * 0.5 && adaptiveBatchSize.value < maxSize) {
    adaptiveBatchSize.value = Math.min(maxSize, Math.ceil(adaptiveBatchSize.value * 1.2))
  }
}

watch(
  [
    () => parsedNodes.value,
    () => parsedNodes.value.length,
    () => incrementalRenderingActive.value,
    () => resolvedBatchSize.value,
    () => resolvedInitialBatch.value,
    () => props.renderBatchDelay,
    () => props.indexKey,
  ],
  () => {
    const nodes = parsedNodes.value
    const total = nodes.length
    const prevCtx = previousRenderContext.value
    const datasetKey = props.indexKey
    const datasetKeyChanged = datasetKey !== undefined && datasetKey !== prevCtx.key
    const lengthChanged = total !== prevCtx.total
    const datasetChanged = datasetKeyChanged || lengthChanged
    previousRenderContext.value = { key: datasetKey, total }

    const prevBatch = previousBatchConfig.value
    const currentDelay = props.renderBatchDelay ?? 16
    const batchConfigChanged
      = prevBatch.batchSize !== resolvedBatchSize.value
        || prevBatch.initial !== resolvedInitialBatch.value
        || prevBatch.delay !== currentDelay
        || prevBatch.enabled !== incrementalRenderingActive.value

    previousBatchConfig.value = {
      batchSize: resolvedBatchSize.value,
      initial: resolvedInitialBatch.value,
      delay: currentDelay,
      enabled: incrementalRenderingActive.value,
    }

    if (datasetKeyChanged) {
      resetHeightMeasurements()
      if (total > 0)
        rebuildHeightTrees(total)
    }
    if (datasetChanged || batchConfigChanged || !incrementalRenderingActive.value)
      cancelBatchTimers()
    if (datasetChanged || batchConfigChanged)
      adaptiveBatchSize.value = Math.max(1, resolvedBatchSize.value || 1)
    if (datasetChanged && virtualizationEnabled.value)
      scheduleFocusSync({ immediate: true })

    const targetCount = desiredRenderedCount.value

    if (!total) {
      renderedCount.value = 0
      cleanupNodeVisibility(0)
      return
    }

    if (!incrementalRenderingActive.value) {
      renderedCount.value = targetCount
      cleanupNodeVisibility(renderedCount.value)
      return
    }

    const shouldResetRenderedCount = datasetKeyChanged || prevCtx.total === 0

    if (shouldResetRenderedCount || batchConfigChanged)
      renderedCount.value = Math.min(targetCount, resolvedInitialBatch.value)
    else
      renderedCount.value = Math.min(renderedCount.value, targetCount)

    const baseInitial = Math.max(1, resolvedInitialBatch.value || resolvedBatchSize.value || total)
    if (renderedCount.value < targetCount)
      scheduleBatch(baseInitial, { immediate: !isClient })
    else
      cleanupNodeVisibility(renderedCount.value)
  },
  { immediate: true },
)

watch(
  () => virtualizationEnabled.value,
  (enabled) => {
    if (!enabled) {
      cleanupScrollListener()
      cancelScheduledFocusSync()
      return
    }
    setupScrollListener()
    scheduleFocusSync({ immediate: true })
  },
  { immediate: true },
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
  () => containerRef.value,
  () => {
    if (!virtualizationEnabled.value)
      return
    setupScrollListener()
    scheduleFocusSync({ immediate: true })
  },
)

watch(
  heightExperimentEnabled,
  (enabled) => {
    if (!enabled)
      return
    ensureExperimentProbeNodes()
  },
  { immediate: true },
)

watch(
  [() => containerRef.value, heightExperimentEnabled],
  () => {
    if (!heightExperimentEnabled.value) {
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
  [heightExperimentEnabled, experimentProbeWidth],
  async () => {
    if (!heightExperimentEnabled.value) {
      simpleTextProbeProfile.value = createEmptySimpleTextProbeProfile()
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
  [heightExperimentEnabled, experimentContainerWidth],
  () => {
    if (virtualizationEnabled.value)
      scheduleFocusSync({ immediate: true })
    if (activeRestoreAnchor.value)
      scheduleRestoreReconcile()
  },
  { immediate: false },
)

watch(
  () => deferNodes.value,
  (enabled) => {
    if (!enabled) {
      for (const handle of nodeVisibilityHandles.values())
        handle.destroy()
      nodeVisibilityHandles.clear()
      for (const index of Array.from(nodeVisibilityFallbackTimers.keys()))
        clearVisibilityFallback(index)
      resetNodeVisibleState()
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
  [() => props.viewportPriority, () => parsedNodes.value.length],
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
  () => desiredRenderedCount.value,
  (target, prev) => {
    if (!incrementalRenderingActive.value)
      return
    if (typeof prev === 'number' && target <= prev)
      return
    if (target > renderedCount.value)
      queueNextBatch()
  },
)

watch(
  [() => props.customId],
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
  cancelBatchTimers()
  for (const handle of nodeVisibilityHandles.values())
    handle.destroy()
  nodeVisibilityHandles.clear()
  for (const observer of nodeContentResizeObservers.values())
    observer.disconnect()
  nodeContentResizeObservers.clear()
  for (const timers of nodeContentDeferredMeasureTimers.values()) {
    for (const id of timers)
      window.clearTimeout(id)
  }
  nodeContentDeferredMeasureTimers.clear()
  for (const stopWatchingVisibility of nodeVisibilityWatchStops.values())
    stopWatchingVisibility()
  nodeVisibilityWatchStops.clear()
  for (const index of Array.from(nodeVisibilityFallbackTimers.keys()))
    clearVisibilityFallback(index)
  cleanupExperimentResizeObserver()
  clearRestoreReconcile()
  cleanupScrollListener()
  cancelScheduledFocusSync()
})

const MermaidBlockNodeAsync = defineAsyncComponent(async () => {
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
})

const InfographicBlockNodeAsync = defineAsyncComponent(async () => {
  try {
    const mod = await import('../../components/InfographicBlockNode')
    return mod.default
  }
  catch (e) {
    console.warn(
      '[markstream-vue] Optional peer dependencies for InfographicBlockNode are missing. Falling back to preformatted code rendering. To enable Infographic rendering, please install "@antv/infographic".',
      e,
    )
    return PreCodeNode
  }
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
const indexPrefix = computed(() => (props.indexKey != null ? String(props.indexKey) : 'markdown-renderer'))
const codeBlockBindings = computed(() => ({
  // streaming behavior control for CodeBlockNode
  stream: props.codeBlockStream,
  darkTheme: props.codeBlockDarkTheme,
  lightTheme: props.codeBlockLightTheme,
  monacoOptions: props.codeBlockMonacoOptions,
  themes: props.themes,
  minWidth: props.codeBlockMinWidth,
  maxWidth: props.codeBlockMaxWidth,
  ...(typeof resolvedShowTooltips.value === 'boolean' ? { showTooltips: resolvedShowTooltips.value } : {}),
  ...(props.codeBlockProps || {}),
}))
const mermaidBindings = computed(() => ({
  ...(props.mermaidProps || {}),
}))
const d2Bindings = computed(() => ({
  ...(props.d2Props || {}),
}))
const infographicBindings = computed(() => ({
  ...(props.infographicProps || {}),
}))
const nonCodeBindings = computed(() => ({
  // Forward `typewriter` flag to non-code node components so they can
  // opt in/out of enter transitions or other typewriter-like behaviour.
  typewriter: props.typewriter,
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

    let bindings = { ...getBindingsFor(node, language) } as Record<string, unknown>
    const estimatedHeight = estimatedNodeHeights.value[item.index]
    if (node.type === 'code_block' && estimatedHeight?.kind === 'code-block') {
      bindings = {
        ...bindings,
        estimatedHeightPx: estimatedHeight.height,
        estimatedContentHeightPx: estimatedHeight.contentHeight,
      }
    }

    return {
      ...item,
      node,
      component,
      bindings,
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

function getBindingsFor(node: ParsedNode, language?: string) {
  const lang = language ?? getCodeBlockLanguage(node)
  if (lang === 'mermaid')
    return mermaidBindings.value

  if (lang === 'infographic')
    return infographicBindings.value

  if (lang === 'd2' || lang === 'd2lang')
    return d2Bindings.value

  if (node.type === 'link')
    return linkBindings.value

  if (node.type === 'list')
    return listBindings.value

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
</script>

<template>
  <div
    ref="containerRef"
    class="markstream-vue markdown-renderer"
    :class="[{ dark: props.isDark }, { virtualized: virtualizationEnabled }]"
    :data-custom-id="props.customId"
    @click="handleContainerClick"
    @mouseover="handleContainerMouseover"
    @mouseout="handleContainerMouseout"
  >
    <template v-if="heightExperimentEnabled || virtualizationEnabled">
      <div
        v-if="heightExperimentEnabled"
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
            v-if="!item.isCodeBlock && props.typewriter !== false"
            name="typewriter"
            appear
          >
            <component
              :is="item.component"
              :node="item.node"
              :loading="item.node.loading"
              :index-key="item.indexKey"
              v-bind="item.bindings"
              :custom-id="props.customId"
              :is-dark="props.isDark"
              @copy="emit('copy', $event)"
              @handle-artifact-click="emit('handleArtifactClick', $event)"
            />
          </transition>

          <component
            :is="item.component"
            v-else
            :node="item.node"
            :loading="item.node.loading"
            :index-key="item.indexKey"
            v-bind="item.bindings"
            :custom-id="props.customId"
            :is-dark="props.isDark"
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

.markdown-renderer.virtualized {
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

.node-placeholder {
  width: 100%;
  min-height: 1rem;
  margin: 0.25rem 0;
  border-radius: 0.5rem;
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
  margin: 1rem 0;
}
</style>

<style>
/* Global (unscoped) CSS for TransitionGroup enter animations */
.markstream-vue .typewriter-enter-from {
  opacity: 0;
}
.markstream-vue .typewriter-enter-active {
  transition: opacity var(--typewriter-fade-duration, 900ms)
    var(--typewriter-fade-ease, ease-out);
  will-change: opacity;
}
.markstream-vue .typewriter-enter-to {
  opacity: 1;
}
</style>
