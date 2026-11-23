import type { MathOptions } from '../config'
import type { MarkdownIt } from '../markdown-it-types'
import type { MarkdownToken } from '../types'

import findMatchingClose from '../findMatchingClose'
import { ESCAPED_TEX_BRACE_COMMANDS, isMathLike } from './isMathLike'

interface MathInlineState {
  env?: Record<string, unknown>
  pending?: string
  pos: number
  posMax: number
  push: (type: string, tag?: string, nesting?: number) => MarkdownToken
  src: string
}

interface MathBlockState {
  bMarks: number[]
  eMarks: number[]
  env?: Record<string, unknown>
  line: number
  push: (type: string, tag?: string, nesting?: number) => MarkdownToken
  src: string
  tShift: number[]
  tokens: MarkdownToken[]
}

const MARKSTREAM_MATH_PLUGIN_APPLIED = '__markstreamMathPluginApplied'
const TOLERANT_BOUNDARY_SCAN_MAX_LINES = 80
const TOLERANT_BOUNDARY_SCAN_MAX_CHARS = 20000
const TOLERANT_BOUNDARY_SCAN_TAIL_CHARS = TOLERANT_BOUNDARY_SCAN_MAX_CHARS + 4096

export function hasMarkstreamMathPlugin(md: MarkdownIt) {
  return !!(md as unknown as Record<string, unknown>)[MARKSTREAM_MATH_PLUGIN_APPLIED]
}

function markMarkstreamMathPluginApplied(md: MarkdownIt) {
  ;(md as unknown as Record<string, unknown>)[MARKSTREAM_MATH_PLUGIN_APPLIED] = true
}

// Heuristic to decide whether a piece of text is likely math.
// Matches common TeX commands, math operators, function-call patterns like f(x),
// superscripts/subscripts, and common math words.
// Common TeX formatting commands that take a brace argument, e.g. \boldsymbol{...}
// Keep this list in a single constant so it's easy to extend/test.

// Precompute an escaped, |-joined string of TEX brace commands so we don't
// rebuild it on every call to `isMathLike`.

// Common KaTeX/TeX command names that might lose their leading backslash.
// Keep this list conservative to avoid false-positives in normal text.
export const KATEX_COMMANDS = [
  'ldots',
  'cdots',
  'quad',
  'in',
  'displaystyle',
  'int_',
  'lim',
  'lim_',
  'ce',
  'pu',
  'end',
  'infty',
  'perp',
  'mid',
  'operatorname',
  'to',
  'rightarrow',
  'leftarrow',
  'math',
  'mathrm',
  'mathit',
  'mathbb',
  'mathcal',
  'mathfrak',
  'implies',
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'lambda',
  'sum',
  'sum_',
  'prod',
  'sqrt',
  'fbox',
  'boxed',
  'color',
  'rule',
  'edef',
  'fcolorbox',
  'hline',
  'hdashline',
  'cdot',
  'times',
  'pm',
  'le',
  'ge',
  'neq',
  'sin',
  'cos',
  'tan',
  'log',
  'ln',
  'exp',
  'frac',
  'text',
  'left',
  'right',
]

// 允许不含空格直接跟下面的公式
const ANY_COMMANDS = [
  'cdot',
  'mathbf{',
  'partial',
  'mu_{',
]

// Precompute escaped KATEX commands and default regex used by
// `normalizeStandaloneBackslashT` when no custom commands are provided.
// Sort commands by length (desc) before joining so longer commands like
// 'operatorname' are preferred over shorter substrings like 'to'. This
// avoids accidental partial matches when building the regex.
export const ESCAPED_KATEX_COMMANDS = KATEX_COMMANDS
  .slice()
  .sort((a, b) => b.length - a.length)
  .map(c => c.replace(/[.*+?^${}()|[\\]\\\]/g, '\\$&'))
  .join('|')
const CONTROL_CHARS_CLASS = '[\t\r\b\f\v]'
export const ESCAPED_MKATWX_COMMANDS = new RegExp(`([^\\\\])(${ANY_COMMANDS.map(c => c).join('|')})+`, 'g')

