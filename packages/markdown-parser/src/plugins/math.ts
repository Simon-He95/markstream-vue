import type { MathOptions } from '../config'
import type { MarkdownIt } from '../markdown-it-types'
import type { MarkdownToken } from '../types'

import findMatchingClose from '../findMatchingClose'
import { ESCAPED_TEX_BRACE_COMMANDS, isMathLike } from './isMathLike'

interface MathInlineState {
  env?: Record<string, unknown>
  pos: number
  posMax?: number
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

function escapeStandaloneExclamation(value: string) {
  return value.replace(/(^|[^\\])!+/gu, (match: string, prefix: string) => {
    if (prefix && FACTORIAL_PRECEDING_RE.test(prefix))
      return match
    const marks = prefix ? match.slice(prefix.length) : match
    return `${prefix}${'\\!'.repeat(marks.length)}`
  })
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

function isEscapedAt(src: string, index: number) {
  let cursor = index - 1
  let backslashes = 0
  while (cursor >= 0 && src[cursor] === '\\') {
    backslashes++
    cursor--
  }
  return backslashes % 2 === 1
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

function isMathSpaceAt(src: string, index: number) {
  if (index < 0 || index >= src.length)
    return false
  const code = src.charCodeAt(index)
  if (code === 0x20 || (code >= 0x09 && code <= 0x0D))
    return true
  // Non-ASCII spaces (NBSP, ideographic space, ...) count as space too.
  return code >= 0x80 && /\s/.test(src[index]!)
}

function inlineMathMarkup(open: string) {
  if (open === '$$')
    return '$$'
  return open === '\\(' ? '\\(\\)' : '$'
}

function pushInlineMath(
  s: MathInlineState,
  open: string,
  content: string,
  opts: MathOptions | undefined,
  loading: boolean,
) {
  const close = open === '$$' ? '$$' : open === '\\(' ? '\\)' : '$'
  const token = s.push('math_inline', 'math', 0)
  token.content = normalizeStandaloneBackslashT(content, opts)
  token.markup = inlineMathMarkup(open)
  token.raw = `${open}${content}${close}`
  token.loading = loading
  return token
}

interface ImageAltCursor {
  depth: number
  scanned: number
}

const imageAltCursors = new WeakMap<MathInlineState, ImageAltCursor>()

/**
 * Whether `pos` sits in the alt text of an `![...](` whose destination has not
 * been typed yet. A finished image never reaches the math rule (the image rule
 * consumes it first), so this only sees incomplete ones, where the alt is still
 * plain text. Math must stay text there too: the renderer rebuilds the pending
 * image from that text, and a math node in the middle would cut the alt short.
 *
 * The cursor only moves forward and only for real (non-silent) rule calls, so
 * one inline parse walks the source at most once instead of rescanning it per
 * `$`.
 */
function isInsideIncompleteImageAlt(s: MathInlineState, pos: number) {
  let cursor = imageAltCursors.get(s)
  if (!cursor) {
    cursor = { depth: 0, scanned: 0 }
    imageAltCursors.set(s, cursor)
  }
  if (pos < cursor.scanned)
    cursor.scanned = cursor.depth = 0

  const src = s.src
  while (cursor.scanned < pos) {
    const index = cursor.scanned
    const char = src.charCodeAt(index)
    if (char === 0x5B && !isEscapedAt(src, index)) {
      if (cursor.depth > 0)
        cursor.depth++
      else if (index > 0 && src.charCodeAt(index - 1) === 0x21)
        cursor.depth = 1
    }
    else if (char === 0x5D && cursor.depth > 0 && !isEscapedAt(src, index)) {
      cursor.depth--
    }
    cursor.scanned++
  }
  return cursor.depth > 0
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
  // The rule is position-local like every other markdown-it inline rule: it
  // only inspects `state.pos`, and it never emits the text in front of a
  // formula itself. That text was already tokenized by the emphasis, link,
  // escape and newline rules (or still sits in `state.pending`, which
  // `state.push` flushes in order), so emphasis, links, escapes and hard
  // breaks around a formula stay intact.
  //
  // Delimiters:
  // - `$` follows Pandoc: the opener must be followed by a non-space and the
  //   closer must be preceded by a non-space and followed by a non-digit. A
  //   candidate closer that breaks that rule makes the opener plain text and
  //   no later `$` is considered, which keeps `100$ and $x$`,
  //   `Price $5 **expensive** up to $x$` and `$20,000 and $30,000` as text.
  // - `$$` covers display delimiters that appear mid-line.
  // - `\(` is the explicit TeX inline delimiter.
  //
  // `state.posMax` bounds the closer search, so a `$` beyond the end of a link
  // label never closes a formula that was opened inside the label.
  const mathInline = (state: unknown, silent?: boolean) => {
    const s = state as MathInlineState
    const src = s.src
    const start = s.pos
    const max = typeof s.posMax === 'number' ? s.posMax : src.length
    if (start >= max)
      return false

    const strict = !!mathOpts?.strictDelimiters
    const allowLoading = !s?.env?.__markstreamFinal

    const first = src.charCodeAt(start)
    let open: string
    if (first === 0x24) {
      // A `$` that follows another `$` is part of a longer run; the run is
      // decided at its first character.
      if (src.charCodeAt(start - 1) === 0x24)
        return false
      // A `$$$` run is a half-typed display fence, not an inline formula.
      if (start + 1 < max && src.charCodeAt(start + 1) === 0x24) {
        if (start + 2 < max && src.charCodeAt(start + 2) === 0x24)
          return false
        open = '$$'
      }
      else {
        open = '$'
      }
    }
    else if (first === 0x5C && start + 1 < max && src.charCodeAt(start + 1) === 0x28) {
      open = '\\('
    }
    else {
      return false
    }
    const closeDelim = open === '$$' ? '$$' : open === '\\(' ? '\\)' : '$'

    // While streaming the alt of an unclosed `![...](` is rebuilt from text, so
    // math there has to stay text. A final parse keeps the formula (markdown-it
    // gives up on such an image anyway), which matches the old behaviour.
    if (!silent && allowLoading && isInsideIncompleteImageAlt(s, start))
      return false

    let closeIndex = -1
    let skippedDisplayRun = false
    if (open === '$') {
      // The Pandoc opener rule: `$` must be followed by a non-space.
      if (isMathSpaceAt(src, start + 1))
        return false
      let cursor = start + 1
      while (cursor < max) {
        if (src.charCodeAt(cursor) !== 0x24) {
          cursor++
          continue
        }
        if (isEscapedAt(src, cursor)) {
          cursor++
          continue
        }
        // A `$$` run belongs to the display rule; skip the whole run.
        let runEnd = cursor + 1
        while (runEnd < max && src.charCodeAt(runEnd) === 0x24)
          runEnd++
        if (runEnd > cursor + 1) {
          skippedDisplayRun = true
          cursor = runEnd
          continue
        }
        // The Pandoc closer rule. A `$` that breaks it is text, and so is the
        // opener: it may well be the next price or the start of real math.
        if (isMathSpaceAt(src, cursor - 1) || isAsciiDigit(cursor + 1 < max ? src[cursor + 1] : undefined))
          return false
        closeIndex = cursor
        break
      }
    }
    else {
      const found = findMatchingClose(src, start + open.length, open, closeDelim)
      if (found !== -1 && found + closeDelim.length <= max)
        closeIndex = found
    }

    if (closeIndex !== -1) {
      const content = src.slice(start + open.length, closeIndex)
      const isDollar = open === '$'
      if (content.includes('`') || !content.trim())
        return false
      if (isDollar && (
        isLikelyPlaceholderDollar(content)
        || isLikelyCurrencyAmountStart(content, true)
        || isLikelyCurrencyRangeDollar(content, closeIndex + 1 < max ? src[closeIndex + 1] : undefined)
      )) {
        return false
      }
      // `$...$` is always a formula; `$$` and `\(` keep the isMathLike
      // heuristic so prose inside display delimiters is not turned into math.
      if (!isDollar && !strict && !isMathLike(content))
        return false

      s.pos = closeIndex + closeDelim.length
      if (!silent)
        pushInlineMath(s, open, content, mathOpts, false)
      return true
    }

    // Unclosed formula. While streaming, render the rest of the inline source
    // as a loading node instead of flashing it as text first. This only
    // applies at the end of the inline source: inside a bounded `posMax` (link
    // text, emphasis markers) a later character can still close the formula.
    if (silent || !allowLoading || strict || max !== src.length)
      return false
    // A `$$` run in the tail is its own opener, so this `$` is plain text and
    // the rest of the source is not this formula's content.
    if (skippedDisplayRun)
      return false
    const rest = src.slice(start + open.length, max)
    if (!rest || rest.includes('`'))
      return false
    if (open === '$' && isLikelyCurrencyAmountStart(rest))
      return false
    if (!isMathLike(rest))
      return false
    s.pos = max
    pushInlineMath(s, open, rest, mathOpts, true)
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
