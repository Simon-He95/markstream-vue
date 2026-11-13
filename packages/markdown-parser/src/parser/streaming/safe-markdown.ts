import type { ParseContext } from '../parse-context'
import type { ParserRuntime } from '../runtime'
import {
  createLatexSplitMathScanner,
  getStreamingAdmonitionOpenTailReplacement,
  stripPendingExplicitMathTail,
} from './boundary-state'
import { normalizeStreamingCustomHtmlSource } from './custom-html-preprocess'

const SAFE_MARKDOWN_WINDOW_MARGIN = 1024
const SAFE_MARKDOWN_WINDOW_OVERLAP = 16
// Find the same earliest line break as (?:^|\n)\s*, without retrying at
// every blank line when the marker is followed by ordinary text.
function findMarkerLineStart(source: string, marker: number, requireNewline = false) {
  const whitespaceStart = source.slice(0, marker).trimEnd().length
  if (whitespaceStart === 0 && !requireNewline)
    return 0
  const newline = source.indexOf('\n', whitespaceStart)
  return newline !== -1 && newline < marker ? newline : -1
}

function scanDigitsBackward(source: string, end: number) {
  let start = end
  while (source.charCodeAt(start - 1) >= 48 && source.charCodeAt(start - 1) <= 57)
    start--
  return start
}

function recoverStreamingTail(source: string) {
  if (source.endsWith('- *'))
    return `${source.slice(0, -1)}\\*`

  const trimmed = source.trimEnd()
  const end = trimmed.length
  const last = trimmed[end - 1]
  let marker = end - 1

  if (last === '-' && trimmed[marker - 1] === '-') {
    marker--
  }
  else if (last === '*' || last === '+') {
    const start = findMarkerLineStart(source, marker, true)
    if (start !== -1)
      return `${source.slice(0, start)}\n`
    if (last === '+')
      return source

    while (trimmed[marker - 1] === '*')
      marker--
    if (end - marker <= 3) {
      const prefixEnd = trimmed.slice(0, marker).trimEnd().length
      if (prefixEnd < marker && (trimmed[prefixEnd - 1] === '.' || trimmed[prefixEnd - 1] === ')')) {
        const digits = scanDigitsBackward(trimmed, prefixEnd - 1)
        if (digits < prefixEnd - 1 && findMarkerLineStart(source, digits) !== -1)
          return trimmed.slice(0, marker) + '\\*'.repeat(end - marker)
      }
    }
    return source
  }
  else if (last === '.' || last === ')') {
    marker = scanDigitsBackward(trimmed, marker)
    if (marker === end - 1)
      return source
  }
  else if (last >= '0' && last <= '9') {
    marker = scanDigitsBackward(trimmed, end)
    if (marker === 0 || source.slice(0, marker).trim() === '')
      return source
  }
  else if (last === '[' || last === '(') {
    if (trimmed[marker - 1] !== '\n' || !/^\n*$/.test(source.slice(end)))
      return source
    while (trimmed[marker - 3] === '\n' && trimmed[marker - 1] === '\n' && (trimmed[marker - 2] === '[' || trimmed[marker - 2] === '('))
      marker -= 2
    return `${source.slice(0, marker - 1)}\n`
  }
  else if (last !== '-' && last !== '>') {
    return source
  }

  const start = findMarkerLineStart(source, marker)
  if (start === -1)
    return source
  return source[start] === '\n' ? `${source.slice(0, start)}\n` : ''
}

/**
 * Cached streaming safe-markdown transform, owned by the parser runtime.
 *
 * Fragment parses bypass this top-level cache and use a full transform.
 */
function transformStreamingSafeMarkdown(
  source: string,
  isFinal: boolean,
  options: ParseContext,
) {
  // Reconstruct transport-split LaTeX commands ONLY inside open math contexts
  // ($...$ / $$...$$ / \[...\]). The previous version rewrote every soft line
  // break followed by `abla|eq|ot|exists`, which corrupted ordinary prose
  // ("First.\nother things" gained a literal backslash-n and merged
  // paragraphs). A bare CR (the \rho/\right split) cannot occur in prose, so
  // that reconstruction stays ungated.
  let safeMarkdown = source.replace(/([^\\])\r(ight|ho)/g, '$1\\r$2')
  const latexSplitMathScanner = createLatexSplitMathScanner(safeMarkdown)
  safeMarkdown = safeMarkdown.replace(/([^\\])\r?\n(abla|eq|ot|exists)/g, (full, before, cmd, offset) => {
    // Consume up to (not including) the newline at offset+1: the $ that opens
    // math may sit anywhere on this line, including as its last char.
    latexSplitMathScanner.scanTo(offset + 1)
    const shouldReconstruct = latexSplitMathScanner.inMath()
    // Consume the newline itself: single-$ math is line-scoped and resets.
    latexSplitMathScanner.scanTo(offset + full.length)
    return shouldReconstruct ? `${before}\\n${cmd}` : full
  })

  if (!isFinal)
    safeMarkdown = recoverStreamingTail(safeMarkdown)

  if (!isFinal) {
    // The tolerant-math boundary scan is applied by the caller to the full
    // document (it carries incremental fence/math state across commits).
    safeMarkdown = getStreamingAdmonitionOpenTailReplacement(safeMarkdown, options.customHtmlTags) ?? safeMarkdown
  }

  safeMarkdown = normalizeStreamingCustomHtmlSource(safeMarkdown, options.customHtmlTags, isFinal)

  return safeMarkdown
}

