export const MERMAID_PREVIEW_MIN_HEIGHT = 360
export const MERMAID_PREVIEW_MAX_HEIGHT = 500
export const INFOGRAPHIC_PREVIEW_MIN_HEIGHT = 360
export const INFOGRAPHIC_PREVIEW_MAX_HEIGHT = 500

export function parsePositiveNumber(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

export function getMermaidDiagramKind(code: string) {
  for (const rawLine of code.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('%%'))
      continue
    const match = line.match(/^([A-Z][\w-]*)\b/i)
    return match?.[1]?.toLowerCase() || ''
  }
  return ''
}

export function estimateMermaidPreviewHeight(code: string) {
  const meaningfulLines = code
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('%%'))
  const lineCount = Math.max(1, meaningfulLines.length)
  const kind = getMermaidDiagramKind(code)

  if (kind === 'gantt')
    return 220 + lineCount * 28
  if (kind === 'sequencediagram')
    return 180 + lineCount * 26
  if (kind === 'classdiagram' || kind === 'statediagram' || kind === 'erdiagram')
    return 180 + lineCount * 24
  if (kind === 'flowchart' || kind === 'graph')
    return 170 + lineCount * 28
  return 200 + lineCount * 22
}

export function estimateInfographicPreviewHeight(code: string) {
  const itemCount = code
    .split(/\r?\n/)
    .filter(line => /^\s*-\s+/.test(line))
    .length

  if (itemCount >= 3)
    return INFOGRAPHIC_PREVIEW_MAX_HEIGHT
  if (itemCount > 0)
    return 280 + itemCount * 60

  return INFOGRAPHIC_PREVIEW_MIN_HEIGHT
}

export function clampPreviewHeight(
  height: number,
  minHeight = MERMAID_PREVIEW_MIN_HEIGHT,
  maxHeight: number | null = MERMAID_PREVIEW_MAX_HEIGHT,
) {
  return maxHeight == null
    ? Math.max(minHeight, height)
    : Math.min(Math.max(minHeight, height), maxHeight)
}

/**
 * Resolve the diagram preview minimum height from the CSS token
 * (`--ms-size-diagram-min-height`), falling back to the provided default.
 * SSR-safe: without a mounted container (Svelte SSR) the token is unreadable,
 * so the fallback applies instead.
 */
export function resolveDiagramMinPreviewHeight(
  container: HTMLElement | null | undefined,
  fallback: number,
) {
  const raw = container
    ? getComputedStyle(container).getPropertyValue('--ms-size-diagram-min-height').trim()
    : ''
  return parsePositiveNumber(raw) ?? fallback
}
