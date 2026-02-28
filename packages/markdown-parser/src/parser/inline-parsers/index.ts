import type { MarkdownToken, ParsedNode, TextNode } from '../../types'
import { parseCheckboxInputToken, parseCheckboxToken } from './checkbox-parser'
import { parseEmojiToken } from './emoji-parser'
import { parseEmphasisToken } from './emphasis-parser'
import { parseFenceToken } from './fence-parser'
import { parseFootnoteRefToken } from './footnote-ref-parser'
import { parseHardbreakToken } from './hardbreak-parser'
import { parseHighlightToken } from './highlight-parser'
import { parseHtmlInlineCodeToken } from './html-inline-code-parser'
import { parseImageToken } from './image-parser'
import { parseInlineCodeToken } from './inline-code-parser'
import { parseInsertToken } from './insert-parser'
import { parseLinkToken } from './link-parser'
import { parseMathInlineToken } from './math-inline-parser'
import { parseReferenceToken } from './reference-parser'
import { parseStrikethroughToken } from './strikethrough-parser'
import { parseStrongToken } from './strong-parser'
import { parseSubscriptToken } from './subscript-parser'
import { parseSuperscriptToken } from './superscript-parser'
import { parseTextToken } from './text-parser'

// Precompiled regexes used frequently in inline parsing
const STRONG_PAIR_RE = /\*\*([\s\S]*?)\*\*/
const STRIKETHROUGH_RE = /[^~]*~{2,}[^~]+/
const HAS_STRONG_RE = /\*\*/

// Helper: detect likely URLs/hrefs (autolinks). Extracted so the
// detection logic is easy to tweak and test.
const AUTOLINK_PROTOCOL_RE = /^(?:https?:\/\/|mailto:|ftp:\/\/)/i
const AUTOLINK_GENERIC_RE = /:\/\//

function countUnescapedAsterisks(str: string): number {
  let count = 0
  let i = 0
  while (i < str.length) {
    if (str[i] === '\\' && i + 1 < str.length && str[i + 1] === '*') {
      i += 2 // skip escaped asterisk
      continue
    }
    if (str[i] === '*')
      count++
    i++
  }
  return count
}

const WORD_CHAR_RE = /[\p{L}\p{N}]/u
const WORD_ONLY_RE = /^[\p{L}\p{N}]+$/u

function isWordChar(ch?: string) {
  if (!ch)
    return false
  return WORD_CHAR_RE.test(ch)
}

function isWordOnly(text: string) {
  if (!text)
    return false
  return WORD_ONLY_RE.test(text)
}

function getAsteriskRunInfo(content: string, start: number) {
  let end = start
  while (end < content.length && content[end] === '*')
    end++
  const prev = start > 0 ? content[start - 1] : undefined
  const next = end < content.length ? content[end] : undefined
  return {
    len: end - start,
    prev,
    next,
    intraword: isWordChar(prev) && isWordChar(next),
  }
}

export function isLikelyUrl(href?: string) {
  if (!href)
    return false
  return AUTOLINK_PROTOCOL_RE.test(href) || AUTOLINK_GENERIC_RE.test(href)
}