// Precompiled helpers reused by normalization
const SPAN_CURLY_RE = /span\{([^}]+)\}/
const OPERATORNAME_SPAN_RE = /\\operatorname\{span\}\{((?:[^{}]|\{[^}]*\})+)\}/
const SINGLE_BACKSLASH_NEWLINE_RE = /(^|[^\\])\\\r?\n/g
const ENDING_SINGLE_BACKSLASH_RE = /(^|[^\\])\\$/g
const FACTORIAL_PRECEDING_RE = /[\p{L}\p{M}\p{N}\p{Pe}\p{Pf}'′″‴|‖]/u

// Cache for dynamically built regexes depending on commands list
// Avoid lookbehind; capture possible prefix so replacements can preserve it.
// Pattern groups:
// 1 - control char (e.g. '\t')
// 2 - optional prefix char (start or a non-word/non-backslash)
// 3 - command name
const DEFAULT_MATH_RE = new RegExp(`(${CONTROL_CHARS_CLASS})|(${ESCAPED_KATEX_COMMANDS})\\b`, 'g')
const MATH_RE_CACHE = new Map<string, RegExp>()
const BRACE_CMD_RE_CACHE = new Map<string, RegExp>()

function getMathRegex(commands: ReadonlyArray<string> | undefined) {
  if (!commands)
    return DEFAULT_MATH_RE
  const arr = [...commands]
  arr.sort((a, b) => b.length - a.length)
  const key = arr.join('\u0001')
  const cached = MATH_RE_CACHE.get(key)
  if (cached)
    return cached
  const commandPattern = `(?:${arr.map(c => c.replace(/[.*+?^${}()|[\\]\\"\]/g, '\\$&')).join('|')})`
  // Use non-lookbehind prefix but capture the prefix so replacement can
  // re-insert it. Groups: (control) | (prefix)(command)
  const re = new RegExp(`(${CONTROL_CHARS_CLASS})|(${commandPattern})\\b`, 'g')
  MATH_RE_CACHE.set(key, re)
  return re
}

function getBraceCmdRegex(useDefault: boolean, commands: ReadonlyArray<string> | undefined) {
  const arr = useDefault ? [] : [...(commands ?? [])]
  if (!useDefault)
    arr.sort((a, b) => b.length - a.length)
  const key = useDefault ? '__default__' : arr.join('\u0001')
  const cached = BRACE_CMD_RE_CACHE.get(key)
  if (cached)
    return cached
  const braceEscaped = useDefault
    ? [ESCAPED_TEX_BRACE_COMMANDS, ESCAPED_KATEX_COMMANDS].filter(Boolean).join('|')
    : [
        arr.map(c => c.replace(/[.*+?^${}()|[\\]\\\]/g, '\\$&')).join('|'),
        ESCAPED_TEX_BRACE_COMMANDS,
      ].filter(Boolean).join('|')
  const re = new RegExp(`(^|[^\\\\\\w])(${braceEscaped})\\s*\\{`, 'g')
  BRACE_CMD_RE_CACHE.set(key, re)
  return re
}

// Hoisted map of control characters -> escaped letter (e.g. '\t' -> 't').
// Kept at module scope to avoid recreating on every normalization call.
const CONTROL_MAP: Record<string, string> = {
  '\t': 't',
  '\r': 'r',
  '\b': 'b',
  '\f': 'f',
  '\v': 'v',
}

function countUnescapedStrong(s: string) {
  const re = /(^|[^\\])(__|\*\*)/g
  let m: RegExpExecArray | null
  let c = 0
  // eslint-disable-next-line unused-imports/no-unused-vars
  while ((m = re.exec(s)) !== null) {
    c++
  }
  return c
}

function escapeStandaloneExclamation(value: string) {
  return value.replace(/(^|[^\\])!+/gu, (match: string, prefix: string) => {
    if (prefix && FACTORIAL_PRECEDING_RE.test(prefix))
      return match
    const marks = prefix ? match.slice(prefix.length) : match
    return `${prefix}${'\\!'.repeat(marks.length)}`
  })
}

function findLastUnescapedStrongMarker(s: string) {
  const re = /(^|[^\\])(__|\*\*)/g
  let m: RegExpExecArray | null
  let last: { marker: string, index: number } | null = null

  while ((m = re.exec(s)) !== null) {
    const marker = m[2]
    const index = m.index + (m[1]?.length ?? 0)
    last = { marker, index }
  }
  return last
}

export function normalizeStandaloneBackslashT(s: string, opts?: MathOptions) {
  const commands = opts?.commands ?? KATEX_COMMANDS
  const escapeExclamation = opts?.escapeExclamation ?? true

  const useDefault = opts?.commands == null

  // Build or reuse regex: match control chars or unescaped command words.
  const re = getMathRegex(useDefault ? undefined : commands)

  // Replace callback receives groups: (match, controlChar, cmd)
  let out = s.replace(re, (m: string, control?: string, cmd?: string, offset?: number, str?: string) => {
    if (control !== undefined && CONTROL_MAP[control] !== undefined)
      return `\\${CONTROL_MAP[control]}`
    if (cmd && commands.includes(cmd)) {
      // Ensure we are not inside a word or escaped by a backslash
      const prev = (str && typeof offset === 'number') ? str[offset - 1] : undefined
      if (prev === '\\' || (prev && /\w/.test(prev)))
        return m
      return `\\${cmd}`
    }
    return m
  })

  // Escape standalone '!' but don't double-escape already escaped ones.
  if (escapeExclamation)
    out = escapeStandaloneExclamation(out)

  // Final pass: some TeX command names take a brace argument and may have
  // lost their leading backslash, e.g. "operatorname{span}". Ensure we
  // restore a backslash before known brace-taking commands when they are
  // followed by '{' and are not already escaped.
  // Use default escaped list when possible. Include TEX_BRACE_COMMANDS so
  // known brace-taking TeX commands (e.g. `text`, `boldsymbol`) are also
  // restored when their leading backslash was lost.
  let result = out
  const braceCmdRe = getBraceCmdRegex(useDefault, useDefault ? undefined : commands)
  result = result.replace(braceCmdRe, (_m: string, p1: string, p2: string) => `${p1}\\${p2}{`)
  result = result.replace(SPAN_CURLY_RE, 'span\\{$1\\}')
    .replace(OPERATORNAME_SPAN_RE, '\\operatorname{span}\\{$1\\}')

  // If a single backslash appears immediately before a newline (e.g. "... 8 \n5..."),
  // it's likely intended as a LaTeX linebreak (`\\`). Double it, but avoid
  // changing already escaped `\\` sequences.
  // Match a single backslash not preceded by another backslash, followed by an optional CR and a LF.
  result = result.replace(SINGLE_BACKSLASH_NEWLINE_RE, '$1\\\\\n')

  // If the string ends with a single backslash (no trailing newline), double it.
  result = result.replace(ENDING_SINGLE_BACKSLASH_RE, '$1\\\\')
  // 将 \n\w+ 转义 \\n\w+
  // result = result.replace(/ \n(\w)/,' \\n$1')
  result = result.replace(ESCAPED_MKATWX_COMMANDS, '$1\\$2')

  return result
}

function isPlainBracketMathLike(content: string) {
  const stripped = content.trim()
  if (!isMathLike(stripped))
    return false

  // Avoid false positives for JSON / structured data inside brackets.
  // Example:
  // [
  //   { "a": 1 }
  // ]
  // Quotes + colon is a strong indicator it's not math.
  if (/"[^"\n]{1,80}"\s*:\s*/.test(stripped))
    return false

  const hasStrongSignal = /\\[a-z]+/i.test(stripped)
    || /[=+*/^<>]|\\times|\\pm|\\cdot|\\le|\\ge|\\neq/.test(stripped)
    || /[_^]/.test(stripped)

  // In non-strict mode, plain `[...]` is allowed as a display-math delimiter.
  // During streaming, incomplete links like `[label]` may transiently appear
  // as a full line before the following `(` arrives. Natural-language labels
  // often use spaced hyphens ("foo - bar"), which should not be treated as math.
  if (!hasStrongSignal && /\s-\s/.test(stripped))
    return false

  return true
}

// `mathInline` runs at every `$` and `\` of an inline source, so what it needs
// to know about the rest of that source is computed at most once per inline
// state, and only when a decision needs it: a paragraph full of prices pays
// for one pass, not one pass per `$`. Keying the entry on the state (WeakMap)
// scopes it to one inline parse, so sources are never retained across parses.
interface InlineMathScan {
  /** End of the last formula this state emitted; a streaming tail counts `**` from here. */
  formulaEnd: number
  /** Last unescaped `$`, `$$`, `\(` and `\)`. An unclosed opener with a later one of its kind is text. */
  lastDelimiter?: Record<'$' | '$$' | '\\(' | '\\)', number>
  /** `![...](...)` spans, plus a still-streaming one that runs to the end of the source. */
  imageRanges?: Array<[number, number]>
}

const inlineMathScanCache = new WeakMap<MathInlineState, InlineMathScan>()

function getInlineMathScan(s: MathInlineState): InlineMathScan {
  let entry = inlineMathScanCache.get(s)
  if (!entry) {
    entry = { formulaEnd: 0 }
    inlineMathScanCache.set(s, entry)
  }
  return entry
}

function lastUnescapedIndexOf(src: string, needle: string) {
  let index = src.lastIndexOf(needle)
  while (index > 0 && isEscapedAt(src, index))
    index = src.lastIndexOf(needle, index - 1)
  return index
}

function getLastDelimiter(s: MathInlineState, delimiter: '$' | '$$' | '\\(' | '\\)') {
  const scan = getInlineMathScan(s)
  scan.lastDelimiter ??= {
    '$': lastUnescapedIndexOf(s.src, '$'),
    '$$': lastUnescapedIndexOf(s.src, '$$'),
    '\\(': lastUnescapedIndexOf(s.src, '\\('),
    '\\)': lastUnescapedIndexOf(s.src, '\\)'),
  }
  return scan.lastDelimiter[delimiter]
}

function isInsideImage(s: MathInlineState, allowIncomplete: boolean) {
  const scan = getInlineMathScan(s)
  const ranges = scan.imageRanges ??= s.src.includes('![') ? buildImageRanges(s.src, allowIncomplete) : []
  // The ranges are sorted and do not overlap.
  let low = 0
  let high = ranges.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (ranges[mid]![1] <= s.pos)
      low = mid + 1
    else
      high = mid
  }
  return low < ranges.length && ranges[low]![0] < s.pos
}

