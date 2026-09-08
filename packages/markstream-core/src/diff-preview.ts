export type DiffPreviewLineKind = 'context' | 'removed' | 'added' | 'hunk' | 'collapsed' | 'metadata' | 'spacer'

export interface DiffPreviewLine {
  code: string
  empty: boolean
  key: string
  kind: DiffPreviewLineKind
  metadataKind?: 'context' | 'removed' | 'added'
  number: number | string
  /** True when this collapsed row replaces the very first diff rows. */
  collapsedFirst?: boolean
  /** True when this collapsed row extends to the end of the diff (terminal). */
  collapsedLast?: boolean
}

export interface DiffPreviewPane {
  className: string
  key: string
  lines: DiffPreviewLine[]
}

export interface DiffPreviewCollapseOptions {
  contextLineCount?: number
  enabled?: boolean
  minimumLineCount?: number
}

export interface BuildDiffPreviewOptions {
  code?: unknown
  hideUnchangedRegions?: boolean | DiffPreviewCollapseOptions
  inline?: boolean
  language?: unknown
  loading?: boolean
  /** Cross-frame LCS cache for incremental reuse while streaming (optional). */
  matchCache?: DiffMatchCache
  originalCode?: unknown
  raw?: unknown
  updatedCode?: unknown
}

interface SourceLineMatch {
  modifiedIndex: number
  originalIndex: number
}

/** Cached split state of one source side, used to reuse earlier line strings across streaming frames. */
interface SourceSplitCache {
  /** Displayed source (trailing newline trimmed when not loading) the lines were split from. */
  source: string
  /** Loading flag the lines were split with. */
  loading: boolean
  /** Lines produced by splitting `source`. */
  lines: string[]
}

/**
 * Cross-frame cache for incremental LCS reuse while a diff streams (append-only
 * content). `buildDiffPreviewPanes`/`computeMatches` mutate it in place; pass a
 * fresh one per diff block (e.g. a ref in the component) — it self-validates
 * against non-append content changes and re-seeds on a full recompute.
 */
export interface DiffMatchCache {
  /** Original lines the cached matches were computed for. */
  original: string[]
  /** Modified lines the cached matches were computed for. */
  modified: string[]
  /** LCS matches for the above inputs. */
  matches: SourceLineMatch[]
  /** All original lines, used for the append-isolation check. */
  originalLines: Set<string>
  /** All modified lines, used for the append-isolation check. */
  modifiedLines: Set<string>
  /** Cached display string + split result of the original source (optional, for incremental re-splits). */
  originalSplit?: SourceSplitCache
  /** Cached display string + split result of the modified source (optional, for incremental re-splits). */
  modifiedSplit?: SourceSplitCache
}

export function createDiffMatchCache(): DiffMatchCache {
  return {
    original: [],
    modified: [],
    matches: [],
    originalLines: new Set(),
    modifiedLines: new Set(),
  }
}

function isLinePrefix(prefix: string[], lines: string[]): boolean {
  if (prefix.length === 0 || prefix.length > lines.length)
    return false
  for (let index = 0; index < prefix.length; index++) {
    if (prefix[index] !== lines[index])
      return false
  }
  return true
}

function reseedMatchCache(cache: DiffMatchCache, original: string[], modified: string[], matches: SourceLineMatch[]) {
  cache.original = original
  cache.modified = modified
  cache.matches = matches
  cache.originalLines = new Set(original)
  cache.modifiedLines = new Set(modified)
}

const DIFF_HEADER_PREFIXES = ['diff ', 'index ', '--- ', '+++ ', '@@ ']
const NO_NEWLINE_METADATA = '\\ No newline at end of file'

const TRAILING_NEWLINE_RE = /\r\n$|\n$|\r$/
const SOURCE_LINE_SPLIT_RE = /\r\n|\n|\r/
const ENDS_WITH_NEWLINE_RE = /(?:\r\n|\n|\r)$/

