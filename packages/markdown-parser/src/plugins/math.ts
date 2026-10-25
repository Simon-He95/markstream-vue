import type { MathOptions } from '../config'
import type { MarkdownIt } from '../markdown-it-types'
import type { MarkdownToken } from '../types'

import findMatchingClose from '../findMatchingClose'
import { ESCAPED_TEX_BRACE_COMMANDS, isMathLike } from './isMathLike'

interface MathInlineState {
  env?: Record<string, unknown>
  pending?: string
  pos: number
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

// `mathInline` is tried by markdown-it at every inline position of a
// paragraph, and it rescans the whole inline source each time. The expensive
// inputs (code-span/image ranges and the math-opener positions) are pure
// functions of the source, so they are computed ONCE per inline state and
// reused across the rule's repeated invocations within that single parse.
//
// Keying the cache on the state object (WeakMap) scopes it to one inline
// parse: the entry is released with the state after parsing, so full
// paragraph sources are never retained across parses or parser instances.
interface InlineScanState {
  codeSpanRanges: Array<[number, number]>
  imageRanges: Array<[number, number]>
  /** Sorted indices of characters that can start a math opener (`$` or `\`). */
  mathOpenerPositions: number[]
}

const inlineScanStateCache = new WeakMap<MathInlineState, InlineScanState>()

function getInlineScanState(s: MathInlineState): InlineScanState {
  let entry = inlineScanStateCache.get(s)
  if (entry)
    return entry

  const src = s.src
  const allowLoading = s.env?.__markstreamFinal !== true
  const mathOpenerPositions: number[] = []
  for (let index = 0; index < src.length; index++) {
    const char = src[index]
    if (char === '$' || char === '\\')
      mathOpenerPositions.push(index)
  }
  entry = {
    codeSpanRanges: buildCodeSpanRanges(src),
    imageRanges: buildImageRanges(src, allowLoading),
    mathOpenerPositions,
  }
  inlineScanStateCache.set(s, entry)
  return entry
}

function hasMathOpenerAtOrAfter(mathOpenerPositions: number[], pos: number): boolean {
  let low = 0
  let high = mathOpenerPositions.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (mathOpenerPositions[mid]! < pos)
      low = mid + 1
    else
      high = mid
  }
  return low < mathOpenerPositions.length
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

function buildImageRanges(src: string, allowIncomplete = false): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  let i = 0
  while (i < src.length - 1) {
    if (src[i] === '!' && src[i + 1] === '[') {
      const start = i
      let j = i + 2
      let labelDepth = 1
      while (j < src.length && labelDepth > 0) {
        if (src[j] === '\\' && j + 1 < src.length) {
          j += 2
          continue
        }
        if (src[j] === '[')
          labelDepth++
        else if (src[j] === ']')
          labelDepth--
        j++
      }
      if (labelDepth === 0 && j < src.length && src[j] === '(') {
        let k = j + 1
        let depth = 1
        while (k < src.length && depth > 0) {
          if (src[k] === '\\' && k + 1 < src.length) {
            k += 2
            continue
          }
          if (src[k] === '(')
            depth++
          else if (src[k] === ')')
            depth--
          k++
        }
        if (depth === 0) {
          ranges.push([start, k])
          i = k
          continue
        }
        if (allowIncomplete) {
          ranges.push([start, src.length])
          i = src.length
          continue
        }
      }
    }
    i++
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

  const { source } = getTolerantBoundaryScanWindow(fullSource, scanWindowCache)
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

function isLikelyCurrencyRangeDollar(content: string, nextChar?: string) {
  const stripped = String(content ?? '').trim()
  if (!stripped)
    return false
  // Currency ranges like "$2000~$5000" should remain plain text.
  // We only gate when the content before closing "$" ends with a range marker
  // and the following character continues with digits.
  if (!/^\d[\d,.]*\s*[~～-]\s*$/.test(stripped))
    return false
  return /\d/.test(String(nextChar ?? ''))
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

  // Inline rule for `\\(...\\)` and `$$...$$` and `$...$`
  const mathInline = (state: unknown, silent?: boolean) => {
    const s = state as MathInlineState
    const strict = !!mathOpts?.strictDelimiters
    const allowLoading = !s?.env?.__markstreamFinal

    const preserveSpacesBeforeLineBreak = (src: string, start: number) => {
      let end = start
      while (end < src.length && (src[end] === ' ' || src[end] === '\t'))
        end++

      if (end === start)
        return start

      const hitsLineBreak = src[end] === '\n' || (src[end] === '\r' && src[end + 1] === '\n')
      if (!hitsLineBreak)
        return start

      const text = src.slice(start, end)
      const token = s.push('text', '', 0)
      token.content = text
      return end
    }

    if (/^\*[^*]+/.test(s.src)) {
      return false
    }

    const pending = String(s.pending ?? '')
    const currentStart = Math.max(0, s.pos - pending.length)
    // Fast path: the opener decision (and the code-span/image ranges) is
    // computed once per inline state. When there is no math opener at or
    // after the scan start, this rule returns false immediately instead of
    // re-scanning the whole source at every inline position.
    const scan = getInlineScanState(s)
    if (!hasMathOpenerAtOrAfter(scan.mathOpenerPositions, currentStart)) {
      return false
    }

    if (s.src[s.pos] === '$') {
      let dollarRunEnd = s.pos + 1
      while (s.src[dollarRunEnd] === '$')
        dollarRunEnd++

      const dollarRunLength = dollarRunEnd - s.pos
      const nextChar = s.src[dollarRunEnd]
      if (dollarRunLength >= 3 && (!nextChar || /\s/.test(nextChar))) {
        const token = s.push('text', '', 0)
        token.content = s.src.slice(s.pos, dollarRunEnd)
        s.pos = dollarRunEnd
        return true
      }
    }

    const delimiters: [string, string][] = [
      ['$$', '$$'],
      ['$', '$'],
      // Support explicit TeX inline delimiters only: `\\(...\\)`
      // NOTE: in source text authors must write the backslashes literally
      // (e.g. `\\(...\\)`). Unescaped `\(...\)` cannot be reliably
      // distinguished from ordinary parentheses and may not be parsed as math.
      ['\\(', '\\)'],
      // Do NOT treat plain parentheses as math delimiters. Using ['\(', '\)']
      // accidentally becomes ['(', ')'] in JS/TS strings and over-matches
      // regular text like "(0 <= t < S-1)", causing false math detection.
    ]

    let searchPos = currentStart
    let preMathPos = currentStart
    // Save the initial unconsumed position so $$ can rescan the current
    // inline segment even after $ handling advances the cursor. Starting
    // from absolute 0 can duplicate already-emitted text after hardbreaks.
    const initialPos = currentStart
    // We'll scan the entire inline source and tokenize all occurrences.
    // Hoisted out of the delimiter loop: the ranges only depend on `src` and
    // the loading flag, so they must not be rebuilt once per delimiter.
    const src = s.src
    const { codeSpanRanges, imageRanges } = scan
    // use findMatchingClose from util
    for (const [open, close] of delimiters) {
      let foundAny = false
      // Reset searchPos for $$ to allow it to scan the full content
      // even after $ rule has processed some text
      if (open === '$$' && searchPos !== initialPos) {
        searchPos = initialPos
      }
      // Guard against non-advancing loops: if we ever end up repeatedly
      // matching the same opener at the same position, force `searchPos`
      // to advance so the inline rule can't hang the UI.
      let lastIndex = -1
      let lastSearchPos = -1
      let stallCount = 0
      const pushText = (text: string) => {
        // sanitize unexpected values
        if (text === 'undefined' || text == null) {
          text = ''
        }
        if (text === '\\') {
          s.pos = s.pos + text.length
          searchPos = s.pos
          return
        }
        if (text === '\\)' || text === '\\(') {
          const t = s.push('text_special', '', 0)
          t.content = text === '\\)' ? ')' : '('
          t.markup = text
          s.pos = s.pos + text.length
          searchPos = s.pos
          return
        }

        if (!text)
          return

        // When scanning $$...$$, also parse nested single-dollar $...$ math
        // segments that appear in the surrounding text. Without this, mixing
        // $ and $$ in one line can cause the $ segments to be emitted as plain
        // text because this rule returns after the first successful delimiter
        // pass.
        if (open === '$$' && text.includes('$')) {
          let localPos = 0
          while (localPos < text.length) {
            const dollarIndex = findNextUnescapedDollar(text, localPos)
            if (dollarIndex === -1) {
              const rest = text.slice(localPos)
              if (rest) {
                const t = s.push('text', '', 0)
                t.content = rest
                s.pos = s.pos + rest.length
                searchPos = s.pos
              }
              break
            }

            // Skip "$$" occurrences; they belong to the $$ scanner.
            if ((dollarIndex > 0 && text[dollarIndex - 1] === '$') || (dollarIndex + 1 < text.length && text[dollarIndex + 1] === '$')) {
              const beforeSkip = text.slice(localPos, dollarIndex + 1)
              if (beforeSkip) {
                const t = s.push('text', '', 0)
                t.content = beforeSkip
                s.pos = s.pos + beforeSkip.length
                searchPos = s.pos
              }
              localPos = dollarIndex + 1
              continue
            }

            const before = text.slice(localPos, dollarIndex)
            if (before) {
              const t = s.push('text', '', 0)
              t.content = before
              s.pos = s.pos + before.length
              searchPos = s.pos
            }

            const closingDollarIndex = findSingleDollarClose(text, dollarIndex + 1)
            if (closingDollarIndex === -1) {
              // No closing delimiter; treat the rest as text.
              const rest = text.slice(dollarIndex)
              const t = s.push('text', '', 0)
              t.content = rest
              s.pos = s.pos + rest.length
              searchPos = s.pos
              break
            }

            const content = text.slice(dollarIndex + 1, closingDollarIndex)
            const hasBacktick = content.includes('`')
            const isEmpty = !content || !content.trim()
            const nextChar = text[closingDollarIndex + 1]
            const isCurrencyRange = isLikelyCurrencyRangeDollar(content, nextChar)
            const isCurrencyAmount = isLikelyCurrencyAmountStart(content, true)
            const isPlaceholder = isLikelyPlaceholderDollar(content)
            if (!hasBacktick && !isEmpty && !isCurrencyRange && !isCurrencyAmount && !isPlaceholder) {
              const token = s.push('math_inline', 'math', 0)
              token.content = normalizeStandaloneBackslashT(content, mathOpts)
              token.markup = '$'
              token.raw = `$${content}$`
              token.loading = false
              s.pos = s.pos + (closingDollarIndex - dollarIndex + 1)
              searchPos = s.pos
              localPos = closingDollarIndex + 1
              continue
            }

            // Not valid math; emit '$' as text and continue.
            const t = s.push('text', '', 0)
            t.content = '$'
            s.pos = s.pos + 1
            searchPos = s.pos
            localPos = dollarIndex + 1
          }
          return
        }

        // Check if text contains image syntax ![...](...)
        // If so, parse and push the image token manually
        const imageStart = text.indexOf('![')
        if (imageStart !== -1) {
          // Push text before the image syntax
          if (imageStart > 0) {
            const beforeImage = text.slice(0, imageStart)
            const t = s.push('text', '', 0)
            t.content = beforeImage
            s.pos = s.pos + beforeImage.length
            searchPos = s.pos
          }

          // Try to parse the image syntax: ![alt](src "title")
          const imageText = text.slice(imageStart)
          const imageMatch = imageText.match(/^!\[([^\]]*)\]\(([^)]+)\)/)
          if (imageMatch) {
            const [, alt, srcAndTitle] = imageMatch
            // Parse src and optional title
            const srcMatch = srcAndTitle.match(/^(\S+)(?:\s+"([^"]+)")?\s*$/)
            const src = srcMatch ? srcMatch[1] : srcAndTitle
            const title = srcMatch && srcMatch[2] ? srcMatch[2] : null

            // Create image token
            const token = s.push('image', 'img', 0)
            token.attrs = [['src', src], ['alt', alt]]
            if (title) {
              token.attrs.push(['title', title])
            }
            token.content = alt
            token.children = [{ type: 'text', content: alt, tag: '' }]
            s.pos = s.pos + imageMatch[0].length
            searchPos = s.pos

            // Continue processing the remaining text after the image
            const remainingText = text.slice(imageStart + imageMatch[0].length)
            if (remainingText) {
              // Recursively process the remaining text
              pushText(remainingText)
            }
            return
          }

          // If image syntax is incomplete, push it as text and continue
          const t = s.push('text', '', 0)
          t.content = text
          s.pos = s.pos + text.length
          searchPos = s.pos
          return
        }

        const t = s.push('text', '', 0)
        t.content = text
        s.pos = s.pos + text.length
        searchPos = s.pos
      }

      while (true) {
        if (searchPos >= src.length)
          break
        const index = src.indexOf(open, searchPos)
        if (index === -1)
          break
        if (isEscapedAt(src, index)) {
          searchPos = index + Math.max(1, open.length)
          continue
        }

        const codeSpanAtIndex = findRangeAt(codeSpanRanges, index)
        if (codeSpanAtIndex) {
          searchPos = codeSpanAtIndex[1]
          continue
        }

        const imageRangeAtIndex = findRangeAt(imageRanges, index)
        if (imageRangeAtIndex) {
          searchPos = imageRangeAtIndex[1]
          continue
        }

        if (index === lastIndex && searchPos === lastSearchPos) {
          stallCount++
          if (stallCount > 2) {
            searchPos = index + Math.max(1, open.length)
            continue
          }
        }
        else {
          stallCount = 0
          lastIndex = index
          lastSearchPos = searchPos
        }
        // NOTE: historically this math rule also supported plain parentheses
        // delimiters, so we avoided matching a "(" right after a link label
        // like `[text](...)`. We no longer treat parentheses as math delimiters,
        // and this rule scans the whole inline source (not only `state.pos`),
        // so returning `false` here can break markdown-it's invariants and hang
        // the parser after we already emitted tokens/advanced `state.pos`.
        //
        // Keep the link-guard only for the legacy "(" delimiter (currently unused).
        if (open === '(' && index > 0) {
          let i = index - 1
          while (i >= 0 && src[i] === ' ')
            i--
          if (i >= 0 && src[i] === ']') {
            searchPos = index + open.length
            continue
          }
        }

        // Skip $$ delimiters when processing $ delimiter to avoid conflicts
        // The $$ rule will handle these separately
        if (open === '$' && index > 0 && src[index - 1] === '$') {
          searchPos = index + 1
          continue
        }
        if (open === '$' && index < src.length - 1 && src[index + 1] === '$') {
          searchPos = index + 2
          continue
        }
        // 有可能遇到 \((\operatorname{span}\\{\boldsymbol{\alpha}\\})^\perp\)
        // 这种情况，前面的 \( 是数学公式的开始，后面的 ( 是普通括号
        // endIndex 需要找到与 open 对应的 close
        // 不能简单地用 indexOf 找到第一个 close — 需要处理嵌套与转义字符
        const endIdx = open === '$'
          ? findSingleDollarClose(src, index + open.length)
          : findMatchingClose(src, index + open.length, open, close)
        if (endIdx === -1) {
          // no matching close for this opener; skip forward
          const content = src.slice(index + open.length)
          if (content.includes(open)) {
            searchPos = src.indexOf(open, index + open.length)
            continue
          }
          if (endIdx === -1) {
            // Do not treat segments containing inline code as math
            const isCurrencyAmount = open === '$' && isLikelyCurrencyAmountStart(content)
            if (allowLoading && !strict && !isCurrencyAmount && isMathLike(content) && !content.includes('`')) {
              searchPos = index + open.length
              foundAny = true
              if (!silent) {
                s.pending = ''
                const toPushBefore = preMathPos ? src.slice(preMathPos, searchPos) : src.slice(0, searchPos)
                const isStrongPrefix = countUnescapedStrong(toPushBefore) % 2 === 1

                if (preMathPos) {
                  pushText(src.slice(preMathPos, searchPos))
                }
                else {
                  let text = src.slice(0, searchPos)
                  if (text.endsWith(open))
                    text = text.slice(0, text.length - open.length)
                  pushText(text)
                }
                if (isStrongPrefix) {
                  const strongMarker = findLastUnescapedStrongMarker(toPushBefore)?.marker ?? '**'
                  const strongToken = s.push('strong_open', '', 0)
                  strongToken.markup = strongMarker
                  const token = s.push('math_inline', 'math', 0)
                  token.content = normalizeStandaloneBackslashT(content, mathOpts)
                  token.markup = open === '$$' ? '$$' : open === '\\(' ? '\\(\\)' : open === '$' ? '$' : '()'
                  token.raw = `${open}${content}${close}`
                  token.loading = true
                  strongToken.content = content
                  s.push('strong_close', '', 0)
                }
                else {
                  const token = s.push('math_inline', 'math', 0)
                  token.content = normalizeStandaloneBackslashT(content, mathOpts)
                  token.markup = open === '$$' ? '$$' : open === '\\(' ? '\\(\\)' : open === '$' ? '$' : '()'
                  token.raw = `${open}${content}${close}`
                  token.loading = true
                }
                // consume the full inline source
                s.pos = src.length
              }
              searchPos = src.length
              preMathPos = searchPos
            }
            break
          }
        }
        const content = src.slice(index + open.length, endIdx)
        // Skip treating as math when the content contains inline-code backticks
        // Always accept explicit dollar-delimited math ($...$) even if the
        // heuristic deems it not math-like (to support cases like $H$, $CO_2$).
        const hasBacktick = content.includes('`')
        const isEmpty = !content || !content.trim()
        const isDollar = open === '$'
        const nextChar = src[endIdx + close.length]
        const isCurrencyRange = isDollar && isLikelyCurrencyRangeDollar(content, nextChar)
        const isCurrencyAmount = isDollar && isLikelyCurrencyAmountStart(content, true)
        const isPlaceholder = isDollar && isLikelyPlaceholderDollar(content)
        if (isCurrencyAmount || isCurrencyRange) {
          // The candidate close may open the next price or a real formula.
          // Leave the text to markdown-it so emphasis boundaries stay intact.
          searchPos = index + open.length
          continue
        }
        const shouldSkip = strict
          ? (hasBacktick || isEmpty || isPlaceholder)
          : (hasBacktick || isEmpty || isPlaceholder || (!isDollar && !isMathLike(content)))
        if (shouldSkip) {
          // push remaining text after last match
          // not math-like; skip this match and continue scanning
          searchPos = endIdx + close.length
          const text = src.slice(s.pos, searchPos)
          if (!s.pending) {
            pushText(text)
            // We consumed the skipped span as plain text; advance the "consumed"
            // cursor so subsequent matches don't re-push this prefix.
            preMathPos = searchPos
          }
          continue
        }
        foundAny = true

        if (!silent) {
          // push text before this math
          const before = src.slice(s.pos - (s.pending ?? '').length, index)
          // 如果 before 包含 单边的 ` ** 或 __ ，则直接跳过，交给 md 处理

          // const m = before.match(/(^|[^\\])(`+|__|\*\*)/)
          // if (m) {
          //   // If there is an unclosed code/emphasis marker before the
          //   // potential math opener, don't abort the whole inline rule
          //   // (which can cause the parser to repeatedly re-run this rule
          //   // leading to a loop). Instead skip this opener and continue
          //   // scanning after it so other rules can handle the content.
          //   searchPos = index + open.length
          //   continue
          // }

          // If we already consumed some content, avoid duplicating the prefix
          // Only push the portion from previous search position
          const prevConsumed = src.slice(0, searchPos)
          let toPushBefore = prevConsumed ? src.slice(preMathPos, index) : before
          const isStrongPrefix = countUnescapedStrong(toPushBefore) % 2 === 1
          if (index !== s.pos && isStrongPrefix) {
            toPushBefore = s.pending + src.slice(s.pos, index)
          }
          const strongMarkerInfo = isStrongPrefix ? findLastUnescapedStrongMarker(toPushBefore) : null
          const strongMarker = strongMarkerInfo?.marker ?? '**'

          // strong prefix handling (preserve previous behavior)
          if (s.pending !== toPushBefore) {
            s.pending = ''
            if (isStrongPrefix) {
              if (strongMarkerInfo) {
                const after = toPushBefore.slice(strongMarkerInfo.index + strongMarker.length)
                pushText(toPushBefore.slice(0, strongMarkerInfo.index))
                const strongToken = s.push('strong_open', '', 0)
                strongToken.markup = strongMarker
                const textToken = s.push('text', '', 0)
                textToken.content = after
                s.push('strong_close', '', 0)
              }
              else {
                pushText(toPushBefore)
              }
            }
            else {
              pushText(toPushBefore)
            }
          }
          if (isStrongPrefix) {
            const strongToken = s.push('strong_open', '', 0)
            strongToken.markup = strongMarker
            const token = s.push('math_inline', 'math', 0)
            token.content = normalizeStandaloneBackslashT(content, mathOpts)
            token.markup = open === '$$' ? '$$' : open === '\\(' ? '\\(\\)' : open === '$' ? '$' : '()'
            token.raw = `${open}${content}${close}`
            token.loading = false
            const raw = src.slice(endIdx + close.length)
            const isBeforeClose = raw.startsWith(strongMarker)
            if (isBeforeClose) {
              s.push('strong_close', '', 0)
            }
            // Always advance cursor past the math span; otherwise when the math
            // is at end-of-line (raw === ''), we'd loop forever on the same opener.
            // 这里的 raw 可能还会有 math_inline, 应该交给后续的规则处理，直接 s.pos 到当前位置
            s.pos = preserveSpacesBeforeLineBreak(src, endIdx + close.length)
            searchPos = s.pos
            preMathPos = searchPos
            if (!isBeforeClose)
              s.push('strong_close', '', 0)
            // Leave the remaining inline suffix to markdown-it so later rules
            // (for example superscript, footnotes, or strong/emphasis) can
            // tokenize it normally instead of being collapsed into plain text.
            return true
          }
          else {
            const token = s.push('math_inline', 'math', 0)
            token.content = normalizeStandaloneBackslashT(content, mathOpts)
            token.markup = open === '$$' ? '$$' : open === '\\(' ? '\\(\\)' : open === '$' ? '$' : '()'
            token.raw = `${open}${content}${close}`
            token.loading = false
          }
        }

        searchPos = preserveSpacesBeforeLineBreak(src, endIdx + close.length)
        preMathPos = searchPos
        s.pos = searchPos
        // Do not consume the trailing suffix here. Returning now lets the
        // inline parser continue from the end of the math token so adjacent
        // markdown like `^[1]^`, `[^1]`, or `**strong**` is still parsed by
        // the normal rules.
        return true
      }

      if (foundAny) {
        if (!silent) {
          // Special handling for $$ rule: process remaining $ delimiters before pushing text
          // This is needed because the $ rule won't run after we return true
          if (open === '$$' && searchPos < src.length && src.slice(searchPos).includes('$')) {
            // Find and process all $...$ patterns in the remaining text
            let remainingPos = searchPos
            while (true) {
              if (remainingPos >= src.length)
                break
              const dollarIndex = findNextUnescapedDollar(src, remainingPos)
              if (dollarIndex === -1)
                break

              // Skip $$ patterns
              if (dollarIndex + 1 < src.length && src[dollarIndex + 1] === '$') {
                remainingPos = dollarIndex + 2
                continue
              }
              if (dollarIndex > 0 && src[dollarIndex - 1] === '$') {
                remainingPos = dollarIndex + 1
                continue
              }

              // Find matching closing $
              const closingDollarIndex = findSingleDollarClose(src, dollarIndex + 1)
              if (closingDollarIndex === -1)
                break

              // Valid $...$ pattern
              const content = src.slice(dollarIndex + 1, closingDollarIndex)
              const hasBacktick = content.includes('`')
              const isEmpty = !content || !content.trim()
              const nextChar = src[closingDollarIndex + 1]
              const isCurrencyRange = isLikelyCurrencyRangeDollar(content, nextChar)
              const isCurrencyAmount = isLikelyCurrencyAmountStart(content, true)
              const isPlaceholder = isLikelyPlaceholderDollar(content)
              // For explicit $...$ delimiters, accept non-empty content
              // (e.g. "$H$", "$1$") even if the heuristic doesn't classify it
              // as "math-like".
              if (!hasBacktick && !isEmpty && !isCurrencyRange && !isCurrencyAmount && !isPlaceholder) {
                // Push text before this $...$
                const before = src.slice(searchPos, dollarIndex)
                if (before) {
                  pushText(before)
                }
                // Push the $ math token
                const token = s.push('math_inline', 'math', 0)
                token.content = normalizeStandaloneBackslashT(content, mathOpts)
                token.markup = '$'
                token.raw = `$${content}$`
                token.loading = false
                searchPos = closingDollarIndex + 1
                remainingPos = closingDollarIndex + 1
              }
              else {
                // Not valid math; emit '$' and continue scanning.
                pushText('$')
                remainingPos = dollarIndex + 1
              }
            }

            // Push remaining text after all $...$ patterns
            if (remainingPos < src.length) {
              pushText(src.slice(remainingPos))
            }
          }
          else {
            // push remaining text after last match
            if (searchPos < src.length)
              pushText(src.slice(searchPos))
          }

          // consume the full inline source
          s.pos = src.length
        }
        else {
          // in silent mode, advance position past what we scanned
          s.pos = searchPos
        }

        return true
      }
    }

    return false
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
