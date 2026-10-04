import type { MarkdownToken, ParsedNode, TextNode } from '../../types'
import type { InlineParseState } from './inline-parser-state'
import {
  countUnescapedAsterisks,
  findLiteralIntrawordAsteriskRunPairEnd,
  findNextStrongClose,
  findNextUnescapedAsterisk,
  findNextUnescapedEmphasisClose,
  findTripleAsteriskClose,
  getAsteriskRunInfo,
  isEmphasisOpenDelimiter,
  isStrongOpenDelimiter,
  isTripleAsteriskInnerText,
  isWordChar,
  isWordOnly,
} from './delimiter-helpers'
import { parseEmphasisToken } from './emphasis-parser'
import {
  handleInlineImageContent,
  handleInlineLinkContent,
  isMarkdownLinkBeforeLinkifiedUrl,
  recoverOuterImageLinkFromRawText,
  recoverOuterImageLinkMidStateFromText,
} from './link-image-recovery'
import {
  decodeVisibleTextFromRaw,
  ESCAPED_PUNCTUATION_RE,
  getInlineTextMarkerFlags,
  hasEscapedMarkup,
  INLINE_CANDIDATE_MARKERS,
  INLINE_TEXT_MARKER_BACKSLASH,
  INLINE_TEXT_MARKER_BACKTICK,
  INLINE_TEXT_MARKER_BANG,
  INLINE_TEXT_MARKER_CLOSE_BRACKET,
  INLINE_TEXT_MARKER_DOLLAR,
  INLINE_TEXT_MARKER_OPEN_BRACKET,
  INLINE_TEXT_MARKER_OPEN_PAREN,
  stripTrailingMidStateMarker,
} from './literal-text-helpers'
import { parseStrikethroughToken } from './strikethrough-parser'
import { parseStrongToken } from './strong-parser'
import { parseTextToken } from './text-parser'

