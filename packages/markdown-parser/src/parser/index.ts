import type { MarkdownIt } from 'markdown-it-ts'
import type { MarkdownToken, ParsedNode, ParseOptions } from '../types'
import { parseInlineTokens } from './inline-parsers'
import { parseCommonBlockToken } from './node-parsers/block-token-parser'
import { parseBlockquote } from './node-parsers/blockquote-parser'
import { containerTokenHandlers } from './node-parsers/container-token-handlers'
import { parseHardBreak } from './node-parsers/hardbreak-parser'
import { parseList } from './node-parsers/list-parser'
import { parseParagraph } from './node-parsers/paragraph-parser'

function stripDanglingHtmlLikeTail(markdown: string) {
  const isWs = (ch: string) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'

  const isLikelyHtmlTagPrefix = (tail: string) => {
    // Deterministic scanner (avoids ReDoS/backtracking regexes).
    // Accepts prefixes like "<think", "</think", "<div class", "<a href=\"x"
    // and treats them as "HTML-ish" tails that can be stripped in streaming mode.
    if (!tail || tail[0] !== '<')
      return false
    if (tail.includes('>'))
      return false

    let i = 1
    // "< " is likely comparison ("x < y"), not a tag
    if (i < tail.length && isWs(tail[i]))
      return false

    if (tail[i] === '/') {
      i++
      // "</ " isn't a tag start
      if (i < tail.length && isWs(tail[i]))
        return false
    }

    const isAlpha = (ch: string) => {
      const c = ch.charCodeAt(0)
      return (c >= 65 && c <= 90) || (c >= 97 && c <= 122)
    }
    const isDigit = (ch: string) => {
      const c = ch.charCodeAt(0)
      return c >= 48 && c <= 57
    }
    const isNameStart = (ch: string) => ch === '!' || isAlpha(ch)
    const isNameChar = (ch: string) => isAlpha(ch) || isDigit(ch) || ch === ':' || ch === '-'
    const isAttrStart = (ch: string) => isAlpha(ch) || isDigit(ch) || ch === '_' || ch === '.' || ch === ':' || ch === '-'
    const isAttrChar = isAttrStart

    if (i >= tail.length || !isNameStart(tail[i]))
      return false

    // tag name
    i++
    while (i < tail.length && isNameChar(tail[i]))
      i++

    while (i < tail.length) {
      // trailing whitespace ok
      while (i < tail.length && isWs(tail[i]))
        i++
      if (i >= tail.length)
        return true

      // allow self-closing slash at end (e.g. "<br/")
      if (tail[i] === '/') {
        i++
        while (i < tail.length && isWs(tail[i]))
          i++
        return i >= tail.length
      }

      // attribute name
      if (!isAttrStart(tail[i]))
        return false
      i++
      while (i < tail.length && isAttrChar(tail[i]))
        i++

      while (i < tail.length && isWs(tail[i]))
        i++

      if (i < tail.length && tail[i] === '=') {
        i++
        while (i < tail.length && isWs(tail[i]))
          i++
        if (i >= tail.length)
          return true // incomplete value

        const quote = tail[i]
        if (quote === '"' || quote === '\'') {
          i++
          while (i < tail.length && tail[i] !== quote)
            i++
          // If we don't see the closing quote (tail ends), it's still a tag prefix
          if (i >= tail.length)
            return true
          i++ // consume closing quote
        }
        else {
          // unquoted value: scan until whitespace or forbidden delimiters
          while (i < tail.length) {
            const ch = tail[i]
            if (isWs(ch) || ch === '<' || ch === '>' || ch === '"' || ch === '\'' || ch === '`')
              break
            i++
          }
          if (i >= tail.length)
            return true // incomplete unquoted value
        }
      }
      // else: boolean attr, continue
    }

    return true
  }

  const isInsideFencedCodeBlock = (src: string, pos: number) => {
    let inFence = false
    let fenceChar: '`' | '~' | '' = ''
    let fenceLen = 0

    const isIndentWs = (ch: string) => ch === ' ' || ch === '\t'

    const parseFenceMarker = (line: string) => {
      let i = 0
      while (i < line.length && isIndentWs(line[i])) i++
      const ch = line[i]
      if (ch !== '`' && ch !== '~')
        return null
      let j = i
      while (j < line.length && line[j] === ch) j++
      const len = j - i
      if (len < 3)
        return null
      return { markerChar: ch as '`' | '~', markerLen: len, rest: line.slice(j) }
    }

    const stripBlockquotePrefix = (line: string) => {
      let i = 0
      while (i < line.length && isIndentWs(line[i])) i++
      let saw = false
      while (i < line.length && line[i] === '>') {
        saw = true
        i++
        while (i < line.length && isIndentWs(line[i])) i++
      }
      return saw ? line.slice(i) : null
    }

    const matchFence = (rawLine: string) => {
      const direct = parseFenceMarker(rawLine)
      if (direct)
        return direct

      const afterQuote = stripBlockquotePrefix(rawLine)
      if (afterQuote == null)
        return null

      return parseFenceMarker(afterQuote)
    }

    let offset = 0
    const lines = src.split(/\r?\n/)
    for (const line of lines) {
      const lineStart = offset
      const lineEnd = offset + line.length

      const pastTargetLine = pos < lineStart
      if (pastTargetLine)
        break

      const fenceMatch = matchFence(line)
      if (fenceMatch) {
        const markerChar = fenceMatch.markerChar
        const markerLen = fenceMatch.markerLen
        if (inFence) {
          if (markerChar === fenceChar && markerLen >= fenceLen) {
            if (/^\s*$/.test(fenceMatch.rest)) {
              inFence = false
              fenceChar = ''
              fenceLen = 0
            }
          }
        }
        else {
          inFence = true
          fenceChar = markerChar
          fenceLen = markerLen
        }
      }

      if (pos <= lineEnd)
        break

      offset = lineEnd + 1
    }

    return inFence
  }

  // In streaming mode it's common to have an incomplete HTML-ish fragment at
  // the very end of the current buffer (e.g. '<fo' or '</think'). Letting it
  // reach markdown-it can produce visible mid-state text nodes. We only strip
  // the *tail* when there is no closing '>' anywhere after the last '<'.
  const s = String(markdown ?? '')
  const lastLt = s.lastIndexOf('<')
  if (lastLt === -1)
    return s
  if (isInsideFencedCodeBlock(s, lastLt))
    return s

  // Only treat it as an HTML-ish tail when "<" looks like a tag start.
  // This avoids truncating normal text/math like "y_{<i}" or "x < y".
  if (lastLt > 0) {
    const prev = s[lastLt - 1]
    const prevIsWs = prev === ' ' || prev === '\t' || prev === '\n' || prev === '\r'
    // Some stream transports escape newlines as "\\n" / "\\r\\n". Treat those
    // sequences as line boundaries too.
    const prev2 = s[lastLt - 2]
    const prevLooksLikeEscapedNewline = (prev === 'n' || prev === 'r') && prev2 === '\\'
    if (!prevIsWs && !prevLooksLikeEscapedNewline)
      return s
  }

  const tail = s.slice(lastLt)
  if (tail.includes('>'))
    return s
  // If the char after '<' is whitespace, it's more likely a comparison ("x < y")
  // than a tag start ("<div").
  if (tail.length > 1 && (tail[1] === ' ' || tail[1] === '\t' || tail[1] === '\n' || tail[1] === '\r'))
    return s

  if (!isLikelyHtmlTagPrefix(tail))
    return s
  return s.slice(0, lastLt)
}

