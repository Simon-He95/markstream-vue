<script setup lang="ts">
import type { BaseNode, HtmlPolicy, MarkdownIt, ParsedNode, ParseOptions } from 'stream-markdown-parser'
import type { SmoothMarkdownStreamOptions } from '../../composables/useSmoothMarkdownStream'
import type { VisibilityHandle } from '../../composables/viewportPriority'
import type { CodeBlockMonacoOptions, CodeBlockMonacoTheme, CodeBlockNodeProps, CodeBlockPreviewPayload, D2BlockNodeProps, InfographicBlockNodeProps, MermaidBlockNodeProps, ShikiCodeBlockProps } from '../../types/component-props'
import { normalizeShikiLanguage } from 'markstream-core'
import { getMarkdown, mergeCustomHtmlTags, parseMarkdownToStructure, resolveCustomHtmlTags } from 'stream-markdown-parser'
import { h as createVNode } from 'vue'
import { computed, getCurrentInstance, inject, markRaw, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, version, watch } from 'vue-demi'
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
import { useSmoothMarkdownStream } from '../../composables/useSmoothMarkdownStream'
import { provideViewportPriority } from '../../composables/viewportPriority'
import { normalizeLanguageIdentifier } from '../../utils'
import { getCodeBlockExtraProps } from '../../utils/codeBlockExtraProps'
import { clampInfographicPreviewHeight, clampMermaidPreviewHeight, estimateInfographicPreviewHeight, estimateMermaidPreviewHeight, parsePositiveNumber } from '../../utils/diagramHeight'
import { getHtmlTagFromContent, shouldRenderUnknownHtmlTagAsText, stripCustomHtmlWrapper } from '../../utils/htmlRenderer'
import { customComponentsRevision, getCustomNodeComponents } from '../../utils/nodeComponents'
import { isLegacyVue26Version } from '../../utils/vue26'
import HtmlBlockNode from '../HtmlBlockNode/HtmlBlockNode.vue'
import HtmlInlineNode from '../HtmlInlineNode/HtmlInlineNode.vue'
import { MathBlockNodeAsync, MathInlineNodeAsync } from './asyncComponent'
import FallbackComponent from './FallbackComponent.vue'
import LegacyNodesRenderer from './LegacyNodesRenderer.vue'

// 组件接收的 props
// 增加用于统一设置所有 code_block 主题和 Monaco 选项的外部 API
interface IdleDeadlineLike {
  timeRemaining?: () => number
}

type NodeRendererCodeBlockThemes
  = CodeBlockNodeProps['themes']
    | ShikiCodeBlockProps['themes']

type NodeRendererCodeBlockProps
  = Partial<Omit<CodeBlockNodeProps, 'node' | 'themes'>>
    & Partial<Omit<ShikiCodeBlockProps, 'themes'>>
    & {
      themes?: NodeRendererCodeBlockThemes
    }
    & Record<string, unknown>

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
  htmlPolicy?: HtmlPolicy
  /** Enable priority rendering for visible viewport area */
  viewportPriority?: boolean
  /**
   * Whether code_block renders should stream updates.
   * When false, code blocks stay in a loading state and render once when final content is ready.
   * Default: true
   */
  codeBlockStream?: boolean
  // 全局传递到每个 CodeBlockNode 的主题（monaco theme 对象）
  codeBlockDarkTheme?: CodeBlockMonacoTheme
  codeBlockLightTheme?: CodeBlockMonacoTheme
  // 传递给 CodeBlockNode 的 monacoOptions（比如 fontSize, MAX_HEIGHT 等）
  codeBlockMonacoOptions?: CodeBlockMonacoOptions
  /** If true, render all `code_block` nodes as plain <pre><code> blocks instead of the full CodeBlockNode */
  renderCodeBlocksAsPre?: boolean
  /** Minimum width forwarded to CodeBlockNode (px or CSS unit) */
  codeBlockMinWidth?: string | number
  /** Maximum width forwarded to CodeBlockNode (px or CSS unit) */
  codeBlockMaxWidth?: string | number
  /** Arbitrary props to forward to every CodeBlockNode */
  codeBlockProps?: NodeRendererCodeBlockProps
  /** Props forwarded to MermaidBlockNode for mermaid fences */
  mermaidProps?: Partial<Omit<MermaidBlockNodeProps, 'node' | 'loading' | 'isDark'>>
  /** Props forwarded to D2BlockNode for d2/d2lang fences */
  d2Props?: Partial<Omit<D2BlockNodeProps, 'node' | 'loading' | 'isDark'>>
  /** Props forwarded to InfographicBlockNode for infographic fences */
  infographicProps?: Partial<Omit<InfographicBlockNodeProps, 'node' | 'loading' | 'isDark'>>
  /** Global tooltip toggle for link/code-block renderers (default: true) */
  showTooltips?: boolean
  /**
   * Theme names or theme objects preloaded for Monaco-backed code blocks.
   * When Shiki code blocks are used, only string theme names are forwarded to
   * MarkdownCodeBlockNode / stream-markdown; theme objects are ignored.
   */
  themes?: CodeBlockMonacoTheme[]
  /**
   * Shiki language preload list forwarded to MarkdownCodeBlockNode.
   *
   * Vue2's default code block renderer is Monaco-backed. This prop is used
   * when a custom `code_block` or language renderer uses MarkdownCodeBlockNode.
   */
  langs?: readonly string[]
  isDark?: boolean
  customId?: string
  indexKey?: number | string
  /** Enable/disable the typewriter cursor (blinking cursor at stream end). Default: false */
  typewriter?: boolean
  /** Enable/disable the non-code-node enter transition (fade animation). Default: true */
  fade?: boolean
  /**
   * Enable built-in smooth pacing for streaming `content` updates.
   * - true: force-enable smooth streaming
   * - false: force-disable smooth streaming
   * - 'auto': enable when typewriter/incremental mode is active
   * Applies to content mode only, not nodes mode.
   */
  smoothStreaming?: boolean | 'auto'
  /** Options forwarded to the built-in smooth streaming controller. Read once when the renderer is created. */
  smoothStreamingOptions?: SmoothMarkdownStreamOptions
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
  showTooltips: true,
  typewriter: false,
  fade: true,
  smoothStreaming: 'auto',
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

