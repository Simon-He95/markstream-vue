export interface PreCodeVisualInput {
  fontFamily?: string
  fontSize?: number
  lineHeight?: number
  maxHeight?: number
  overflow?: 'scroll' | 'wrap'
  padding?: number
  tabSize?: number
}

export const DEFAULT_PRE_CODE_FONT_SIZE = 12
export const DEFAULT_PRE_CODE_LINE_HEIGHT = 18
export const DEFAULT_PRE_CODE_FONT_FAMILY = '"SF Mono", Monaco, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace'
export const DEFAULT_PRE_CODE_PADDING = 8
export const DEFAULT_PRE_CODE_TAB_SIZE = 4
export const DEFAULT_PRE_CODE_MAX_HEIGHT = 500
export const DEFAULT_PRE_CODE_SCROLLBAR_GUTTER = 6

export interface ResolvedPreCodeVisualOptions {
  fontFamily: string
  fontSize: number
  lineHeight: number
  maxHeight: number
  overflow: 'scroll' | 'wrap'
  padding: number
  paddingBottom: number
  scrollbarGutter: number
  tabSize: number
}

function positiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined
}

function nonNegativeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined
}

export function resolvePreCodeVisualOptions(
  options: PreCodeVisualInput | undefined,
): ResolvedPreCodeVisualOptions {
  const fontSize = positiveNumber(options?.fontSize) ?? DEFAULT_PRE_CODE_FONT_SIZE
  const lineHeight = positiveNumber(options?.lineHeight)
    ?? (fontSize === DEFAULT_PRE_CODE_FONT_SIZE
      ? DEFAULT_PRE_CODE_LINE_HEIGHT
      : Math.max(12, Math.round(fontSize * 1.5)))
  const fontFamily = typeof options?.fontFamily === 'string' && options.fontFamily.trim()
    ? options.fontFamily.trim()
    : DEFAULT_PRE_CODE_FONT_FAMILY
  const padding = nonNegativeNumber(options?.padding) ?? DEFAULT_PRE_CODE_PADDING

  return {
    fontFamily,
    fontSize,
    lineHeight,
    maxHeight: positiveNumber(options?.maxHeight) ?? DEFAULT_PRE_CODE_MAX_HEIGHT,
    overflow: options?.overflow ?? 'wrap',
    padding,
    paddingBottom: padding,
    scrollbarGutter: DEFAULT_PRE_CODE_SCROLLBAR_GUTTER,
    tabSize: positiveNumber(options?.tabSize) ?? DEFAULT_PRE_CODE_TAB_SIZE,
  }
}

export function resolvePreCodeLayoutStyle(visual: ResolvedPreCodeVisualOptions, options: {
  padding?: number
  showLineNumbers?: boolean
  diff?: boolean
}) {
  const horizontal = options.padding == null ? '1ch' : `${visual.padding}px`
  return {
    '--markstream-code-font-family': visual.fontFamily,
    '--markstream-code-padding-x': horizontal,
    '--markstream-code-padding-y': `${visual.padding}px`,
    '--markstream-code-padding-bottom': `${visual.paddingBottom}px`,
    '--markstream-code-scrollbar-gutter': `${visual.scrollbarGutter}px`,
    '--markstream-code-tab-size': String(visual.tabSize),
    ...(options.diff ? { '--markstream-pre-diff-line-height': `${visual.lineHeight}px` } : {}),
    '--markstream-pre-line-number-top': `${visual.padding}px`,
    '--markstream-pre-line-number-left': '0px',
    '--markstream-pre-line-number-padding-left': '2ch',
    '--markstream-pre-line-number-padding-right': '1ch',
    '--markstream-pre-line-number-separator-width': '2px',
    '--markstream-pre-line-number-gap-to-code': horizontal,
    '--markstream-code-padding-left': 'calc(var(--markstream-pre-line-number-padding-left, 2ch) + var(--markstream-pre-line-number-width, 2ch) + var(--markstream-pre-line-number-padding-right, 1ch) + var(--markstream-pre-line-number-separator-width, 2px) + var(--markstream-pre-line-number-gap-to-code, 1ch))',
    'background-color': 'var(--markstream-code-fallback-bg, var(--markstream-code-theme-bg, var(--markstream-pre-resolved-theme-bg)))',
    'color': 'var(--markstream-code-fallback-fg, var(--markstream-code-theme-fg, var(--markstream-pre-resolved-theme-fg)))',
    'box-sizing': 'border-box',
    'font-family': visual.fontFamily,
    'font-size': `${visual.fontSize}px`,
    'line-height': `${visual.lineHeight}px`,
    'tab-size': visual.tabSize,
    'white-space': visual.overflow === 'scroll' ? 'pre' : 'pre-wrap',
    'overflow': 'auto',
    'overflow-x': visual.overflow === 'wrap' ? 'hidden' : 'auto',
    'overflow-y': 'auto',
    'overflow-wrap': visual.overflow === 'wrap' ? 'anywhere' : 'normal',
    'word-break': 'normal',
    'padding-top': `${visual.padding}px`,
    'padding-bottom': `${visual.paddingBottom}px`,
    'padding-left': options.showLineNumbers ? 'var(--markstream-code-padding-left)' : horizontal,
    'padding-right': horizontal,
    'max-height': `${visual.maxHeight}px`,
    'scrollbar-gutter': options.diff ? 'auto' : 'stable',
    'width': '100%',
    'margin': '0',
  } as const
}
