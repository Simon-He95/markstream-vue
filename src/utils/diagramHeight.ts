export const MERMAID_PREVIEW_MIN_HEIGHT = 360
export const MERMAID_PREVIEW_MAX_HEIGHT = 500
export const INFOGRAPHIC_PREVIEW_MIN_HEIGHT = 360
export const INFOGRAPHIC_PREVIEW_MAX_HEIGHT = 500
export const D2_PREVIEW_MIN_HEIGHT = 240
export const D2_PREVIEW_MAX_HEIGHT = 520

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

export function clampMermaidPreviewHeight(
  height: number,
  minHeight = MERMAID_PREVIEW_MIN_HEIGHT,
  maxHeight: number | null = MERMAID_PREVIEW_MAX_HEIGHT,
) {
  return clampPreviewHeight(height, minHeight, maxHeight)
}

export function clampInfographicPreviewHeight(
  height: number,
  minHeight = INFOGRAPHIC_PREVIEW_MIN_HEIGHT,
  maxHeight: number | null = INFOGRAPHIC_PREVIEW_MAX_HEIGHT,
) {
  return clampPreviewHeight(height, minHeight, maxHeight)
}

export function clampD2PreviewHeight(
  height: number,
  minHeight = D2_PREVIEW_MIN_HEIGHT,
  maxHeight: number | null = D2_PREVIEW_MAX_HEIGHT,
) {
  return clampPreviewHeight(height, minHeight, maxHeight)
}

/**
 * Estimates the height a D2 diagram will occupy before its runtime has produced
 * the SVG. The source panel is much shorter than the rendered diagram, so
 * without a reservation the whole page below the block is pushed down when the
 * preview appears (measured ~238px, ~0.10 CLS on the playground).
 *
 * The estimate deliberately errs low: the renderer keeps the measured source
 * height as a floor as well, so a low estimate never shrinks the block, and any
 * residual growth is smaller than the un-reserved jump.
 */
export function estimateD2PreviewHeight(code: string) {
  const { lineCount, nodeCount } = code
    .split(/\r?\n/)
    .reduce<{ lineCount: number, nodeCount: number }>((acc, rawLine) => {
      const line = rawLine.trim()
      if (!line || line.startsWith('#') || line.startsWith('...'))
        return acc
      // `direction`, `vars`, `style` and similar are directives, not shapes.
      const isDirective = /^[A-Z_][\w-]*\s*:/i.test(line)
      if (!isDirective)
        acc.nodeCount += 1
      acc.lineCount += 1
      return acc
    }, { lineCount: 0, nodeCount: 0 })

  // Rank-direction diagrams grow with depth, not with row count, so the node
  // count dominates; each node contributes a box plus surrounding spacing.
  const estimated = 120 + Math.max(1, nodeCount) * 46 + Math.max(0, lineCount - nodeCount) * 8

  return clampPreviewHeight(estimated, D2_PREVIEW_MIN_HEIGHT, D2_PREVIEW_MAX_HEIGHT)
}