function displaySource(source: unknown, loading: boolean) {
  const value = String(source ?? '')
  return loading ? value : value.replace(TRAILING_NEWLINE_RE, '')
}

function splitSource(source: unknown, loading: boolean) {
  const value = displaySource(source, loading)
  return value ? value.split(SOURCE_LINE_SPLIT_RE) : []
}

/**
 * Incremental variant of `splitSource`. When the new display source is a pure
 * append of the previously split one (and the loading flag is unchanged), only
 * the last cached line plus the appended tail need a fresh split — earlier line
 * strings are reused by reference, keeping per-frame cost proportional to the
 * appended tail instead of the whole document. Any other change (replacement,
 * shrink, loading flip) falls back to a full re-split and reseeds the cache.
 */
function splitSourceCached(source: unknown, loading: boolean, cache: DiffMatchCache, side: 'original' | 'modified') {
  const value = displaySource(source, loading)
  const splitKey: 'originalSplit' | 'modifiedSplit' = side === 'original' ? 'originalSplit' : 'modifiedSplit'
  const previous = cache[splitKey]

  if (previous && loading === previous.loading && value.startsWith(previous.source)) {
    if (value === '') {
      cache[splitKey] = { source: '', loading, lines: [] }
      return []
    }
    const tail = value.slice(previous.source.length)
    if (tail === '')
      return previous.lines
    // A cached source ending in `\r` may pair with an appended `\n` into a
    // single CRLF break, invalidating the phantom trailing piece of the
    // previous split — re-split from that `\r` and drop its leading piece.
    const endsWithCr = previous.source.endsWith('\r')
    const region = endsWithCr
      ? previous.source.slice(-1) + tail
      : (previous.lines.at(-1) ?? '') + tail
    const fresh = region.split(SOURCE_LINE_SPLIT_RE)
    const lines = endsWithCr
      ? previous.lines.slice(0, -1).concat(fresh.slice(1))
      : previous.lines.slice(0, -1).concat(fresh)
    cache[splitKey] = { source: value, loading, lines }
    return lines
  }

  const lines = value ? value.split(SOURCE_LINE_SPLIT_RE) : []
  cache[splitKey] = { source: value, loading, lines }
  return lines
}

function normalizeLanguage(language: unknown) {
  return String(language ?? '')
    .split(/\s+/g)[0]
    ?.split(':')[0]
    ?.toLowerCase()
    .replace(/[^\w-]/g, '') || 'plaintext'
}

function isBlank(code: string) {
  return String(code ?? '').trim().length === 0
}

function makeLine(
  code: string,
  kind: DiffPreviewLineKind,
  key: string,
  number: number | string,
  preserveBlankKind = false,
): DiffPreviewLine {
  const empty = isBlank(code)
  return {
    code,
    empty,
    key,
    kind: empty && kind !== 'hunk' && kind !== 'spacer' && !preserveBlankKind ? 'context' : kind,
    number,
  }
}

function shouldPreserveBlankKind(lines: string[], index: number) {
  return !isBlank(lines[index]) || index < lines.length - 1
}

function isRemovedLine(line: string) {
  return line.startsWith('-') && !line.startsWith('---')
}

function isAddedLine(line: string) {
  return line.startsWith('+') && !line.startsWith('+++')
}

function hasDiffHeaders(lines: string[]) {
  return lines.some(line => DIFF_HEADER_PREFIXES.some(prefix => line.startsWith(prefix)))
}

function normalizeDiffBody(body: string, headers: boolean) {
  return !headers && body.startsWith(' ') && !body.startsWith('  ') ? ` ${body}` : body
}

function hasFinalNewline(source: unknown) {
  return ENDS_WITH_NEWLINE_RE.test(String(source ?? ''))
}

function createMetadataLine(
  key: string,
  metadataKind: 'context' | 'removed' | 'added',
): DiffPreviewLine {
  return {
    ...makeLine('No newline at end of file', 'metadata', key, ''),
    metadataKind,
  }
}

