import type { CodeBlockOptions } from '../types/component-props'

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
  options: CodeBlockOptions | undefined,
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
