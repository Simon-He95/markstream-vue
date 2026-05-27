// Centralized exported props interfaces for components
import type { CodeBlockNode } from 'stream-markdown-parser'

export interface CodeBlockMonacoThemeObject {
  name: string
  base?: string
  inherit?: boolean
  colors?: Record<string, string>
  rules?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export type CodeBlockMonacoTheme = string | CodeBlockMonacoThemeObject

export type CodeBlockMonacoLanguage = string | ((...args: unknown[]) => unknown)

export interface CodeBlockDiffHideUnchangedRegionsOptions {
  enabled?: boolean
  contextLineCount?: number
  minimumLineCount?: number
  revealLineCount?: number
}

export type CodeBlockDiffHideUnchangedRegions
  = | boolean
    | CodeBlockDiffHideUnchangedRegionsOptions

export type CodeBlockDiffLineStyle = 'background' | 'bar'

export type CodeBlockDiffAppearance = 'auto' | 'light' | 'dark'

export type CodeBlockDiffUnchangedRegionStyle = 'line-info' | 'line-info-basic' | 'metadata' | 'simple'

export type CodeBlockDiffHunkActionKind = 'revert' | 'stage'

export type CodeBlockDiffHunkSide = 'upper' | 'lower'

export interface CodeBlockDiffHunkActionContext {
  action: CodeBlockDiffHunkActionKind
  side: CodeBlockDiffHunkSide
  lineChange: unknown
  originalModel: unknown
  modifiedModel: unknown
}

export interface CodeBlockMonacoOptions {
  MAX_HEIGHT?: number | string
  fontSize?: number
  lineHeight?: number
  fontFamily?: string
  tabSize?: number
  readOnly?: boolean
  wordWrap?: 'off' | 'on' | 'wordWrapColumn' | 'bounded' | string
  wrappingIndent?: 'none' | 'same' | 'indent' | 'deepIndent' | string
  theme?: string
  themes?: CodeBlockMonacoTheme[]
  languages?: CodeBlockMonacoLanguage[]
  renderSideBySide?: boolean
  useInlineViewWhenSpaceIsLimited?: boolean
  enableSplitViewResizing?: boolean
  ignoreTrimWhitespace?: boolean
  maxComputationTime?: number
  diffAlgorithm?: string
  renderIndicators?: boolean
  originalEditable?: boolean
  revealDebounceMs?: number
  revealStrategy?: 'bottom' | 'centerIfOutside' | 'center'
  revealBatchOnIdleMs?: number
  updateThrottleMs?: number
  diffUpdateThrottleMs?: number
  diffAutoScroll?: boolean
  diffHideUnchangedRegions?: CodeBlockDiffHideUnchangedRegions
  diffLineStyle?: CodeBlockDiffLineStyle
  diffAppearance?: CodeBlockDiffAppearance
  diffUnchangedRegionStyle?: CodeBlockDiffUnchangedRegionStyle
  diffHunkActionsOnHover?: boolean
  diffHunkHoverHideDelayMs?: number
  onDiffHunkAction?: (context: CodeBlockDiffHunkActionContext) => void | boolean | Promise<void | boolean>
  scrollbar?: Record<string, unknown>
  [key: string]: unknown
}

export interface CodeBlockNodeProps {
  node: CodeBlockNode
  isDark?: boolean
  loading?: boolean
  stream?: boolean
  darkTheme?: CodeBlockMonacoTheme
  lightTheme?: CodeBlockMonacoTheme
  isShowPreview?: boolean
  monacoOptions?: CodeBlockMonacoOptions
  enableFontSizeControl?: boolean
  minWidth?: string | number
  maxWidth?: string | number
  themes?: CodeBlockMonacoTheme[]
  showHeader?: boolean
  showCopyButton?: boolean
  showExpandButton?: boolean
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
  showHeader?: boolean
  showModeToggle?: boolean
  showCopyButton?: boolean
  showExportButton?: boolean
  showFullscreenButton?: boolean
  showCollapseButton?: boolean
  showZoomControls?: boolean
  enableWheelZoom?: boolean
  // Defaults to true. Set false only for trusted diagrams that need loose Mermaid HTML labels.
  isStrict?: boolean
  // Defaults to false. Set true only for trusted diagrams that need Mermaid-generated click bindings after sanitized SVG mount.
  enableMermaidInteractions?: boolean
  showTooltips?: boolean
  onRenderError?: (error: unknown, code: string, container: HTMLElement) => boolean | void
}

export interface CodeBlockPreviewPayload {
  node: CodeBlockNode
  artifactType: 'text/html' | 'image/svg+xml'
  artifactTitle: string
  id: string
}

export interface MarkdownCodeBlockPreviewPayload {
  type: 'text/html' | 'image/svg+xml'
  content: string
  title: string
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

export interface MathBlockNodeProps {
  node: {
    type: 'math_block'
    content: string
    raw: string
    loading?: boolean
  }
  indexKey?: number | string
}

export interface MathInlineNodeProps {
  node: {
    type: 'math_inline'
    content: string
    raw: string
    loading?: boolean
    markup?: string
  }
  indexKey?: number | string
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