// Process inline tokens (for text inside paragraphs, headings, etc.)
export function parseInlineTokens(
  tokens: MarkdownToken[],
  raw?: string,
  pPreToken?: MarkdownToken,
  options?: { requireClosingStrong?: boolean, customHtmlTags?: readonly string[], validateLink?: (url: string) => boolean },
): ParsedNode[] {
  if (!tokens || tokens.length === 0)
    return []

  const result: ParsedNode[] = []
  let currentTextNode: TextNode | null = null

  let i = 0
  // Default to strict matching for strong unless caller explicitly sets false
  const requireClosingStrong = options?.requireClosingStrong

  // Helpers to manage text node merging and pushing parsed nodes
  function resetCurrentTextNode() {
    currentTextNode = null
  }

  function handleEmphasisAndStrikethrough(content: string, token: MarkdownToken): boolean {
    // strikethrough (~~)
    if (STRIKETHROUGH_RE.test(content)) {
      let idx = content.indexOf('~~')
      if (idx === -1)
        idx = 0
      const _text = content.slice(0, idx)
      if (_text) {
        if (currentTextNode) {
          currentTextNode.content += _text
          currentTextNode.raw += _text
        }
        else {
          currentTextNode = {
            type: 'text',
            content: String(_text ?? ''),
            raw: String(token.content ?? ''),
          }
          result.push(currentTextNode)
        }
      }
      const strikethroughContent = content.slice(idx)
      const { node } = parseStrikethroughToken([
        { type: 's_open', tag: 's', content: '', markup: '*', info: '', meta: null },
        { type: 'text', tag: '', content: strikethroughContent.replace(/~/g, ''), markup: '', info: '', meta: null },
        { type: 's_close', tag: 's', content: '', markup: '*', info: '', meta: null },
      ], 0)
      resetCurrentTextNode()
      pushNode(node)
      i++
      return true
    }

    // strong (**)
    // Note: markdown-it may sometimes leave `**...**` as a plain text token
    // (e.g. when wrapping inline HTML like `<font>...</font>`). In that case,
    // we still want to recognize and parse the first strong pair.
    if (HAS_STRONG_RE.test(content)) {
      const openIdx = content.indexOf('**')
      const beforeText = openIdx > -1 ? content.slice(0, openIdx) : ''
      if (beforeText) {
        pushText(beforeText, beforeText)
      }

      if (openIdx === -1) {
        i++
        return true
      }

      // Check if the leading ** are from escaped asterisks
      // by checking if the raw markdown has \* at the corresponding position
      if (raw && openIdx === 0) {
        // Find where this content would start in raw
        // We need to check if the position in raw has \*
        let rawHasEscapedAsteriskAtStart = false
        let asteriskCount = 0
        // Count how many asterisks are at the start of content
        while (asteriskCount < content.length && content[asteriskCount] === '*') {
          asteriskCount++
        }
        // Check if raw has \* at the beginning (accounting for escaped backslashes)
        if (raw.startsWith('\\*')) {
          rawHasEscapedAsteriskAtStart = true
        }

        // If raw starts with escaped asterisks, don't parse as strong
        if (rawHasEscapedAsteriskAtStart) {
          // Check if all asterisks in content prefix are escaped in raw
          let escapedCount = 0
          let j = 0
          while (j < raw.length && escapedCount < asteriskCount) {
            if (raw[j] === '\\' && j + 1 < raw.length && raw[j + 1] === '*') {
              escapedCount += 1
              j += 2
            }
            else if (raw[j] === '*') {
              // Found unescaped asterisk, stop checking
              break
            }
            else {
              j++
            }
          }
          // If all leading asterisks in content are escaped in raw, treat as text
          if (escapedCount >= 2) {
            pushText(content, content)
            i++
            return true
          }
        }
      }

      // Fallback check: count asterisks in content vs unescaped asterisks in raw
      // This handles cases like `需方：\*\*\*\*\*\*有限公司`
      if (raw) {
        const contentAsteriskCount = (content.match(/\*/g) || []).length
        const rawAsteriskCount = countUnescapedAsterisks(raw)
        if (contentAsteriskCount > rawAsteriskCount) {
          pushText(content.slice(beforeText.length), content.slice(beforeText.length))
          i++
          return true
        }
      }

      const runInfo = getAsteriskRunInfo(content, openIdx)
      // find the first matching closing ** pair in the content
      const exec = STRONG_PAIR_RE.exec(content)
      let inner = ''
      let after = ''
      if (exec && typeof exec.index === 'number') {
        inner = exec[1]
        after = content.slice(exec.index + exec[0].length)
        const closeIdx = exec.index + exec[0].length - 2
        const closeRunInfo = getAsteriskRunInfo(content, closeIdx)
        if (
          runInfo.intraword
          && closeRunInfo.intraword
          && !isWordOnly(inner)
        ) {
          pushText(content.slice(beforeText.length), content.slice(beforeText.length))
          i++
          return true
        }
        if (!inner && runInfo.len >= 4 && runInfo.intraword) {
          pushText(content.slice(beforeText.length), content.slice(beforeText.length))
          i++
          return true
        }
      }
      else {
        // no closing pair found: decide behavior based on strict option
        if (requireClosingStrong) {
          // 严格模式：不要硬匹配 strong，保留原文为普通文本
          pushText(content.slice(beforeText.length), content.slice(beforeText.length))
          i++
          return true
        }
        if (runInfo.intraword) {
          pushText(content.slice(beforeText.length), content.slice(beforeText.length))
          i++
          return true
        }
        // 非严格模式（原行为）：mid-state, take rest as inner
        inner = content.slice(openIdx + 2)
        after = ''
      }

      // Special case: if the matched strong is empty (e.g., `****`) and the
      // remaining content is also just asterisks, treat the entire thing as text
      // to avoid creating empty strong nodes from escaped asterisks.
      if (!inner && /^\*+$/.test(after)) {
        // The entire content is just asterisks, treat as text
        pushText(content, content)
        i++
        return true
      }

      const { node } = parseStrongToken([
        { type: 'strong_open', tag: 'strong', content: '', markup: '**', info: '', meta: null },
        { type: 'text', tag: '', content: inner, markup: '', info: '', meta: null },
        { type: 'strong_close', tag: 'strong', content: '', markup: '**', info: '', meta: null },
      ], 0, raw, options as any)

      resetCurrentTextNode()
      pushNode(node)

      if (after) {
        handleToken({
          type: 'text',
          content: after,
          raw: after,
        })
        i--
      }

      i++
      return true
    }

    // emphasis (*)
    if (/[^*]*\*[^*]+/.test(content)) {
      let idx = content.indexOf('*')
      if (idx === -1)
        idx = 0
      const _text = content.slice(0, idx)
      if (_text) {
        if (currentTextNode) {
          currentTextNode.content += _text
          currentTextNode.raw += _text
        }
        else {
          currentTextNode = { type: 'text', content: String(_text ?? ''), raw: String(token.content ?? '') }
          result.push(currentTextNode)
        }
      }
      const runInfo = getAsteriskRunInfo(content, idx)
      const closeIndex = content.indexOf('*', idx + 1)
      if (closeIndex === -1 && runInfo.intraword) {
        pushText(content.slice(idx), content.slice(idx))
        i++
        return true
      }
      const emphasisContent = content.slice(idx, closeIndex > -1 ? closeIndex + 1 : undefined)
      const { node } = parseEmphasisToken([
        { type: 'em_open', tag: 'em', content: '', markup: '*', info: '', meta: null },
        { type: 'text', tag: '', content: emphasisContent.replace(/\*/g, ''), markup: '', info: '', meta: null },
        { type: 'em_close', tag: 'em', content: '', markup: '*', info: '', meta: null },
      ], 0, options as any)

      if (closeIndex !== -1 && closeIndex < content.length - 1) {
        const afterContent = content.slice(closeIndex + 1)
        if (afterContent) {
          handleToken({ type: 'text', content: afterContent, raw: afterContent } as unknown as MarkdownToken)
        }
      }
      resetCurrentTextNode()
      pushNode(node)
      i++
      return true
    }

    return false
  }

  function handleInlineCodeContent(content: string, _token: MarkdownToken): boolean {
    // Need at least one backtick to consider inline code
    if (!content.includes('`'))
      return false

    const findFirstUnescapedBacktick = (src: string) => {
      for (let idx = 0; idx < src.length; idx++) {
        if (src[idx] !== '`')
          continue
        let slashCount = 0
        for (let j = idx - 1; j >= 0 && src[j] === '\\'; j--)
          slashCount++
        if (slashCount % 2 === 0)
          return idx
      }
      return -1
    }

    const codeStart = findFirstUnescapedBacktick(content)
    if (codeStart === -1)
      return false
    // Determine the length of the opening backtick run (supports ``code``)
    let runLen = 1
    for (let k = codeStart + 1; k < content.length && content[k] === '`'; k++)
      runLen++

    // Find a matching closing run of the same length
    const closingSeq = '`'.repeat(runLen)
    const searchFrom = codeStart + runLen
    const codeEnd = content.indexOf(closingSeq, searchFrom)

    // If no matching closing run is found within this token stream, treat as mid-state.
    if (codeEnd === -1) {
      // Mid-state handling: for single backtick, emit an inline_code node so
      // editors can style it while typing; for multi-backtick runs, keep it as
      // plain text to avoid over-eager code spans.
      if (runLen === 1) {
        // beforeText 可能包含 strong/emphasis，需要递归处理
        const beforeText = content.slice(0, codeStart)
        const codeContent = content.slice(codeStart + 1)
        if (beforeText) {
          const handled = handleEmphasisAndStrikethrough(beforeText, _token)
          if (!handled)
            pushText(beforeText, beforeText)
          else
            i--
        }

        pushParsed({ type: 'inline_code', code: codeContent, raw: String(codeContent) } as ParsedNode)
        i++
        return true
      }

      // For `` or longer mid-states, treat as text fallback (non-recursive)
      let merged = content
      for (let j = i + 1; j < tokens.length; j++)
        merged += String((tokens[j].content ?? '') + (tokens[j].markup ?? ''))
      i = tokens.length - 1
      pushText(merged, merged)
      i++
      return true
    }

    // Close any current text node and handle the text before the code span
    resetCurrentTextNode()
    const beforeText = content.slice(0, codeStart)
    const codeContent = content.slice(codeStart + runLen, codeEnd)
    const after = content.slice(codeEnd + runLen)

    if (beforeText) {
      // Try to parse emphasis/strong inside the pre-code fragment, without
      // advancing the outer token index `i` permanently.
      const handled = handleEmphasisAndStrikethrough(beforeText, _token)
      if (!handled)
        pushText(beforeText, beforeText)
      else
        i--
    }

    pushParsed({
      type: 'inline_code',
      code: codeContent,
      raw: String(codeContent ?? ''),
    } as ParsedNode)

    if (after) {
      handleToken({ type: 'text', content: after, raw: after } as unknown as MarkdownToken)
      i--
    }
    i++
    return true
  }

  function pushParsed(node: ParsedNode) {
    // ensure any ongoing text node is closed when pushing non-text nodes
    resetCurrentTextNode()
    result.push(node)
  }

  function pushToken(token: MarkdownToken) {
    // push a raw token into result as a ParsedNode (best effort cast)
    resetCurrentTextNode()
    result.push(token as ParsedNode)
  }

  // backward-compatible alias used by existing call sites that pass parsed nodes
  function pushNode(node: ParsedNode) {
    pushParsed(node)
  }

  function pushText(content: string, raw?: string) {
    if (currentTextNode) {
      currentTextNode.content += content
      currentTextNode.raw += raw ?? content
    }
    else {
      currentTextNode = {
        type: 'text',
        content: String(content ?? ''),
        raw: String(raw ?? content ?? ''),
      } as TextNode
      result.push(currentTextNode)
    }
  }

  while (i < tokens.length) {
    const token = tokens[i] as MarkdownToken
    handleToken(token)
  }

  function handleToken(token: MarkdownToken) {
    switch (token.type) {
      case 'text': {
        handleTextToken(token)
        break
      }

      case 'softbreak':
        if (currentTextNode) {
          // Append newline to the current text node
          currentTextNode.content += '\n'
          currentTextNode.raw += '\n' // Assuming raw should also reflect the newline
        }
        else {
          currentTextNode = {
            type: 'text',
            content: '\n',
            raw: '\n',
          }
          result.push(currentTextNode)
        }
        // Don't create a node for softbreak itself, just modify text
        i++
        break

      case 'code_inline':
        pushNode(parseInlineCodeToken(token))
        i++
        break
      case 'html_inline': {
        const [node, index] = parseHtmlInlineCodeToken(
          token,
          tokens,
          i,
          parseInlineTokens,
          raw,
          pPreToken,
          options,
        )
        pushNode(node)
        i = index
        break
      }

      case 'link_open': {
        handleLinkOpen(token)
        break
      }

      case 'image':
        resetCurrentTextNode()
        pushNode(parseImageToken(token))
        i++
        break

      case 'strong_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseStrongToken(tokens, i, token.content, options as any)
        pushNode(node)
        i = nextIndex
        break
      }

      case 'em_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseEmphasisToken(tokens, i, options as any)
        pushNode(node)
        i = nextIndex
        break
      }

      case 's_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseStrikethroughToken(tokens, i, options as any)
        pushNode(node)
        i = nextIndex
        break
      }

      case 'mark_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseHighlightToken(tokens, i, options as any)
        pushNode(node)
        i = nextIndex
        break
      }

      case 'ins_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseInsertToken(tokens, i, options as any)
        pushNode(node)
        i = nextIndex
        break
      }

      case 'sub_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseSubscriptToken(tokens, i, options as any)
        pushNode(node)
        i = nextIndex
        break
      }

      case 'sup_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseSuperscriptToken(tokens, i, options as any)
        pushNode(node)
        i = nextIndex
        break
      }

      case 'sub':
        resetCurrentTextNode()
        pushNode({
          type: 'subscript',
          children: [
            {
              type: 'text',
              content: String(token.content ?? ''),
              raw: String(token.content ?? ''),
            },
          ],
          raw: `~${String(token.content ?? '')}~`,
        })
        i++
        break

      case 'sup':
        resetCurrentTextNode()
        pushNode({
          type: 'superscript',
          children: [
            {
              type: 'text',
              content: String(token.content ?? ''),
              raw: String(token.content ?? ''),
            },
          ],
          raw: `^${String(token.content ?? '')}^`,
        })
        i++
        break

      case 'emoji': {
        resetCurrentTextNode()
        const preToken = tokens[i - 1]
        if (preToken?.type === 'text' && /\|:-+/.test(String(preToken.content ?? ''))) {
          // 处理表格中的 emoji，跳过
          pushText('', '')
        }
        else {
          pushNode(parseEmojiToken(token))
        }
        i++
        break
      }
      case 'checkbox':
        resetCurrentTextNode()
        pushNode(parseCheckboxToken(token))
        i++
        break
      case 'checkbox_input':
        resetCurrentTextNode()
        pushNode(parseCheckboxInputToken(token))
        i++
        break
      case 'footnote_ref':
        resetCurrentTextNode()
        pushNode(parseFootnoteRefToken(token))
        i++
        break

      case 'footnote_anchor':{
        // Emit a footnote_anchor node so NodeRenderer can render a backlink
        // element (e.g. a small "↩" that scrolls back to the reference).
        resetCurrentTextNode()

        const meta = (token.meta ?? {}) as Record<string, unknown>
        const id = String(meta.label ?? token.content ?? '')
        pushParsed({
          type: 'footnote_anchor',
          id,
          raw: String(token.content ?? ''),
        } as ParsedNode)

        i++
        break
      }

      case 'hardbreak':
        resetCurrentTextNode()
        pushNode(parseHardbreakToken())
        i++
        break

      case 'fence': {
        resetCurrentTextNode()
        // Handle fenced code blocks with language specifications
        pushNode(parseFenceToken(tokens[i]))
        i++
        break
      }

      case 'math_inline': {
        resetCurrentTextNode()
        // 可能遇到 math_inline text math_inline 的特殊情况，需要合并成一个
        if (!token.content && token.markup === '$' && tokens[i + 1]?.type === 'text' && tokens[i + 2]?.type === 'math_inline') {
          pushNode(parseMathInlineToken({
            ...token,
            content: tokens[i + 1].content,
          }))
          i += 2
        }
        else {
          pushNode(parseMathInlineToken(token))
        }
        i++
        break
      }

      case 'reference': {
        handleReference(token)
        break
      }

      case 'text_special':{
        // treat as plain text (merge into adjacent text nodes)
        pushText(String(token.content ?? ''), String(token.content ?? ''))
        i++
        break
      }

      default:
        // Skip unknown token types, ensure text merging stops.
        // Synthetic 'link' tokens (from fixLinkTokens) must respect validateLink.
        if (token.type === 'link' && (token as any).href != null && options?.validateLink && !options.validateLink((token as any).href)) {
          resetCurrentTextNode()
          const displayText = String((token as any).text ?? '')
          pushText(displayText, displayText)
        }
        else {
          pushToken(token)
        }
        i++
        break
    }
  }

  function commitTextNode(content: string, token: MarkdownToken, preToken?: MarkdownToken, nextToken?: MarkdownToken) {
    const textNode = parseTextToken({ ...token, content })

    if (currentTextNode) {
      // Merge with the previous text node
      currentTextNode.content += textNode.content.replace(/(\*+|\(|\\)$/, '')
      currentTextNode.raw += textNode.raw
      return
    }

    const maybeMath = preToken?.tag === 'br' && tokens[i - 2]?.content === '['
    if (!nextToken)
      textNode.content = textNode.content.replace(/(\*+|\(|\\)$/, '')

    currentTextNode = textNode
    currentTextNode.center = maybeMath
    result.push(currentTextNode)
  }

  function handleTextToken(token: MarkdownToken) {
    // 合并连续的 text 节点
    let index = result.length - 1
    const rawContent = String(token.content ?? '')
    let content = rawContent
    if (rawContent.includes('\\'))
      content = rawContent.replace(/\\/g, '')

    if (token.content === '<' || (content === '1' && tokens[i - 1]?.tag === 'br')) {
      i++
      return
    }

    // math 公式 $ 只出现一个并且在末尾，优化掉
    const dollarIndex = content.indexOf('$')
    if (dollarIndex !== -1 && dollarIndex === content.lastIndexOf('$') && content.endsWith('$')) {
      content = content.slice(0, -1)
    }

    // 处理 undefined 结尾的问题
    if (content.endsWith('undefined') && !raw?.endsWith('undefined')) {
      content = content.slice(0, -9)
    }
    for (index; index >= 0; index--) {
      const item = result[index]
      if (item.type === 'text') {
        currentTextNode = null
        // Avoid duplicating text when the incoming token content already
        // includes the previous text node (can happen with certain mid-state
        // token streams).
        const itemContent = String((item as any).content ?? '')
        if (!content.startsWith(itemContent))
          content = itemContent + content
        continue
      }
      break
    }

    if (index < result.length - 1)
      result.length = index + 1

    const nextToken = tokens[i + 1]
    if (pPreToken?.type === 'list_item_open' && /^\d$/.test(content)) {
      i++
      return
    }
    if (content === '`' || content === '|' || content === '$' || /^\*+$/.test(content)) {
      i++
      return
    }
    if (!nextToken && /[^\]]\s*\(\s*$/.test(content)) {
      content = content.replace(/\(\s*$/, '')
    }
    if (!content) {
      i++
      return
    }

    const hasInlineCandidates = (
      content.includes('*')
      || content.includes('~')
      || content.includes('`')
      || content.includes('[')
      || content.includes('!')
      || content.includes('$')
      || content.includes('|')
      || content.includes('(')
    )
    if (!hasInlineCandidates) {
      commitTextNode(content, token, tokens[i - 1], nextToken)
      i++
      return
    }

    if (handleCheckboxLike(content))
      return
    const preToken = tokens[i - 1]
    if ((content === '[' && !nextToken?.markup?.includes('*')) || (content === ']' && !preToken?.markup?.includes('*'))) {
      i++
      return
    }
    // Use raw token content for inline-code fallback parsing so backslashes
    // inside code spans are preserved (e.g. `\\(...\\)`).
    if (handleInlineCodeContent(rawContent, token))
      return

    if (handleInlineImageContent(content, token))
      return

    // Avoid synthesizing links from raw text only when the next token is
    // already a structured link_open. This prevents duplicates while still
    // allowing fallback for later tricky links in the same inline run.
    if (tokens[i + 1]?.type !== 'link_open' && handleInlineLinkContent(content, token))
      return

    if (handleEmphasisAndStrikethrough(content, token))
      return

    // Emit remaining text token
    commitTextNode(content, token, preToken, nextToken)
    i++
  }

  function handleLinkOpen(token: MarkdownToken) {
    // mirror logic previously in the switch-case for 'link_open'
    resetCurrentTextNode()

    // 直接使用 parseLinkToken 来解析链接及其子节点，这能正确处理包含 code_inline 等复杂内容的链接
    const { node, nextIndex } = parseLinkToken(tokens, i, { requireClosingStrong })
    i = nextIndex

    // Respect consumer link validation (e.g. md.set({ validateLink }) so javascript: is not output as link
    if (options?.validateLink && !options.validateLink(node.href)) {
      pushText(node.text, node.text)
      return
    }

    // Determine loading state conservatively: if the link token parser
    // marked it as loading already, keep it; otherwise compute from raw
    // and href as a fallback so unclosed links remain marked as loading.
    const hrefAttr = token.attrs?.find(([name]) => name === 'href')?.[1]
    const hrefStr = String(hrefAttr ?? '')
    // Only override the link parser's default loading state when we
    // actually have an href to check against the raw source. If the
    // tokenizer emitted a link_open without an href (partial tokenizers
    // may do this), prefer the parseLinkToken's initial loading value
    // (which defaults to true for mid-state links).
    if (raw && hrefStr) {
      // More robust: locate the first "](" after the link text and see if
      // there's a matching ')' that closes the href. This avoids false
      // positives when other parentheses appear elsewhere in the source.
      const openIdx = raw.indexOf('](')
      if (openIdx === -1) {
        // No explicit link start found in raw — be conservative and keep
        // the parser's default loading value.
      }
      else {
        const closeIdx = raw.indexOf(')', openIdx + 2)
        if (closeIdx === -1) {
          node.loading = true
        }
        else if (node.loading) {
          // Check that the href inside the parens corresponds to this token
          const inside = raw.slice(openIdx + 2, closeIdx)
          if (inside.includes(hrefStr))
            node.loading = false
        }
      }
    }
    pushParsed(node)
  }

  function handleReference(token: MarkdownToken) {
    // mirror previous in-switch 'reference' handling
    resetCurrentTextNode()
    const nextToken = tokens[i + 1]
    const preToken = tokens[i - 1]
    const preResult = result[result.length - 1]

    const nextIsTextNotStartingParens = nextToken?.type === 'text' && !((String(nextToken.content ?? '')).startsWith('('))
    const preIsTextEndingBracketOrOnlySpace = preToken?.type === 'text' && /\]$|^\s*$/.test(String(preToken.content ?? ''))

    if (nextIsTextNotStartingParens || preIsTextEndingBracketOrOnlySpace) {
      pushNode(parseReferenceToken(token))
    }
    else if (nextToken && nextToken.type === 'text') {
      nextToken.content = String(token.markup ?? '') + String(nextToken.content ?? '')
    }
    else if (preResult && preResult.type === 'text') {
      preResult.content = String(preResult.content ?? '') + String(token.markup ?? '')
      preResult.raw = String(preResult.raw ?? '') + String(token.markup ?? '')
    }
    i++
  }

  function handleInlineLinkContent(content: string, _token: MarkdownToken): boolean {
    const linkStart = content.indexOf('[')
    if (linkStart === -1)
      return false

    let textNodeContent = content.slice(0, linkStart)
    const linkEnd = content.indexOf('](', linkStart)
    if (linkEnd !== -1) {
      const textToken = tokens[i + 2]
      let text = content.slice(linkStart + 1, linkEnd)
      if (text.includes('[')) {
        const secondLinkStart = text.indexOf('[')
        // adjust original linkStart and text
        textNodeContent += content.slice(0, linkStart + secondLinkStart + 1)
        const newLinkStart = linkStart + secondLinkStart + 1
        text = content.slice(newLinkStart + 1, linkEnd)
      }
      const nextToken = tokens[i + 1]
      if (content.endsWith('](') && nextToken?.type === 'link_open' && textToken) {
        const last = tokens[i + 4]
        let index = 4
        let loading = true
        if (last?.type === 'text' && last.content === ')') {
          index++
          loading = false
        }
        else if (last?.type === 'text' && last.content === '.') {
          i++
        }

        if (textNodeContent) {
          pushText(textNodeContent, textNodeContent)
        }
        const hrefFromToken = String(textToken.content ?? '')
        if (options?.validateLink && !options.validateLink(hrefFromToken)) {
          pushText(text, text)
        }
        else {
          pushParsed({
            type: 'link',
            href: hrefFromToken,
            title: null,
            text,
            children: [{ type: 'text', content: text, raw: text }],
            loading,
          } as ParsedNode)
        }
        i += index
        return true
      }

      const linkContentEnd = content.indexOf(')', linkEnd)
      const href = linkContentEnd !== -1 ? content.slice(linkEnd + 2, linkContentEnd) : ''
      const loading = linkContentEnd === -1
      let emphasisMatch = textNodeContent.match(/\*+$/)
      if (emphasisMatch) {
        textNodeContent = textNodeContent.replace(/\*+$/, '')
      }
      if (textNodeContent) {
        pushText(textNodeContent, textNodeContent)
      }
      if (!emphasisMatch)
        emphasisMatch = text.match(/^\*+/)
      if (!requireClosingStrong && emphasisMatch) {
        const type = emphasisMatch[0].length
        text = text.replace(/^\*+/, '').replace(/\*+$/, '')
        const newTokens = []
        if (type === 1) {
          newTokens.push({ type: 'em_open', tag: 'em', nesting: 1 })
        }
        else if (type === 2) {
          newTokens.push({ type: 'strong_open', tag: 'strong', nesting: 1 })
        }
        else if (type === 3) {
          newTokens.push({ type: 'strong_open', tag: 'strong', nesting: 1 })
          newTokens.push({ type: 'em_open', tag: 'em', nesting: 1 })
        }
        newTokens.push({
          type: 'link',
          href,
          title: null,
          text,
          children: [{ type: 'text', content: text, raw: text }],
          loading,
        })
        if (type === 1) {
          newTokens.push({ type: 'em_close', tag: 'em', nesting: -1 })
          const { node } = parseEmphasisToken(newTokens, 0, options as any)
          pushNode(node)
        }
        else if (type === 2) {
          newTokens.push({ type: 'strong_close', tag: 'strong', nesting: -1 })
          const { node } = parseStrongToken(newTokens, 0, undefined, options as any)
          pushNode(node)
        }
        else if (type === 3) {
          newTokens.push({ type: 'em_close', tag: 'em', nesting: -1 })
          newTokens.push({ type: 'strong_close', tag: 'strong', nesting: -1 })
          const { node } = parseStrongToken(newTokens, 0, undefined, options as any)
          pushNode(node)
        }
        else {
          const { node } = parseEmphasisToken(newTokens, 0, options as any)
          pushNode(node)
        }
      }
      else {
        if (options?.validateLink && !options.validateLink(href)) {
          pushText(text, text)
        }
        else {
          pushParsed({
            type: 'link',
            href,
            title: null,
            text,
            children: [{ type: 'text', content: text, raw: text }],
            loading,
          } as ParsedNode)
        }
      }

      const afterText = linkContentEnd !== -1 ? content.slice(linkContentEnd + 1) : ''
      if (afterText) {
        handleToken({ type: 'text', content: afterText, raw: afterText } as unknown as MarkdownToken)
        i--
      }
      i++
      return true
    }

    return false
  }

  function handleInlineImageContent(content: string, token: MarkdownToken): boolean {
    const imageStart = content.indexOf('![')
    if (imageStart === -1)
      return false

    const textNodeContent = content.slice(0, imageStart)
    if (!currentTextNode) {
      currentTextNode = {
        type: 'text',
        content: textNodeContent,
        raw: textNodeContent,
      }
    }
    else {
      currentTextNode.content += textNodeContent
    }
    result.push(currentTextNode)
    currentTextNode = null // Reset current text node
    pushParsed(parseImageToken(token, true) as ParsedNode)
    i++
    return true
  }

  function handleCheckboxLike(content: string): boolean {
    // Detect checkbox-like syntax at the start of a list item e.g. [x] or [ ]
    if (!(content?.startsWith('[') && pPreToken?.type === 'list_item_open'))
      return false

    const _content = content.slice(1)
    const w = _content.match(/[^\s\]]/)
    if (w === null) {
      i++
      return true
    }
    // If the first non-space/']' char is x/X treat as a checkbox input
    if (w && /x/i.test(w[0])) {
      const checked = w[0] === 'x' || w[0] === 'X'
      pushParsed({
        type: 'checkbox_input',
        checked,
        raw: checked ? '[x]' : '[ ]',
      } as ParsedNode)
      i++
      return true
    }

    return false
  }

  return result
}
