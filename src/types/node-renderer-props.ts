import type { BaseNode, HtmlPolicy, MarkdownIt, ParseOptions } from 'stream-markdown-parser'
import type { Ref } from 'vue'
import type { SmoothMarkdownStreamOptions } from '../composables/useSmoothMarkdownStream'
import type {
  CodeBlockMonacoOptions,
  CodeBlockMonacoTheme,
  CodeBlockNodeProps,
  D2BlockNodeProps,
  InfographicBlockNodeProps,
  MermaidBlockNodeProps,
  ShikiCodeBlockProps,
} from './component-props'

type NodeRendererCodeBlockThemes
  = CodeBlockNodeProps['themes']
    | ShikiCodeBlockProps['themes']

export type NodeRendererCodeBlockProps
  = Partial<Omit<CodeBlockNodeProps, 'node' | 'themes'>>
    & Partial<Omit<ShikiCodeBlockProps, 'themes'>>
    & {
      themes?: NodeRendererCodeBlockThemes
    }
    & Record<string, unknown>
export type NodeRendererMode = 'docs' | 'chat' | 'minimal'
export type NodeRendererCodeRenderer = 'pre' | 'shiki' | 'monaco'

export type MarkstreamVirtualPhase
  = | 'estimating'
    | 'streaming'
    | 'measuring'
    | 'settling'
    | 'settled'
    | 'final'

export type MarkstreamVirtualConfidence
  = | 'estimate'
    | 'mixed'
    | 'measured'
    | 'final'

export type MarkstreamVirtualReason
  = | 'content'
    | 'parse'
    | 'batch'
    | 'resize'
    | 'node-resize'
    | 'async-node'
    | 'font'
    | 'theme'
    | 'final'
    | 'restore'
    | 'manual'

export type MarkstreamVirtualAnchor
  = | {
    type: 'node'
    nodeIndex: number
    offsetWithinNodePx: number
  }
  | {
    type: 'bottom'
    distanceFromBottomPx: number
  }

export interface MarkstreamMeasuredHeightCacheEntry {
  index: number
  height: number
}

export interface MarkstreamHeightCacheEntry extends MarkstreamMeasuredHeightCacheEntry {
  /**
   * Compatibility metadata.
   *
   * MarkdownRender exports these fields for newly captured caches, and
   * standalone virtualScroll.heightCache imports require signature at runtime.
   */
  nodeType?: string
  signature: string
}

export type MarkstreamHeightCache = MarkstreamHeightCacheEntry[]
export type MarkstreamInternalHeightCache = MarkstreamMeasuredHeightCacheEntry[]

export interface MarkstreamVirtualMetrics {
  sessionKey: string
  threadKey?: string
  phase: MarkstreamVirtualPhase
  nodeCount: number
  liveRange: {
    start: number
    end: number
  }
  renderedCount: number
  measuredCount: number
  estimatedCount: number
  averageNodeHeight: number
  topSpacerHeight: number
  bottomSpacerHeight: number
  visibleDomHeight: number
  totalHeight: number
  width: number
  final: boolean
  stable: boolean
  confidence: MarkstreamVirtualConfidence
  reason: MarkstreamVirtualReason
}

export interface MarkstreamVirtualState {
  sessionKey: string
  threadKey?: string
  /**
   * Present only when this renderer is close enough to the scrollRoot viewport
   * to own a restore anchor. Automatic height/cache state may omit it.
   */
  anchor?: MarkstreamVirtualAnchor
  /**
   * true means `anchor` was captured from this renderer's current visible or
   * near-visible viewport area. false/undefined means the state is primarily
   * for metrics and height cache.
   */
  anchorCaptured?: boolean
  metrics: MarkstreamVirtualMetrics
  width: number
  contentHash?: string
  measurementKey?: string
  heightCache?: MarkstreamHeightCache
}

export type MarkstreamScrollRoot = HTMLElement | null | undefined
export type MarkstreamScrollRootRef = Ref<MarkstreamScrollRoot>
export type MarkstreamScrollRootLike
  = | MarkstreamScrollRoot
    | MarkstreamScrollRootRef
    | {
      $el?: MarkstreamScrollRoot
    }
export type MarkstreamScrollRootResolver = () => MarkstreamScrollRootLike

