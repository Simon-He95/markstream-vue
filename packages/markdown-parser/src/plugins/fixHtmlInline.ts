import type { MarkdownIt } from '../markdown-it-types'
import type { MarkdownToken } from '../types'
import { normalizeCustomHtmlTagName } from '../customHtmlTags'
import { STANDARD_BLOCK_HTML_TAGS, STANDARD_HTML_TAGS, VOID_HTML_TAGS } from '../htmlTags'
import { escapeTagForRegExp, findTagCloseIndexOutsideQuotes } from '../htmlTagUtils'

const VOID_TAGS = VOID_HTML_TAGS

// A conservative set of common HTML tags used to detect streaming mid-states.
// We only suppress/merge partial tags for these names to avoid false positives
// (e.g., autolinks like <http://...>).
const BASE_COMMON_HTML_TAGS = STANDARD_HTML_TAGS

const BLOCK_LEVEL_HTML_TAGS = new Set<string>(STANDARD_BLOCK_HTML_TAGS)
BLOCK_LEVEL_HTML_TAGS.delete('details')

const OPEN_TAG_RE = /<([A-Z][\w-]*)(?=[\s/>]|$)/gi
const CLOSE_TAG_RE = /<\/\s*([A-Z][\w-]*)(?=[\s/>]|$)/gi
const TAG_NAME_AT_START_RE = /^<\s*(?:\/\s*)?([A-Z][\w-]*)/i
const STRICT_OPEN_TAG_NAME_AT_START_RE = /^<\s*([A-Z][\w:-]*)(?=[\s/>]|$)/i

function getHtmlInlineTagName(content: string) {
  return (content.match(TAG_NAME_AT_START_RE)?.[1] ?? '').toLowerCase()
}

function isHtmlInlineClosingTag(content: string) {
  return /^\s*<\s*\//.test(content)
}

function isSelfClosingHtmlInline(content: string, tag: string) {
  return VOID_TAGS.has(tag) || /\/\s*>\s*$/.test(content)
}

function findMatchingCloseChildIndex(
  children: Array<{ type?: string, content?: string }>,
  tag: string,
) {
  let depth = 0

  for (let index = 0; index < children.length; index++) {
    const child = children[index]
    if (!child || child.type !== 'html_inline')
      continue

    const content = String(child.content ?? '')
    const childTag = getHtmlInlineTagName(content)
    if (childTag !== tag)
      continue

    if (isHtmlInlineClosingTag(content)) {
      if (depth === 0)
        return index
      depth--
      continue
    }

    if (!isSelfClosingHtmlInline(content, childTag))
      depth++
  }

  return -1
}

function getTrailingOpenDepth(
  children: Array<{ type?: string, content?: string }>,
  tag: string,
) {
  let depth = 0

  for (const child of children) {
    if (!child || child.type !== 'html_inline')
      continue

    const content = String(child.content ?? '')
    const childTag = getHtmlInlineTagName(content)
    if (childTag !== tag)
      continue

    if (isHtmlInlineClosingTag(content)) {
      if (depth > 0)
        depth--
      continue
    }

    if (!isSelfClosingHtmlInline(content, childTag))
      depth++
  }

  return depth
}

function findMatchingCloseRangeInHtml(content: string, tag: string, startIndex = 0) {
  const tokenRe = new RegExp(String.raw`<\s*(\/?)\s*${escapeTagForRegExp(tag)}(?=[\s>/])[^>]*>`, 'gi')
  tokenRe.lastIndex = Math.max(0, startIndex)
  let depth = 0
  let match: RegExpExecArray | null

  while ((match = tokenRe.exec(content)) !== null) {
    const raw = match[0] ?? ''
    const closing = !!match[1]
    const selfClosing = !closing && /\/\s*>$/.test(raw)

    if (closing) {
      if (depth === 0) {
        return {
          start: match.index,
          end: match.index + raw.length,
        }
      }
      depth--
      continue
    }

    if (!selfClosing)
      depth++
  }

  return null
}

function getTrailingCustomTagDepthInHtml(content: string, tag: string) {
  const tokenRe = new RegExp(String.raw`<\s*(\/?)\s*${escapeTagForRegExp(tag)}(?=[\s>/])[^>]*>`, 'gi')
  let depth = 0
  let match: RegExpExecArray | null

  while ((match = tokenRe.exec(content)) !== null) {
    const raw = match[0] ?? ''
    const closing = !!match[1]
    const selfClosing = !closing && /\/\s*>$/.test(raw)

    if (closing) {
      if (depth > 0)
        depth--
      continue
    }

    if (!selfClosing)
      depth++
  }

  return depth
}

