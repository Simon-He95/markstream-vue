export const MERMAID_PREVIEW_MIN_HEIGHT = 360
export const MERMAID_PREVIEW_MAX_HEIGHT = 500
// Floor for the *fitted* preview height (MermaidBlockNode's `fitPreviewHeight`).
// MERMAID_PREVIEW_MIN_HEIGHT above is a pre-render reservation and also backs
// --ms-size-diagram-min-height, so reusing it after the diagram has resolved
// would keep the blank space that fitting exists to remove; a 0 floor would let
// a one-line diagram collapse into a sliver.
export const MERMAID_FITTED_PREVIEW_MIN_HEIGHT = 120
export const INFOGRAPHIC_PREVIEW_MIN_HEIGHT = 360
export const INFOGRAPHIC_PREVIEW_MAX_HEIGHT = 500
export const D2_PREVIEW_MIN_HEIGHT = 240
// Matches the rendered preview's own cap (--ms-size-code-max-height, 500px):
// reserving more than the preview can occupy would trade the growth shift for a
// shrink shift once the diagram resolves.
export const D2_PREVIEW_MAX_HEIGHT = 500

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

/**
 * Clamps a height measured from the rendered diagram to the fitted range: the
 * max still caps the preview at what it can occupy, the floor is the fitted
 * floor rather than the pre-render reservation.
 */
export function clampFittedMermaidPreviewHeight(
  height: number,
  minHeight = MERMAID_FITTED_PREVIEW_MIN_HEIGHT,
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

// D2 keywords that configure a diagram or a shape instead of declaring one.
// They take a scalar value (`direction: right`, `shape: cylinder`) and must not
// be counted as shapes.
const D2_DIRECTIVE_KEYS = new Set([
  'direction',
  'label',
  'shape',
  'icon',
  'near',
  'link',
  'tooltip',
  'width',
  'height',
  'grid-rows',
  'grid-columns',
  'grid-gap',
  'vertical-gap',
  'horizontal-gap',
  'class',
  'constraint',
  'source-arrowhead',
  'target-arrowhead',
])

// These open a block of settings, so every line up to the closing brace is a
// setting as well (`vars: { d2-config: { layout-engine: elk } }`).
const D2_DIRECTIVE_BLOCK_KEYS = new Set([
  'vars',
  'classes',
  'style',
  'layers',
  'scenarios',
  'steps',
])

function braceDepthDelta(line: string) {
  let depth = 0
  let inString = false
  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    if (char === '"' || char === '\'') {
      inString = !inString
      continue
    }
    if (inString)
      continue
    if (char === '{')
      depth += 1
    else if (char === '}')
      depth -= 1
  }
  return depth
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
 *
 * `key: value` lines are shapes unless the key is a known directive. D2 declares
 * a shape's label that way (`client: Web Client`) and containers use it as well
 * (`server: {`), so treating every `key:` line as a directive — the first cut of
 * this estimator — measured labelled diagrams as if they had no shapes at all
 * and reserved the 240px floor for them.
 */
export function estimateD2PreviewHeight(code: string) {
  let lineCount = 0
  let nodeCount = 0
  let directiveBlockDepth = 0

  for (const rawLine of code.split(/\r?\n/)) {
    const line = rawLine.trim()

    // Inside `vars`/`classes`/`style`/... every line is a setting, not a shape.
    if (directiveBlockDepth > 0) {
      directiveBlockDepth = Math.max(0, directiveBlockDepth + braceDepthDelta(line))
      continue
    }

    if (!line || line.startsWith('#') || line.startsWith('...'))
      continue
    if (/^[}\]]+$/.test(line))
      continue

    const declaration = line.match(/^([A-Z_][\w-]*)\s*:(.*)$/i)
    if (declaration) {
      const key = declaration[1].toLowerCase()
      if (D2_DIRECTIVE_BLOCK_KEYS.has(key)) {
        lineCount += 1
        directiveBlockDepth = Math.max(0, braceDepthDelta(declaration[2]))
        continue
      }
      if (D2_DIRECTIVE_KEYS.has(key)) {
        lineCount += 1
        continue
      }
    }

    nodeCount += 1
    lineCount += 1
  }

  // Rank-direction diagrams grow with depth, not with row count, so the node
  // count dominates; each node contributes a box plus surrounding spacing.
  const estimated = 120 + Math.max(1, nodeCount) * 46 + Math.max(0, lineCount - nodeCount) * 8

  return clampPreviewHeight(estimated, D2_PREVIEW_MIN_HEIGHT, D2_PREVIEW_MAX_HEIGHT)
}
