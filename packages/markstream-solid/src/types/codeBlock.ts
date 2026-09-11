export interface CodeBlockThemePair {
  dark: string
  light: string
}

export type CodeBlockTheme = string

export type CodeBlockThemeProp = CodeBlockTheme | CodeBlockThemePair

export type CodeBlockThemes = readonly [dark: CodeBlockTheme, light: CodeBlockTheme]

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