// Precompiled regexes used frequently in inline parsing
const STRIKETHROUGH_RE = /[^~]*~{2,}[^~]+/
const HAS_STRONG_RE = /\*\*/
const INLINE_REPARSE_MARKER_RE = /[[_*^~]/

function isCurrentStreamToken(state: InlineParseState, token: MarkdownToken) {
  return token === state.tokens[state.index]
}

function handleEmphasisAndStrikethrough(state: InlineParseState, content: string, token: MarkdownToken): boolean {
  const rawSource = isCurrentStreamToken(state, token) && state.tokens.length === 1
    ? state.raw
    : String(token.content ?? '')
  const markerCandidates: Array<{
    type: 'strong' | 'emphasis' | 'strikethrough'
    index: number
  }> = []
  const literalIntrawordRunPairEnd = findLiteralIntrawordAsteriskRunPairEnd(content)
  if (literalIntrawordRunPairEnd !== -1) {
    state.pushText(content.slice(0, literalIntrawordRunPairEnd), content.slice(0, literalIntrawordRunPairEnd))
    const afterContent = content.slice(literalIntrawordRunPairEnd)
    if (afterContent) {
      state.dispatchToken({ type: 'text', content: afterContent, raw: afterContent } as unknown as MarkdownToken)
      state.index--
    }
    state.index++
    return true
  }
  if (STRIKETHROUGH_RE.test(content)) {
    const idx = content.indexOf('~~')
    if (idx !== -1)
      markerCandidates.push({ type: 'strikethrough', index: idx })
  }
  if (HAS_STRONG_RE.test(content)) {
    const idx = content.indexOf('**')
    if (idx !== -1)
      markerCandidates.push({ type: 'strong', index: idx })
  }
  if (/[^*]*\*[^*]+/.test(content)) {
    const idx = rawSource
      ? findNextUnescapedAsterisk(rawSource, 0)
      : content.indexOf('*')
    if (rawSource && idx === -1)
      return false
    if (idx !== -1)
      markerCandidates.push({ type: 'emphasis', index: idx })
  }
  markerCandidates.sort((a, b) => {
    if (a.index !== b.index)
      return a.index - b.index
    if (a.type === b.type)
      return 0
    // Prefer `**` over `*` when both point at the same run.
    if (a.type === 'strong')
      return -1
    if (b.type === 'strong')
      return 1
    return 0
  })
  const nextMarker = markerCandidates[0]
  if (!nextMarker)
    return false

  // strikethrough (~~)
  if (nextMarker.type === 'strikethrough') {
    const idx = nextMarker.index
    const beforeText = idx > -1 ? content.slice(0, idx) : ''
    if (beforeText)
      state.pushText(beforeText, beforeText)
    if (idx === -1) {
      state.index++
      return true
    }
    const closeIdx = content.indexOf('~~', idx + 2)
    const inner = closeIdx === -1 ? content.slice(idx + 2) : content.slice(idx + 2, closeIdx)
    const after = closeIdx === -1 ? '' : content.slice(closeIdx + 2)
    const { node } = parseStrikethroughToken([
      { type: 's_open', tag: 's', content: '', markup: '~~', info: '', meta: null },
      { type: 'text', tag: '', content: inner, markup: '', info: '', meta: null },
      { type: 's_close', tag: 's', content: '', markup: '~~', info: '', meta: null },
    ], 0, state.parseInlineTokens, state.options)
    state.resetCurrentTextNode()
    state.pushParsed(node)
    if (after) {
      state.dispatchToken({
        type: 'text',
        content: after,
        raw: after,
      })
      state.index--
    }
    state.index++
    return true
  }
  // strong (**)
  // Note: markdown-it may sometimes leave `**...**` as a plain text token
  // (e.g. when wrapping inline HTML like `<font>...</font>`). In that case,
  // we still want to recognize and parse the first strong pair.
  if (nextMarker.type === 'strong') {
    const openIdx = nextMarker.index
    const beforeText = openIdx > -1 ? content.slice(0, openIdx) : ''
    if (beforeText) {
      state.pushText(beforeText, beforeText)
    }
    if (openIdx === -1) {
      state.index++
      return true
    }
    // Check if the leading ** are from escaped asterisks
    // by checking if the raw markdown has \* at the corresponding position
    if (state.raw && openIdx === 0) {
      // Find where this content would start in raw
      // We need to check if the position in raw has \*
      let rawHasEscapedAsteriskAtStart = false
      let asteriskCount = 0
      // Count how many asterisks are at the start of content
      while (asteriskCount < content.length && content[asteriskCount] === '*') {
        asteriskCount++
      }
      // Check if raw has \* at the beginning (accounting for escaped backslashes)
      if (state.raw.startsWith('\\*')) {
        rawHasEscapedAsteriskAtStart = true
      }
      // If raw starts with escaped asterisks, don't parse as strong
      if (rawHasEscapedAsteriskAtStart) {
        // Check if all asterisks in content prefix are escaped in raw
        let escapedCount = 0
        let j = 0
        while (j < state.raw.length && escapedCount < asteriskCount) {
          if (state.raw[j] === '\\' && j + 1 < state.raw.length && state.raw[j + 1] === '*') {
            escapedCount += 1
            j += 2
          }
          else if (state.raw[j] === '*') {
            // Found unescaped asterisk, stop checking
            break
          }
          else {
            j++
          }
        }
        // If all leading asterisks in content are escaped in raw, treat as text
        if (escapedCount >= 2) {
          state.pushText(content, content)
          state.index++
          return true
        }
      }
    }
    // Fallback check: count asterisks in content vs unescaped asterisks in raw
    // This handles cases like `需方：\*\*\*\*\*\*有限公司`
    if (state.raw) {
      const contentAsteriskCount = (content.match(/\*/g) || []).length
      const rawAsteriskCount = countUnescapedAsterisks(state.raw)
      if (contentAsteriskCount > rawAsteriskCount) {
        state.pushText(content.slice(beforeText.length), content.slice(beforeText.length))
        state.index++
        return true
      }
    }
    const runInfo = getAsteriskRunInfo(content, openIdx)
    if (runInfo.len >= 3) {
      const closeIndex = findTripleAsteriskClose(content, openIdx + runInfo.len)
      if (closeIndex !== -1) {
        const inner = content.slice(openIdx + runInfo.len, closeIndex)
        if (isTripleAsteriskInnerText(inner)) {
          const { node } = parseStrongToken([
            { type: 'strong_open', tag: 'strong', content: '', markup: '**', info: '', meta: null },
            { type: 'em_open', tag: 'em', content: '', markup: '*', info: '', meta: null },
            { type: 'text', tag: '', content: inner, markup: '', info: '', meta: null },
            { type: 'em_close', tag: 'em', content: '', markup: '*', info: '', meta: null },
            { type: 'strong_close', tag: 'strong', content: '', markup: '**', info: '', meta: null },
          ], 0, state.parseInlineTokens, state.raw, state.options)
          state.resetCurrentTextNode()
          state.pushParsed(node)
          const afterContent = content.slice(closeIndex + 3)
          if (afterContent) {
            state.dispatchToken({ type: 'text', content: afterContent, raw: afterContent } as unknown as MarkdownToken)
            state.index--
          }
          state.index++
          return true
        }
      }
    }
    if (!isStrongOpenDelimiter(content, openIdx)) {
      const literalRun = content.slice(openIdx, openIdx + runInfo.len)
      state.pushText(literalRun, literalRun)
      const afterContent = content.slice(openIdx + runInfo.len)
      if (afterContent) {
        state.dispatchToken({ type: 'text', content: afterContent, raw: afterContent } as unknown as MarkdownToken)
        state.index--
      }
      state.index++
      return true
    }
    const close = findNextStrongClose(content, openIdx + 2)
    let inner = ''
    let after = ''
    if (close.index !== -1) {
      inner = content.slice(openIdx + 2, close.index)
      after = content.slice(close.index + 2)
      const closeIdx = close.index
      const closeRunInfo = getAsteriskRunInfo(content, closeIdx)
      if (runInfo.intraword
        && closeRunInfo.intraword
        && !isWordOnly(inner)) {
        state.pushText(content.slice(beforeText.length), content.slice(beforeText.length))
        state.index++
        return true
      }
      if (!inner && runInfo.len >= 4 && runInfo.intraword) {
        state.pushText(content.slice(beforeText.length), content.slice(beforeText.length))
        state.index++
        return true
      }
    }
    else {
      // no closing pair found: decide behavior based on strict option
      if (state.requireClosingStrong || close.sawInvalidClose) {
        state.pushText(content.slice(beforeText.length), content.slice(beforeText.length))
        state.index++
        return true
      }
      if (runInfo.intraword) {
        state.pushText(content.slice(beforeText.length), content.slice(beforeText.length))
        state.index++
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
      state.pushText(content, content)
      state.index++
      return true
    }
    const { node } = parseStrongToken([
      { type: 'strong_open', tag: 'strong', content: '', markup: '**', info: '', meta: null },
      { type: 'text', tag: '', content: inner, markup: '', info: '', meta: null },
      { type: 'strong_close', tag: 'strong', content: '', markup: '**', info: '', meta: null },
    ], 0, state.parseInlineTokens, state.raw, state.options)
    state.resetCurrentTextNode()
    state.pushParsed(node)
    if (after) {
      state.dispatchToken({
        type: 'text',
        content: after,
        raw: after,
      })
      state.index--
    }
    state.index++
    return true
  }
  // emphasis (*)
  if (nextMarker.type === 'emphasis') {
    let idx = nextMarker.index
    if (idx === -1)
      idx = 0
    const _text = content.slice(0, idx)
    if (_text) {
      state.pushText(_text, _text)
    }
    if (!isEmphasisOpenDelimiter(content, idx)) {
      state.pushText(content[idx], content[idx])
      const afterContent = content.slice(idx + 1)
      if (afterContent) {
        state.dispatchToken({ type: 'text', content: afterContent, raw: afterContent } as unknown as MarkdownToken)
        state.index--
      }
      state.index++
      return true
    }
    const runInfo = getAsteriskRunInfo(content, idx)
    const close = findNextUnescapedEmphasisClose(rawSource, content, idx + 1)
    const closeIndex = close.index
    const nextInlineToken = state.tokens[state.index + 1]
    if (state.options?.final
      && nextInlineToken?.type === 'em_open'
      && closeIndex !== -1
      && content.slice(idx + 1, closeIndex).trim() !== content.slice(idx + 1, closeIndex)) {
      state.pushText(content.slice(idx), content.slice(idx))
      state.index++
      return true
    }
    if (closeIndex === -1 && (close.sawInvalidClose || state.options?.final || runInfo.intraword || !isWordChar(content[idx + 1]))) {
      state.pushText(content.slice(idx), content.slice(idx))
      state.index++
      return true
    }
    const emphasisContent = closeIndex > -1
      ? content.slice(idx + 1, closeIndex)
      : content.slice(idx + 1)
    const { node } = parseEmphasisToken([
      { type: 'em_open', tag: 'em', content: '', markup: '*', info: '', meta: null },
      { type: 'text', tag: '', content: emphasisContent, markup: '', info: '', meta: null },
      { type: 'em_close', tag: 'em', content: '', markup: '*', info: '', meta: null },
    ], 0, state.parseInlineTokens, state.options)
    state.resetCurrentTextNode()
    state.pushParsed(node)
    if (closeIndex !== -1 && closeIndex < content.length - 1) {
      const afterContent = content.slice(closeIndex + 1)
      if (afterContent) {
        state.dispatchToken({ type: 'text', content: afterContent, raw: afterContent } as unknown as MarkdownToken)
        state.index--
      }
    }
    state.index++
    return true
  }
  return false
}

function handleInlineCodeContent(state: InlineParseState, content: string, _token: MarkdownToken): boolean {
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
        const handled = handleEmphasisAndStrikethrough(state, beforeText, _token)
        if (!handled)
          state.pushText(beforeText, beforeText)
        else
          state.index--
      }
      state.pushParsed({ type: 'inline_code', code: codeContent, raw: String(codeContent) } as ParsedNode)
      state.index++
      return true
    }
    // For `` or longer mid-states, treat as text fallback (non-recursive)
    let merged = content
    for (let j = state.index + 1; j < state.tokens.length; j++)
      merged += String((state.tokens[j].content ?? '') + (state.tokens[j].markup ?? ''))
    state.index = state.tokens.length - 1
    state.pushText(merged, merged)
    state.index++
    return true
  }
  // Close the current text node and handle the text before the code span
  state.resetCurrentTextNode()
  const beforeText = content.slice(0, codeStart)
  const codeContent = content.slice(codeStart + runLen, codeEnd)
  const after = content.slice(codeEnd + runLen)
  if (beforeText) {
    // Try to parse emphasis/strong inside the pre-code fragment, without
    // advancing the outer token cursor permanently.
    const handled = handleEmphasisAndStrikethrough(state, beforeText, _token)
    if (!handled)
      state.pushText(beforeText, beforeText)
    else
      state.index--
  }
  state.pushParsed({
    type: 'inline_code',
    code: codeContent,
    raw: String(codeContent ?? ''),
  } as ParsedNode)
  if (after) {
    state.dispatchToken({ type: 'text', content: after, raw: after } as unknown as MarkdownToken)
    state.index--
  }
  state.index++
  return true
}

