import type { CodeBlockDiffHideUnchangedRegions, CodeBlockDiffHideUnchangedRegionsOptions } from '../../types/component-props'

export function resolveDiffHideUnchangedRegionsOption(value: unknown): CodeBlockDiffHideUnchangedRegions {
  if (typeof value === 'boolean')
    return value
  const raw = value as {
    collapsedContextThreshold?: unknown
    expandUnchanged?: unknown
    parseDiffOptions?: { context?: unknown }
  } | undefined
  if (raw?.expandUnchanged === true)
    return false
  const context = Number(raw?.parseDiffOptions?.context)
  const threshold = Number(raw?.collapsedContextThreshold)
  return {
    enabled: true,
    // eslint-disable-next-line unicorn/prefer-number-properties
    contextLineCount: isFinite(context) && context >= 0 ? Math.floor(context) : 2,
    // eslint-disable-next-line unicorn/prefer-number-properties
    minimumLineCount: isFinite(threshold) && threshold >= 0 ? Math.floor(threshold) + 1 : 6,
    revealLineCount: 5,
  } as CodeBlockDiffHideUnchangedRegionsOptions
}

export function resolveDiffInlineLayout(options: Record<string, unknown>) {
  return options.diffStyle === 'unified'
}

export function parseCodeFenceInfo(raw: string) {
  const firstLine = String(raw ?? '').split(/\r?\n/, 1)[0]?.trim() ?? ''
  if (firstLine.length < 3)
    return ''
  const marker = firstLine[0]
  if ((marker !== '`' && marker !== '~') || firstLine[1] !== marker || firstLine[2] !== marker)
    return ''

  let index = 3
  while (firstLine[index] === marker)
    index += 1

  return firstLine.slice(index).trim()
}

export function isDiffFenceInfo(value: unknown) {
  const firstToken = String(value ?? '').trim().split(/\s+/, 1)[0] ?? ''
  return firstToken === 'diff'
}

export function isDiffCodeBlock(node: { diff?: boolean, language?: unknown, raw?: unknown }) {
  return node.diff === true
    || isDiffFenceInfo(node.language)
    || isDiffFenceInfo(parseCodeFenceInfo(String(node.raw ?? '')))
}

export function extractCodeBlockFileLabel(raw: string) {
  const info = parseCodeFenceInfo(raw)
  if (!info)
    return ''

  const tokens = info.split(/\s+/).filter(Boolean)
  if (!tokens.length)
    return ''

  const candidates = tokens[0] === 'diff' ? tokens.slice(1) : tokens
  for (const token of candidates) {
    const value = token.includes(':')
      ? token.slice(token.indexOf(':') + 1)
      : token
    if (value && /[./\\-]/.test(value))
      return value
  }

  return ''
}

export function resolveCodeBlockHeader(raw: string, displayLanguage: string, isDiff: boolean) {
  const fileLabel = extractCodeBlockFileLabel(raw)
  return {
    title: fileLabel || displayLanguage,
    caption: fileLabel ? (isDiff ? `Diff / ${displayLanguage}` : displayLanguage) : '',
  }
}

function splitCodeLines(source: string) {
  const displaySource = String(source ?? '').replace(/\r\n$|\n$|\r$/, '')
  return displaySource ? displaySource.split(/\r\n|\n|\r/) : []
}

// Diff streaming commits feed the header stats on every chunk (watch + RAF +
// onDidUpdateDiff can all re-run the same source pair within one frame). Cache
// the most recent input pair: the stream is append-only, so consecutive calls
// either share the pair (skip the whole LCS) or differ in the tail (the prefix
// scan below is cheap). This removes the repeated full DP per frame without
// changing any semantics.
let cachedDiffStatsOriginal = ''
let cachedDiffStatsModified = ''
let cachedDiffStatsResult: { removed: number, added: number } | null = null

export function estimateDiffStats(originalSource: string, modifiedSource: string) {
  if (
    cachedDiffStatsResult
    && cachedDiffStatsOriginal === originalSource
    && cachedDiffStatsModified === modifiedSource
  ) {
    return cachedDiffStatsResult
  }

  const originalLines = splitCodeLines(originalSource)
  const modifiedLines = splitCodeLines(modifiedSource)
  let start = 0
  let originalEnd = originalLines.length - 1
  let modifiedEnd = modifiedLines.length - 1

  while (
    start <= originalEnd
    && start <= modifiedEnd
    && originalLines[start] === modifiedLines[start]
  ) {
    start++
  }

  while (
    originalEnd >= start
    && modifiedEnd >= start
    && originalLines[originalEnd] === modifiedLines[modifiedEnd]
  ) {
    originalEnd--
    modifiedEnd--
  }

  const originalMiddleLength = Math.max(0, originalEnd - start + 1)
  const modifiedMiddleLength = Math.max(0, modifiedEnd - start + 1)
  let result: { removed: number, added: number }
  if (originalMiddleLength === 0 || modifiedMiddleLength === 0) {
    result = {
      removed: originalMiddleLength,
      added: modifiedMiddleLength,
    }
  }
  else {
    const maxCells = 1_500_000
    if ((originalMiddleLength + 1) * (modifiedMiddleLength + 1) <= maxCells) {
      // Intern lines once so the quadratic LCS loop only compares integer IDs.
      const lineIds = new Map<string, number>()
      const modifiedIds = new Uint32Array(modifiedMiddleLength)
      for (let j = 0; j < modifiedMiddleLength; j++) {
        const line = modifiedLines[start + j]
        let id = lineIds.get(line)
        if (id === undefined) {
          id = lineIds.size + 1
          lineIds.set(line, id)
        }
        modifiedIds[j] = id
      }
      const originalIds = new Uint32Array(originalMiddleLength)
      for (let i = 0; i < originalMiddleLength; i++)
        originalIds[i] = lineIds.get(originalLines[start + i]) ?? 0
      const columns = modifiedMiddleLength + 1
      let next = new Uint32Array(columns)
      let current = new Uint32Array(columns)
      for (let i = originalMiddleLength - 1; i >= 0; i--) {
        current[modifiedMiddleLength] = 0
        for (let j = modifiedMiddleLength - 1; j >= 0; j--) {
          current[j] = originalIds[i] === modifiedIds[j]
            ? next[j + 1] + 1
            : Math.max(next[j], current[j + 1])
        }
        const swap = next
        next = current
        current = swap
      }
      const commonMiddleLines = next[0]
      result = {
        removed: originalMiddleLength - commonMiddleLines,
        added: modifiedMiddleLength - commonMiddleLines,
      }
    }
    else {
      result = {
        removed: originalMiddleLength,
        added: modifiedMiddleLength,
      }
    }
  }

  cachedDiffStatsOriginal = originalSource
  cachedDiffStatsModified = modifiedSource
  cachedDiffStatsResult = result
  return result
}