function tokenToRaw(token: MarkdownToken) {
  const shape = token as unknown as { raw?: string, markup?: string, content?: string }
  return String(shape.raw ?? shape.content ?? shape.markup ?? '')
}

function isNonElementHtmlBlock(content: string) {
  return /^\s*<\s*[!?]/.test(content)
}

function buildCommonHtmlTagSet(extraTags?: readonly string[]) {
  const set = new Set(BASE_COMMON_HTML_TAGS)
  if (extraTags && Array.isArray(extraTags)) {
    for (const t of extraTags) {
      const raw = String(t ?? '').trim()
      if (!raw)
        continue
      const m = raw.match(/^[<\s/]*([A-Z][\w-]*)/i)
      if (!m)
        continue
      set.add(m[1].toLowerCase())
    }
  }
  return set
}

function isCommonHtmlTagOrPrefix(tag: string, tagSet: Set<string>) {
  if (tagSet.has(tag))
    return true
  for (const common of tagSet) {
    if (common.startsWith(tag))
      return true
  }
  return false
}

function findFirstIncompleteTag(content: string, tagSet: Set<string>) {
  let first:
    | { index: number, tag: string, closing: boolean }
    | null = null

  for (const m of content.matchAll(OPEN_TAG_RE)) {
    const idx = m.index ?? -1
    if (idx < 0)
      continue
    const tag = (m[1] ?? '').toLowerCase()
    // For opening tags we also accept prefixes of known HTML tags
    // (e.g., '<fo' while typing '<font ...>').
    if (!isCommonHtmlTagOrPrefix(tag, tagSet))
      continue
    const rest = content.slice(idx)
    if (findTagCloseIndexOutsideQuotes(rest) !== -1)
      continue
    if (!first || idx < first.index)
      first = { index: idx, tag, closing: false }
  }

  for (const m of content.matchAll(CLOSE_TAG_RE)) {
    const idx = m.index ?? -1
    if (idx < 0)
      continue
    const tag = (m[1] ?? '').toLowerCase()
    // For closing tags we also accept prefixes of known HTML tags
    // (e.g., '</sp' while typing '</span>').
    if (!isCommonHtmlTagOrPrefix(tag, tagSet))
      continue
    const rest = content.slice(idx)
    if (findTagCloseIndexOutsideQuotes(rest) !== -1)
      continue
    if (!first || idx < first.index)
      first = { index: idx, tag, closing: true }
  }

  // Also swallow bare "<" or "</" at the end while typing.
  const bareClose = /<\/\s*$/.exec(content)
  if (bareClose && typeof bareClose.index === 'number') {
    const idx = bareClose.index
    const rest = content.slice(idx)
    if (!rest.includes('>') && (!first || idx < first.index))
      first = { index: idx, tag: '', closing: true }
  }

  const bareOpen = /<\s*$/.exec(content)
  if (bareOpen && typeof bareOpen.index === 'number') {
    const idx = bareOpen.index
    const rest = content.slice(idx)
    // Avoid matching "</" which is handled above.
    if (!rest.startsWith('</') && !rest.includes('>') && (!first || idx < first.index))
      first = { index: idx, tag: '', closing: false }
  }

  return first
}

function splitTextToken(token: MarkdownToken, content: string) {
  const t = token as MarkdownToken & { content?: string, raw?: string }
  // Preserve the original MarkdownToken prototype (markdown-it-ts attaches helper methods).
  const nt = Object.assign(
    Object.create(Object.getPrototypeOf(t)),
    t,
    { type: 'text', content, raw: content },
  ) as MarkdownToken
  return nt
}

