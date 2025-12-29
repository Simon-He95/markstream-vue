<script setup lang="ts">
import type { BaseNode, MarkdownIt, ParsedNode, ParseOptions } from 'stream-markdown-parser'
import type { VisibilityHandle } from '../../composables/viewportPriority'
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { computed, defineAsyncComponent, markRaw, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
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
import { getCustomNodeComponents } from '../../utils/nodeComponents'
import HtmlBlockNode from '../HtmlBlockNode/HtmlBlockNode.vue'
import HtmlInlineNode from '../HtmlInlineNode/HtmlInlineNode.vue'
import { MathBlockNodeAsync, MathInlineNodeAsync } from './asyncComponent'
import FallbackComponent from './FallbackComponent.vue'

// 组件接收的 props
// 增加用于统一设置所有 code_block 主题和 Monaco 选项的外部 API
interface IdleDeadlineLike {
  timeRemaining?: () => number
}

// Exported props interface so declaration generators can include prop types
export interface NodeRendererProps {
  content?: string
  nodes?: BaseNode[]
  /**
   * Whether the input stream is complete (end-of-stream). When true, the parser
   * will stop emitting streaming "loading" nodes for unfinished constructs.
   */
  final?: boolean
  /** Options forwarded to parseMarkdownToStructure when content is provided */
  parseOptions?: ParseOptions
  customMarkdownIt?: (md: MarkdownIt) => MarkdownIt
  /** Log parse/render timing and virtualization stats (dev only) */
  debugPerformance?: boolean
  /**
   * Custom HTML-like tags that participate in streaming mid‑state handling
   * and are emitted as custom nodes (e.g. ['thinking']). Forwarded to `getMarkdown()`.
   */
  customHtmlTags?: readonly string[]
  /** Enable priority rendering for visible viewport area */
  viewportPriority?: boolean
  /**
   * Whether code_block renders should stream updates.
   * When false, code blocks stay in a loading state and render once when final content is ready.
   * Default: true
   */
  codeBlockStream?: boolean
  // 全局传递到每个 CodeBlockNode 的主题（monaco theme 对象）
  codeBlockDarkTheme?: any
  codeBlockLightTheme?: any
  // 传递给 CodeBlockNode 的 monacoOptions（比如 fontSize, MAX_HEIGHT 等）
  codeBlockMonacoOptions?: Record<string, any>
  /** If true, render all `code_block` nodes as plain <pre><code> blocks instead of the full CodeBlockNode */
  renderCodeBlocksAsPre?: boolean
  /** Minimum width forwarded to CodeBlockNode (px or CSS unit) */
  codeBlockMinWidth?: string | number
  /** Maximum width forwarded to CodeBlockNode (px or CSS unit) */
  codeBlockMaxWidth?: string | number
  /** Arbitrary props to forward to every CodeBlockNode */
  codeBlockProps?: Record<string, any>
  themes?: string[]
  isDark?: boolean
  customId?: string
  indexKey?: number | string
  /** Enable/disable the non-code-node enter transition (typewriter). Default: true */
  typewriter?: boolean
  /** Enable incremental/batched rendering of nodes to avoid large single flush costs. Default: true */
  batchRendering?: boolean
  /** How many nodes to render immediately before batching kicks in. Default: 40 */
  initialRenderBatchSize?: number
  /** How many additional nodes to render per batch tick. Default: 80 */
  renderBatchSize?: number
  /** Extra delay (ms) before each batch after rAF; helps yield to input. Default: 16 */
  renderBatchDelay?: number
  /** Target budget (ms) for each batch before we shrink subsequent batch sizes. Default: 6 */
  renderBatchBudgetMs?: number
  /** Timeout (ms) for requestIdleCallback slices. Default: 120 */
  renderBatchIdleTimeoutMs?: number
  /** Defer rendering nodes until they are near the viewport */
  deferNodesUntilVisible?: boolean
  /** Maximum number of fully rendered nodes kept in DOM. Default: 320 */
  maxLiveNodes?: number
  /** Number of nodes to keep before/after focus. Default: 60 */
  liveNodeBuffer?: number
}

const props = withDefaults(defineProps<NodeRendererProps>(), {
  codeBlockStream: true,
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
const viewportPriorityAutoDisabled = ref(false)
const SCROLL_PARENT_OVERFLOW_RE = /auto|scroll|overlay/i
const isClient = typeof window !== 'undefined'
const debugPerformanceEnabled = computed(() => props.debugPerformance && isClient && typeof console !== 'undefined')

function logPerf(label: string, data: Record<string, unknown>) {
  if (!debugPerformanceEnabled.value)
    return
  console.info(`[markstream-vue][perf] ${label}`, data)
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
    const overflowY = (style.overflowY || '').toLowerCase()
    const overflow = (style.overflow || '').toLowerCase()
    if (SCROLL_PARENT_OVERFLOW_RE.test(overflowY) || SCROLL_PARENT_OVERFLOW_RE.test(overflow))
      return current
    current = current.parentElement
  }
  return null
}
const instanceMsgId = props.customId
  ? `renderer-${props.customId}`
  : `renderer-${Date.now()}-${Math.random().toString(36).slice(2)}`
const defaultMd = getMarkdown(instanceMsgId)
const mdBase = computed(() => {
  const tags = props.customHtmlTags
  if (!tags || tags.length === 0)
    return defaultMd
  return getMarkdown(instanceMsgId, { customHtmlTags: tags })
})
const mdInstance = computed(() => {
  const base = mdBase.value
  return props.customMarkdownIt
    ? props.customMarkdownIt(base)
    : base
})

function normalizeCustomTag(t: unknown) {
  const raw = String(t ?? '').trim()
  if (!raw)
    return ''
  const m = raw.match(/^[<\s/]*([A-Z][\w-]*)/i)
  return m ? m[1].toLowerCase() : ''
}

const mergedParseOptions = computed(() => {
  const base = props.parseOptions ?? {}
  const resolvedFinal = props.final ?? (base as any).final
  const propTags = props.customHtmlTags ?? []
  const optionTags = (base as any).customHtmlTags ?? []
  const merged = [...propTags, ...optionTags]
    .map(normalizeCustomTag)
    .filter(Boolean)
  if (!merged.length) {
    if (resolvedFinal == null)
      return base
    return {
      ...(base as any),
      final: resolvedFinal,
    } as ParseOptions
  }
  return {
    ...base,
    final: resolvedFinal,
    customHtmlTags: Array.from(new Set(merged)),
  } as ParseOptions
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
const maxLiveNodesResolved = computed(() => Math.max(1, props.maxLiveNodes ?? 320))
const virtualizationEnabled = computed(() => {
  if ((props.maxLiveNodes ?? 0) <= 0)
    return false
  return parsedNodes.value.length > maxLiveNodesResolved.value
})
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
const isTestEnv = typeof globalThis !== 'undefined'
  && typeof (globalThis as any).process !== 'undefined'
  && (globalThis as any).process?.env?.NODE_ENV === 'test'
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
const nodeVisibilityState = reactive<Record<number, boolean>>({})
const nodeVisibilityHandles = new Map<number, VisibilityHandle>()
const nodeVisibilityFallbackTimers = new Map<number, number>()
const nodeSlotElements = new Map<number, HTMLElement | null>()
const scrollRootElement = ref<HTMLElement | null>(null)
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
const desiredRenderedCount = computed(() => {
  if (!virtualizationEnabled.value)
    return parsedNodes.value.length
  const overscan = liveNodeBufferResolved.value
  const windowEnd = Math.max(liveRange.end + overscan, resolvedInitialBatch.value)
  const target = Math.min(parsedNodes.value.length, windowEnd)
  return Math.max(renderedCount.value, target)
})

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
  const entries = Array.from(nodeSlotElements.entries()).sort((a, b) => a[0] - b[0])
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
}

const averageNodeHeight = computed(() => {
  return heightStats.count > 0 ? Math.max(12, heightStats.total / heightStats.count) : 32
})

function estimateHeightRange(start: number, end: number) {
  if (start >= end)
    return 0
  let total = 0
  for (let i = start; i < end; i++)
    total += nodeHeights[i] ?? averageNodeHeight.value
  return total
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

function estimateIndexForOffset(offsetPx: number) {
  if (offsetPx <= 0)
    return 0
  let remaining = offsetPx
  const nodes = parsedNodes.value
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
  let remaining = offsetPx
  for (let i = nodes.length - 1; i >= 0; i--) {
    const height = nodeHeights[i] ?? averageNodeHeight.value
    if (remaining <= height)
      return i
    remaining -= height
  }
  return 0
}

function cleanupNodeVisibility(maxIndex: number) {
  if (!nodeVisibilityHandles.size)
    return
  // When virtualization is disabled the DOM retains every slot, so keep
  // observers intact; they will be cleaned up when the slot unmounts.
  if (!virtualizationEnabled.value)
    return
  for (const [index, handle] of nodeVisibilityHandles) {
    if (index >= maxIndex) {
      handle.destroy()
      nodeVisibilityHandles.delete(index)
      if (deferNodes.value)
        delete nodeVisibilityState[index]
      clearVisibilityFallback(index)
      nodeSlotElements.delete(index)
    }
  }
}

function markNodeVisible(index: number, visible: boolean) {
  if (deferNodes.value)
    nodeVisibilityState[index] = visible
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
  return nodeVisibilityState[index] === true
}

function destroyNodeHandle(index: number) {
  const handle = nodeVisibilityHandles.get(index)
  if (handle) {
    handle.destroy()
    nodeVisibilityHandles.delete(index)
  }
  clearVisibilityFallback(index)
}

function setNodeSlotElement(index: number, el: HTMLElement | null) {
  if (el)
    nodeSlotElements.set(index, el)
  else
    nodeSlotElements.delete(index)
  if (!el)
    clearVisibilityFallback(index)

  if (!shouldObserveSlots.value || !registerNodeVisibility) {
    destroyNodeHandle(index)
    if (el)
      markNodeVisible(index, true)
    else if (deferNodes.value)
      delete nodeVisibilityState[index]
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
      else if (deferNodes.value)
        delete nodeVisibilityState[index]
      return
    }
  }

  if (index < resolvedInitialBatch.value && !virtualizationEnabled.value) {
    destroyNodeHandle(index)
    markNodeVisible(index, true)
    return
  }

  if (!el) {
    destroyNodeHandle(index)
    if (deferNodes.value)
      delete nodeVisibilityState[index]
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
  handle.whenVisible
    .then(() => {
      clearVisibilityFallback(index)
      markNodeVisible(index, true)
    })
    .catch(() => {})
    .finally(() => {
      // Once visibility is confirmed we can release the handle reference so
      // long-lived renders (no virtualization) do not leak observers.
      if (nodeVisibilityHandles.get(index) === handle)
        nodeVisibilityHandles.delete(index)
      try {
        handle.destroy()
      }
      catch {}
    })

  if (virtualizationEnabled.value)
    scheduleFocusSync()
}

function setNodeContentRef(index: number, el: HTMLElement | null) {
  if (!el) {
    nodeContentElements.delete(index)
    return
  }
  nodeContentElements.set(index, el)
  queueMicrotask(() => {
    recordNodeHeight(index, el.offsetHeight)
  })
}

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
    if (nodeVisibilityState[index] === true)
      return
    const el = nodeSlotElements.get(index)
    if (!el) {
      delete nodeVisibilityState[index]
      return
    }

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
  for (const key of Object.keys(nodeVisibilityState))
    delete nodeVisibilityState[key]
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
  () => parsedNodes.value.length,
  () => {
    if (virtualizationEnabled.value)
      scheduleFocusSync({ immediate: true })
  },
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
      for (const key of Object.keys(nodeVisibilityState))
        delete nodeVisibilityState[key]
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

onBeforeUnmount(() => {
  cancelBatchTimers()
  for (const handle of nodeVisibilityHandles.values())
    handle.destroy()
  nodeVisibilityHandles.clear()
  for (const index of Array.from(nodeVisibilityFallbackTimers.keys()))
    clearVisibilityFallback(index)
  cleanupScrollListener()
  cancelScheduledFocusSync()
})

// 异步按需加载 CodeBlock 组件；失败时退回为 InlineCodeNode（内联代码渲染）
const CodeBlockNodeAsync = defineAsyncComponent(async () => {
  try {
    const mod = await import('../../components/CodeBlockNode')
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

// 组件映射表
const codeBlockComponent = computed(() => props.renderCodeBlocksAsPre ? PreCodeNode : CodeBlockNodeAsync)
const nodeComponents = {
  text: TextNode,
  paragraph: ParagraphNode,
  heading: HeadingNode,
  code_block: CodeBlockNodeAsync,
  list: ListNode,
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

// Decide which component to use for a given node. Ensure that code blocks
// with language `mermaid` are rendered with `MermaidBlockNode` (unless a
// custom component named `mermaid` is registered for the given customId).
function getNodeComponent(node: ParsedNode) {
  if (!node)
    return FallbackComponent
  const customComponents = getCustomNodeComponents(props.customId)
  const customForType = (customComponents as any)[String((node as any).type)]
  if (node.type === 'code_block') {
    const lang = String((node as any).language ?? '').trim().toLowerCase()
    // Keep Mermaid blocks routed to MermaidBlockNode unless a specific
    // `mermaid` override is provided.
    if (lang === 'mermaid') {
      const customMermaid = (customComponents as any).mermaid
      return customMermaid || MermaidBlockNodeAsync
    }

    if (customForType)
      return customForType

    // Honor a custom `code_block` component if the consumer registered one
    // via `setCustomComponents(customId, { code_block: MyComponent })`.
    const customCodeBlock = (customComponents as any).code_block
    if (customCodeBlock)
      return customCodeBlock

    return codeBlockComponent.value
  }

  if (customForType)
    return customForType

  return (nodeComponents as any)[String((node as any).type)] || FallbackComponent
}

function getBindingsFor(node: ParsedNode) {
  // For mermaid blocks we don't forward CodeBlock-specific props
  if (node?.type === 'code_block' && String((node as any).language ?? '').trim().toLowerCase() === 'mermaid')
    return {}

  return node.type === 'code_block'
    ? {
        // streaming behavior control for CodeBlockNode
        stream: props.codeBlockStream,
        darkTheme: props.codeBlockDarkTheme,
        lightTheme: props.codeBlockLightTheme,
        monacoOptions: props.codeBlockMonacoOptions,
        themes: props.themes,
        minWidth: props.codeBlockMinWidth,
        maxWidth: props.codeBlockMaxWidth,
        ...(props.codeBlockProps || {}),
      }
    : {
        // Forward `typewriter` flag to non-code node components so they can
        // opt in/out of enter transitions or other typewriter-like behaviour.
        typewriter: props.typewriter,
      }
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
    @click="handleContainerClick"
    @mouseover="handleContainerMouseover"
    @mouseout="handleContainerMouseout"
  >
    <div
      v-if="virtualizationEnabled"
      class="node-spacer"
      :style="{ height: `${topSpacerHeight}px` }"
      aria-hidden="true"
    />
    <template v-for="item in visibleNodes" :key="item.index">
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
            v-if="item.node.type !== 'code_block' && props.typewriter !== false"
            name="typewriter"
            appear
          >
            <component
              :is="getNodeComponent(item.node)"
              :node="item.node"
              :loading="item.node.loading"
              :index-key="`${indexKey || 'markdown-renderer'}-${item.index}`"
              v-bind="getBindingsFor(item.node)"
              :custom-id="props.customId"
              :is-dark="props.isDark"
              @copy="emit('copy', $event)"
              @handle-artifact-click="emit('handleArtifactClick', $event)"
            />
          </transition>

          <component
            :is="getNodeComponent(item.node)"
            v-else
            :node="item.node"
            :loading="item.node.loading"
            :index-key="`${indexKey || 'markdown-renderer'}-${item.index}`"
            v-bind="getBindingsFor(item.node)"
            :custom-id="props.customId"
            :is-dark="props.isDark"
            @copy="emit('copy', $event)"
            @handle-artifact-click="emit('handleArtifactClick', $event)"
          />
        </div>
        <div
          v-else
          class="node-placeholder"
          :style="{ height: `${nodeHeights[item.index] ?? averageNodeHeight}px` }"
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
  background-image: linear-gradient(90deg, rgba(148, 163, 184, 0.18), rgba(148, 163, 184, 0.05), rgba(148, 163, 184, 0.18));
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
  color: #6a737d;
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
