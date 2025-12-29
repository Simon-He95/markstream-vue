import type { MarkdownIt } from 'markdown-it-ts'
import type { MathOptions } from '../config'

import findMatchingClose from '../findMatchingClose'
import { ESCAPED_TEX_BRACE_COMMANDS, isMathLike } from './isMathLike'

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
    out = out.replace(/(^|[^\\])!/g, '$1\\!')

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

  const hasStrongSignal = /\\[a-z]+/i.test(stripped)
    || /\d/.test(stripped)
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

export function applyMath(md: MarkdownIt, mathOpts?: MathOptions) {
  // Inline rule for `\\(...\\)` and `$$...$$` and `$...$`
  const mathInline = (state: unknown, silent: boolean) => {
    const s = state as any
    const strict = !!mathOpts?.strictDelimiters
    const allowLoading = !s?.env?.__markstreamFinal

    if (/^\*[^*]+/.test(s.src)) {
      return false
    }
    const delimiters: [string, string][] = [
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

    let searchPos = 0
    let preMathPos = 0
    // use findMatchingClose from util
    for (const [open, close] of delimiters) {
      // We'll scan the entire inline source and tokenize all occurrences
      const src = s.src
      let foundAny = false
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
        // If the delimiter is immediately preceded by a ']' (possibly with
        // intervening spaces), it's likely part of a markdown link like
        // `[text](...)`, so we should not treat this '(' as the start of
        // an inline math span. Also guard the index to avoid OOB access.
        if (index > 0) {
          let i = index - 1
          // skip spaces between ']' and the delimiter
          while (i >= 0 && src[i] === ' ')
            i--
          if (i >= 0 && src[i] === ']')
            return false
        }
        // 有可能遇到 \((\operatorname{span}\\{\boldsymbol{\alpha}\\})^\perp\)
        // 这种情况，前面的 \( 是数学公式的开始，后面的 ( 是普通括号
        // endIndex 需要找到与 open 对应的 close
        // 不能简单地用 indexOf 找到第一个 close — 需要处理嵌套与转义字符
        const endIdx = findMatchingClose(src, index + open.length, open, close)
        if (endIdx === -1) {
          // no matching close for this opener; skip forward
          const content = src.slice(index + open.length)
          if (content.includes(open)) {
            searchPos = src.indexOf(open, index + open.length)
            continue
          }
          if (endIdx === -1) {
            // Do not treat segments containing inline code as math
            if (allowLoading && !strict && isMathLike(content) && !content.includes('`')) {
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
        const shouldSkip = strict
          ? (hasBacktick || isEmpty)
          : (hasBacktick || isEmpty || (!isDollar && !isMathLike(content)))
        if (shouldSkip) {
          // push remaining text after last match
          // not math-like; skip this match and continue scanning
          searchPos = endIdx + close.length
          const text = src.slice(s.pos, searchPos)
          if (!s.pending)
            pushText(text)
          continue
        }
        foundAny = true

        if (!silent) {
          // push text before this math
          const before = src.slice(s.pos - s.pending.length, index)
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
            s.pos = endIdx + close.length
            searchPos = s.pos
            preMathPos = searchPos
            if (!isBeforeClose)
              s.push('strong_close', '', 0)
            continue
          }
          else {
            const token = s.push('math_inline', 'math', 0)
            token.content = normalizeStandaloneBackslashT(content, mathOpts)
            token.markup = open === '$$' ? '$$' : open === '\\(' ? '\\(\\)' : open === '$' ? '$' : '()'
            token.raw = `${open}${content}${close}`
            token.loading = false
          }
        }

        searchPos = endIdx + close.length
        preMathPos = searchPos
        s.pos = searchPos
      }

      if (foundAny) {
        if (!silent) {
          // push remaining text after last match
          if (searchPos < src.length)
            pushText(src.slice(searchPos))
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
    const s = state as any
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
    for (const [open, close] of delimiters) {
      // 这里其实不应该只匹配 startWith的情况因为很可能前面还有 text
      if (lineText.startsWith(open)) {
        if (open.includes('[')) {
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
      // 这里可能 ai 返回的格式有问题 $$ 跟在文本的最后，而不是单独一行，此时匹配是否有下一行，把它当作块级公式处理
      else if (lineText.endsWith(open) && !lineText.slice(0, lineText.length - open.length).trim().includes(open) && startLine + 1 < endLine) {
        // lineText 要变成下一行的内容，把之前lineText的内容当作普通文本处理
        s.push('text', '', 0).content = lineText.slice(0, lineText.length - open.length)
        const nextLineStartPos = s.bMarks[startLine + 1] + s.tShift[startLine + 1]
        const nextLineText = s.src.slice(nextLineStartPos, s.eMarks[startLine + 1]).trim()
        lineText = nextLineText
        // 更新 endLine
        if (open === '$$') {
          skipFirstLine = true
          matched = true
          openDelim = open
          closeDelim = close
          break
        }
      }
    }

    if (!matched)
      return false
    if (silent)
      return true

    if (
      lineText.includes(closeDelim)
      && lineText.indexOf(closeDelim) > openDelim.length
    ) {
      const startDelimIndex = lineText.indexOf(openDelim)
      const endDelimIndex = lineText.indexOf(
        closeDelim,
        startDelimIndex + openDelim.length,
      )
      const content = lineText.slice(
        startDelimIndex + openDelim.length,
        endDelimIndex,
      )
      const token: any = s.push('math_block', 'math', 0)
      token.content = normalizeStandaloneBackslashT(content)
      token.markup
        = openDelim === '$$' ? '$$' : openDelim === '[' ? '[]' : '\\[\\]'
      token.map = [startLine, startLine + 1]
      token.raw = `${openDelim}${content}${closeDelim}`
      token.block = true
      token.loading = false
      s.line = startLine + 1
      return true
    }

    let nextLine = startLine
    let content = ''
    let found = false

    const firstLineContent
      = lineText === openDelim ? '' : lineText.slice(openDelim.length)

    if (firstLineContent.includes(closeDelim)) {
      const endIndex = firstLineContent.indexOf(closeDelim)
      content = firstLineContent.slice(0, endIndex)
      found = true
      nextLine = startLine
    }
    else {
      if (firstLineContent && !skipFirstLine)
        content = firstLineContent

      for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
        const lineStart = s.bMarks[nextLine] + s.tShift[nextLine]
        const lineEnd = s.eMarks[nextLine]
        const currentLine = s.src.slice(lineStart - 1, lineEnd)
        if (currentLine.trim() === closeDelim) {
          found = true
          break
        }
        else if (currentLine.includes(closeDelim)) {
          found = true
          const endIndex = currentLine.indexOf(closeDelim)
          content += (content ? '\n' : '') + currentLine.slice(0, endIndex)
          break
        }
        content += (content ? '\n' : '') + currentLine
      }
    }

    // In strict mode or final mode, do not emit mid-state (unclosed) block math
    if ((!allowLoading || strict) && !found)
      return false
    // 追加检测内容是否是 math
    const looksMath = openDelim === '[' ? isPlainBracketMathLike(content) : isMathLike(content)
    if (!looksMath)
      return false

    const token: any = s.push('math_block', 'math', 0)
    token.content = normalizeStandaloneBackslashT(content)
    token.markup
      = openDelim === '$$' ? '$$' : openDelim === '[' ? '[]' : '\\[\\]'
    token.raw = `${openDelim}${content}${content.startsWith('\n') ? '\n' : ''}${closeDelim}`
    token.map = [startLine, nextLine + 1]
    token.block = true
    token.loading = !found
    s.line = nextLine + 1
    return true
  }

  // Register math before the escape rule so inline math is tokenized
  // before markdown-it processes backslash escapes. This preserves
  // backslashes inside math content (e.g. "\\{") instead of having
  // the escape rule remove them from the token content.
  md.inline.ruler.before('escape', 'math', mathInline)
  md.block.ruler.before('paragraph', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  })
}