export function getSafeMarkdown(runtime: ParserRuntime, sourceMarkdown: string, isFinal: boolean, options: ParseContext) {
  const mode = `${isFinal ? 'final' : 'stream'}:${(options.customHtmlTags ?? []).join(',')}`
  const previous = options.isFragment ? undefined : runtime.safeMarkdown

  const update = !isFinal && !options.isFragment && runtime.chunkUpdate?.source === sourceMarkdown
    ? runtime.chunkUpdate
    : undefined
  const tailLength = SAFE_MARKDOWN_WINDOW_MARGIN + SAFE_MARKDOWN_WINDOW_OVERLAP
  // A cached tail exists only while preprocessing leaves the raw source intact.
  let rawTail: string | undefined
  let noMathBoundaryOpener = false
  let safeMarkdown: string
  let extendsPreviousSafeMarkdown = false
  if (
    // Append-only streaming fast path: only the appended tail can introduce
    // new mid-state markers, and the prefix of the previous safe markdown was
    // already transformed identically. Transform a tail window of the RAW
    // source (old tail margin + appended chunk) and stitch it onto the cached
    // prefix, avoiding O(doc) regex scans on every commit (quadratic total
    // for long streaming documents).
    !isFinal
    && !options.customHtmlTags?.length
    && previous
    && previous.mode === mode
    && sourceMarkdown.length >= previous.source.length
    && runtime.sourceExtends(previous.source, sourceMarkdown)
  ) {
    // The window cut MUST be a raw-source index. The previous implementation
    // cut `previous.safeMarkdown` at a safeMarkdown index but sliced the raw
    // source with it: any char-inserting fix earlier in the document (e.g.
    // `\n(abla|eq|ot|exists)` / `\r(ight|ho)`) made the two index spaces
    // diverge and silently dropped/repeated chars at the seam.
    const windowStart = Math.max(0, previous.source.length - tailLength)
    const cachedTail = update?.previous === previous.source ? previous.unchangedRawTail : undefined
    const window = update && cachedTail !== undefined
      ? cachedTail + update.chunk
      : sourceMarkdown.slice(windowStart)
    const transformed = transformStreamingSafeMarkdown(window, isFinal, options)
    // Overlap verification: the part of the window that overlaps the previous
    // source (its first `previous.source.length - windowStart` chars) must be
    // byte-identical to the previous safe markdown tail. A re-transform of
    // unchanged source is deterministic, so equality proves the overlap region
    // had no char-inserting fixes (which would shift the seam) AND that the
    // appended chunk did not complete a cross-boundary fix (e.g. a trailing
    // `\r` followed by an appended `ight`). Any divergence falls back to a
    // full-document transform, which is always correct.
    const overlapLength = previous.source.length - windowStart
    const overlapOk = transformed.length >= overlapLength
      && transformed.slice(0, overlapLength) === (cachedTail ?? previous.safeMarkdown.slice(-overlapLength))
    if (overlapOk) {
      extendsPreviousSafeMarkdown = true
      if (transformed === window && (cachedTail !== undefined || previous.safeMarkdown === previous.source)) {
        safeMarkdown = sourceMarkdown
        if (update) {
          rawTail = window.slice(-tailLength)
          if (previous.noMathBoundaryOpener !== false) {
            const mathWindow = previous.noMathBoundaryOpener ? window : sourceMarkdown
            noMathBoundaryOpener = !mathWindow.includes('$$') && !mathWindow.includes('\\[')
          }
          if (update.previous === previous.source)
            update.safeChunk = update.chunk
        }
      }
      else {
        safeMarkdown = previous.safeMarkdown.slice(0, previous.safeMarkdown.length - overlapLength) + transformed
      }
    }
    else {
      safeMarkdown = transformStreamingSafeMarkdown(sourceMarkdown, isFinal, options)
    }
  }
  else {
    safeMarkdown = transformStreamingSafeMarkdown(sourceMarkdown, isFinal, options)
  }

  // The tolerant-math boundary scan carries incremental fence/math state in
  // its own cache keyed by md, so it must always run on the full document
  // (not a tail window) — otherwise pre-window math openers would be
  // invisible and ambiguous tails would not be hidden.
  if (!isFinal) {
    // A verified overlap proves the transformed prefix is unchanged. A math
    // truncation can preserve that proof only if it leaves the entire prefix.
    if (extendsPreviousSafeMarkdown && previous)
      runtime.rememberSourceExtension(previous.safeMarkdown, safeMarkdown)
    const unstrippedLength = safeMarkdown.length
    safeMarkdown = stripPendingExplicitMathTail(safeMarkdown, runtime, !options.isFragment)
    if (safeMarkdown.length < unstrippedLength) {
      rawTail = undefined
      if (update)
        update.safeChunk = undefined
    }
    if (extendsPreviousSafeMarkdown && previous
      && safeMarkdown.length < unstrippedLength && safeMarkdown.length >= previous.safeMarkdown.length) {
      runtime.rememberSourceExtension(previous.safeMarkdown, safeMarkdown)
    }
  }

  if (!options.isFragment) {
    runtime.safeMarkdown = {
      source: sourceMarkdown,
      safeMarkdown,
      mode,
      unchangedRawTail: rawTail,
      noMathBoundaryOpener: rawTail === undefined ? undefined : noMathBoundaryOpener,
      cannotBeStandaloneHtml: rawTail !== undefined && (
        (extendsPreviousSafeMarkdown && previous?.cannotBeStandaloneHtml)
        || (!previous?.cannotBeStandaloneHtml && /^\s*[^<\s]/.test(safeMarkdown))
      ),
    }
  }
  return safeMarkdown
}
