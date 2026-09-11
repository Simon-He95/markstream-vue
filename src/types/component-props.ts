// Centralized exported props interfaces for components
import type { CodeBlockNode } from 'stream-markdown-parser'

export interface CodeBlockThemePair {
  dark: string
  light: string
}

export type CodeBlockTheme = string

export type CodeBlockThemeProp = CodeBlockTheme | CodeBlockThemePair

export type CodeBlockThemes = readonly [dark: CodeBlockTheme, light: CodeBlockTheme]

export interface CommonCodeBlockProps {
  showHeader?: boolean
  showCopyButton?: boolean
  showExpandButton?: boolean
}

export interface CodeBlockDiffHideUnchangedRegionsOptions {
  enabled?: boolean
  contextLineCount?: number
  minimumLineCount?: number
  revealLineCount?: number
}

export type CodeBlockDiffHideUnchangedRegions
  = | boolean
    | CodeBlockDiffHideUnchangedRegionsOptions

export interface CodeBlockOptions {
  fontSize?: number
  lineHeight?: number
  fontFamily?: string
  maxHeight?: number
  padding?: number
  tabSize?: number
  disableLineNumbers?: boolean
  overflow?: 'scroll' | 'wrap'
  disableVirtualizationBuffers?: boolean
  useCSSClasses?: boolean
  useTokenTransformer?: boolean
  tokenizeMaxLineLength?: number
  tokenizeMaxLength?: number
  unsafeCSS?: string
  diffStyle?: 'unified' | 'split'
  diffIndicators?: 'classic' | 'bars' | 'none'
  disableBackground?: boolean
  hunkSeparators?: 'simple' | 'metadata' | 'line-info' | 'line-info-basic'
  expandUnchanged?: boolean
  collapsedContextThreshold?: number
  lineDiffType?: 'word-alt' | 'word' | 'char' | 'none'
  maxLineDiffLength?: number
  expansionLineCount?: number
  parseDiffOptions?: Record<string, unknown>
  lineHoverHighlight?: 'disabled' | 'both' | 'number' | 'line'
  enableTokenInteractionsOnWhitespace?: boolean
  enableGutterUtility?: boolean
  enableLineSelection?: boolean
  controlledSelection?: boolean
  onGutterUtilityClick?: (...args: any[]) => unknown
  onLineClick?: (...args: any[]) => unknown
  onLineNumberClick?: (...args: any[]) => unknown
  onLineEnter?: (...args: any[]) => unknown
  onLineLeave?: (...args: any[]) => unknown
  onTokenClick?: (...args: any[]) => unknown
  onTokenEnter?: (...args: any[]) => unknown
  onTokenLeave?: (...args: any[]) => unknown
  onLineSelected?: (...args: any[]) => unknown
  onLineSelectionStart?: (...args: any[]) => unknown
  onLineSelectionChange?: (...args: any[]) => unknown
  onLineSelectionEnd?: (...args: any[]) => unknown
  getLineIndex?: (...args: any[]) => unknown
  renderAnnotation?: (...args: any[]) => unknown
  renderGutterUtility?: (...args: any[]) => unknown
  onPostRender?: (...args: any[]) => unknown
  mergeConflict?: boolean
  lineAnnotations?: unknown[]
  onController?: (controller: any) => void
  workerManager?: unknown
}

export interface CodeBlockNodeProps extends CommonCodeBlockProps {
  node: CodeBlockNode
  codeBlockOptions?: CodeBlockOptions
  showLineNumbers?: boolean
  isDark?: boolean
  loading?: boolean
  stream?: boolean
  theme?: CodeBlockThemeProp
  /** @deprecated Use `theme` prop instead. Kept for backward compatibility. */
  darkTheme?: CodeBlockTheme
  /** @deprecated Use `theme` prop instead. Kept for backward compatibility. */
  lightTheme?: CodeBlockTheme
  isShowPreview?: boolean
  enableFontSizeControl?: boolean
  minWidth?: string | number
  maxWidth?: string | number
  themes?: CodeBlockThemes
  showPreviewButton?: boolean
  showCollapseButton?: boolean
  showFontSizeButtons?: boolean
  showTooltips?: boolean
  htmlPreviewAllowScripts?: boolean
  htmlPreviewSandbox?: string
  customId?: string
}