const emit = defineEmits<{
  (e: 'copy', code: string): void
  (e: 'copy-code', code: string): void
  (e: 'handleArtifactClick', payload: CodeBlockPreviewPayload): void
  (e: 'click', event: MouseEvent): void
  (e: 'mouseover', event: MouseEvent): void
  (e: 'mouseout', event: MouseEvent): void
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

const MAX_DEFERRED_NODE_COUNT = 900
const MAX_VIEWPORT_OBSERVER_TARGETS = 640
const VIEWPORT_PRIORITY_RECOVERY_COUNT = 200

const containerRef = ref<HTMLElement>()
const viewportPriorityAutoDisabled = ref(false)
const SCROLL_PARENT_OVERFLOW_RE = /auto|scroll|overlay/i
const isClient = typeof window !== 'undefined'
const debugPerformanceEnabled = computed(() => props.debugPerformance && isClient && typeof console !== 'undefined')
const textStreamState = new Map<string, string>()
const streamRenderVersion = ref(0)
const smoothStream = useSmoothMarkdownStream(props.smoothStreamingOptions)
const resolvedShowTooltips = computed<boolean | undefined>(() => props.showTooltips)
const inheritedHtmlPolicy = inject<{ value?: HtmlPolicy } | undefined>('markstreamHtmlPolicy', undefined)
const inheritedSmoothStreaming = inject<{ value?: boolean } | undefined>('markstreamSmoothStreaming', undefined)
const resolvedHtmlPolicy = computed<HtmlPolicy>(() => props.htmlPolicy ?? inheritedHtmlPolicy?.value ?? 'safe')

provide('markstreamShowTooltips', resolvedShowTooltips)
provide('markstreamHtmlPolicy', resolvedHtmlPolicy)
provide('markstreamTypewriter', computed(() => props.typewriter === true))
provide('markstreamFade', computed(() => props.fade !== false))
provide('markstreamTextStreamState', textStreamState)
provide('markstreamStreamVersion', streamRenderVersion)

const smoothStreamingEligible = computed(() => {
  if (props.smoothStreaming === false)
    return false
  if (props.nodes?.length)
    return false
  if (props.smoothStreaming !== true && inheritedSmoothStreaming?.value)
    return false
  if (props.smoothStreaming === true)
    return true
  return props.typewriter === true || (props.maxLiveNodes ?? 0) <= 0
})

const hasMountedForSmoothStreaming = ref(!isClient || props.smoothStreaming === true)

onMounted(() => {
  hasMountedForSmoothStreaming.value = true
})

const smoothStreamingEnabled = computed(() => (
  hasMountedForSmoothStreaming.value
  && smoothStreamingEligible.value
))

provide('markstreamSmoothStreaming', smoothStreamingEnabled)

const renderContent = computed(() => (
  smoothStreamingEnabled.value
    ? smoothStream.visible.value
    : (props.content ?? '')
))
const rawContent = computed(() => props.content ?? '')
const smoothSourceSynced = computed(() => (
  Boolean(props.nodes?.length) || smoothStream.source.value === rawContent.value
))

const requestedFinal = computed<boolean | undefined>(() => {
  const base = (props.parseOptions ?? {}) as ParseOptions
  return props.final ?? base.final
})

const effectiveFinal = computed<boolean | undefined>(() => {
  const finalRequested = requestedFinal.value

  if (smoothStreamingEnabled.value && finalRequested != null) {
    return Boolean(
      finalRequested
      && smoothSourceSynced.value
      && smoothStream.caughtUp.value,
    )
  }

  return finalRequested
})

const renderVersionSource = computed(() => {
  if (props.nodes?.length)
    return props.nodes
  return renderContent.value
})

watch(
  [() => props.content, () => props.nodes, smoothStreamingEnabled, requestedFinal],
  ([content, nodes, enabled, finalRequested]) => {
    if (nodes?.length) {
      smoothStream.reset('')
      return
    }

    const nextContent = content ?? ''

    if (!enabled) {
      smoothStream.reset(nextContent)
      if (finalRequested)
        smoothStream.finish({ flush: true })
      return
    }

    const source = smoothStream.source.value

    if (!nextContent) {
      smoothStream.reset('')
    }
    else if (nextContent === source) {
      // no-op
    }
    else if (nextContent.startsWith(source)) {
      smoothStream.enqueue(nextContent.slice(source.length))
    }
    else {
      smoothStream.reset(nextContent)
    }

    if (finalRequested)
      smoothStream.finish()
  },
  { immediate: true },
)

watch(
  renderVersionSource,
  () => {
    streamRenderVersion.value += 1
  },
  { immediate: true },
)

function logPerf(label: string, data: Record<string, unknown>) {
  if (!debugPerformanceEnabled.value)
    return
  console.info(`[markstream-vue2][perf] ${label}`, data)
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
const customTagCache = new Map<string, MarkdownIt>()
const EMPTY_PARSED_NODES = markRaw([] as ParsedNode[])
const customComponentsMap = computed(() => {
  void customComponentsRevision.value
  return getCustomNodeComponents(props.customId)
})
const effectiveCustomHtmlTags = computed(() => mergeCustomHtmlTags(props.customHtmlTags, (props.parseOptions as any)?.customHtmlTags))
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

function cloneNodeValue<T>(value: T): T {
  if (Array.isArray(value))
    return Object.freeze(value.map(item => cloneNodeValue(item))) as T
  if (!value || typeof value !== 'object')
    return value
  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>))
    output[key] = cloneNodeValue(child)
  return Object.freeze(output) as T
}