export type MarkstreamVirtualScrollHeightCacheOptions
  = | {
    heightCache?: null | undefined
    heightCacheWidth?: number
  }
  | {
    /**
     * Cached measured node heights.
     *
     * When this is supplied outside restoreState, heightCacheWidth is required
     * so the renderer can reject stale layout caches after width changes.
     */
    heightCache: MarkstreamHeightCache
    heightCacheWidth: number
  }

interface MarkstreamVirtualScrollSharedBaseOptions {
  scrollRoot?: MarkstreamScrollRootLike | MarkstreamScrollRootResolver
  threadKey?: string
  restoreState?: MarkstreamVirtualState | null
  /**
   * Apply `restoreState.anchor` to the shared scroll root.
   *
   * By default `restoreState` imports compatible height cache only, so several
   * MarkdownRender instances can mount with persisted state without fighting
   * over the same outer scroll root.
   */
  restoreAnchor?: boolean | string | number
  /**
   * Extra cache invalidation key for layout-affecting host state:
   * theme, font, density, custom component style revision, Monaco line height, etc.
   */
  measurementKey?: string | number
  settleMode?: 'auto' | 'manual'
  settledToken?: string | number | boolean
  emitIntervalMs?: number
  heightDiffThresholdPx?: number
  /**
   * Maximum number of measured node-height records emitted in heightCache.
   *
   * Default: 5000. Set <= 0 to export all compatible measured heights.
   * Large values improve restore precision but increase event/state payload size.
   */
  heightCacheLimit?: number
}

export type MarkstreamVirtualScrollSharedOptions
  = MarkstreamVirtualScrollSharedBaseOptions & MarkstreamVirtualScrollHeightCacheOptions

export type MarkstreamVirtualScrollOptions
  = | (MarkstreamVirtualScrollSharedOptions & {
    enabled: true
    sessionKey: string
  })
  | (MarkstreamVirtualScrollSharedOptions & {
    enabled: boolean
    sessionKey: string
  })
  | (MarkstreamVirtualScrollSharedOptions & {
    enabled?: false
    sessionKey?: string
  })

export interface MarkstreamCaptureVirtualStateOptions {
  /**
   * Default: false for imperative capture.
   *
   * Event-driven state emission still uses viewport-gated capture internally,
   * but a host virtualizer can opt into viewport-gated imperative capture
   * during thread switch.
   */
  requireViewport?: boolean
  /**
   * Default: false.
   *
   * When true, captureVirtualState() may include a best-effort node anchor even
   * if the renderer is not near the viewport. Such anchors are emitted with
   * anchorCaptured=false and are not auto-restored unless explicitly opted in.
   */
  allowFallbackAnchor?: boolean
  /**
   * Default: true.
   */
  includeEmptyState?: boolean
}

export interface MarkstreamRendererHandle {
  getVirtualMetrics: () => MarkstreamVirtualMetrics
  captureVirtualState: (
    options?: MarkstreamCaptureVirtualStateOptions,
  ) => MarkstreamVirtualState | null
  restoreVirtualState: (
    state: MarkstreamVirtualState,
    options?: {
      /**
       * Default: false.
       *
       * Only works when state.anchor exists. Cache import still works without
       * anchor.
       */
      restoreAnchor?: boolean
      restoreToken?: string | number | boolean
      /**
       * Default: false.
       *
       * Set true only when the caller knows an anchor with
       * anchorCaptured=false still belongs to the active viewport context.
       */
      allowUncapturedAnchor?: boolean
    },
  ) => void
  forceMeasure: (reason?: MarkstreamVirtualReason) => Promise<MarkstreamVirtualMetrics>
  settle: (options?: {
    frames?: number
    timeoutMs?: number
    reason?: MarkstreamVirtualReason
    /**
     * Force-clear pending delayed height-settling timers before returning.
     * Default: false. Use only when the host knows async layout work is done.
     */
    flushPendingTimers?: boolean
  }) => Promise<MarkstreamVirtualMetrics>
  scrollToNode: (
    index: number,
    align?: 'start' | 'center' | 'end' | 'nearest',
  ) => void
}

export interface MarkstreamNodeLifecycle {
  reportHeight: (indexKey: string | number, height: number) => void
  markPending: (indexKey: string | number) => void
  markSettled: (indexKey: string | number) => void
}