function fixStreamingHtmlInlineChildren(children: MarkdownToken[], tagSet: Set<string>) {
  if (!children.length)
    return { children }

  const out: MarkdownToken[] = []
  let pending: { tag: string, buffer: string, closing: boolean } | null = null
  let pendingAtEnd: string | null = null

  function pushTextPart(text: string, baseToken?: MarkdownToken) {
    if (!text)
      return
    if (baseToken)
      out.push(splitTextToken(baseToken, text))
    else
      out.push({ type: 'text', content: text, raw: text } as MarkdownToken)
  }

  function splitCompleteHtmlFromText(chunk: string, baseToken?: MarkdownToken) {
    let cursor = 0
    while (cursor < chunk.length) {
      const lt = chunk.indexOf('<', cursor)
      if (lt === -1) {
        pushTextPart(chunk.slice(cursor), baseToken)
        break
      }
      pushTextPart(chunk.slice(cursor, lt), baseToken)
      const sub = chunk.slice(lt)
      const tagMatch = sub.match(TAG_NAME_AT_START_RE)
      if (!tagMatch) {
        pushTextPart('<', baseToken)
        cursor = lt + 1
        continue
      }
      const closeIdx = findTagCloseIndexOutsideQuotes(sub)
      if (closeIdx === -1) {
        pushTextPart('<', baseToken)
        cursor = lt + 1
        continue
      }

      const tagText = sub.slice(0, closeIdx + 1)
      const tagName = (tagMatch[1] ?? '').toLowerCase()
      if (tagSet.has(tagName)) {
        out.push({
          type: 'html_inline',
          tag: '',
          content: tagText,
          raw: tagText,
        } as MarkdownToken)
      }
      else {
        pushTextPart(tagText, baseToken)
      }
      cursor = lt + tagText.length
    }
  }

  function processTextChunk(chunk: string, baseToken?: MarkdownToken) {
    if (!chunk)
      return
    const match = findFirstIncompleteTag(chunk, tagSet)
    if (!match) {
      splitCompleteHtmlFromText(chunk, baseToken)
      return
    }

    const before = chunk.slice(0, match.index)
    if (before)
      splitCompleteHtmlFromText(before, baseToken)
    pending = {
      tag: match.tag,
      buffer: chunk.slice(match.index),
      closing: match.closing,
    }
    pendingAtEnd = pending.buffer
  }

  for (const child of children) {
    if (pending) {
      pending.buffer += tokenToRaw(child)
      pendingAtEnd = pending.buffer
      const closeIdx = findTagCloseIndexOutsideQuotes(pending.buffer)
      if (closeIdx === -1) {
        // still incomplete: swallow this token to avoid rendering jitter
        continue
      }

      const tagChunk = pending.buffer.slice(0, closeIdx + 1)
      const afterChunk = pending.buffer.slice(closeIdx + 1)
      out.push({
        type: 'html_inline',
        tag: '',
        content: tagChunk,
        raw: tagChunk,
      } as MarkdownToken)
      pending = null
      pendingAtEnd = null
      if (afterChunk)
        processTextChunk(afterChunk)
      continue
    }

    if (child.type === 'html_inline') {
      const content = tokenToRaw(child)
      const tagMatch = content.match(TAG_NAME_AT_START_RE)
      const tagName = (tagMatch?.[1] ?? '').toLowerCase()
      if (tagName && tagSet.has(tagName) && findTagCloseIndexOutsideQuotes(content) === -1) {
        // markdown-it may prematurely close a tag at a ">" inside a quoted
        // attribute value (e.g. `<a href="...a>b`), producing a broken html_inline
        // token. Treat it as a streaming mid-state and swallow until we see a
        // real tag close ">" outside quotes.
        pending = {
          tag: tagName,
          buffer: content,
          closing: /^<\s*\//.test(content),
        }
        pendingAtEnd = pending.buffer
        continue
      }
    }

    if (child.type === 'text') {
      const content = String((child as MarkdownToken).content ?? '')
      if (!content.includes('<')) {
        out.push(child)
        continue
      }
      processTextChunk(content, child)
      continue
    }

    out.push(child)
  }

  return {
    children: out,
    pendingBuffer: pendingAtEnd ?? undefined,
  }
}

export interface FixHtmlInlineOptions {
  /**
   * Custom HTML-like tag names that should participate in streaming
   * mid-state suppression and complete-tag splitting (e.g. ['thinking']).
   */
  customHtmlTags?: readonly string[]
}