export interface ImageNodeProps {
  node: {
    type: 'image'
    src: string
    alt: string
    title: string | null
    raw: string
    loading?: boolean
  }
  fallbackSrc?: string
  lazy?: boolean
  usePlaceholder?: boolean
}

export interface LinkNodeProps {
  node: {
    type: 'link'
    href: string
    title: string | null
    text: string
    attrs?: [string, string][]
    children: { type: string, raw: string }[]
    raw: string
    loading?: boolean
  }
  indexKey: number | string
  customId?: string
  showTooltip?: boolean
  color?: string
  underlineHeight?: number
  underlineBottom?: number | string
  animationDuration?: number
  animationOpacity?: number
  animationTiming?: string
  animationIteration?: string | number
}

export interface PreCodeNodeProps {
  node: CodeBlockNode
  loading?: boolean
  showLineNumbers?: boolean
  diffInline?: boolean
  diffHideUnchangedRegions?: CodeBlockDiffHideUnchangedRegions
  /**
   * Optional reserved visual height for async/loading fallbacks.
   * Used by virtual-scroll restore paths to avoid a zero/short pending frame.
   */
  reservedHeightPx?: number
}

export interface MermaidBlockNodeProps {
  node: CodeBlockNode
  maxHeight?: string | null
  estimatedPreviewHeightPx?: number
  loading?: boolean
  isDark?: boolean
  workerTimeoutMs?: number
  parseTimeoutMs?: number
  renderTimeoutMs?: number
  fullRenderTimeoutMs?: number
  renderDebounceMs?: number
  contentStableDelayMs?: number
  previewPollDelayMs?: number
  previewPollMaxDelayMs?: number
  previewPollMaxAttempts?: number
  // header customization
  showHeader?: boolean
  showModeToggle?: boolean
  showCopyButton?: boolean
  showExportButton?: boolean
  showFullscreenButton?: boolean
  showCollapseButton?: boolean
  showZoomControls?: boolean
  enableWheelZoom?: boolean
  // Defaults to true. Set false only for trusted diagrams that need Mermaid's loose render config. SVG output is still sanitized.
  isStrict?: boolean
  // Defaults to false. Set true only for trusted diagrams that need Mermaid-generated click bindings after sanitized SVG mount.
  enableMermaidInteractions?: boolean
  showTooltips?: boolean
  // Custom error handler called when mermaid rendering fails.
  // Receives the error, the raw mermaid code, and the container element.
  // Return true to prevent the default error display.
  onRenderError?: (error: unknown, code: string, container: HTMLElement) => boolean | void
}

export interface CodeBlockPreviewPayload {
  node: CodeBlockNode
  artifactType: 'text/html' | 'image/svg+xml'
  artifactTitle: string
  id: string
}

export interface MermaidBlockEvent<TPayload = unknown> {
  payload?: TPayload
  defaultPrevented: boolean
  preventDefault: () => void
  svgElement?: SVGElement | null
  svgString?: string | null
}

export interface D2BlockNodeProps {
  node: CodeBlockNode
  maxHeight?: string | null
  estimatedPreviewHeightPx?: number
  loading?: boolean
  isDark?: boolean
  progressiveRender?: boolean
  progressiveIntervalMs?: number
  themeId?: number | null
  darkThemeId?: number | null
  showHeader?: boolean
  showModeToggle?: boolean
  showCopyButton?: boolean
  showExportButton?: boolean
  showCollapseButton?: boolean
}

export interface InfographicBlockNodeProps {
  node: CodeBlockNode
  maxHeight?: string | null
  estimatedPreviewHeightPx?: number
  loading?: boolean
  isDark?: boolean
  showHeader?: boolean
  showModeToggle?: boolean
  showCopyButton?: boolean
  showCollapseButton?: boolean
  showExportButton?: boolean
  showFullscreenButton?: boolean
  showZoomControls?: boolean
}

export interface MathBlockNodeProps {
  node: {
    type: 'math_block'
    content: string
    raw: string
    loading?: boolean
  }
  indexKey?: number | string
  cacheScope?: string | number
}

export interface MathInlineNodeProps {
  node: {
    type: 'math_inline'
    content: string
    raw: string
    loading?: boolean
    markup?: string
  }
}