function cloneParsedNodeList(nodes: ParsedNode[]) {
  return nodes.map(node => cloneNodeValue(node))
}

const mergedParseOptions = computed(() => {
  const base = props.parseOptions ?? {}
  const resolvedFinal = effectiveFinal.value

  const merged = effectiveCustomHtmlTags.value
  const hasFinal = resolvedFinal != null
  const hasCustom = merged.length > 0

  if (!hasFinal && !hasCustom)
    return base

  return {
    ...(base as any),
    ...(hasFinal ? { final: resolvedFinal } : {}),
    ...(hasCustom ? { customHtmlTags: merged } : {}),
  } as ParseOptions
})

// Set of effective custom HTML tags (normalised to lowercase).
// Used in `renderedItems` to coerce pre-parsed html_block/html_inline nodes
// whose tag matches a registered custom component.
const effectiveCustomHtmlTagsSet = computed<Set<string>>(() => {
  const arr: string[] = (mergedParseOptions.value as any).customHtmlTags ?? []
  return new Set(arr.map(t => String(t).trim().toLowerCase()).filter(Boolean))
})

const legacyVue26 = isLegacyVue26Version(version)
const parsedNodes = computed<ParsedNode[]>(() => {
  if (legacyVue26 && !props.content && Array.isArray(props.nodes))
    return EMPTY_PARSED_NODES
  // 解析 content 字符串为节点数组
  // If the consumer passed an explicit `nodes` array, return a shallow
  // copy so the computed value has a new identity whenever the caller
  // replaces or mutates the array in-place. This ensures the watchers
  // that rely on `parsedNodes` will run and update rendering even when
  // the array length doesn't change.
  if (props.nodes?.length)
    return markRaw(cloneParsedNodeList(props.nodes as unknown as ParsedNode[]))
  const contentToParse = renderContent.value
  if (contentToParse) {
    // Prefer an explicitly passed `markdown` prop, then a globally
    // provided markdown via `setGlobalMarkdown`, otherwise fall back
    // to the legacy `getMarkdown()` factory.
    const parseStart = debugPerformanceEnabled.value ? performance.now() : 0
    const parsed = parseMarkdownToStructure(contentToParse, mdInstance.value, mergedParseOptions.value)
    if (debugPerformanceEnabled.value) {
      logPerf('parse(sync)', {
        ms: Math.round(performance.now() - parseStart),
        nodes: parsed.length,
        contentLength: contentToParse.length,
      })
    }
    return markRaw(cloneParsedNodeList(parsed))
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
const codeBlockRenderCache = new WeakMap<object, { signature: string, node: ParsedNode }>()
const nodeSlotVersion = ref(0)
const sortedNodeSlots = computed(() => {
  // Track a manual version so we only rebuild when slots change.
  void nodeSlotVersion.value
  return Array.from(nodeSlotElements.entries()).sort((a, b) => a[0] - b[0])
})
const scrollRootElement = ref<HTMLElement | null>(null)
let detachScrollHandler: (() => void) | null = null
let pendingFocusSync: { id: number | ReturnType<typeof setTimeout>, viaTimeout: boolean } | null = null
const liveRange = reactive({ start: 0, end: 0 })
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
const nodeContentElements = new Map<number, HTMLElement | null>()
const legacyNodesMode = computed(() => legacyVue26 && !props.content && Array.isArray(props.nodes))
const legacyNodeItems = computed<ParsedNode[]>(() => {
  if (!legacyNodesMode.value)
    return EMPTY_PARSED_NODES
  return markRaw(cloneParsedNodeList((props.nodes as unknown as ParsedNode[]) || []))
})

const getNodeRefs = (() => {
  const proxy = getCurrentInstance()?.proxy as any
  return () => proxy?.$refs as Record<string, any> | undefined
})()

function syncNodeRefs() {
  const refs = getNodeRefs()
  if (!refs)
    return
  const seen = new Set<number>()
  for (const item of visibleNodes.value) {
    const slot = resolveTemplateRef(refs[`node-slot-${item.index}`])
    const content = resolveTemplateRef(refs[`node-content-${item.index}`])
    if ((nodeSlotElements.get(item.index) ?? null) !== slot)
      setNodeSlotElement(item.index, slot)
    if ((nodeContentElements.get(item.index) ?? null) !== content)
      setNodeContentRef(item.index, content)
    seen.add(item.index)
  }
  for (const index of Array.from(nodeSlotElements.keys())) {
    if (!seen.has(index))
      setNodeSlotElement(index, null)
  }
  for (const index of Array.from(nodeContentElements.keys())) {
    if (!seen.has(index))
      setNodeContentRef(index, null)
  }
}

function resolveTemplateRef<T extends HTMLElement>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item)
        return item
    }
    return null
  }
  return value ?? null
}
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
const heightTreeSize = ref(0)
const heightSumTree = ref<number[]>([])
const heightKnownTree = ref<number[]>([])

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
}

const averageNodeHeight = computed(() => {
  return heightStats.count > 0 ? Math.max(12, heightStats.total / heightStats.count) : 32
})

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