export function applyFixHtmlInlineTokens(md: MarkdownIt, options: FixHtmlInlineOptions = {}) {
  const commonHtmlTags = buildCommonHtmlTagSet(options.customHtmlTags)
  // Tags that should stay inline when we auto-append a closing tag at core stage.
  const autoCloseInlineTagSet = new Set<string>([
    'a',
    'span',
    'strong',
    'em',
    'b',
    'i',
    'u',
  ])
  const customTagSet = new Set<string>()
  if (options.customHtmlTags?.length) {
    for (const t of options.customHtmlTags) {
      const name = normalizeCustomHtmlTagName(t)
      if (!name)
        continue
      customTagSet.add(name)
      autoCloseInlineTagSet.add(name)
    }
  }
  const shouldMergeHtmlBlockTag = (tag: string) => customTagSet.has(tag) || !commonHtmlTags.has(tag) || BLOCK_LEVEL_HTML_TAGS.has(tag)
  const getHtmlBlockCarrierContent = (token: MarkdownToken & { content?: string, children?: MarkdownToken[] }) => {
    if (token.type === 'html_block')
      return String(token.content ?? '')
    if (token.type !== 'inline' || !Array.isArray(token.children) || token.children.length !== 1)
      return ''
    const onlyChild = token.children[0]
    if (onlyChild?.type !== 'html_block')
      return ''
    return String(token.content ?? onlyChild.content ?? '')
  }
  const normalizeHtmlBlockCarrier = (
    token: MarkdownToken & { content?: string, children?: MarkdownToken[], raw?: string },
    content: string,
  ) => {
    token.type = 'html_block'
    token.content = content
    token.raw = content
    token.children = []
  }
  // Streaming mid-state: suppress partial inline HTML in text tokens until the
  // tag is fully closed with `>`, then allow it to be tokenized as html_inline.
  md.core.ruler.after('inline', 'fix_html_inline_streaming', (state: unknown) => {
    const s = state as unknown as { tokens?: MarkdownToken[] }
    const toks = s.tokens ?? []
    for (const t of toks) {
      const tok = t as MarkdownToken & { children?: MarkdownToken[], content?: string, raw?: string }
      if (tok.type !== 'inline' || !Array.isArray(tok.children))
        continue

      // markdown-it-ts may emit inline tokens with empty children when the
      // content starts with an incomplete HTML-ish fragment like "<span ...".
      // In that case, synthesize a text token so we can suppress mid-states.
      const originalContent = String(tok.content ?? '')
      const sourceChildren = tok.children.length
        ? tok.children
        : (originalContent.includes('<')
            ? [{ type: 'text', content: originalContent, raw: originalContent } as MarkdownToken]
            : null)

      if (!sourceChildren)
        continue

      try {
        const fixed = fixStreamingHtmlInlineChildren(sourceChildren, commonHtmlTags)
        tok.children = fixed.children
        if (fixed.pendingBuffer) {
          const idx = originalContent.lastIndexOf(fixed.pendingBuffer)
          if (idx !== -1) {
            const trimmed = originalContent.slice(0, idx)
            tok.content = trimmed
            // keep raw in sync if present
            if (typeof tok.raw === 'string')
              tok.raw = trimmed
          }
        }
      }
      catch (e) {
        console.error('[applyFixHtmlInlineTokens] failed to fix streaming html inline', e)
      }
    }
  })

  // Fix certain single-token inline HTML cases by expanding into [openTag, text, closeTag]
  // This helps downstream inline parsers (e.g., <a>text</a>) to recognize inner text reliably.
  md.core.ruler.push('fix_html_inline_tokens', (state: unknown) => {
    const s = state as unknown as { tokens?: MarkdownToken[] }
    const toks = s.tokens ?? []

    // 有一些很特殊的场景，比如 html_block 开始 <thinking>，但是后面跟着很多段落,如果没匹配到</thinking>，中间的都应该合并为html_block的 content
    const tagStack: [string, number][] = []
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i] as MarkdownToken & { content?: string, children: MarkdownToken[] }

      // If we're currently inside an unclosed custom-tag html_block, merge
      // everything (including other html_block tokens) into the opener until
      // the matching closing tag arrives.
      if (tagStack.length > 0) {
        const [openTag, openIndex] = tagStack[tagStack.length - 1]
        if (i !== openIndex) {
          // Remove structural paragraph wrappers that can appear in stream mode.
          if (t.type === 'paragraph_open' || t.type === 'paragraph_close') {
            toks.splice(i, 1)
            i--
            continue
          }

          const chunk = String((t as MarkdownToken).content ?? (t as MarkdownToken).raw ?? '')

          if (chunk) {
            const openToken = toks[openIndex] as MarkdownToken & { content?: string, loading?: boolean }
            const mergedContent = `${String(openToken.content || '')}\n${chunk}`
            const openEnd = findTagCloseIndexOutsideQuotes(mergedContent)
            const closeRange = openEnd === -1
              ? null
              : findMatchingCloseRangeInHtml(mergedContent, openTag, openEnd + 1)
            if (closeRange) {
              const before = mergedContent.slice(0, closeRange.end)
              const after = mergedContent.slice(closeRange.end)

              openToken.content = before
              openToken.loading = false

              const afterTrimmed = after.replace(/^\s+/, '')
              // Remove current token after merging.
              toks.splice(i, 1)
              // Close the stack before reinserting trailing content.
              tagStack.pop()
              if (afterTrimmed) {
                toks.splice(i, 0, afterTrimmed.startsWith('<')
                  ? ({ type: 'html_block', content: afterTrimmed } as MarkdownToken)
                  : ({ type: 'inline', content: afterTrimmed, children: [{ type: 'text', content: afterTrimmed, raw: afterTrimmed }] } as MarkdownToken))
              }
              i--
              continue
            }

            openToken.content = mergedContent
            if (openToken.loading !== false)
              openToken.loading = true
          }

          // Remove current token after merging.
          toks.splice(i, 1)
          i--
          continue
        }
      }

      const rawContent = getHtmlBlockCarrierContent(t)
      if (rawContent) {
        if (isNonElementHtmlBlock(rawContent))
          continue

        // Support both opening (<tag ...>) and closing (</tag>) blocks.
        const tag = (rawContent.match(/<\s*(?:\/\s*)?([^\s>/]+)/)?.[1] ?? '').toLowerCase()
        const isClosingTag = /^\s*<\s*\//.test(rawContent)

        // Merge configured custom tags and unknown HTML-like tags (e.g. <think>)
        // until their matching closing tag arrives. Also merge standard block
        // tags that markdown-it can split on blank lines, such as <details>.
        if (!tag || !shouldMergeHtmlBlockTag(tag))
          continue

        normalizeHtmlBlockCarrier(t, rawContent)

        if (!isClosingTag) {
          // 开始标签，入栈
          if (tag) {
            // If the html_block already contains its own closing tag, do NOT
            // push it onto the stack; otherwise we'd incorrectly merge the
            // following blocks into this html_block.
            const selfClosingRe = new RegExp(`^\\s*<\\s*${tag}\\b[^>]*\\/\\s*>`, 'i')
            if (!selfClosingRe.test(rawContent) && getTrailingCustomTagDepthInHtml(rawContent, tag) > 0)
              tagStack.push([tag, i])
          }
        }
        else {
          // 结束标签：如果匹配到栈顶，则把 closing token 也合并进 opener 并删除自己
          if (tagStack.length > 0 && tag && tagStack[tagStack.length - 1][0] === tag) {
            const [, openIndex] = tagStack[tagStack.length - 1]
            const openToken = toks[openIndex] as MarkdownToken & { content?: string, loading?: boolean }
            openToken.content = `${String(openToken.content || '')}\n${rawContent}`
            openToken.loading = false
            tagStack.pop()

            // Remove current closing html_block token so it doesn't become a stray node.
            toks.splice(i, 1)
            i--
          }
        }
        continue
      }
      else if (tagStack.length > 0) {
        // 如果在标签栈中，说明是未闭合标签的内容，合并到上一个 html_block
        if (t.type === 'paragraph_open' || t.type === 'paragraph_close') {
          // 应该删除这些标签
          toks.splice(i, 1)
          i-- // 调整索引
          continue
        }
        const content = t.content || ''
        const CLOSING_TAG_REGEX = new RegExp(`<\\s*\\/\\s*${tagStack[tagStack.length - 1][0]}\\s*>`, 'i')
        const isClosingTag = CLOSING_TAG_REGEX.test(content)

        if (content) {
          // 插入到栈顶标签对应的 html_block 中
          const [, openIndex] = tagStack[tagStack.length - 1]
          const openToken = toks[openIndex] as MarkdownToken & { content?: string, loading: boolean }
          openToken.content = `${openToken.content || ''}\n${content}`
          if (openToken.loading !== false)
            openToken.loading = !isClosingTag
        }
        if (isClosingTag) {
          tagStack.pop()
        }
        // 删除当前 token
        toks.splice(i, 1)
        i-- // 调整索引
      }
      else {
        continue
      }
    }

    // Some custom tags (e.g. <thinking>) can be tokenized by markdown-it into
    // multiple top-level inline tokens, with the closing tag arriving in a
    // later inline token. Our inline parser can only match closing tags within
    // the same inline token's children list, so we merge such sequences here.
    if (customTagSet.size > 0) {
      const openReCache = new Map<string, RegExp>()
      const closeReCache = new Map<string, RegExp>()
      const getOpenRe = (tag: string) => {
        let r = openReCache.get(tag)
        if (!r) {
          r = new RegExp(`<\\s*${tag}\\b`, 'i')
          openReCache.set(tag, r)
        }
        return r
      }
      const getCloseRe = (tag: string) => {
        let r = closeReCache.get(tag)
        if (!r) {
          r = new RegExp(`<\\s*\\/\\s*${tag}\\s*>`, 'i')
          closeReCache.set(tag, r)
        }
        return r
      }

      const stack: Array<{ tag: string, index: number }> = []
      for (let i = 0; i < toks.length; i++) {
        const tok = toks[i] as MarkdownToken & { content?: string, children?: MarkdownToken[] }
        const content = String(tok.content ?? '')

        // If we're inside an unclosed custom tag, we may need to close it even
        // if the closing tag is emitted as html_block (markdown-it can do this).
        if (stack.length > 0) {
          const top = stack[stack.length - 1]
          const openTok = toks[top.index] as MarkdownToken & { content?: string, children?: MarkdownToken[] }

          // Close via an html_block token like "</thinking>"
          if (tok.type === 'html_block' && getCloseRe(top.tag).test(content)) {
            openTok.content = `${String(openTok.content ?? '')}\n${content}`
            if (Array.isArray(openTok.children)) {
              openTok.children.push({
                type: 'html_inline',
                content: `</${top.tag}>`,
                raw: `</${top.tag}>`,
              } as MarkdownToken)
            }
            toks.splice(i, 1)
            i--
            stack.pop()
            continue
          }

          // Only merge inline tokens; keep block structure intact.
          if (tok.type !== 'inline')
            continue

          const children = Array.isArray(tok.children) ? tok.children : []
          const closeChildIndex = findMatchingCloseChildIndex(children, top.tag)

          // If the closing tag is inside this inline token, merge up to it and
          // keep the trailing content as a new paragraph so it doesn't get
          // swallowed by the custom tag.
          if (closeChildIndex !== -1) {
            const beforeChildren = children.slice(0, closeChildIndex + 1)
            const afterChildren = children.slice(closeChildIndex + 1)

            const beforeText = beforeChildren
              .map((c: MarkdownToken) => String(c?.content ?? c?.raw ?? ''))
              .join('')

            // Only append the fragment up to and including the closing tag.
            openTok.content = `${String(openTok.content ?? '')}\n${beforeText}`
            if (Array.isArray(openTok.children))
              openTok.children.push(...beforeChildren)

            // Replace current token with trailing content when present.
            if (afterChildren.length) {
              const afterText = afterChildren.map((c: MarkdownToken) => String(c.content ?? c.raw ?? '')).join('')
              if (afterText.trim()) {
                const trimmed = afterText.replace(/^\s+/, '')
                if (trimmed.startsWith('<')) {
                  toks.splice(i, 1, { type: 'html_block', content: trimmed } as MarkdownToken)
                }
                else {
                  toks.splice(i, 1, { type: 'paragraph_open', tag: 'p', nesting: 1 } as MarkdownToken, { type: 'inline', tag: '', nesting: 0, content: afterText, children: [{ type: 'text', content: afterText, raw: afterText }] } as MarkdownToken, { type: 'paragraph_close', tag: 'p', nesting: -1 } as MarkdownToken)
                  // current index now points at paragraph_open; move on
                }
              }
              else {
                toks.splice(i, 1)
                i--
              }
            }
            else {
              toks.splice(i, 1)
              i--
            }

            stack.pop()
            continue
          }

          // No closing tag: merge everything and remove current inline token.
          openTok.content = `${String(openTok.content ?? '')}\n${content}`
          if (Array.isArray(openTok.children))
            openTok.children.push(...children)
          toks.splice(i, 1)
          i--
          continue
        }

        // Not inside: detect an opening custom tag that does not close within this token.
        if (tok.type !== 'inline')
          continue
        const children = Array.isArray(tok.children) ? tok.children : []
        for (const tag of customTagSet) {
          const trailingOpenDepth = children.length
            ? getTrailingOpenDepth(children, tag)
            : (getOpenRe(tag).test(content) && !getCloseRe(tag).test(content) ? 1 : 0)
          if (trailingOpenDepth > 0) {
            stack.push({ tag, index: i })
            break
          }
        }
      }
    }

    // Defensive cleanup: some edge cases can end up with an orphan
    // paragraph_close token (without a matching paragraph_open) after
    // core-stage token mutations. Drop such invalid closes so downstream
    // consumers don't see stray paragraph_close.
    {
      let depth = 0
      for (let i = 0; i < toks.length; i++) {
        const t = toks[i] as MarkdownToken
        if (t.type === 'paragraph_open') {
          depth++
          continue
        }
        if (t.type === 'paragraph_close') {
          if (depth > 0) {
            depth--
          }
          else {
            toks.splice(i, 1)
            i--
          }
        }
      }
    }

    for (let i = 0; i < toks.length; i++) {
      const t = toks[i] as MarkdownToken & { content?: string, children: MarkdownToken[], loading?: boolean }
      if (t.type === 'html_block') {
        const rawTag = t.content?.match(/<([^\s>/]+)/)?.[1] ?? ''
        const tag = rawTag.toLowerCase()

        // Special tags: comments, doctypes, processing instructions
        // These should not be modified
        if (tag.startsWith('!') || tag.startsWith('?')) {
          t.loading = false
          continue
        }

        // Custom tags (configured by user): keep as html_block
        // These are handled specially to support streaming and structured nodes
        if (customTagSet.has(tag)) {
          const raw = String(t.content ?? '')
          const openEnd = findTagCloseIndexOutsideQuotes(raw)
          const closeRange = openEnd === -1
            ? null
            : findMatchingCloseRangeInHtml(raw, tag, openEnd + 1)
          const hasClose = !!closeRange
          t.loading = hasClose ? false : t.loading !== undefined ? t.loading : true

          const endTagIndex = closeRange?.start ?? -1
          const closeLen = closeRange ? closeRange.end - closeRange.start : 0

          if (endTagIndex !== -1) {
            // Found a closing tag - extract inner content and trim
            const rawForNode = raw.slice(0, endTagIndex + closeLen)
            let inner = ''
            if (openEnd !== -1 && openEnd < endTagIndex) {
              inner = raw.slice(openEnd + 1, endTagIndex)
            }

            // Create structured node with inner content
            t.children = [
              {
                type: tag,
                content: inner,
                raw: rawForNode,
                attrs: [],
                tag,
                loading: false,
              },
            ] as MarkdownToken[]

            // Update token content
            t.content = rawForNode
            ;(t as MarkdownToken).raw = rawForNode

            // Insert trailing content as a new token if present
            const afterContent = raw.slice(endTagIndex + closeLen) || ''
            const afterTrimmed = afterContent.replace(/^\s+/, '')
            if (afterTrimmed) {
              toks.splice(i + 1, 0, afterTrimmed.startsWith('<')
                ? ({ type: 'html_block', content: afterTrimmed } as MarkdownToken)
                : ({ type: 'text', content: afterTrimmed, raw: afterTrimmed } as MarkdownToken))
            }
          }
          else {
            // No closing tag yet (streaming mid-state)
            t.children = [
              {
                type: tag,
                content: '',
                raw,
                attrs: [],
                tag,
                loading: true,
              },
            ] as MarkdownToken[]
          }

          continue
        }

        // Common block tags: skip conversion to inline
        if (['br', 'hr', 'img', 'input', 'link', 'meta', 'div', 'p', 'ul', 'li'].includes(tag))
          continue

        // Other HTML tags: convert to inline type for better handling
        // Parse attributes and check for closing tag
        t.type = 'inline'
        const attrs: [string, string][] = []
        const attrRegex = /\s([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
        let match
        while ((match = attrRegex.exec(t.content || '')) !== null) {
          const attrName = match[1]
          const attrValue = match[2] || match[3] || match[4] || ''
          attrs.push([attrName, attrValue])
        }

        const raw = String(t.content ?? '')
        const closeRe = new RegExp(`<\\/\\s*${tag}\\s*>`, 'i')
        const closeMatch = closeRe.exec(raw)
        const endTagIndex = closeMatch ? closeMatch.index : -1
        const closeLen = closeMatch ? closeMatch[0].length : 0

        if (endTagIndex !== -1) {
          // Found a closing tag - split content
          const rawForNode = raw.slice(0, endTagIndex + closeLen)
          const afterContent = raw.slice(endTagIndex + closeLen) || ''
          const afterTrimmed = afterContent.replace(/^\s+/, '')

          // Create html_block child node
          t.children = [
            {
              type: 'html_block',
              content: rawForNode,
              tag,
              loading: false,
            },
          ] as MarkdownToken[]

          // Update token content
          t.content = rawForNode
          ;(t as MarkdownToken).raw = rawForNode

          // Insert trailing content as a new token if present
          if (afterTrimmed) {
            toks.splice(i + 1, 0, afterTrimmed.startsWith('<')
              ? ({ type: 'html_block', content: afterTrimmed } as MarkdownToken)
              : ({ type: 'text', content: afterTrimmed, raw: afterTrimmed } as MarkdownToken))
          }
        }
        else {
          // No closing tag - streaming mid-state
          t.children = [
            {
              type: 'html_block',
              content: t.content,
              tag,
              loading: true,
            },
          ] as MarkdownToken[]
        }
        continue
      }
      if (!t || t.type !== 'inline')
        continue

      // 修复children 是单个 html_inline的场景
      if (t.children.length === 2 && t.children[0].type === 'html_inline') {
        // 补充一个闭合标签
        const rawTag = t.children[0].content?.match(/<([^\s>/]+)/)?.[1] ?? ''
        const tag = rawTag.toLowerCase()
        const second = t.children[1] as MarkdownToken
        const secondCloseTag = String(second?.content ?? '').match(/^<\s*\/\s*([^\s>]+)/)?.[1]?.toLowerCase() ?? ''
        // Already a complete open+close pair: don't append another closing tag.
        if (second?.type === 'html_inline' && secondCloseTag === tag)
          continue
        // 如果是常见的 inline标签（含用户自定义），则只追加结尾标签，否则转换成 html_block
        if (autoCloseInlineTagSet.has(tag)) {
          t.children[0].loading = true
          t.children[0].tag = tag
          t.children.push({
            type: 'html_inline',
            tag,
            loading: true,
            content: `</${tag}>`,
          } as MarkdownToken)
        }
        else {
          t.children = [
            {
              type: 'html_block',
              loading: true,
              tag,
              content: String(t.children[0]?.content ?? '') + String(t.children[1]?.content ?? ''),
            } as MarkdownToken,
          ]
        }
        continue
      }
      else if (t.children.length === 3 && t.children[0].type === 'html_inline' && t.children[2].type === 'html_inline') {
        const rawTag = t.children[0].content?.match(/<([^\s>/]+)/)?.[1] ?? ''
        const tag = rawTag.toLowerCase()
        // 如果是常见的 inline标签（含用户自定义），则不处理，否则转换成 html_block
        if (autoCloseInlineTagSet.has(tag))
          continue
        t.children = [
          {
            type: 'html_block',
            loading: false,
            tag,
            content: t.children.map(ct => ct.content).join(''),
          } as MarkdownToken,
        ]
        continue
      }
      // Only handle pathological cases where inline content is a single HTML-ish chunk
      if (!t.content?.startsWith('<') || (t as MarkdownToken).children?.length !== 1)
        continue

      const raw = String(t.content)
      const htmlToken = t as unknown as { children: Array<{ type: string, content: string }> }
      const onlyChild = htmlToken.children[0] as { type?: string, content?: string } | undefined

      // Keep literal text untouched (e.g. malformed "<robot=xxx>..."), but still
      // suppress dangling "<tag" mid-states to avoid streaming jitter.
      if (onlyChild?.type !== 'html_inline') {
        if (/^<\s*(?:\/\s*)?[A-Z][\w:-]*\s*$/i.test(raw))
          htmlToken.children.length = 0
        continue
      }

      const strictTagName = String(onlyChild.content ?? raw).match(STRICT_OPEN_TAG_NAME_AT_START_RE)?.[1]?.toLowerCase() ?? ''
      if (!strictTagName)
        continue

      const selfClosing = /\/\s*>\s*$/.test(raw)
      const isVoid = selfClosing || VOID_TAGS.has(strictTagName)

      if (isVoid) {
        // For void/self-closing tags, keep a single html_inline token
        htmlToken.children = [
          { type: 'html_inline', content: raw },
        ]
        continue
      }
      htmlToken.children.length = 0
    }
  })
}