function buildCodeSpanRanges(src: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  let i = 0

  while (i < src.length) {
    if (src[i] !== '`') {
      i++
      continue
    }

    const openStart = i
    let openLen = 1
    while (openStart + openLen < src.length && src[openStart + openLen] === '`')
      openLen++

    let j = openStart + openLen
    let closeStart = -1
    while (j < src.length) {
      if (src[j] !== '`') {
        j++
        continue
      }

      let runLen = 1
      while (j + runLen < src.length && src[j + runLen] === '`')
        runLen++

      if (runLen === openLen) {
        closeStart = j
        break
      }

      j += runLen
    }

    if (closeStart !== -1) {
      ranges.push([openStart, closeStart + openLen])
      i = closeStart + openLen
      continue
    }

    i = openStart + openLen
  }

  return ranges
}

function findRangeAt(ranges: Array<[number, number]>, index: number): [number, number] | null {
  for (const range of ranges) {
    if (index >= range[0] && index < range[1])
      return range
  }
  return null
}

/**
 * Resolves where a delimiter scan that opens one level at `from` closes, for
 * every `from`. `prefix[p]` is the net depth change over `[0, p)` for `open`
 * and `close`, ignoring escaped delimiters, so the scan closes at the first
 * `t >= from` where `prefix[t + 1] === prefix[from] - 1`.
 *
 * The per-opener loop this replaces walked to the end of the source for every
 * opener whose destination never closed, which is O(openers × source length) —
 * quadratic for a paragraph holding many unclosed images. Depth moves by at most
 * one per character, so the first index right of `from` that dips below
 * `prefix[from]` lands exactly on `prefix[from] - 1`, and one monotonic stack
 * pass answers that for every position. Positions live in Int32Arrays rather
 * than a map from depth to positions, so a paragraph of a million nested parens
 * costs a few megabytes instead of a map entry per distinct depth.
 */
function buildDelimiterScan(src: string, open: string, close: string): (from: number) => number {
  const prefix = new Int32Array(src.length + 1)
  for (let index = 0; index < src.length; index++) {
    const char = src[index]
    let delta = 0
    if ((char === open || char === close) && !isEscapedAt(src, index))
      delta = char === open ? 1 : -1
    prefix[index + 1] = prefix[index]! + delta
  }

  const missing = src.length + 1
  const nextDeeper = new Int32Array(src.length + 1).fill(missing)
  const pending = new Int32Array(src.length + 1)
  let depth = 0
  for (let index = src.length; index >= 0; index--) {
    const value = prefix[index]!
    while (depth > 0 && prefix[pending[depth - 1]!]! >= value)
      depth--
    nextDeeper[index] = depth > 0 ? pending[depth - 1]! : missing
    pending[depth++] = index
  }

  return (from: number) => {
    const deeper = nextDeeper[from]!
    return deeper === missing ? -1 : deeper - 1
  }
}

/**
 * The outer inline state only reaches a `$` inside `![...](...)` when the image
 * rule did not take it: the destination is not valid, or, while a reply
 * streams, it has not closed yet. Such a span stays text, as the image recovery
 * expects; a formula in it would split a half image off the rest. A valid image
 * never gets here, and its alt is parsed in a state of its own.
 */