function appendInlineSourceMetadata(
  lines: DiffPreviewLine[],
  originalSource: unknown,
  modifiedSource: unknown,
) {
  const originalMissing = String(originalSource ?? '').length > 0 && !hasFinalNewline(originalSource)
  const modifiedMissing = String(modifiedSource ?? '').length > 0 && !hasFinalNewline(modifiedSource)
  if (!originalMissing && !modifiedMissing)
    return lines

  if (originalMissing)
    lines.push(createMetadataLine('inline-no-newline-original', 'removed'))
  if (modifiedMissing)
    lines.push(createMetadataLine('inline-no-newline-modified', 'added'))
  return lines
}

function isExplicitDiffLanguage(language: unknown, raw: unknown) {
  if (normalizeLanguage(language) === 'diff')
    return true

  const firstLine = String(raw ?? '').split(/\r?\n/, 1)[0]?.trim() ?? ''
  return /^`{3,}\s*diff(?:\s|$)|^~{3,}\s*diff(?:\s|$)/.test(firstLine)
}

function hasPatchLines(lines: string[], language: unknown, raw: unknown) {
  const hasRemoved = lines.some(line => isRemovedLine(line))
  const hasAdded = lines.some(line => isAddedLine(line))
  return (hasRemoved && hasAdded)
    || (isExplicitDiffLanguage(language, raw) && (hasRemoved || hasAdded))
}

function computeMatches(original: string[], modified: string[], cache?: DiffMatchCache): SourceLineMatch[] {
  // Incremental reuse for append-only streaming: when the new sources are a
  // pure suffix-append of the previously computed pair AND none of the appended
  // lines appears in the other side's previous content, the cached matches stay
  // optimal and only the appended tail needs a fresh LCS. The result is exact
  // (identical to a full recompute), so streaming stays consistent with the
  // settled render — the dominant cost becomes the tail size instead of the
  // whole changed region on every frame.
  if (
    cache
    && isLinePrefix(cache.original, original)
    && isLinePrefix(cache.modified, modified)
  ) {
    const deltaOriginal = original.slice(cache.original.length)
    const deltaModified = modified.slice(cache.modified.length)
    const isolated = deltaOriginal.every(line => !cache.modifiedLines.has(line))
      && deltaModified.every(line => !cache.originalLines.has(line))
    if (isolated) {
      const matches = cache.matches.concat(
        computeLcs(deltaOriginal, deltaModified).map(match => ({
          originalIndex: match.originalIndex + cache.original.length,
          modifiedIndex: match.modifiedIndex + cache.modified.length,
        })),
      )
      // The prefix check above makes it safe to extend the existing line sets.
      for (const line of deltaOriginal)
        cache.originalLines.add(line)
      for (const line of deltaModified)
        cache.modifiedLines.add(line)
      cache.original = original
      cache.modified = modified
      cache.matches = matches
      return matches
    }
  }

  const matches = computeLcs(original, modified)
  if (cache)
    reseedMatchCache(cache, original, modified, matches)
  return matches
}

function computeLcs(original: string[], modified: string[]): SourceLineMatch[] {
  const prefix: SourceLineMatch[] = []
  let start = 0
  while (start < original.length && start < modified.length && original[start] === modified[start]) {
    prefix.push({ originalIndex: start, modifiedIndex: start })
    start++
  }

  const suffix: SourceLineMatch[] = []
  let originalEnd = original.length - 1
  let modifiedEnd = modified.length - 1
  while (originalEnd >= start && modifiedEnd >= start && original[originalEnd] === modified[modifiedEnd]) {
    suffix.push({ originalIndex: originalEnd, modifiedIndex: modifiedEnd })
    originalEnd--
    modifiedEnd--
  }

  suffix.reverse()

  const originalLength = originalEnd - start + 1
  const modifiedLength = modifiedEnd - start + 1
  if (originalLength <= 0 || modifiedLength <= 0)
    return prefix.concat(suffix)

  const maxCells = 1_500_000
  if ((originalLength + 1) * (modifiedLength + 1) > maxCells)
    return prefix.concat(suffix)

  // Intern lines once so the quadratic LCS loop only compares integer IDs.
  const lineIds = new Map<string, number>()
  const modifiedIds = new Uint32Array(modifiedLength)
  for (let j = 0; j < modifiedLength; j++) {
    const line = modified[start + j]
    let id = lineIds.get(line)
    if (id === undefined) {
      id = lineIds.size + 1
      lineIds.set(line, id)
    }
    modifiedIds[j] = id
  }
  const originalIds = new Uint32Array(originalLength)
  for (let i = 0; i < originalLength; i++)
    originalIds[i] = lineIds.get(original[start + i]) ?? 0
  const columns = modifiedLength + 1
  const scores = new Uint32Array((originalLength + 1) * (modifiedLength + 1))
  for (let originalIndex = originalLength - 1; originalIndex >= 0; originalIndex--) {
    for (let modifiedIndex = modifiedLength - 1; modifiedIndex >= 0; modifiedIndex--) {
      const scoreIndex = originalIndex * columns + modifiedIndex
      if (originalIds[originalIndex] === modifiedIds[modifiedIndex]) {
        scores[scoreIndex] = scores[(originalIndex + 1) * columns + modifiedIndex + 1] + 1
      }
      else {
        scores[scoreIndex] = Math.max(
          scores[(originalIndex + 1) * columns + modifiedIndex],
          scores[originalIndex * columns + modifiedIndex + 1],
        )
      }
    }
  }

  const middle: SourceLineMatch[] = []
  let originalIndex = 0
  let modifiedIndex = 0
  while (originalIndex < originalLength && modifiedIndex < modifiedLength) {
    if (original[start + originalIndex] === modified[start + modifiedIndex]) {
      middle.push({ originalIndex: start + originalIndex, modifiedIndex: start + modifiedIndex })
      originalIndex++
      modifiedIndex++
    }
    else if (scores[(originalIndex + 1) * columns + modifiedIndex] >= scores[originalIndex * columns + modifiedIndex + 1]) {
      originalIndex++
    }
    else {
      modifiedIndex++
    }
  }
  return prefix.concat(middle, suffix)
}

const PATCH_HEADER_PREFIXES = ['diff ', 'index ', '--- ', '+++ ']

function isPatchHeaderLine(line: string, headers: boolean) {
  return headers && PATCH_HEADER_PREFIXES.some(prefix => line.startsWith(prefix))
}

function buildInlinePatchPreviewLines(lines: string[]): DiffPreviewLine[] {
  const result: DiffPreviewLine[] = []
  let originalLine = 1
  let modifiedLine = 1
  const headers = hasDiffHeaders(lines)

  for (const [index, raw] of lines.entries()) {
    if (raw === NO_NEWLINE_METADATA) {
      const previousKind = result.at(-1)?.kind
      const metadataKind = previousKind === 'removed' || previousKind === 'added'
        ? previousKind
        : 'context'
      result.push(createMetadataLine(`inline-no-newline-${index}`, metadataKind))
    }
    else if (isPatchHeaderLine(raw, headers)) {
      continue
    }
    else if (raw.startsWith('@@')) {
      const match = raw.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/)
      if (match) {
        originalLine = Number(match[1])
        modifiedLine = Number(match[2])
      }
      result.push(makeLine(raw, 'hunk', `inline-hunk-${index}`, ''))
    }
    else if (isRemovedLine(raw)) {
      result.push(makeLine(normalizeDiffBody(raw.slice(1), headers), 'removed', `inline-removed-${index}`, originalLine++, true))
    }
    else if (isAddedLine(raw)) {
      result.push(makeLine(normalizeDiffBody(raw.slice(1), headers), 'added', `inline-added-${index}`, modifiedLine++, true))
    }
    else {
      const code = headers && raw.startsWith(' ') ? raw.slice(1) : raw
      result.push(makeLine(code, 'context', `inline-context-${index}`, modifiedLine))
      originalLine++
      modifiedLine++
    }
  }

  return result
}

function buildInlineSourcePreviewLines(
  originalSource: unknown,
  modifiedSource: unknown,
  loading: boolean,
  cache?: DiffMatchCache,
): DiffPreviewLine[] {
  const original = cache
    ? splitSourceCached(originalSource, loading, cache, 'original')
    : splitSource(originalSource, loading)
  const modified = cache
    ? splitSourceCached(modifiedSource, loading, cache, 'modified')
    : splitSource(modifiedSource, loading)
  const matches = computeMatches(original, modified, cache)
  if (matches.length > 0) {
    const result: DiffPreviewLine[] = []
    let originalIndex = 0
    let modifiedIndex = 0

    for (const match of matches) {
      while (originalIndex < match.originalIndex) {
        result.push(makeLine(original[originalIndex], 'removed', `inline-removed-source-${originalIndex}`, originalIndex + 1, shouldPreserveBlankKind(original, originalIndex)))
        originalIndex++
      }
      while (modifiedIndex < match.modifiedIndex) {
        result.push(makeLine(modified[modifiedIndex], 'added', `inline-added-source-${modifiedIndex}`, modifiedIndex + 1, shouldPreserveBlankKind(modified, modifiedIndex)))
        modifiedIndex++
      }
      result.push(makeLine(modified[match.modifiedIndex], 'context', `inline-context-source-${match.originalIndex}-${match.modifiedIndex}`, match.modifiedIndex + 1))
      originalIndex = match.originalIndex + 1
      modifiedIndex = match.modifiedIndex + 1
    }

    while (originalIndex < original.length) {
      result.push(makeLine(original[originalIndex], 'removed', `inline-removed-source-${originalIndex}`, originalIndex + 1, shouldPreserveBlankKind(original, originalIndex)))
      originalIndex++
    }
    while (modifiedIndex < modified.length) {
      result.push(makeLine(modified[modifiedIndex], 'added', `inline-added-source-${modifiedIndex}`, modifiedIndex + 1, shouldPreserveBlankKind(modified, modifiedIndex)))
      modifiedIndex++
    }

    return result
  }

  const result: DiffPreviewLine[] = []
  let start = 0
  let originalEnd = original.length - 1
  let modifiedEnd = modified.length - 1

  while (start <= originalEnd && start <= modifiedEnd && original[start] === modified[start]) {
    result.push(makeLine(modified[start], 'context', `inline-prefix-${start}`, start + 1))
    start++
  }

  const suffix: DiffPreviewLine[] = []
  while (originalEnd >= start && modifiedEnd >= start && original[originalEnd] === modified[modifiedEnd]) {
    suffix.unshift(makeLine(modified[modifiedEnd], 'context', `inline-suffix-${modifiedEnd}`, modifiedEnd + 1))
    originalEnd--
    modifiedEnd--
  }

  for (let index = start; index <= originalEnd; index++) {
    result.push(makeLine(original[index], 'removed', `inline-removed-source-${index}`, index + 1, shouldPreserveBlankKind(original, index)))
  }

  for (let index = start; index <= modifiedEnd; index++) {
    result.push(makeLine(modified[index], 'added', `inline-added-source-${index}`, index + 1, shouldPreserveBlankKind(modified, index)))
  }

  return result.concat(suffix)
}

function buildSideBySideSourcePreviewPanes(
  originalSource: unknown,
  modifiedSource: unknown,
  loading: boolean,
  hideUnchangedRegions: BuildDiffPreviewOptions['hideUnchangedRegions'],
  cache?: DiffMatchCache,
): DiffPreviewPane[] {
  const originalSourceLines = cache
    ? splitSourceCached(originalSource, loading, cache, 'original')
    : splitSource(originalSource, loading)
  const modifiedSourceLines = cache
    ? splitSourceCached(modifiedSource, loading, cache, 'modified')
    : splitSource(modifiedSource, loading)
  const matches = computeMatches(originalSourceLines, modifiedSourceLines, cache)
  const originalLines: DiffPreviewLine[] = []
  const modifiedLines: DiffPreviewLine[] = []
  let originalIndex = 0
  let modifiedIndex = 0
  let blockIndex = 0

  const appendChangedBlock = (originalEnd: number, modifiedEnd: number) => {
    const rowCount = Math.max(originalEnd - originalIndex, modifiedEnd - modifiedIndex)
    for (let offset = 0; offset < rowCount; offset++) {
      const nextOriginalIndex = originalIndex + offset
      const nextModifiedIndex = modifiedIndex + offset
      originalLines.push(nextOriginalIndex < originalEnd
        ? makeLine(originalSourceLines[nextOriginalIndex], 'removed', `original-changed-${blockIndex}-${nextOriginalIndex}`, nextOriginalIndex + 1, shouldPreserveBlankKind(originalSourceLines, nextOriginalIndex))
        : makeLine('', 'spacer', `original-spacer-${blockIndex}-${offset}`, ''))
      modifiedLines.push(nextModifiedIndex < modifiedEnd
        ? makeLine(modifiedSourceLines[nextModifiedIndex], 'added', `modified-changed-${blockIndex}-${nextModifiedIndex}`, nextModifiedIndex + 1, shouldPreserveBlankKind(modifiedSourceLines, nextModifiedIndex))
        : makeLine('', 'spacer', `modified-spacer-${blockIndex}-${offset}`, ''))
    }
    originalIndex = originalEnd
    modifiedIndex = modifiedEnd
    blockIndex++
  }

  for (const match of matches) {
    appendChangedBlock(match.originalIndex, match.modifiedIndex)
    originalLines.push(makeLine(originalSourceLines[match.originalIndex], 'context', `original-context-${match.originalIndex}-${match.modifiedIndex}`, match.originalIndex + 1))
    modifiedLines.push(makeLine(modifiedSourceLines[match.modifiedIndex], 'context', `modified-context-${match.originalIndex}-${match.modifiedIndex}`, match.modifiedIndex + 1))
    originalIndex = match.originalIndex + 1
    modifiedIndex = match.modifiedIndex + 1
  }
  appendChangedBlock(originalSourceLines.length, modifiedSourceLines.length)

  const originalMissing = String(originalSource ?? '').length > 0 && !hasFinalNewline(originalSource)
  const modifiedMissing = String(modifiedSource ?? '').length > 0 && !hasFinalNewline(modifiedSource)
  if (originalMissing || modifiedMissing) {
    originalLines.push(originalMissing
      ? createMetadataLine('original-no-newline', 'removed')
      : makeLine('', 'spacer', 'original-no-newline-spacer', ''))
    modifiedLines.push(modifiedMissing
      ? createMetadataLine('modified-no-newline', 'added')
      : makeLine('', 'spacer', 'modified-no-newline-spacer', ''))
  }

  return collapseDiffPanes([
    {
      key: 'original',
      className: 'markstream-pre__diff-pane--original',
      lines: originalLines,
    },
    {
      key: 'modified',
      className: 'markstream-pre__diff-pane--modified',
      lines: modifiedLines,
    },
  ], hideUnchangedRegions)
}

function resolveCollapseOptions(value: BuildDiffPreviewOptions['hideUnchangedRegions']) {
  if (value == null || value === false)
    return null
  const options = value === true ? {} : value
  if (options.enabled === false)
    return null
  return {
    contextLineCount: Math.max(0, Math.floor(options.contextLineCount ?? 2)),
    minimumLineCount: Math.max(1, Math.floor(options.minimumLineCount ?? 4)),
  }
}

function collapseDiffPanes(
  panes: DiffPreviewPane[],
  hideUnchangedRegions: BuildDiffPreviewOptions['hideUnchangedRegions'],
) {
  const options = resolveCollapseOptions(hideUnchangedRegions)
  if (!options || panes.length < 1 || panes.length > 2)
    return panes
  if (panes.length === 2 && panes[0].lines.length !== panes[1].lines.length)
    return panes

  const original = panes[0].lines
  const modified = panes[1]?.lines
  let sourceLineCount = original.length
  while (
    sourceLineCount > 0
    && panes.every(pane => pane.lines[sourceLineCount - 1].kind === 'metadata')
  ) {
    sourceLineCount--
  }
  const isUnchangedRow = (lineIndex: number) => original[lineIndex].kind === 'context'
    && (
      modified === undefined
      || (
        modified[lineIndex].kind === 'context'
        && original[lineIndex].code === modified[lineIndex].code
      )
    )
  const collapsedRanges: Array<{ start: number, end: number, count: number, first: boolean, last: boolean }> = []
  let index = 0
  while (index < sourceLineCount) {
    const start = index
    while (index < sourceLineCount && isUnchangedRow(index)) {
      index++
    }
    const end = index
    const runLength = end - start
    if (runLength >= options.minimumLineCount) {
      const hiddenStart = start + (start === 0 ? 0 : options.contextLineCount)
      const isTerminalRange = end === sourceLineCount
      const hiddenEnd = end - (isTerminalRange ? 0 : options.contextLineCount)
      if (hiddenEnd - hiddenStart >= options.minimumLineCount) {
        collapsedRanges.push({
          start: hiddenStart,
          // A terminal range extends through any trailing no-newline metadata
          // row (kept in the pane, matching the legacy fallback), but the
          // reported line count is based on the trimmed source rows only.
          end: isTerminalRange ? original.length : hiddenEnd,
          count: isTerminalRange ? sourceLineCount - hiddenStart : hiddenEnd - hiddenStart,
          first: hiddenStart === 0,
          last: isTerminalRange,
        })
      }
    }
    if (index === start)
      index++
  }

  if (!collapsedRanges.length)
    return panes

  return panes.map((pane, paneIndex) => {
    const lines: DiffPreviewLine[] = []
    let sourceIndex = 0
    for (const range of collapsedRanges) {
      lines.push(...pane.lines.slice(sourceIndex, range.start))
      lines.push({
        code: paneIndex === 0 ? `${range.count} unmodified lines` : '',
        kind: 'collapsed',
        empty: false,
        key: `${pane.key}-collapsed-${range.start}-${range.end}`,
        number: '',
        collapsedFirst: range.first,
        collapsedLast: range.last,
      })
      sourceIndex = range.end
    }
    lines.push(...pane.lines.slice(sourceIndex))
    return { ...pane, lines }
  })
}

export function buildDiffPreviewPanes(options: BuildDiffPreviewOptions): DiffPreviewPane[] {
  const loading = options.loading === true
  const inline = options.inline === true
  const codeLines = splitSource(options.code, loading)
  const originalCode = options.originalCode
  const updatedCode = options.updatedCode
  const hasSourcePair = originalCode != null || updatedCode != null

  if (inline) {
    const lines = hasSourcePair
      ? appendInlineSourceMetadata(
          buildInlineSourcePreviewLines(originalCode, updatedCode, loading, options.matchCache),
          originalCode,
          updatedCode,
        )
      : buildInlinePatchPreviewLines(codeLines)

    return collapseDiffPanes([
      {
        key: 'inline',
        className: 'markstream-pre__diff-pane--inline',
        lines,
      },
    ], options.hideUnchangedRegions)
  }

  if (!hasPatchLines(codeLines, options.language, options.raw) && hasSourcePair) {
    return buildSideBySideSourcePreviewPanes(
      originalCode,
      updatedCode,
      loading,
      options.hideUnchangedRegions,
      options.matchCache,
    )
  }

  const { original, modified } = buildSplitPatchPanes(codeLines)

  return collapseDiffPanes([
    {
      key: 'original',
      className: 'markstream-pre__diff-pane--original',
      lines: original.map((line, index) => ({
        ...line,
        key: `original-${index}`,
        number: line.kind === 'metadata' || line.kind === 'spacer' ? '' : line.number,
      })),
    },
    {
      key: 'modified',
      className: 'markstream-pre__diff-pane--modified',
      lines: modified.map((line, index) => ({
        ...line,
        key: `modified-${index}`,
        number: line.kind === 'metadata' || line.kind === 'spacer' ? '' : line.number,
      })),
    },
  ], options.hideUnchangedRegions)
}

function readHunkStart(line: string) {
  const match = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/)
  return match ? { original: Number(match[1]), modified: Number(match[2]) } : undefined
}

/**
 * Parse a patch into side-by-side panes. Removed/added runs are grouped and
 * row-aligned with spacer rows, patch line numbers are tracked from hunk
 * headers, and git file metadata headers (`diff --git`, `index`, `---`, `+++`)
 * are dropped instead of painted as numbered context rows.
 */
function buildSplitPatchPanes(lines: string[]) {
  const original: DiffPreviewLine[] = []
  const modified: DiffPreviewLine[] = []
  const headers = hasDiffHeaders(lines)
  let originalNumber = 1
  let modifiedNumber = 1
  let previousKind: 'context' | 'removed' | 'added' = 'context'
  let index = 0

  while (index < lines.length) {
    const raw = lines[index]
    if (raw === NO_NEWLINE_METADATA) {
      if (previousKind === 'removed') {
        original.push(createMetadataLine('original-patch-no-newline', 'removed'))
        modified.push(makeLine('', 'spacer', '', ''))
      }
      else if (previousKind === 'added') {
        original.push(makeLine('', 'spacer', '', ''))
        modified.push(createMetadataLine('modified-patch-no-newline', 'added'))
      }
      else {
        original.push(createMetadataLine('original-patch-no-newline', 'context'))
        modified.push(createMetadataLine('modified-patch-no-newline', 'context'))
      }
      index++
      continue
    }
    if (isPatchHeaderLine(raw, headers)) {
      index++
      continue
    }
    if (raw.startsWith('@@')) {
      const start = readHunkStart(raw)
      if (start) {
        originalNumber = start.original
        modifiedNumber = start.modified
      }
      original.push(makeLine(raw, 'hunk', '', ''))
      modified.push(makeLine(raw, 'hunk', '', ''))
      previousKind = 'context'
      index++
      continue
    }
    if (isRemovedLine(raw) || isAddedLine(raw)) {
      const removed: string[] = []
      const added: string[] = []
      while (index < lines.length && (isRemovedLine(lines[index]) || isAddedLine(lines[index]))) {
        if (isRemovedLine(lines[index])) {
          removed.push(normalizeDiffBody(lines[index].slice(1), headers))
          previousKind = 'removed'
        }
        else {
          added.push(normalizeDiffBody(lines[index].slice(1), headers))
          previousKind = 'added'
        }
        index++
      }
      const count = Math.max(removed.length, added.length)
      for (let offset = 0; offset < count; offset++) {
        original.push(offset < removed.length
          ? makeLine(removed[offset], 'removed', '', originalNumber++, true)
          : makeLine('', 'spacer', '', ''))
        modified.push(offset < added.length
          ? makeLine(added[offset], 'added', '', modifiedNumber++, true)
          : makeLine('', 'spacer', '', ''))
      }
      continue
    }
    const code = headers && raw.startsWith(' ') ? raw.slice(1) : raw
    original.push(makeLine(code, 'context', '', originalNumber++))
    modified.push(makeLine(code, 'context', '', modifiedNumber++))
    previousKind = 'context'
    index++
  }

  return { original, modified }
}