export interface NodeRendererProps {
  /** Raw Markdown input. Omit this when you pass pre-parsed nodes instead. */
  content?: string
  /** Pre-parsed Markdown nodes to render without running the internal parser. */
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
   * Custom HTML-like tags that participate in streaming mid-state handling
   * and are emitted as custom nodes (e.g. ['thinking']). Forwarded to `getMarkdown()`.
   */
  customHtmlTags?: readonly string[]
  /** Preset renderer tuning. Default keeps the existing docs/rich path. */
  mode?: NodeRendererMode
  /** HTML rendering policy for html_block/html_inline nodes. Default: safe */
  htmlPolicy?: HtmlPolicy
  /** Enable priority rendering for visible viewport area */
  viewportPriority?: boolean
  /**
   * Whether code_block renders should stream updates.
   * When false, code blocks stay in a loading state and render once when final content is ready.
   * Default: true
   */
  codeBlockStream?: boolean
  /** Preferred dark Monaco theme forwarded to every code block renderer. */
  codeBlockDarkTheme?: CodeBlockMonacoTheme
  /** Preferred light Monaco theme forwarded to every code block renderer. */
  codeBlockLightTheme?: CodeBlockMonacoTheme
  /** Monaco editor options forwarded to every `CodeBlockNode`. */
  codeBlockMonacoOptions?: CodeBlockMonacoOptions
  /** Code block renderer. `renderCodeBlocksAsPre` still takes precedence when true. */
  codeRenderer?: NodeRendererCodeRenderer
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
   * When `codeRenderer="shiki"`, only string theme names are forwarded to
   * MarkdownCodeBlockNode / stream-markdown; theme objects are ignored.
   */
  themes?: CodeBlockMonacoTheme[]
  /**
   * Shiki language preload list forwarded to MarkdownCodeBlockNode.
   *
   * Vue 3 built-in Shiki mode consumes this when `codeRenderer="shiki"`.
   * React/Vue2 consume it when a custom `code_block` or language renderer
   * uses MarkdownCodeBlockNode.
   */
  langs?: readonly string[]
  /** Forces dark mode for built-in renderers such as Mermaid, D2, KaTeX, and code blocks. */
  isDark?: boolean
  /** Scope key used by `setCustomComponents()` and `data-custom-id` style overrides. */
  customId?: string
  indexKey?: number | string
  /**
   * Show a blinking typewriter cursor while streamed content grows.
   * - `true` / `'precise'`: position the cursor at the last rendered text using DOM Range measurements.
   * - `'simple'`: render a lightweight inline cursor without DOM Range measurements.
   * Applies to `content` mode; ignored when non-empty `nodes` are provided. Default: false
   */
  typewriter?: boolean | 'simple' | 'precise'
  /**
   * Enable built-in smooth pacing for streaming `content` updates.
   * - `true`: force-enable smooth streaming (content mode only)
   * - `false`: force-disable smooth streaming
   * - `'auto'` (default): enable only when typewriter/incremental mode is active
   * Applies when rendering from `content` (not `nodes`).
   * Default: 'auto'
   */
  smoothStreaming?: boolean | 'auto'
  /** Options forwarded to the built-in smooth streaming composable. */
  smoothStreamingOptions?: SmoothMarkdownStreamOptions
  /** Performance tuning knob for the minimum interval in ms between built-in smooth-streaming parse commits. Default: 80. */
  parseCoalesceMs?: number
  /** Enable/disable non-code-node enter and streamed-text fade animations. Default: true */
  fade?: boolean
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
  /** Maximum number of fully rendered nodes kept in DOM. Default: 220 */
  maxLiveNodes?: number
  /** Number of nodes to keep before/after focus. Default: 60 */
  liveNodeBuffer?: number
  /**
   * Controls node-level virtualization inside this Markdown document only.
   *
   * It does not virtualize a chat/timeline list. Use MarkstreamVirtualTimeline
   * or useMarkstreamVirtualAdapter for the outer conversation surface.
   */
  nodeVirtual?: boolean | 'auto'
  /** Advanced: report logical height and restore state to an outer virtual scroller. */
  virtualScroll?: MarkstreamVirtualScrollOptions
  /** Internal: render nodes as a fragment without container wrappers */
  renderAsFragment?: boolean
}