onMounted(() => {
  if (isClient)
    nextTick(syncNodeRefs)
})

watch(visibleNodes, () => {
  if (isClient)
    nextTick(syncNodeRefs)
})

watch(renderedCount, () => {
  if (isClient)
    nextTick(syncNodeRefs)
})

watch(virtualizationEnabled, () => {
  if (isClient)
    nextTick(syncNodeRefs)
})

function estimateIndexForOffset(offsetPx: number) {
  if (offsetPx <= 0)
    return 0
  const nodes = parsedNodes.value
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
        delete nodeVisibilityState[index]
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

function bumpNodeSlotVersion() {
  nodeSlotVersion.value += 1
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
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV && typeof console !== 'undefined')
    console.warn('[markstream-vue2] viewportPriority auto-disabled:', reason)

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
      if (renderedCount.value !== 0)
        renderedCount.value = 0
      cleanupNodeVisibility(0)
      return
    }

    if (!incrementalRenderingActive.value) {
      if (renderedCount.value !== targetCount)
        renderedCount.value = targetCount
      cleanupNodeVisibility(renderedCount.value)
      return
    }

    const shouldResetRenderedCount = datasetKeyChanged || prevCtx.total === 0

    if (shouldResetRenderedCount || batchConfigChanged) {
      const nextRenderedCount = Math.min(targetCount, resolvedInitialBatch.value)
      if (renderedCount.value !== nextRenderedCount)
        renderedCount.value = nextRenderedCount
    }
    else {
      const nextRenderedCount = Math.min(renderedCount.value, targetCount)
      if (renderedCount.value !== nextRenderedCount)
        renderedCount.value = nextRenderedCount
    }

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
  clearTypewriterCursorTimeout()
})

// 异步按需加载 CodeBlock 组件；失败时退回为 InlineCodeNode（内联代码渲染）
async function CodeBlockNodeAsync() {
  try {
    const mod = await import('../../components/CodeBlockNode')
    return (mod as any).default ?? mod
  }
  catch (e) {
    console.warn(
      '[markstream-vue2] Optional peer dependencies for CodeBlockNode are missing. Falling back to inline-code rendering (no Monaco). To enable full code block features, please install "stream-monaco".',
      e,
    )
    return PreCodeNode
  }
}

const MermaidBlockNodeLoading = {
  name: 'MermaidBlockNodeLoading',
  props: {
    estimatedPreviewHeightPx: Number,
    isDark: Boolean,
    showHeader: { type: Boolean, default: true },
  },
  render(this: any, renderH?: any) {
    const h = typeof renderH === 'function' ? renderH : createVNode
    const attrProps = typeof renderH === 'function'
      ? { attrs: { 'data-markstream-mermaid': '1', 'data-markstream-mode': 'pending' } }
      : { 'data-markstream-mermaid': '1', 'data-markstream-mode': 'pending' }
    const height = `${parsePositiveNumber(this.estimatedPreviewHeightPx) ?? 360}px`
    return h('div', {
      ...attrProps,
      class: [
        'my-4 rounded-lg border overflow-hidden shadow-sm',
        this.isDark ? 'border-gray-700/30' : 'border-gray-200',
      ],
    }, [
      this.showHeader === false
        ? null
        : h('div', {
            class: [
              'mermaid-block-header flex justify-between items-center px-4 py-2.5 border-b',
              this.isDark ? 'bg-gray-800 border-gray-700/30' : 'bg-gray-50 border-gray-200',
            ],
          }, [
            h('div', { class: 'flex items-center gap-x-2 overflow-hidden' }, [
              h('span', { class: this.isDark ? 'text-sm font-medium font-mono truncate text-gray-400' : 'text-sm font-medium font-mono truncate text-gray-600' }, 'Mermaid'),
            ]),
          ]),
      h('div', {
        class: [
          'mermaid-preview-area min-h-[360px] relative overflow-hidden block',
          this.isDark ? 'bg-gray-900' : 'bg-gray-50',
        ],
        style: { height },
      }),
    ])
  },
}

const mermaidBlockNodeComponent = ref<any | null>(null)
let mermaidBlockNodeImport: Promise<void> | null = null

function loadMermaidBlockNode() {
  if (mermaidBlockNodeComponent.value || mermaidBlockNodeImport)
    return
  mermaidBlockNodeImport = import('../../components/MermaidBlockNode')
    .then(mod => (mod as any).default ?? mod)
    .then((component) => {
      mermaidBlockNodeComponent.value = component
    })
    .catch((e) => {
      console.warn(
        '[markstream-vue2] Optional peer dependencies for MermaidBlockNode are missing. Falling back to preformatted code rendering. To enable Mermaid rendering, please install "mermaid".',
        e,
      )
      mermaidBlockNodeComponent.value = PreCodeNode
    })
}

function resolveMermaidBlockNodeComponent() {
  loadMermaidBlockNode()
  return mermaidBlockNodeComponent.value || MermaidBlockNodeLoading
}

