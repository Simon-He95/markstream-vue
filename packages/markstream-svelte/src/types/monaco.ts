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