function buildImageRanges(src: string, allowIncomplete: boolean): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  let closeLabel: ((from: number) => number) | null = null
  let closeDestination: ((from: number) => number) | null = null
  let i = src.indexOf('![')
  while (i !== -1) {
    closeLabel ??= buildDelimiterScan(src, '[', ']')
    // The label opens at `[`; the scan resumes right after it.
    const labelEnd = closeLabel(i + 2)
    const openParen = labelEnd === -1 ? -1 : labelEnd + 1
    if (openParen !== -1 && openParen < src.length && src[openParen] === '(') {
      closeDestination ??= buildDelimiterScan(src, '(', ')')
      const destinationEnd = closeDestination(openParen + 1)
      if (destinationEnd !== -1) {
        ranges.push([i, destinationEnd + 1])
        i = src.indexOf('![', destinationEnd + 1)
        continue
      }
      if (allowIncomplete) {
        ranges.push([i, src.length])
        break
      }
    }
    i = src.indexOf('![', i + 1)
  }
  return ranges
}

function isEscapedAt(src: string, index: number) {
  let cursor = index - 1
  let backslashes = 0
  while (cursor >= 0 && src[cursor] === '\\') {
    backslashes++
    cursor--
  }
  return backslashes % 2 === 1
}

function findNextUnescapedDollar(src: string, startIdx: number) {
  let searchPos = startIdx

  while (searchPos < src.length) {
    const index = src.indexOf('$', searchPos)
    if (index === -1)
      return -1
    if (isEscapedAt(src, index)) {
      searchPos = index + 1
      continue
    }
    return index
  }

  return -1
}

function findSingleDollarClose(src: string, startIdx: number) {
  let searchPos = startIdx

  while (searchPos < src.length) {
    const index = findNextUnescapedDollar(src, searchPos)
    if (index === -1)
      return -1
    if ((index > 0 && src[index - 1] === '$') || (index + 1 < src.length && src[index + 1] === '$')) {
      searchPos = index + 1
      continue
    }
    return index
  }

  return -1
}

function findUnescapedDelimiter(src: string, delimiter: string, startIdx = 0) {
  let searchPos = Math.max(0, startIdx)

  while (searchPos < src.length) {
    const index = src.indexOf(delimiter, searchPos)
    if (index === -1)
      return -1

    if (!isEscapedAt(src, index))
      return index

    searchPos = index + Math.max(1, delimiter.length)
  }

  return -1
}

function countUnescapedDelimiter(
  src: string,
  delimiter: string,
  startIdx = 0,
  endIdx = src.length,
  excludedRanges: Array<[number, number]> = [],
) {
  let count = 0
  let searchPos = Math.max(0, startIdx)
  const end = Math.min(src.length, Math.max(0, endIdx))

  while (searchPos < end) {
    const index = src.indexOf(delimiter, searchPos)
    if (index === -1 || index >= end)
      break

    const excluded = findRangeAt(excludedRanges, index)
    if (excluded) {
      searchPos = Math.max(index + Math.max(1, delimiter.length), excluded[1])
      continue
    }

    if (!isEscapedAt(src, index))
      count++

    searchPos = index + Math.max(1, delimiter.length)
  }

  return count
}

function getTolerantBoundaryLineEndOpenIndex(
  line: string,
  openDelim: string,
  closeDelim: string,
) {
  const source = trimRightSpaceOrTab(String(line ?? ''))
  if (!source.endsWith(openDelim))
    return -1

  const openIndex = source.length - openDelim.length
  if (openIndex <= 0)
    return -1

  const prefix = trimRightSpaceOrTab(source.slice(0, openIndex))
  if (!prefix.trim())
    return -1

  if (isEscapedAt(source, openIndex))
    return -1

  const codeSpanRanges = buildCodeSpanRanges(source)
  if (findRangeAt(codeSpanRanges, openIndex))
    return -1

  const previousOpenCount = countUnescapedDelimiter(
    source,
    openDelim,
    0,
    openIndex,
    codeSpanRanges,
  )

  if (openDelim === '$$') {
    if (previousOpenCount % 2 === 1)
      return -1
  }
  else {
    const previousCloseCount = countUnescapedDelimiter(
      source,
      closeDelim,
      0,
      openIndex,
      codeSpanRanges,
    )
    if (previousOpenCount > previousCloseCount)
      return -1
  }

  return openIndex
}

function isSpaceOrTab(ch?: string) {
  return ch === ' ' || ch === '\t'
}

function trimRightSpaceOrTab(value: string) {
  let end = value.length
  while (end > 0 && isSpaceOrTab(value[end - 1]))
    end--
  return value.slice(0, end)
}

interface TolerantBoundaryScanWindowCache {
  lineOffset: number
  windowStart: number
}

function countLineBreaks(value: string) {
  let count = 0
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '\n')
      count++
  }
  return count
}

function isAsciiDigit(ch?: string) {
  if (!ch)
    return false
  const code = ch.charCodeAt(0)
  return code >= 48 && code <= 57
}

function isThematicLikeLine(trimmed: string) {
  if (trimmed.length < 3)
    return false

  const marker = trimmed[0]
  if (marker !== '-' && marker !== '*' && marker !== '_' && marker !== '=')
    return false

  let markerCount = 0
  for (let index = 0; index < trimmed.length; index++) {
    const ch = trimmed[index]
    if (ch === marker) {
      markerCount++
      continue
    }
    if (isSpaceOrTab(ch))
      continue
    return false
  }

  return markerCount >= 3
}

function isMarkdownTableDelimiterCell(cell: string) {
  const value = cell.trim()
  if (!value)
    return false

  let index = 0
  if (value[index] === ':')
    index++

  let dashCount = 0
  while (value[index] === '-') {
    dashCount++
    index++
  }

  if (dashCount < 3)
    return false

  if (value[index] === ':')
    index++

  return index === value.length
}

function isMarkdownTableDelimiterLine(trimmed: string) {
  if (!trimmed.includes('|'))
    return false

  const withoutLeadingPipe = trimmed[0] === '|' ? trimmed.slice(1) : trimmed
  const withoutEdgePipe = withoutLeadingPipe.endsWith('|')
    ? withoutLeadingPipe.slice(0, -1)
    : withoutLeadingPipe

  return withoutEdgePipe.split('|').every(isMarkdownTableDelimiterCell)
}

function isOrderedListBoundaryLine(trimmed: string) {
  let index = 0
  if (!isAsciiDigit(trimmed[index]))
    return false

  while (isAsciiDigit(trimmed[index]))
    index++

  if (trimmed[index] !== '.' && trimmed[index] !== ')')
    return false

  return isSpaceOrTab(trimmed[index + 1])
}