const InfographicBlockNodeLoading = {
  name: 'InfographicBlockNodeLoading',
  props: {
    estimatedPreviewHeightPx: Number,
    isDark: Boolean,
    showHeader: { type: Boolean, default: true },
  },
  render(this: any, renderH?: any) {
    const h = typeof renderH === 'function' ? renderH : createVNode
    const attrProps = typeof renderH === 'function'
      ? { attrs: { 'data-markstream-infographic': '1', 'data-markstream-mode': 'pending' } }
      : { 'data-markstream-infographic': '1', 'data-markstream-mode': 'pending' }
    const height = `${parsePositiveNumber(this.estimatedPreviewHeightPx) ?? 360}px`
    return h('div', {
      ...attrProps,
      class: [
        'my-4 rounded-lg border overflow-hidden shadow-sm',
        this.isDark ? 'border-gray-700/30' : 'border-gray-200',
      ],
    }, [
      this.showHeader === false
        ? null
        : h('div', {
            class: [
              'infographic-block-header flex justify-between items-center px-4 py-2.5 border-b',
              this.isDark ? 'bg-gray-800 border-gray-700/30' : 'bg-gray-50 border-gray-200',
            ],
          }, [
            h('div', { class: 'flex items-center gap-x-2 overflow-hidden' }, [
              h('span', { class: this.isDark ? 'text-sm font-medium font-mono truncate text-gray-400' : 'text-sm font-medium font-mono truncate text-gray-600' }, 'Infographic'),
            ]),
          ]),
      h('div', {
        class: [
          'infographic-preview min-h-[360px] relative overflow-hidden block',
          this.isDark ? 'bg-gray-900' : 'bg-gray-50',
        ],
        style: { height },
      }),
    ])
  },
}

const infographicBlockNodeComponent = ref<any | null>(null)
let infographicBlockNodeImport: Promise<void> | null = null

function loadInfographicBlockNode() {
  if (infographicBlockNodeComponent.value || infographicBlockNodeImport)
    return
  infographicBlockNodeImport = import('../../components/InfographicBlockNode')
    .then(mod => (mod as any).default ?? mod)
    .then((component) => {
      infographicBlockNodeComponent.value = component
    })
    .catch((e) => {
      console.warn(
        '[markstream-vue2] Optional peer dependencies for InfographicBlockNode are missing. Falling back to preformatted code rendering.',
        e,
      )
      infographicBlockNodeComponent.value = PreCodeNode
    })
}

function resolveInfographicBlockNodeComponent() {
  loadInfographicBlockNode()
  return infographicBlockNodeComponent.value || InfographicBlockNodeLoading
}

async function D2BlockNodeAsync() {
  try {
    const mod = await import('../../components/D2BlockNode')
    return (mod as any).default ?? mod
  }
  catch (e) {
    console.warn(
      '[markstream-vue2] Optional peer dependencies for D2BlockNode are missing. Falling back to preformatted code rendering. To enable D2 rendering, please install \"@terrastruct/d2\".',
      e,
    )
    return PreCodeNode
  }
}

