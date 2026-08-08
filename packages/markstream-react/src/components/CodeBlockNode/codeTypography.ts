type CodeBlockOptions = Record<string, unknown> | null | undefined

export const defaultCodeFontFamily = '"SF Mono", Monaco, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace'
export const defaultCodeFontSize = 12
export const defaultCodeLineHeight = 18

export function readPositiveCodeMetric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

export function resolveCodePadding(
  options?: CodeBlockOptions,
  defaultPadding = 8,
) {
  const padding = options?.padding
  if (!padding || typeof padding !== 'object')
    return { top: defaultPadding, bottom: defaultPadding }

  const raw = padding as Record<string, unknown>
  return {
    top: readPositiveCodeMetric(raw.top) ?? 0,
    bottom: readPositiveCodeMetric(raw.bottom) ?? 0,
  }
}

export function resolveCodeTypography(
  options?: CodeBlockOptions,
  preferredFontSize?: number,
) {
  const fontSize = readPositiveCodeMetric(options?.fontSize)
    ?? readPositiveCodeMetric(preferredFontSize)
    ?? defaultCodeFontSize
  const lineHeight = readPositiveCodeMetric(options?.lineHeight)
    ?? (fontSize === defaultCodeFontSize
      ? defaultCodeLineHeight
      : Math.max(12, Math.round(fontSize * 1.5)))
  const fontFamily = typeof options?.fontFamily === 'string' && options.fontFamily.trim()
    ? options.fontFamily.trim()
    : defaultCodeFontFamily

  return {
    fontFamily,
    fontSize,
    lineHeight,
  }
}