function isTolerantBoundaryStopLine(line: string) {
  const trimmed = line.trimStart()
  if (!trimmed)
    return true

  if (trimmed.startsWith('```') || trimmed.startsWith('~~~') || trimmed.startsWith(':::'))
    return true

  if (trimmed[0] === '>' || trimmed[0] === '<')
    return true

  if (trimmed[0] === '#') {
    let level = 0
    while (trimmed[level] === '#')
      level++
    if (level >= 1 && level <= 6 && isSpaceOrTab(trimmed[level]))
      return true
  }

  if ((trimmed[0] === '-' || trimmed[0] === '+' || trimmed[0] === '*') && isSpaceOrTab(trimmed[1]))
    return true

  if (isOrderedListBoundaryLine(trimmed))
    return true

  if (isThematicLikeLine(trimmed))
    return true

  if (isMarkdownTableDelimiterLine(trimmed))
    return true

  return false
}

function appendTolerantBoundaryContent(content: string, line: string) {
  if (!content)
    return line
  if (!line)
    return content
  return `${content}\n${line}`
}

function isTolerantMathBlockContent(content: string) {
  const stripped = String(content ?? '').trim()
  if (!stripped)
    return false
  return isMathLike(stripped)
}

function hashTolerantBoundaryContent(content: string) {
  let hash = 0
  for (let index = 0; index < content.length; index++)
    hash = ((hash * 31) + content.charCodeAt(index)) | 0
  return hash.toString(36)
}

function getTolerantBoundaryScanWindow(
  source: string,
  cache?: TolerantBoundaryScanWindowCache,
) {
  if (source.length <= TOLERANT_BOUNDARY_SCAN_TAIL_CHARS)
    return { source, lineOffset: 0 }

  if (cache) {
    const cut = source.length - TOLERANT_BOUNDARY_SCAN_TAIL_CHARS
    let start = source.indexOf('\n', cut)
    start = start === -1 ? source.length : start + 1
    const lineOffset = cache.lineOffset
      + countLineBreaks(source.slice(cache.windowStart, start))
    cache.lineOffset = lineOffset
    cache.windowStart = start
    return { source: source.slice(start), lineOffset }
  }

  let start = source.length - TOLERANT_BOUNDARY_SCAN_TAIL_CHARS
  const nextLineBreak = source.indexOf('\n', start)
  start = nextLineBreak === -1 ? source.length : nextLineBreak + 1
  const lineOffset = countLineBreaks(source.slice(0, start))
  return {
    source: source.slice(start),
    lineOffset,
  }
}

export function mayContainTolerantMathBlockBoundaryOpener(
  markdown: string,
  scanWindowCache?: TolerantBoundaryScanWindowCache,
) {
  const fullSource = String(markdown ?? '')
  if (!fullSource || (!fullSource.includes('$$') && !fullSource.includes('\\[')))
    return false

  // The predicate only needs text, not absolute line numbers.
  let source = fullSource
  if (scanWindowCache) {
    source = getTolerantBoundaryScanWindow(fullSource, scanWindowCache).source
  }
  else if (fullSource.length > TOLERANT_BOUNDARY_SCAN_TAIL_CHARS) {
    const nextLineBreak = fullSource.indexOf('\n', fullSource.length - TOLERANT_BOUNDARY_SCAN_TAIL_CHARS)
    source = nextLineBreak === -1 ? '' : fullSource.slice(nextLineBreak + 1)
  }
  if (!source)
    return false

  const lines = source.split(/\r?\n/)
  const startLine = Math.max(0, lines.length - TOLERANT_BOUNDARY_SCAN_MAX_LINES - 2)
  const delimiters: Array<[string, string]> = [['$$', '$$'], ['\\[', '\\]']]

  for (let line = startLine; line < lines.length; line++) {
    const openingLine = trimRightSpaceOrTab(lines[line])
    if (!openingLine)
      continue

    if (isTolerantBoundaryStopLine(openingLine))
      continue

    for (const [openDelim, closeDelim] of delimiters) {
      if (getTolerantBoundaryLineEndOpenIndex(openingLine, openDelim, closeDelim) !== -1)
        return true
    }
  }

  return false
}

export function getTolerantMathBlockBoundaryStreamKey(
  markdown: string,
  scanWindowCache?: TolerantBoundaryScanWindowCache,
) {
  const fullSource = String(markdown ?? '')
  if (!fullSource || (!fullSource.includes('$$') && !fullSource.includes('\\[')))
    return null

  const { source, lineOffset } = getTolerantBoundaryScanWindow(fullSource, scanWindowCache)
  if (!source)
    return null

  const lines = source.split(/\r?\n/)
  const startLine = Math.max(0, lines.length - TOLERANT_BOUNDARY_SCAN_MAX_LINES - 2)
  const delimiters: Array<[string, string]> = [['$$', '$$'], ['\\[', '\\]']]

  for (let line = startLine; line < lines.length - 1; line++) {
    const openingLine = trimRightSpaceOrTab(lines[line])

    for (const [openDelim, closeDelim] of delimiters) {
      const openIndex = getTolerantBoundaryLineEndOpenIndex(
        openingLine,
        openDelim,
        closeDelim,
      )
      if (openIndex === -1)
        continue

      let content = ''
      let stopped = false

      for (let currentLine = line + 1; currentLine < lines.length; currentLine++) {
        if (currentLine - line > TOLERANT_BOUNDARY_SCAN_MAX_LINES) {
          stopped = true
          break
        }

        const current = lines[currentLine]
        const closeIndex = findUnescapedDelimiter(current, closeDelim)

        if (closeIndex !== -1) {
          const nextContent = appendTolerantBoundaryContent(content, current.slice(0, closeIndex))
          if (!isTolerantMathBlockContent(nextContent)) {
            stopped = true
            break
          }

          const suffix = current.slice(closeIndex + closeDelim.length)
          const suffixKey = suffix.trim()
            ? `suffix:${hashTolerantBoundaryContent(suffix)}`
            : 'nosuffix'
          return [
            'closed',
            openDelim,
            lineOffset + line,
            openIndex,
            lineOffset + currentLine,
            closeIndex,
            hashTolerantBoundaryContent(nextContent),
            suffixKey,
          ].join(':')
        }

        if (isTolerantBoundaryStopLine(current)) {
          stopped = true
          break
        }

        content = appendTolerantBoundaryContent(content, current)
        if (content.length > TOLERANT_BOUNDARY_SCAN_MAX_CHARS) {
          stopped = true
          break
        }
      }

      if (!stopped && isTolerantMathBlockContent(content))
        return ['pending', openDelim, lineOffset + line, openIndex].join(':')
    }
  }

  return null
}