function tryReparseCollapsedInlineText(state: InlineParseState, rawContent: string): ParsedNode[] | null {
  const md = state.options.markdownIt
  if (!md)
    return null
  if (state.tokens.length <= 1 || !state.tokens.some(token => token?.type === 'math_inline'))
    return null
  if (!INLINE_REPARSE_MARKER_RE.test(rawContent))
    return null
  const reparsed = md.parseInline(rawContent, { __markstreamFinal: !!state.options?.final }) as unknown as MarkdownToken[]
  if (!Array.isArray(reparsed) || reparsed.length === 0)
    return null
  const inlineToken = reparsed.find(token => token?.type === 'inline')
  const children = (inlineToken?.children ?? [])
    .filter(child => !(child?.type === 'text' && String(child.content ?? '') === ''))
  if (!children.length)
    return null
  if (!children.some(child => child?.type !== 'text'))
    return null
  if (children.length === 1 && children[0]?.type === 'text' && String(children[0].content ?? '') === rawContent)
    return null
  const reparsedNodes = state.parseInlineTokens(children, rawContent, state.pPreToken, state.options)
  return reparsedNodes.length ? reparsedNodes : null
}

function commitTextNode(state: InlineParseState, content: string, token: MarkdownToken, preToken?: MarkdownToken, nextToken?: MarkdownToken, markerFlags = getInlineTextMarkerFlags(content)) {
  const textNode = parseTextToken({ ...token, content })
  if (state.currentTextNode) {
    // Merge with the previous text node. The mid-state marker strip only
    // applies to streaming tails; final parses must keep real trailing
    // characters (`(`, `*`, `\`) intact.
    state.currentTextNode.content += state.options?.final
      ? textNode.content
      : stripTrailingMidStateMarker(textNode.content, token, markerFlags)
    state.currentTextNode.raw += textNode.raw
    return
  }
  const maybeMath = preToken?.tag === 'br' && state.tokens[state.index - 2]?.content === '['
  if (!nextToken) {
    textNode.content = state.options?.final
      ? textNode.content
      : stripTrailingMidStateMarker(textNode.content, token, markerFlags)
  }
  state.currentTextNode = textNode
  state.currentTextNode.center = maybeMath
  state.result.push(state.currentTextNode)
}

