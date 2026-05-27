import type React from 'react'
import type { BaseNode, HtmlPolicy, MarkdownIt, ParsedNode, ParseOptions } from 'stream-markdown-parser'
import type { CustomComponentMap } from './customComponents'
import type { SmoothMarkdownStreamOptions } from './hooks/useSmoothMarkdownStream'
import type {
  CodeBlockMonacoOptions,
  CodeBlockMonacoTheme,
  CodeBlockNodeProps,
  CodeBlockPreviewPayload,
  D2BlockNodeProps,
  InfographicBlockNodeProps,
  MermaidBlockNodeProps,
} from './types/component-props'

export type NodeRendererCodeBlockProps = Partial<Omit<CodeBlockNodeProps, 'node'>> & Record<string, unknown>

export interface NodeRendererProps {
  content?: string
  nodes?: readonly BaseNode[] | null
  /**
   * Whether the input stream is complete (end-of-stream). When true, the parser
   * can stop emitting streaming "loading" nodes for unfinished constructs.
   */
  final?: boolean
  parseOptions?: ParseOptions
  customMarkdownIt?: (md: MarkdownIt) => MarkdownIt
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
  codeBlockDarkTheme?: CodeBlockMonacoTheme
  codeBlockLightTheme?: CodeBlockMonacoTheme
  codeBlockMonacoOptions?: CodeBlockMonacoOptions
  renderCodeBlocksAsPre?: boolean
  codeBlockMinWidth?: string | number
  codeBlockMaxWidth?: string | number
  codeBlockProps?: NodeRendererCodeBlockProps
  mermaidProps?: Partial<Omit<MermaidBlockNodeProps, 'node' | 'loading' | 'isDark'>>
  d2Props?: Partial<Omit<D2BlockNodeProps, 'node' | 'loading' | 'isDark'>>
  infographicProps?: Partial<Omit<InfographicBlockNodeProps, 'node' | 'loading' | 'isDark'>>
  showTooltips?: boolean
  themes?: CodeBlockMonacoTheme[]
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
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void
  onMouseOver?: (event: React.MouseEvent<HTMLElement>) => void
  onMouseOut?: (event: React.MouseEvent<HTMLElement>) => void
}

export interface RenderContext {
  customId?: string
  isDark?: boolean
  indexKey?: string
  typewriter?: boolean
  /** Enable/disable fade animations. Default: true */
  fade?: boolean
  textStreamState?: Map<string, string>
  streamRenderVersion?: number
  customComponents?: CustomComponentMap
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
    themes?: CodeBlockMonacoTheme[]
    darkTheme?: CodeBlockMonacoTheme
    lightTheme?: CodeBlockMonacoTheme
    monacoOptions?: CodeBlockMonacoOptions
    minWidth?: string | number
    maxWidth?: string | number
  }
  events: {
    onCopy?: (code: string) => void
    onHandleArtifactClick?: (payload: CodeBlockPreviewPayload) => void
  }
}

export type RenderNodeFn = (node: ParsedNode, key: React.Key, ctx: RenderContext) => React.ReactNode