export function parseMarkdownToStructure(
  markdown: string,
  md: MarkdownIt,
  options: ParseOptions = {},
): ParsedNode[] {
  const isFinal = !!options.final
  // Ensure markdown is a string — guard against null/undefined inputs from callers
  // todo: 下面的特殊 math 其实应该更精确匹配到() 或者 $$ $$ 或者 \[ \] 内部的内容
  let safeMarkdown = (markdown ?? '').toString().replace(/([^\\])\r(ight|ho)/g, '$1\\r$2').replace(/([^\\])\n(abla|eq|ot|exists)/g, '$1\\n$2')
  if (!isFinal) {
    if (safeMarkdown.endsWith('- *')) {
      // 放置markdown 解析 - * 会被处理成多个 ul >li 嵌套列表
      safeMarkdown = safeMarkdown.replace(/- \*$/, '- \\*')
    }
    if (/(?:^|\n)\s*-\s*$/.test(safeMarkdown)) {
      // streaming 中间态：单独的 "-" 行（或以换行结尾的 "-\n"）会被渲染成文本/列表前缀，
      // 也会导致输入 "---" 时第一个 "-" 先闪出来再跳成 hr。
      safeMarkdown = safeMarkdown.replace(/(?:^|\n)\s*-\s*$/, (m) => {
        return m.startsWith('\n') ? '\n' : ''
      })
    }
    else if (/(?:^|\n)\s*--\s*$/.test(safeMarkdown)) {
      // streaming 中间态：输入 "---" 时的 "--" 前缀也不应该作为文本渲染，避免跳动。
      safeMarkdown = safeMarkdown.replace(/(?:^|\n)\s*--\s*$/, (m) => {
        return m.startsWith('\n') ? '\n' : ''
      })
    }
    else if (/(?:^|\n)\s*>\s*$/.test(safeMarkdown)) {
      // streaming 中间态：单独的 ">" 行会先被识别成 blockquote，导致 UI 闪烁/跳动。
      // 只裁剪末尾这一个 marker，等后续内容到齐再正常解析。
      safeMarkdown = safeMarkdown.replace(/(?:^|\n)\s*>\s*$/, (m) => {
        return m.startsWith('\n') ? '\n' : ''
      })
    }
    else if (/\n\s*[*+]\s*$/.test(safeMarkdown)) {
      // streaming 中间态：单独的 "*"/"+" 行会被识别成空的 list item，导致 UI 闪出一个圆点
      safeMarkdown = safeMarkdown.replace(/\n\s*[*+]\s*$/, '\n')
    }
    else if (/\n[[(]\n*$/.test(safeMarkdown)) {
      // 此时 markdown 解析会出错要跳过
      safeMarkdown = safeMarkdown.replace(/(\n\[|\n\()+\n*$/g, '\n')
    }
  }

  // For custom HTML-like blocks (e.g. <thinking>...</thinking>), markdown-it may
  // keep parsing subsequent lines as part of the HTML block unless there's a
  // blank line boundary. To ensure content immediately following a closing tag
  // (like a list/table/blockquote/fence) is parsed as Markdown blocks, insert
  // a single empty line after the closing tag when the next line begins with a
  // block-level marker.
  if (options.customHtmlTags?.length) {
    const tags = options.customHtmlTags
      .map(t => String(t ?? '').trim())
      .filter(Boolean)
      .map((t) => {
        const m = t.match(/^[<\s/]*([A-Z][\w-]*)/i)
        return (m?.[1] ?? '').toLowerCase()
      })
      .filter(Boolean)

    if (tags.length) {
      // Fast path: no closing tag marker at all.
      if (!safeMarkdown.includes('</')) {
        // no-op
      }
      else {
        for (const tag of tags) {
          const re = new RegExp(
          // After a closing tag at end-of-line, if the next line is not blank
          // (ignoring whitespace) and we're not at end-of-string, insert a
          // blank line to force markdown-it to resume normal block parsing.
          // Restrict to lines that contain ONLY the closing tag (plus whitespace)
          // to avoid affecting inline occurrences like "x</thinking>y".
            String.raw`(^[\t ]*<\s*\/\s*${tag}\s*>[\t ]*)(\r?\n)(?![\t ]*\r?\n|$)`,
            'gim',
          )
          safeMarkdown = safeMarkdown.replace(re, '$1$2$2')
        }
      }
    }
  }

  // 마지막에 남아있는 미완성 '<...'(예: '<fo', '</think') 꼬리 조각은
  // streaming 중간 상태에서 화면에 그대로 찍힐 수 있으므로, markdown-it
  // 파싱 전에 제거한다.
  if (!isFinal)
    safeMarkdown = stripDanglingHtmlLikeTail(safeMarkdown)

  // Get tokens from markdown-it
  const tokens = md.parse(safeMarkdown, { __markstreamFinal: isFinal })
  // Defensive: ensure tokens is an array
  if (!tokens || !Array.isArray(tokens))
    return []

  // Allow consumers to transform tokens before processing
  const pre = options.preTransformTokens
  const post = options.postTransformTokens
  let transformedTokens = tokens as unknown as MarkdownToken[]
  if (pre && typeof pre === 'function') {
    transformedTokens = pre(transformedTokens) || transformedTokens
  }

  // Process the tokens into our structured format.
  // Note: markdown-it's `html_block` token.content can be normalized in ways
  // that drop some original lines. Keep the original source around so block
  // parsers can reconstruct raw slices using token.map when needed.
  const internalOptions = {
    ...options,
    __sourceMarkdown: safeMarkdown,
    __customHtmlBlockCursor: 0,
  } as any
  let result = processTokens(transformedTokens, internalOptions)

  // Backwards compatible token-level post hook: if provided and returns
  // a modified token array, re-process tokens and override node-level result.
  if (post && typeof post === 'function') {
    const postResult = post(transformedTokens)
    if (Array.isArray(postResult)) {
      // Backwards compatibility: if the hook returns an array of tokens
      // (they have a `type` string property), re-process them into nodes.
      const first = (postResult as unknown[])[0] as unknown
      const firstType = (first as Record<string, unknown>)?.type
      if (first && typeof firstType === 'string') {
        result = processTokens(postResult as unknown as MarkdownToken[])
      }
      else {
        // Otherwise assume it returned ParsedNode[] and use it as-is
        result = postResult as unknown as ParsedNode[]
      }
    }
  }
  if (options.debug) {
    console.log('Parsed Markdown Tree Structure:', result)
  }
  return result
}

// Process markdown-it tokens into our structured format
export function processTokens(tokens: MarkdownToken[], options?: ParseOptions): ParsedNode[] {
  // Defensive: ensure tokens is an array
  if (!tokens || !Array.isArray(tokens))
    return []

  const result: ParsedNode[] = []
  let i = 0
  // Note: table token normalization is applied during markdown-it parsing
  // via the `applyFixTableTokens` plugin (core.ruler.after('block')).
  // Link/strong/list-item fixes are applied during the inline stage by
  // their respective plugins. That keeps parsing-time fixes centralized
  // and avoids ad-hoc post-processing here.
  while (i < tokens.length) {
    const handled = parseCommonBlockToken(tokens, i, options, containerTokenHandlers)
    if (handled) {
      result.push(handled[0])
      i = handled[1]
      continue
    }

    const token = tokens[i]
    switch (token.type) {
      case 'paragraph_open':
        result.push(parseParagraph(tokens, i, options))
        i += 3 // Skip paragraph_open, inline, paragraph_close
        break

      case 'bullet_list_open':
      case 'ordered_list_open': {
        const [listNode, newIndex] = parseList(tokens, i, options)
        result.push(listNode)
        i = newIndex
        break
      }

      case 'blockquote_open': {
        const [blockquoteNode, newIndex] = parseBlockquote(tokens, i, options)
        result.push(blockquoteNode)
        i = newIndex
        break
      }

      case 'footnote_anchor':{
        const meta = (token.meta ?? {}) as Record<string, unknown>
        const id = String(meta.label ?? token.content ?? '')
        result.push({
          type: 'footnote_anchor',
          id,
          raw: String(token.content ?? ''),
        } as ParsedNode)

        i++
        break
      }

      case 'hardbreak':
        result.push(parseHardBreak())
        i++
        break

      case 'text': {
        const content = String(token.content ?? '')
        // In stream mode, markdown-it can occasionally emit a root-level `text`
        // token (e.g. immediately after an HTML/custom block closes). Treat it
        // as a normal paragraph so the content isn't dropped.
        result.push({
          type: 'paragraph',
          raw: content,
          children: content
            ? [{ type: 'text', content, raw: content } as ParsedNode]
            : [],
        } as ParsedNode)
        i++
        break
      }

      case 'inline':
        result.push(...parseInlineTokens(token.children || [], String(token.content ?? ''), undefined, {
          requireClosingStrong: options?.requireClosingStrong,
          customHtmlTags: options?.customHtmlTags,
        }))
        i += 1
        break
      default:
        // Handle other token types or skip them
        i += 1
        break
    }
  }

  return result
}

export { parseInlineTokens }
