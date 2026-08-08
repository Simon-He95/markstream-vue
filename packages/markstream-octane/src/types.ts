import type * as Octane from 'octane'
import type { ComponentBody } from 'octane'
import type { BaseNode, HtmlPolicy, MarkdownIt, ParsedNode, ParseOptions } from 'stream-markdown-parser'
import type { CustomComponentMap, HtmlComponentDefinitions, HtmlComponentMap, StreamingComponentDefinitions, StreamingComponentMap } from './customComponents'
import type { SmoothMarkdownStreamOptions } from './hooks/useSmoothMarkdownStream'
import type {
  CodeBlockNodeProps,
  CodeBlockPreviewPayload,
  CodeBlockTheme,
  D2BlockNodeProps,
  InfographicBlockNodeProps,
  MermaidBlockNodeProps,
  ShikiCodeBlockProps,
} from './types/component-props'

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

export interface NodeRendererProps<
  TStreamingComponents extends Record<string, ComponentBody<any>> = StreamingComponentMap,
  THtmlComponents extends Record<string, any> = HtmlComponentMap,
> {
  content?: string
  nodes?: readonly BaseNode[] | null
  /**
   * Whether the input stream is complete (end-of-stream). When true, the parser
   * can stop emitting streaming "loading" nodes for unfinished constructs.
   */
  final?: boolean
  parseOptions?: ParseOptions
  customMarkdownIt?: (md: MarkdownIt) => MarkdownIt
  streamingComponents?: TStreamingComponents & StreamingComponentDefinitions<TStreamingComponents>
  htmlComponents?: THtmlComponents & HtmlComponentDefinitions<THtmlComponents>
  /** Log parse/render timing stats (dev only). */
  debugPerformance?: boolean
  /**
   * Custom HTML-like tags that should be emitted as custom nodes (e.g. ['thinking']).
   * Forwarded to `getMarkdown()` and merged into parseOptions.
   */
  customHtmlTags?: readonly string[]
  htmlPolicy?: HtmlPolicy
  viewportPriority?: boolean
  codeBlockStream?: boolean
  codeBlockDarkTheme?: CodeBlockTheme
  codeBlockLightTheme?: CodeBlockTheme
  renderCodeBlocksAsPre?: boolean
  codeBlockMinWidth?: string | number
  codeBlockMaxWidth?: string | number
  codeBlockProps?: NodeRendererCodeBlockProps
  mermaidProps?: Partial<Omit<MermaidBlockNodeProps, 'node' | 'loading' | 'isDark'>>
  d2Props?: Partial<Omit<D2BlockNodeProps, 'node' | 'loading' | 'isDark'>>
  infographicProps?: Partial<Omit<InfographicBlockNodeProps, 'node' | 'loading' | 'isDark'>>
  showTooltips?: boolean
  /**
   * Theme names or theme objects preloaded for stream-diffs backed code blocks.
   */
  themes?: CodeBlockTheme[]
  /**
   * Shiki language preload list.
   *
   * The default Octane code block renderer is stream-diffs backed. This prop is
   * used when a custom `code_block` or language renderer opts into Shiki.
   */
  langs?: readonly string[]
  isDark?: boolean
  customId?: string
  indexKey?: number | string
  /** Show a blinking typewriter cursor while streamed content grows. Default: false */
  typewriter?: boolean
  /** Enable/disable non-code-node enter and streamed-text fade animations. Default: true */
  fade?: boolean
  /**
   * Enable built-in smooth pacing for streaming `content` updates.
   * - `true`: force-enable smooth streaming (content mode only)
   * - `false`: force-disable smooth streaming
   * - `'auto'` (default): enable only when typewriter/incremental mode is active
   * Applies when rendering from `content` (not `nodes`).
   */
  smoothStreaming?: boolean | 'auto'
  /** Options forwarded to the built-in smooth streaming controller. Read once when the renderer is created. */
  smoothStreamingOptions?: SmoothMarkdownStreamOptions
  batchRendering?: boolean
  initialRenderBatchSize?: number
  renderBatchSize?: number
  renderBatchDelay?: number
  renderBatchBudgetMs?: number
  renderBatchIdleTimeoutMs?: number
  deferNodesUntilVisible?: boolean
  maxLiveNodes?: number
  liveNodeBuffer?: number
  onCopy?: (code: string) => void
  onHandleArtifactClick?: (payload: CodeBlockPreviewPayload) => void
  onClick?: (event: MouseEvent) => void
  onMouseOver?: (event: MouseEvent) => void
  onMouseOut?: (event: MouseEvent) => void
}

export interface RenderContext {
  customId?: string
  isDark?: boolean
  final?: boolean
  indexKey?: string
  typewriter?: boolean
  /** Enable/disable fade animations. Default: true */
  fade?: boolean
  textStreamState?: Map<string, string>
  streamRenderVersion?: number
  customComponents?: CustomComponentMap
  streamingComponents?: StreamingComponentMap
  htmlComponents?: HtmlComponentMap
  customHtmlTags?: readonly string[]
  htmlPolicy?: HtmlPolicy
  codeBlockProps?: NodeRendererCodeBlockProps
  mermaidProps?: Partial<Omit<MermaidBlockNodeProps, 'node' | 'loading' | 'isDark'>>
  d2Props?: Partial<Omit<D2BlockNodeProps, 'node' | 'loading' | 'isDark'>>
  infographicProps?: Partial<Omit<InfographicBlockNodeProps, 'node' | 'loading' | 'isDark'>>
  showTooltips?: boolean
  codeBlockStream?: boolean
  renderCodeBlocksAsPre?: boolean
  codeBlockThemes?: {
    themes?: CodeBlockTheme[]
    darkTheme?: CodeBlockTheme
    lightTheme?: CodeBlockTheme
    minWidth?: string | number
    maxWidth?: string | number
    langs?: readonly string[]
  }
  events: {
    onCopy?: (code: string) => void
    onHandleArtifactClick?: (payload: CodeBlockPreviewPayload) => void
  }
}

export type RenderNodeFn = (node: ParsedNode, key: string | number | bigint, ctx: RenderContext) => Octane.OctaneNode