export function handleTextToken(state: InlineParseState, token: MarkdownToken) {
  // 合并连续的 text 节点
  const rawContent = String(token.content ?? '')
  const rawMarkerFlags = getInlineTextMarkerFlags(rawContent)
  const rawHasBackslash = (rawMarkerFlags & INLINE_TEXT_MARKER_BACKSLASH) !== 0
  const rawSource = isCurrentStreamToken(state, token) && state.tokens.length === 1 && rawHasBackslash && typeof state.raw === 'string'
    ? String(state.raw)
    : ''
  let content = rawSource
    ? decodeVisibleTextFromRaw(rawSource)
    : rawHasBackslash
      ? rawContent.replace(ESCAPED_PUNCTUATION_RE, '$1')
      : rawContent
  const markerFlags = content === rawContent
    ? rawMarkerFlags
    : getInlineTextMarkerFlags(content)
  if (token.content === '<' || (content === '1' && state.tokens[state.index - 1]?.tag === 'br')) {
    state.index++
    return
  }
  // math 公式 $ 只出现一个并且在末尾，优化掉
  const dollarIndex = (markerFlags & INLINE_TEXT_MARKER_DOLLAR) !== 0
    ? content.indexOf('$')
    : -1
  if (dollarIndex !== -1 && dollarIndex === content.lastIndexOf('$') && content.endsWith('$'))
    content = content.slice(0, -1)

  // 处理 undefined 结尾的问题
  if (content.endsWith('undefined') && !state.raw?.endsWith('undefined')) {
    content = content.slice(0, -9)
  }
  let trailingTextStart = state.result.length
  let trailingTextContent = ''
  for (let index = state.result.length - 1; index >= 0; index--) {
    const item = state.result[index]
    if (item.type !== 'text')
      break
    trailingTextStart = index
    trailingTextContent = String(item.content ?? '') + trailingTextContent
  }
  if (trailingTextStart < state.result.length) {
    // Some mid-state token streams resend the full trailing text chunk. Only
    // replace the existing text tail when the incoming token clearly starts
    // with that exact tail; otherwise keep the previous text nodes so later
    // inline parsing (for example an opening backtick) cannot accidentally
    // drop the already-rendered sibling text.
    if (content.startsWith(trailingTextContent)) {
      state.currentTextNode = null
      state.result.length = trailingTextStart
    }
    else {
      state.currentTextNode = state.result[state.result.length - 1] as TextNode
    }
  }
  const nextToken = state.tokens[state.index + 1]
  // A text token made up exclusively of inline markers is a mid-state artifact
  // while streaming (the user is still typing `***`, `` ` `` or `$x$`), so the
  // streaming path keeps dropping it. A final parse is authoritative: the
  // trailing `*` of `**bold***`, a lone `$` or a stray backtick are real
  // characters and must stay visible, so they are only dropped when the parse
  // is not final.
  if (state.options?.final !== true
    && (((content === '`' || content === '|' || content === '$') && !hasEscapedMarkup(token, `\\${content}`))
      || (/^\*+$/.test(content) && !hasEscapedMarkup(token, '\\*')))) {
    state.index++
    return
  }
  if (!nextToken && state.options?.final !== true && (markerFlags & INLINE_TEXT_MARKER_OPEN_PAREN) !== 0 && /[^\]]\s*\(\s*$/.test(content))
    content = content.replace(/\(\s*$/, '')
  if (!content) {
    state.index++
    return
  }
  if ((markerFlags & (INLINE_TEXT_MARKER_OPEN_BRACKET | INLINE_TEXT_MARKER_BANG)) === (INLINE_TEXT_MARKER_OPEN_BRACKET | INLINE_TEXT_MARKER_BANG)
    && recoverOuterImageLinkFromRawText(state, content)) {
    return
  }
  if ((markerFlags & (INLINE_TEXT_MARKER_CLOSE_BRACKET | INLINE_TEXT_MARKER_OPEN_PAREN)) === (INLINE_TEXT_MARKER_CLOSE_BRACKET | INLINE_TEXT_MARKER_OPEN_PAREN)
    && recoverOuterImageLinkMidStateFromText(state, content)) {
    return
  }
  const hasInlineCandidates = (markerFlags & INLINE_CANDIDATE_MARKERS) !== 0
  if (!hasInlineCandidates) {
    commitTextNode(state, content, token, state.tokens[state.index - 1], nextToken, markerFlags)
    state.index++
    return
  }
  if ((markerFlags & INLINE_TEXT_MARKER_OPEN_BRACKET) !== 0 && handleCheckboxLike(state, content))
    return
  const preToken = state.tokens[state.index - 1]
  if (((markerFlags & INLINE_TEXT_MARKER_OPEN_BRACKET) !== 0 && content === '[' && !nextToken?.markup?.includes('*') && !hasEscapedMarkup(token, '\\['))
    || ((markerFlags & INLINE_TEXT_MARKER_CLOSE_BRACKET) !== 0 && content === ']' && !preToken?.markup?.includes('*') && !hasEscapedMarkup(token, '\\]'))) {
    state.index++
    return
  }
  // Use raw token content for inline-code fallback parsing so backslashes
  // inside code spans are preserved (e.g. `\\(...\\)`).
  if ((markerFlags & INLINE_TEXT_MARKER_BACKTICK) !== 0 && handleInlineCodeContent(state, rawContent, token))
    return
  if ((markerFlags & (INLINE_TEXT_MARKER_BANG | INLINE_TEXT_MARKER_OPEN_BRACKET)) === (INLINE_TEXT_MARKER_BANG | INLINE_TEXT_MARKER_OPEN_BRACKET)
    && handleInlineImageContent(state, content)) {
    return
  }
  // Avoid synthesizing links from raw text only when the next token is
  // already a structured link_open. This prevents duplicates while still
  // allowing fallback for later tricky links in the same inline run.
  if ((markerFlags & INLINE_TEXT_MARKER_OPEN_BRACKET) !== 0
    && (state.tokens[state.index + 1]?.type !== 'link_open' || isMarkdownLinkBeforeLinkifiedUrl(state, content))
    && handleInlineLinkContent(state, content, token)) {
    return
  }
  const reparsedNodes = tryReparseCollapsedInlineText(state, rawContent)
  if (reparsedNodes) {
    state.resetCurrentTextNode()
    for (const node of reparsedNodes)
      state.pushParsed(node)
    state.index++
    return
  }
  if (handleEmphasisAndStrikethrough(state, content, token))
    return

  // Emit remaining text token
  commitTextNode(state, content, token, preToken, nextToken, markerFlags)
  state.index++
}

function handleCheckboxLike(state: InlineParseState, content: string): boolean {
  // Detect checkbox-like syntax at the start of a list item e.g. [x] or [ ]
  if (!(content?.startsWith('[') && state.pPreToken?.type === 'list_item_open'))
    return false
  const _content = content.slice(1)
  const w = _content.match(/[^\s\]]/)
  if (w === null) {
    state.index++
    return true
  }
  // If the first non-space/']' char is x/X treat as a checkbox input
  if (w && /x/i.test(w[0])) {
    const checked = w[0] === 'x' || w[0] === 'X'
    state.pushParsed({
      type: 'checkbox_input',
      checked,
      raw: checked ? '[x]' : '[ ]',
    } as ParsedNode)
    state.index++
    return true
  }
  return false
}