function isLikelyCurrencyAmountStart(content: string, closed = false) {
  // A separate explicit formula must not supply TeX markers to a price span.
  const stripped = String(content ?? '').split('\\(', 1)[0].trimStart()
  const amount = stripped.match(/^\d+(?:,\d{3})*(?:\.\d+)?/)
  if (!amount || /[\\^{}_]/.test(stripped))
    return false
  const rest = stripped.slice(amount[0].length)
  if (!rest.trim())
    return !closed
  // An unfinished numeric operator can still be a price followed by another
  // price. Wait for an operand before promoting it to loading math.
  if (/^\s*[+\-*/=<>]/.test(rest))
    return /^[\s+\-*/=<>]+$/.test(rest) || rest.startsWith('**')
  return /^[)\s,.!?;:~～–—]/.test(rest)
}

function isLikelyPlaceholderDollar(content: string) {
  const stripped = String(content ?? '').trim()
  if (!stripped)
    return false
  // Placeholder text like "$...$" / "$…$" is not math.
  return /^(?:\.{3,}|…+)$/.test(stripped)
}

export function applyMath(md: MarkdownIt, mathOpts?: MathOptions) {
  markMarkstreamMathPluginApplied(md)

  const pushInlineParagraph = (s: MathBlockState, content: string, line: number) => {
    const paragraphContent = String(content ?? '')
      .replace(/^[\t ]+/, '')
      .replace(/[\t ]+$/, '')

    if (!paragraphContent)
      return

    const paragraphOpen = s.push('paragraph_open', 'p', 1)
    paragraphOpen.map = [line, line + 1]

    const inlineToken = s.push('inline', '', 0)
    inlineToken.content = paragraphContent
    inlineToken.map = [line, line + 1]
    inlineToken.children = []

    s.push('paragraph_close', 'p', -1)
  }

  // Inline rule for `\(...\)`, `$$...$$` and `$...$`.
  //
  // Like any other markdown-it inline rule, it only decides whether a formula
  // starts at `state.pos` and leaves the text around it to the other rules, so
  // emphasis, links, escapes and hard breaks next to a formula are parsed by
  // their own rules. `$` and `\` already end markdown-it's `text` rule, so this
  // runs at each of them and returns after one char compare everywhere else.
  //
  // A single `$` follows Pandoc: the opening `$` is followed by a non-space, and
  // the closing `$` is preceded by a non-space and not followed by a digit.
  // Otherwise this `$` is text, and no later `$` is tried as its closer.
  const mathInline = (state: unknown, silent?: boolean) => {
    const s = state as MathInlineState
    const src = s.src
    const pos = s.pos
    const max = s.posMax
    const code = src.charCodeAt(pos)
    if (code !== 0x24 /* $ */ && code !== 0x5C /* \ */)
      return false

    let open: '$' | '$$' | '\\('
    if (code === 0x24) {
      // The `$` just before this one was left as text (the first half of a
      // `$$` that does not close), so this one cannot open a formula either.
      // Pending text always ends at `pos`, so its last char is `src[pos - 1]`.
      // Reading it from `pending` would flatten that growing string at every
      // `$`, copying all the text before it each time.
      if (s.pending && src.charCodeAt(pos - 1) === 0x24)
        return false
      let runEnd = pos + 1
      while (runEnd < max && src.charCodeAt(runEnd) === 0x24)
        runEnd++
      if (runEnd - pos >= 3) {
        if (!silent) {
          const token = s.push('text', '', 0)
          token.content = src.slice(pos, runEnd)
        }
        s.pos = runEnd
        return true
      }
      open = runEnd - pos === 2 ? '$$' : '$'
    }
    else if (pos + 1 < max && src.charCodeAt(pos + 1) === 0x28 /* ( */) {
      open = '\\('
    }
    else {
      return false
    }

    const close = open === '\\(' ? '\\)' : open
    const contentStart = pos + open.length
    if (open === '$' && (contentStart >= max || /\s/.test(src[contentStart]!)))
      return false

    const allowLoading = !s.env?.__markstreamFinal
    // Silent calls come from a label scan, which must still skip a formula so
    // that a `]` inside it does not end the label.
    if (!silent && isInsideImage(s, allowLoading))
      return false

    const strict = !!mathOpts?.strictDelimiters
    const pushFormula = (content: string, loading: boolean) => {
      const token = s.push('math_inline', 'math', 0)
      token.content = normalizeStandaloneBackslashT(content, mathOpts)
      token.markup = open === '\\(' ? '\\(\\)' : open
      token.raw = `${open}${content}${close}`
      token.loading = loading
    }

    let end: number
    if (open === '$')
      end = findSingleDollarClose(src, contentStart)
    // With no `\)` left, skip a scan to the end of the source for every `\(`.
    else if (open === '\\(' && getLastDelimiter(s, '\\)') < contentStart)
      end = -1
    else
      end = findMatchingClose(src, contentStart, open, close)
    // A closer past `posMax` (e.g. after the end of a link label) belongs to
    // another range.
    if (end !== -1 && end + close.length > max)
      end = -1

    if (end === -1) {
      // An unclosed formula is drawn as a loading node only while streaming,
      // only at the end of the whole inline source (not inside link text), and
      // only from the last opener of its kind: an earlier one is text. In silent
      // mode (a link label scan) it matches nothing, so it cannot hide the `]`.
      if (silent || !allowLoading || strict || max !== src.length || getLastDelimiter(s, open) > pos)
        return false
      const tail = src.slice(contentStart, max)
      if (tail.includes('`') || !isMathLike(tail) || (open === '$' && isLikelyCurrencyAmountStart(tail)))
        return false
      // An unclosed `**` / `__` before the formula is still being typed too;
      // keep the formula inside it, as the streaming strong recovery expects.
      const before = src.slice(getInlineMathScan(s).formulaEnd, pos)
      const strongMarker = countUnescapedStrong(before) % 2 === 1
        ? findLastUnescapedStrongMarker(before)?.marker ?? '**'
        : null
      if (strongMarker) {
        const strongToken = s.push('strong_open', '', 0)
        strongToken.markup = strongMarker
        strongToken.content = tail
      }
      pushFormula(tail, true)
      if (strongMarker)
        s.push('strong_close', '', 0)
      s.pos = max
      return true
    }

    // Pandoc: a closing `$` is preceded by a non-space and not followed by a digit.
    if (open === '$' && (/\s/.test(src[end - 1]!) || /\d/.test(src[end + 1] ?? '')))
      return false
    const content = src.slice(contentStart, end)
    if (!content.trim() || content.includes('`'))
      return false
    if (open === '$') {
      if (isLikelyPlaceholderDollar(content) || isLikelyCurrencyAmountStart(content, true))
        return false
    }
    else if (!strict && !isMathLike(content)) {
      return false
    }

    if (!silent) {
      pushFormula(content, false)
      getInlineMathScan(s).formulaEnd = end + close.length
    }
    s.pos = end + close.length
    return true
  }

  // Block math rule similar to previous implementation
  const mathBlock = (
    state: unknown,
    startLine: number,
    endLine: number,
    silent: boolean,
  ) => {
    const s = state as MathBlockState
    const allowLoading = !s?.env?.__markstreamFinal
    const strict = mathOpts?.strictDelimiters
    const delimiters: [string, string][] = strict
      ? [
          ['\\[', '\\]'],
          ['$$', '$$'],
        ]
      : [
          ['\\[', '\\]'],
          ['\[', '\]'],
          ['$$', '$$'],
        ]
    const startPos = s.bMarks[startLine] + s.tShift[startLine]
    let lineText = s.src.slice(startPos, s.eMarks[startLine]).trim()
    let matched = false
    let openDelim = ''
    let closeDelim = ''
    let skipFirstLine = false
    let prefixBeforeOpen = ''
    let tolerantBoundary = false
    for (const [open, close] of delimiters) {
      // A footnote prefix stays Markdown even before its colon arrives.
      if (open === '[' && lineText.startsWith('[^'))
        continue
      // 这里其实不应该只匹配 startWith的情况因为很可能前面还有 text
      if (lineText.startsWith(open)) {
        if (open.includes('[')) {
          const sameLineContent = open === '\\[' ? lineText.slice(open.length) : ''
          if (
            open === '\\['
            && findUnescapedDelimiter(sameLineContent, close) === -1
            && !/^\s*!\[/.test(sameLineContent)
            && !sameLineContent.includes('`')
            && isMathLike(sameLineContent)
          ) {
            matched = true
            openDelim = open
            closeDelim = close
            break
          }
          if (mathOpts?.strictDelimiters) {
            if (lineText.replace('\\', '') === '[') {
              if (startLine + 1 < endLine) {
                matched = true
                openDelim = open
                closeDelim = close
                break
              }
              continue
            }
          }
          else {
            if (lineText.replace('\\', '') === '[') {
              if (startLine + 1 < endLine) {
                matched = true
                openDelim = open
                closeDelim = close
                break
              }
              continue
            }
            else {
              // inline math block
              // 排除 todo list 的情况
              const lastToken = s.tokens[s.tokens.length - 1]
              if (lastToken && lastToken.type === 'list_item_open' && lastToken.mark === '-' && lineText.slice(open.length, lineText.indexOf(']')).trim() === 'x') {
                continue
              }
              if (lineText.replace('\\', '').startsWith('[') && !lineText.includes('](')) {
                const closeIndex = lineText.indexOf(']')
                if (lineText.slice(closeIndex).trim() !== ']') {
                  continue
                }
                const inner = lineText.slice(open.length, closeIndex)
                const looksMath = open === '[' ? isPlainBracketMathLike(inner) : isMathLike(inner)
                if (looksMath) {
                  matched = true
                  openDelim = open
                  closeDelim = close
                  break
                }
                continue
              }
            }
          }
        }
        else {
          matched = true
          openDelim = open
          closeDelim = close
          break
        }
      }
      // 这里可能 ai 返回的格式有问题：`$$` 跟在文本的最后，而不是单独一行。
      // 仅对 `$$` / 显式 `\[` 启用该容错；对普通 `[` 启用会误伤 JSON/数组/链接。
      else if ((open === '$$' || open === '\\[') && lineText.endsWith(open) && startLine + 1 < endLine) {
        const openIndex = getTolerantBoundaryLineEndOpenIndex(lineText, open, close)
        if (openIndex === -1)
          continue

        const prefix = trimRightSpaceOrTab(lineText.slice(0, openIndex))
        prefixBeforeOpen = prefix
        tolerantBoundary = true

        const nextLineStartPos = s.bMarks[startLine + 1] + s.tShift[startLine + 1]
        const nextLineText = s.src.slice(nextLineStartPos, s.eMarks[startLine + 1]).trim()
        lineText = nextLineText
        // 更新 endLine
        skipFirstLine = true
        matched = true
        openDelim = open
        closeDelim = close
        break
      }
    }

    if (!matched)
      return false

    if (silent && !tolerantBoundary)
      return true

    const startDelimIndex = lineText.indexOf(openDelim)
    const closeSearchStart = startDelimIndex + openDelim.length
    const escapedPlainBracketCloseIndex = !strict && openDelim === '['
      ? lineText.indexOf('\\]', closeSearchStart)
      : -1
    const sameLineCloseDelim = escapedPlainBracketCloseIndex >= 0 ? '\\]' : closeDelim
    const sameLineCloseIndex = escapedPlainBracketCloseIndex >= 0
      ? escapedPlainBracketCloseIndex
      : findUnescapedDelimiter(lineText, closeDelim, closeSearchStart)

    if (!skipFirstLine && sameLineCloseIndex > openDelim.length) {
      const content = lineText.slice(
        startDelimIndex + openDelim.length,
        sameLineCloseIndex,
      )
      const token = s.push('math_block', 'math', 0)
      token.content = normalizeStandaloneBackslashT(content)
      token.markup
        = openDelim === '$$' ? '$$' : openDelim === '[' ? '[]' : '\\[\\]'
      token.map = [startLine, startLine + 1]
      token.raw = `${openDelim}${content}${sameLineCloseDelim}`
      token.block = true
      token.loading = false
      s.line = startLine + 1
      const trailingAfterClose = lineText.slice(sameLineCloseIndex + sameLineCloseDelim.length)
      if (trailingAfterClose.trim())
        pushInlineParagraph(s, trailingAfterClose, startLine)
      return true
    }

    let nextLine = startLine
    let content = ''
    let found = false
    let trailingAfterClose = ''
    let trailingAfterCloseLine = startLine

    const firstLineContent
      = skipFirstLine
        ? lineText
        : lineText === openDelim ? '' : lineText.slice(openDelim.length)
    const fallbackPlainBracketClose = !strict && openDelim === '\\[' ? ']' : ''

    const firstLineCloseIndex = findUnescapedDelimiter(firstLineContent, closeDelim)
    if (firstLineCloseIndex !== -1) {
      const endIndex = firstLineCloseIndex
      content = firstLineContent.slice(0, endIndex)
      trailingAfterClose = firstLineContent.slice(endIndex + closeDelim.length)
      trailingAfterCloseLine = skipFirstLine ? startLine + 1 : startLine
      found = true
      nextLine = trailingAfterCloseLine
    }
    else {
      if (firstLineContent && !skipFirstLine)
        content = firstLineContent

      for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
        const lineStart = s.bMarks[nextLine] + s.tShift[nextLine]
        const lineEnd = s.eMarks[nextLine]
        const currentLine = s.src.slice(lineStart, lineEnd)
        const currentLineTrimmed = currentLine.trim()
        if (!strict && openDelim === '[' && currentLineTrimmed === '\\]') {
          closeDelim = '\\]'
          found = true
          break
        }
        if (fallbackPlainBracketClose && currentLine.trim() === fallbackPlainBracketClose) {
          closeDelim = fallbackPlainBracketClose
          found = true
          break
        }
        if (currentLineTrimmed === closeDelim) {
          found = true
          break
        }
        else if (!strict && openDelim === '[' && currentLine.includes('\\]')) {
          found = true
          const endIndex = currentLine.indexOf('\\]')
          closeDelim = '\\]'
          const beforeClose = currentLine.slice(0, endIndex)
          if (beforeClose)
            content += (content ? '\n' : '') + beforeClose
          trailingAfterClose = currentLine.slice(endIndex + closeDelim.length)
          trailingAfterCloseLine = nextLine
          break
        }
        else if (findUnescapedDelimiter(currentLine, closeDelim) !== -1) {
          found = true
          const endIndex = findUnescapedDelimiter(currentLine, closeDelim)
          const beforeClose = currentLine.slice(0, endIndex)
          if (beforeClose)
            content += (content ? '\n' : '') + beforeClose
          trailingAfterClose = currentLine.slice(endIndex + closeDelim.length)
          trailingAfterCloseLine = nextLine
          break
        }
        content += (content ? '\n' : '') + currentLine
      }
    }

    // In strict mode or final mode, do not emit mid-state (unclosed) block math
    if ((!allowLoading || strict) && !found)
      return false
    // 追加检测内容是否是 math
    // For explicit $$ delimiters, skip the isMathLike check since $$ is already
    // a clear math marker. This allows spaced subscript formats like "f _ { x }"
    // to be correctly recognized as math.
    // However, if the content starts with markdown special syntax like ![, skip.
    const hasMarkdownPrefix = /^\s*!\[/.test(content)
    const looksMath = tolerantBoundary
      ? !hasMarkdownPrefix && isTolerantMathBlockContent(content)
      : openDelim === '$$' ? !hasMarkdownPrefix : (openDelim === '[' ? isPlainBracketMathLike(content) : isMathLike(content))
    if (!looksMath)
      return false

    if (silent)
      return true

    if (prefixBeforeOpen)
      pushInlineParagraph(s, prefixBeforeOpen, startLine)

    const token = s.push('math_block', 'math', 0)
    token.content = normalizeStandaloneBackslashT(content)
    token.markup
      = openDelim === '$$' ? '$$' : openDelim === '[' ? '[]' : '\\[\\]'
    token.raw = `${openDelim}${content}${content.startsWith('\n') ? '\n' : ''}${closeDelim}`
    token.map = [startLine, nextLine + 1]
    token.block = true
    token.loading = !found
    s.line = nextLine + 1

    if (trailingAfterClose.trim())
      pushInlineParagraph(s, trailingAfterClose, trailingAfterCloseLine)

    return true
  }

  const explicitMathBlockBeforeSetext = (
    state: unknown,
    startLine: number,
    endLine: number,
    silent: boolean,
  ) => {
    const s = state as MathBlockState
    const startPos = s.bMarks[startLine] + s.tShift[startLine]
    const lineText = s.src.slice(startPos, s.eMarks[startLine]).trim()

    if (!lineText.startsWith('$$') && !lineText.startsWith('\\['))
      return false

    return mathBlock(state, startLine, endLine, silent)
  }

  // Register math before the escape rule so inline math is tokenized
  // before markdown-it processes backslash escapes. This preserves
  // backslashes inside math content (e.g. "\\{") instead of having
  // the escape rule remove them from the token content.
  md.inline.ruler.before('escape', 'math', mathInline)
  md.block.ruler.before('lheading', 'explicit_math_block', explicitMathBlockBeforeSetext, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  })
  md.block.ruler.before('paragraph', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  })
}