// 组件映射表
const codeBlockComponent = computed(() => props.renderCodeBlocksAsPre ? PreCodeNode : CodeBlockNodeAsync)
const nodeComponents = {
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
const codeBlockExtraProps = computed(() => getCodeBlockExtraProps(props.codeBlockProps))
const builtinCodeBlockExtraProps = computed(() =>
  getCodeBlockExtraProps(props.codeBlockProps, { omit: ['langs'] }),
)
const codeBlockBindings = computed(() => ({
  // streaming behavior control for CodeBlockNode
  stream: props.codeBlockStream,
  darkTheme: props.codeBlockDarkTheme,
  lightTheme: props.codeBlockLightTheme,
  monacoOptions: props.codeBlockMonacoOptions,
  themes: props.themes,
  minWidth: props.codeBlockMinWidth,
  maxWidth: props.codeBlockMaxWidth,
  ...(typeof props.showTooltips === 'boolean' ? { showTooltips: props.showTooltips } : {}),
  ...builtinCodeBlockExtraProps.value,
}))
const customCodeBlockBindings = computed(() => ({
  ...codeBlockBindings.value,
  langs: props.langs,
  ...codeBlockExtraProps.value,
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
  // opt in/out of typewriter cursor behavior.
  typewriter: props.typewriter,
  // Forward `fade` flag to non-code node components for enter animations.
  fade: props.fade,
  // Forward customHtmlTags for non-whitelisted tag detection in child components
  customHtmlTags: mergedParseOptions.value.customHtmlTags,
  htmlPolicy: resolvedHtmlPolicy.value,
}))
const linkBindings = computed(() => ({
  ...nonCodeBindings.value,
  ...(typeof props.showTooltips === 'boolean' ? { showTooltip: props.showTooltips } : {}),
}))
const listBindings = computed(() => ({
  ...nonCodeBindings.value,
  ...(typeof props.showTooltips === 'boolean' ? { showTooltips: props.showTooltips } : {}),
}))
const legacyRenderedItems = computed(() => {
  return legacyNodeItems.value.map((node, index) => {
    const language = getCodeBlockLanguage(node)
    let resolvedNode = node
    let component = getNodeComponent(node, language)

    // Coerce html_block/html_inline nodes whose tag matches a registered
    // custom component listed in customHtmlTags.
    if (
      (node.type === 'html_block' || node.type === 'html_inline')
      && component === (nodeComponents as any)[node.type]
    ) {
      const tag = String((node as any).tag ?? '').trim().toLowerCase()
        || getHtmlTagFromContent((node as any).content)
      if (tag) {
        // Check if tag is whitelisted in customHtmlTags
        if (effectiveCustomHtmlTagsSet.value.has(tag)) {
          const customComponents = customComponentsMap.value
          const customForTag = (customComponents as any)[tag]
          if (customForTag) {
            component = customForTag
            resolvedNode = {
              ...(node as any),
              type: tag,
              tag,
              content: stripCustomHtmlWrapper((node as any).content, tag),
            } as ParsedNode
          }
        }
        else if (shouldRenderUnknownHtmlTagAsText((node as any).content ?? (node as any).raw, tag)) {
          const rawContent = String((node as any).content ?? (node as any).raw ?? '')
          if (node.type === 'html_inline') {
            component = TextNode
            resolvedNode = {
              type: 'text',
              content: rawContent,
              raw: rawContent,
            } as ParsedNode
          }
          else {
            component = ParagraphNode
            resolvedNode = {
              type: 'paragraph',
              children: [{ type: 'text', content: rawContent, raw: rawContent }],
              raw: rawContent,
            } as ParsedNode
          }
        }
      }
    }

    return {
      node: resolvedNode,
      component,
      bindings: getBindingsFor(resolvedNode, language, component),
      isCodeBlock: resolvedNode.type === 'code_block',
      index,
      indexKey: `${indexPrefix.value}-${index}`,
      renderKey: getRenderKey(resolvedNode, index),
    }
  })
})
const legacyStructuredContentMode = computed(() => {
  if (!legacyVue26 || !props.content)
    return false
  return parsedNodes.value.some(node => isLegacyStructuredNode(node))
})
const renderedItems = computed(() => {
  return visibleNodes.value.map((item) => {
    let node = getCodeBlockRenderNode(item.node)
    const language = getCodeBlockLanguage(node)
    let component = getNodeComponent(node, language)

    // Coerce html_block/html_inline nodes whose tag matches a registered
    // custom component listed in customHtmlTags.
    if (
      (node.type === 'html_block' || node.type === 'html_inline')
      && component === (nodeComponents as any)[node.type]
    ) {
      const tag = String((node as any).tag ?? '').trim().toLowerCase()
        || getHtmlTagFromContent((node as any).content)
      if (tag) {
        // Check if tag is whitelisted in customHtmlTags
        if (effectiveCustomHtmlTagsSet.value.has(tag)) {
          const customComponents = customComponentsMap.value
          const customForTag = (customComponents as any)[tag]
          if (customForTag) {
            component = customForTag
            node = {
              ...(node as any),
              type: tag,
              tag,
              content: stripCustomHtmlWrapper((node as any).content, tag),
            } as ParsedNode
          }
        }
        else if (shouldRenderUnknownHtmlTagAsText((node as any).content ?? (node as any).raw, tag)) {
          const rawContent = String((node as any).content ?? (node as any).raw ?? '')
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

    return {
      ...item,
      node,
      component,
      bindings: getBindingsFor(node, language, component),
      isCodeBlock: node.type === 'code_block',
      indexKey: `${indexPrefix.value}-${item.index}`,
      renderKey: getRenderKey(node, item.index),
    }
  })
})

function getCodeBlockRenderNode(node: ParsedNode) {
  if (node.type !== 'code_block')
    return node

  const codeBlockNode = node as any
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

function getCodeBlockLanguage(node: ParsedNode) {
  return node?.type === 'code_block'
    ? String((node as any).language ?? '').trim().toLowerCase()
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

function isLegacyStructuredNode(node: ParsedNode | null | undefined) {
  if (!node)
    return false
  const type = String((node as any).type || '')
  if ([
    'blockquote',
    'list',
    'list_item',
    'table',
    'definition_list',
    'footnote',
    'admonition',
  ].includes(type)) {
    return true
  }
  return Array.isArray((node as any).items)
    || Array.isArray((node as any).rows)
    || (Array.isArray((node as any).children) && ['paragraph', 'heading', 'text'].includes(type) === false)
}

function getRenderKey(node: ParsedNode, index: number) {
  const base = `${indexPrefix.value}-${index}`
  if (!node)
    return base

  const type = String((node as any).type || 'unknown')
  // Keep streaming code blocks on a stable key so Monaco-backed components
  // receive prop updates instead of being torn down and recreated per chunk.
  if (type === 'code_block')
    return base

  const loading = (node as any).loading === true
  const raw = typeof (node as any).raw === 'string' ? (node as any).raw.length : 0
  const content = typeof (node as any).content === 'string' ? (node as any).content.length : 0
  const children = Array.isArray((node as any).children) ? (node as any).children.length : 0
  const items = Array.isArray((node as any).items) ? (node as any).items.length : 0
  const rows = Array.isArray((node as any).rows) ? (node as any).rows.length : 0

  if (!legacyVue26 && !loading)
    return base

  const hasNestedStructure = children > 0 || items > 0 || rows > 0
  if (!loading && !hasNestedStructure)
    return base

  return `${base}-${type}-${loading ? 'l' : 'r'}-${raw}-${content}-${children}-${items}-${rows}`
}

function getMermaidBindingsFor(node: ParsedNode) {
  const bindings = { ...mermaidBindings.value } as Record<string, any>
  if (parsePositiveNumber(bindings.estimatedPreviewHeightPx) == null) {
    bindings.estimatedPreviewHeightPx = clampMermaidPreviewHeight(
      estimateMermaidPreviewHeight(String((node as any)?.code ?? '')),
      undefined,
      bindings.maxHeight === 'none' ? null : (parsePositiveNumber(bindings.maxHeight) ?? undefined),
    )
  }
  return bindings
}

function getInfographicBindingsFor(node: ParsedNode) {
  const bindings = { ...infographicBindings.value } as Record<string, any>
  if (parsePositiveNumber(bindings.estimatedPreviewHeightPx) == null) {
    bindings.estimatedPreviewHeightPx = clampInfographicPreviewHeight(
      estimateInfographicPreviewHeight(String((node as any)?.code ?? '')),
      undefined,
      bindings.maxHeight === 'none' ? null : (parsePositiveNumber(bindings.maxHeight) ?? undefined),
    )
  }
  return bindings
}

// Decide which component to use for a given node. Ensure that code blocks
// with language `mermaid` are rendered with `MermaidBlockNode` (unless a
// custom component named `mermaid` is registered for the given customId).
function getNodeComponent(node: ParsedNode, language?: string) {
  if (!node)
    return FallbackComponent
  const customComponents = customComponentsMap.value
  const customForType = (customComponents as any)[String((node as any).type)]
  if (node.type === 'code_block') {
    const lang = language ?? getCodeBlockLanguage(node)
    const customForLanguage = lang
      ? getCustomCodeLanguageComponent(customComponents as any, lang)
      : undefined
    if (customForLanguage)
      return customForLanguage

    // Keep Mermaid blocks routed to MermaidBlockNode unless a specific
    // `mermaid` override is provided.
    if (lang === 'mermaid') {
      const customMermaid = (customComponents as any).mermaid
      return customMermaid || resolveMermaidBlockNodeComponent()
    }

    if (lang === 'infographic') {
      const customInfographic = (customComponents as any).infographic
      return customInfographic || resolveInfographicBlockNodeComponent()
    }

    if (lang === 'd2' || lang === 'd2lang') {
      const customD2 = (customComponents as any).d2
      return customD2 || D2BlockNodeAsync
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

function isCustomCodeBlockComponent(component: unknown) {
  return Boolean(component && component === (customComponentsMap.value as any).code_block)
}

function isCustomLanguageCodeBlockComponent(component: unknown, language?: string) {
  return Boolean(component && language && component === getCustomCodeLanguageComponent(customComponentsMap.value as any, language))
}

function getBindingsFor(node: ParsedNode, language?: string, component?: unknown) {
  const lang = language ?? getCodeBlockLanguage(node)
  if (node.type === 'code_block' && isCustomLanguageCodeBlockComponent(component, lang)) {
    if (lang === 'mermaid')
      return getMermaidBindingsFor(node)

    if (lang === 'infographic')
      return getInfographicBindingsFor(node)

    if (lang === 'd2' || lang === 'd2lang')
      return d2Bindings.value

    return customCodeBlockBindings.value
  }

  if (node.type === 'code_block' && isCustomCodeBlockComponent(component))
    return customCodeBlockBindings.value

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

const hasExplicitNodes = computed(() => Array.isArray(props.nodes) && props.nodes.length > 0)

// ── Typewriter cursor ──
const typewriterCursorRef = ref<HTMLElement | null>(null)
const showTypewriterCursor = ref(false)
let typewriterCursorTimeout: ReturnType<typeof setTimeout> | undefined
let lastTypewriterContentLength = 0
const TYPEWRITER_CURSOR_EXCLUDED_NODE_TYPES = new Set(['code_block', 'admonition', 'table', 'math_block', 'html_block', 'image'])

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
    return children.reduce((total: number, child: unknown) => total + getNodeTextLength(child), 0)
  const items = record.items
  if (Array.isArray(items))
    return items.reduce((total: number, item: unknown) => total + getNodeTextLength(item), 0)
  return 0
}

function getTypewriterContentLength() {
  if (props.nodes?.length)
    return props.nodes.reduce((total: number, node: unknown) => total + getNodeTextLength(node), 0)
  // Use raw content length, not renderContent (which may be the paced-out
  // visible portion when smooth streaming is active).  The cursor should
  // appear as long as the source content is growing, even if the visible
  // stream hasn't caught up yet.
  return rawContent.value.length
}

function clearTypewriterCursorTimeout() {
  if (!typewriterCursorTimeout)
    return
  clearTimeout(typewriterCursorTimeout)
  typewriterCursorTimeout = undefined
}

function getLastTextNode(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.textContent ?? ''
      if (!text.trim())
        return NodeFilter.FILTER_REJECT
      const parent = node.parentElement
      if (!parent)
        return NodeFilter.FILTER_REJECT
      if (parent.closest('.typewriter-cursor, .height-estimation-probes, [data-node-type="code_block"], [data-node-type="admonition"], [data-node-type="table"], [data-node-type="math_block"], [data-node-type="html_block"], [data-node-type="image"], script, style'))
        return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let last: Text | null = null
  let current = walker.nextNode()
  while (current) {
    last = current as Text
    current = walker.nextNode()
  }
  return last
}

function updateTypewriterCursorPosition() {
  if (typeof window === 'undefined' || !showTypewriterCursor.value || !containerRef.value || !typewriterCursorRef.value)
    return
  const root = containerRef.value
  const cursor = typewriterCursorRef.value
  const lastText = getLastTextNode(root)
  const rootRect = root.getBoundingClientRect()
  let left = 0
  let top = 0
  let height = 20

  if (lastText?.textContent) {
    const range = document.createRange()
    const end = lastText.textContent.length
    range.setStart(lastText, Math.max(0, end - 1))
    range.setEnd(lastText, end)
    const rects = typeof range.getClientRects === 'function'
      ? range.getClientRects()
      : undefined
    const rect = rects?.[rects.length - 1] ?? lastText.parentElement?.getBoundingClientRect()
    if (rect) {
      left = rect.right - rootRect.left + root.scrollLeft
      top = rect.top - rootRect.top + root.scrollTop
      height = rect.height || height
    }
    range.detach()
  }

  cursor.style.transform = `translate(${Math.max(0, left)}px, ${Math.max(0, top)}px)`
  cursor.style.height = `${height}px`
}

watch(
  [renderContent, rawContent, () => props.nodes, () => props.typewriter, effectiveFinal],
  async () => {
    if (typeof window === 'undefined' || hasExplicitNodes.value)
      return

    // When the stream is final (and effective — smooth streaming has caught up),
    // hide the cursor immediately.
    if (effectiveFinal.value) {
      showTypewriterCursor.value = false
      clearTypewriterCursorTimeout()
      return
    }

    const nextLength = getTypewriterContentLength()
    const cursorAllowed = shouldShowTypewriterCursorForCurrentNodes()
    if (props.typewriter === false || !cursorAllowed || nextLength <= lastTypewriterContentLength) {
      if (props.typewriter === false || !cursorAllowed)
        showTypewriterCursor.value = false
      lastTypewriterContentLength = nextLength
      return
    }

    lastTypewriterContentLength = nextLength
    showTypewriterCursor.value = true
    clearTypewriterCursorTimeout()
    await nextTick()
    updateTypewriterCursorPosition()
    typewriterCursorTimeout = setTimeout(() => {
      showTypewriterCursor.value = false
    }, 3000)
  },
  { flush: 'post', immediate: true },
)

watch(
  showTypewriterCursor,
  async (visible) => {
    if (!visible)
      return
    await nextTick()
    updateTypewriterCursorPosition()
  },
  { flush: 'post' },
)
</script>

<template>
  <div
    ref="containerRef"
    class="markstream-vue2 markdown-renderer"
    :class="[{ dark: props.isDark }, { virtualized: virtualizationEnabled }]"
    :data-custom-id="props.customId"
    @click="handleContainerClick"
    @mouseover="handleContainerMouseover"
    @mouseout="handleContainerMouseout"
  >
    <template v-if="legacyNodesMode">
      <div
        v-for="item in legacyRenderedItems"
        :key="item.renderKey"
        class="node-slot"
        :data-node-index="item.index"
        :data-node-type="item.node.type"
      >
        <div class="node-content">
          <transition
            v-if="!item.isCodeBlock && props.fade !== false"
            name="fade"
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
              @copy="emitCodeCopy($event)"
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
            @copy="emitCodeCopy($event)"
            @handle-artifact-click="emit('handleArtifactClick', $event)"
          />
        </div>
      </div>
    </template>
    <LegacyNodesRenderer
      v-else-if="legacyStructuredContentMode"
      :nodes="parsedNodes"
      :custom-id="props.customId"
      :index-key="props.indexKey"
      :typewriter="props.typewriter"
      :fade="props.fade"
      :show-tooltips="props.showTooltips"
      :code-block-stream="props.codeBlockStream"
      :code-block-dark-theme="props.codeBlockDarkTheme"
      :code-block-light-theme="props.codeBlockLightTheme"
      :code-block-monaco-options="props.codeBlockMonacoOptions"
      :render-code-blocks-as-pre="props.renderCodeBlocksAsPre"
      :code-block-min-width="props.codeBlockMinWidth"
      :code-block-max-width="props.codeBlockMaxWidth"
      :code-block-props="props.codeBlockProps"
      :themes="props.themes"
      :langs="props.langs"
      :is-dark="props.isDark"
      :custom-html-tags="mergedParseOptions.customHtmlTags"
      :html-policy="resolvedHtmlPolicy"
      @copy="emitCodeCopy($event)"
      @handle-artifact-click="emit('handleArtifactClick', $event)"
    />
    <template v-else>
      <div
        v-if="virtualizationEnabled"
        class="node-spacer"
        :style="{ height: `${topSpacerHeight}px` }"
        aria-hidden="true"
      />
      <div
        v-for="item in renderedItems"
        :key="item.renderKey"
        :ref="`node-slot-${item.index}`"
        class="node-slot"
        :data-node-index="item.index"
        :data-node-type="item.node.type"
      >
        <div
          v-if="shouldRenderNode(item.index)"
          :ref="`node-content-${item.index}`"
          class="node-content"
        >
          <!-- Skip wrapping code_block nodes in transitions to avoid touching Monaco editor internals -->
          <transition
            v-if="!item.isCodeBlock && props.fade !== false"
            name="fade"
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
              @copy="emitCodeCopy($event)"
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
            @copy="emitCodeCopy($event)"
            @handle-artifact-click="emit('handleArtifactClick', $event)"
          />
        </div>
        <div
          v-else
          class="node-placeholder"
          :style="{ height: `${nodeHeights[item.index] ?? averageNodeHeight}px` }"
        />
      </div>
      <div
        v-if="virtualizationEnabled"
        class="node-spacer"
        :style="{ height: `${bottomSpacerHeight}px` }"
        aria-hidden="true"
      />
    </template>
    <span v-if="showTypewriterCursor" ref="typewriterCursorRef" class="typewriter-cursor" aria-hidden="true" />
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

@media (prefers-reduced-motion: reduce) {
  .typewriter-cursor {
    animation: none !important;
  }
}
</style>

<style>
/* Global (unscoped) CSS for TransitionGroup enter animations */
.markstream-vue2 .fade-enter-from {
  opacity: 0;
}
.markstream-vue2 .fade-enter-active {
  transition: opacity var(--fade-duration, var(--typewriter-fade-duration, 280ms))
    var(--fade-ease, var(--typewriter-fade-ease, cubic-bezier(0.33, 0, 0.67, 1)));
  will-change: opacity;
}
.markstream-vue2 .fade-enter-to {
  opacity: 1;
}

.markstream-vue2 .typewriter-enter-from {
  opacity: 0;
}
.markstream-vue2 .typewriter-enter-active {
  transition: opacity var(--typewriter-fade-duration, 280ms)
    var(--typewriter-fade-ease, cubic-bezier(0.33, 0, 0.67, 1));
  will-change: opacity;
}
.markstream-vue2 .typewriter-enter-to {
  opacity: 1;
}
</style>
