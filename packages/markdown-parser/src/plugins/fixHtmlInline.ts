import type { MarkdownIt, Token } from 'markdown-it-ts'

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

// A conservative set of common HTML tags used to detect streaming mid-states.
// We only suppress/merge partial tags for these names to avoid false positives
// (e.g., autolinks like <http://...>).
const BASE_COMMON_HTML_TAGS = new Set<string>([
  ...Array.from(VOID_TAGS),
  // inline/common
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'button',
  'cite',
  'code',
  'data',
  'del',
  'dfn',
  'em',
  'font',
  'i',
  'img',
  'input',
  'ins',
  'kbd',
  'label',
  'mark',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
  // block/common
  'article',
  'aside',
  'blockquote',
  'div',
  'details',
  'figcaption',
  'figure',
  'footer',
  'header',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
  // svg-ish (often embedded inline)
  'svg',
  'g',
  'path',
])

const OPEN_TAG_RE = /<([A-Z][\w-]*)(?=[\s/>]|$)/gi
const CLOSE_TAG_RE = /<\/\s*([A-Z][\w-]*)(?=[\s/>]|$)/gi
const TAG_NAME_AT_START_RE = /^<\s*(?:\/\s*)?([A-Z][\w-]*)/i

function findTagCloseIndexOutsideQuotes(html: string) {
  let inSingle = false
  let inDouble = false

  for (let i = 0; i < html.length; i++) {
    const ch = html[i]
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      continue
    }
    if (ch === '\'' && !inDouble) {
      inSingle = !inSingle
      continue
    }
    if (ch === '>' && !inSingle && !inDouble)
      return i
  }

  return -1
}

function tokenToRaw(token: Token) {
  const shape = token as unknown as { raw?: string, markup?: string, content?: string }
  return String(shape.raw ?? shape.content ?? shape.markup ?? '')
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

function splitTextToken(token: Token, content: string) {
  const t = token as Token & { content?: string, raw?: string }
  // Preserve the original Token prototype (markdown-it-ts attaches helper methods).
  const nt = Object.assign(
    Object.create(Object.getPrototypeOf(t)),
    t,
    { type: 'text', content, raw: content },
  ) as Token
  return nt
}

function fixStreamingHtmlInlineChildren(children: Token[], tagSet: Set<string>) {
  if (!children.length)
    return { children }

  const out: Token[] = []
  let pending: { tag: string, buffer: string, closing: boolean } | null = null
  let pendingAtEnd: string | null = null

  function pushTextPart(text: string, baseToken?: Token) {
    if (!text)
      return
    if (baseToken)
      out.push(splitTextToken(baseToken, text))
    else
      out.push({ type: 'text', content: text, raw: text } as any)
  }

  function splitCompleteHtmlFromText(chunk: string, baseToken?: Token) {
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
        } as any)
      }
      else {
        pushTextPart(tagText, baseToken)
      }
      cursor = lt + tagText.length
    }
  }

  function processTextChunk(chunk: string, baseToken?: Token) {
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
      } as any)
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
      const content = String((child as any).content ?? '')
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
      const raw = String(t ?? '').trim()
      if (!raw)
        continue
      const m = raw.match(/^[<\s/]*([A-Z][\w-]*)/i)
      if (!m)
        continue
      const name = m[1].toLowerCase()
      customTagSet.add(name)
      autoCloseInlineTagSet.add(name)
    }
  }
  // Streaming mid-state: suppress partial inline HTML in text tokens until the
  // tag is fully closed with `>`, then allow it to be tokenized as html_inline.
  md.core.ruler.after('inline', 'fix_html_inline_streaming', (state: unknown) => {
    const s = state as unknown as { tokens?: Token[] }
    const toks = s.tokens ?? []
    for (const t of toks) {
      const tok = t as Token & { children?: Token[], content?: string, raw?: string }
      if (tok.type !== 'inline' || !Array.isArray(tok.children))
        continue

      // markdown-it-ts may emit inline tokens with empty children when the
      // content starts with an incomplete HTML-ish fragment like "<span ...".
      // In that case, synthesize a text token so we can suppress mid-states.
      const originalContent = String(tok.content ?? '')
      const sourceChildren = tok.children.length
        ? tok.children
        : (originalContent.includes('<')
            ? [{ type: 'text', content: originalContent, raw: originalContent } as any]
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
    const s = state as unknown as { tokens?: Token[] }
    const toks = s.tokens ?? []

    // 有一些很特殊的场景，比如 html_block 开始 <thinking>，但是后面跟着很多段落,如果没匹配到</thinking>，中间的都应该合并为html_block的 content
    const tagStack: [string, number][] = []
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i] as Token & { content?: string, children: any[] }

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

          const chunk = String((t as any).content ?? (t as any).raw ?? '')
          const closeRe = new RegExp(`<\\s*\\/\\s*${openTag}\\s*>`, 'i')
          const closeMatch = chunk ? closeRe.exec(chunk) : null
          const isClosingTag = !!closeMatch

          if (chunk) {
            const openToken = toks[openIndex] as Token & { content?: string, loading?: boolean }
            if (closeMatch && typeof closeMatch.index === 'number') {
              const end = closeMatch.index + String(closeMatch[0] ?? '').length
              const before = chunk.slice(0, end)
              const after = chunk.slice(end)

              openToken.content = `${String(openToken.content || '')}\n${before}`
              openToken.loading = false

              const afterTrimmed = after.replace(/^\s+/, '')
              // Remove current token after merging.
              toks.splice(i, 1)
              // Close the stack before reinserting trailing content.
              tagStack.pop()
              if (afterTrimmed) {
                toks.splice(i, 0, afterTrimmed.startsWith('<')
                  ? ({ type: 'html_block', content: afterTrimmed } as any)
                  : ({ type: 'inline', content: afterTrimmed, children: [{ type: 'text', content: afterTrimmed, raw: afterTrimmed }] } as any))
              }
              i--
              continue
            }

            openToken.content = `${String(openToken.content || '')}\n${chunk}`
            if (openToken.loading !== false)
              openToken.loading = !isClosingTag
          }

          // Remove current token after merging.
          toks.splice(i, 1)
          i--

          if (isClosingTag)
            tagStack.pop()
          continue
        }
      }

      if (t.type === 'html_block') {
        const rawContent = String(t.content || '')
        // Support both opening (<tag ...>) and closing (</tag>) blocks.
        const tag = (rawContent.match(/<\s*(?:\/\s*)?([^\s>/]+)/)?.[1] ?? '').toLowerCase()
        const isClosingTag = /^\s*<\s*\//.test(rawContent)

        if (!isClosingTag) {
          // 开始标签，入栈
          if (tag) {
            // If the html_block already contains its own closing tag, do NOT
            // push it onto the stack; otherwise we'd incorrectly merge the
            // following blocks into this html_block.
            const closeRe = new RegExp(`<\\s*\\/\\s*${tag}\\s*>`, 'i')
            if (!closeRe.test(rawContent))
              tagStack.push([tag, i])
          }
        }
        else {
          // 结束标签：如果匹配到栈顶，则把 closing token 也合并进 opener 并删除自己
          if (tagStack.length > 0 && tag && tagStack[tagStack.length - 1][0] === tag) {
            const [, openIndex] = tagStack[tagStack.length - 1]
            const openToken = toks[openIndex] as Token & { content?: string, loading?: boolean }
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
          const openToken = toks[openIndex] as Token & { content?: string, loading: boolean }
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
        const tok = toks[i] as Token & { content?: string, children?: any[] }
        const content = String(tok.content ?? '')

        // If we're inside an unclosed custom tag, we may need to close it even
        // if the closing tag is emitted as html_block (markdown-it can do this).
        if (stack.length > 0) {
          const top = stack[stack.length - 1]
          const openTok = toks[top.index] as Token & { content?: string, children?: any[] }

          // Close via an html_block token like "</thinking>"
          if (tok.type === 'html_block' && getCloseRe(top.tag).test(content)) {
            openTok.content = `${String(openTok.content ?? '')}\n${content}`
            if (Array.isArray(openTok.children)) {
              openTok.children.push({
                type: 'html_inline',
                content: `</${top.tag}>`,
                raw: `</${top.tag}>`,
              } as any)
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
          const closeChildIndex = children.findIndex((c: any) => {
            if (!c || c.type !== 'html_inline')
              return false
            const cContent = String(c.content ?? '')
            return /^\s*<\s*\//.test(cContent) && cContent.toLowerCase().includes(top.tag)
          })

          // If the closing tag is inside this inline token, merge up to it and
          // keep the trailing content as a new paragraph so it doesn't get
          // swallowed by the custom tag.
          if (closeChildIndex !== -1) {
            const beforeChildren = children.slice(0, closeChildIndex + 1)
            const afterChildren = children.slice(closeChildIndex + 1)

            const beforeText = beforeChildren
              .map((c: any) => String(c?.content ?? c?.raw ?? ''))
              .join('')

            // Only append the fragment up to and including the closing tag.
            openTok.content = `${String(openTok.content ?? '')}\n${beforeText}`
            if (Array.isArray(openTok.children))
              openTok.children.push(...beforeChildren)

            // Replace current token with trailing content (if any)
            if (afterChildren.length) {
              const afterText = afterChildren.map((c: any) => String(c.content ?? c.raw ?? '')).join('')
              if (afterText.trim()) {
                const trimmed = afterText.replace(/^\s+/, '')
                if (trimmed.startsWith('<')) {
                  toks.splice(i, 1, { type: 'html_block', content: trimmed } as any)
                }
                else {
                  toks.splice(i, 1, { type: 'paragraph_open', tag: 'p', nesting: 1 } as any, { type: 'inline', tag: '', nesting: 0, content: afterText, children: [{ type: 'text', content: afterText, raw: afterText }] } as any, { type: 'paragraph_close', tag: 'p', nesting: -1 } as any)
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
        for (const tag of customTagSet) {
          if (getOpenRe(tag).test(content) && !getCloseRe(tag).test(content)) {
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
        const t = toks[i] as Token
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
      const t = toks[i] as Token & { content?: string, children: any[], loading?: boolean }
      if (t.type === 'html_block') {
        const rawTag = t.content?.match(/<([^\s>/]+)/)?.[1] ?? ''
        const tag = rawTag.toLowerCase()
        // Keep custom tags as html_block so block-level custom components work.

        if (customTagSet.has(tag)) {
          const raw = String(t.content ?? '')
          const closeRe = new RegExp(`<\\/\\s*${tag}\\s*>`, 'i')
          const hasClose = closeRe.test(raw)
          t.loading = hasClose ? false : t.loading !== undefined ? t.loading : true

          const closeMatch = closeRe.exec(raw)
          const endTagIndex = closeMatch ? closeMatch.index : -1
          const closeLen = closeMatch ? closeMatch[0].length : 0

          if (endTagIndex !== -1) {
            const rawForNode = raw.slice(0, endTagIndex + closeLen)
            t.content = rawForNode
            ;(t as any).raw = rawForNode

            const afterContent = raw.slice(endTagIndex + closeLen) || ''
            const afterTrimmed = afterContent.replace(/^\s+/, '')
            if (afterTrimmed) {
              toks.splice(i + 1, 0, afterTrimmed.startsWith('<')
                ? ({ type: 'html_block', content: afterTrimmed } as any)
                : ({ type: 'text', content: afterTrimmed, raw: afterTrimmed } as any))
            }
          }

          continue
        }

        // Do not attempt to convert or close comments/doctypes/processing-instructions
        if (tag.startsWith('!') || tag.startsWith('?')) {
          t.loading = false
          continue
        }
        // 如果是常见的 block 标签，则跳过，否则转换成 inline 处理
        if (['br', 'hr', 'img', 'input', 'link', 'meta', 'div', 'p', 'ul', 'li'].includes(tag))
          continue
        t.type = 'inline'
        const hasClose = new RegExp(`<\\/\\s*${tag}\\s*>`, 'i').test(String(t.content ?? ''))
        const loading = hasClose ? false : t.loading !== undefined ? t.loading : true
        const attrs: [string, string][] = []
        // 解析属性
        const attrRegex = /\s([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
        let match
        while ((match = attrRegex.exec(t.content || '')) !== null) {
          const attrName = match[1]
          const attrValue = match[2] || match[3] || match[4] || ''
          attrs.push([attrName, attrValue])
        }
        if (customTagSet.has(tag)) {
          const raw = String(t.content ?? '')
          const closeRe = new RegExp(`<\\/\\s*${tag}\\s*>`, 'i')
          const closeMatch = closeRe.exec(raw)
          const endTagIndex = closeMatch ? closeMatch.index : -1
          const closeLen = closeMatch ? closeMatch[0].length : 0

          const rawForNode = endTagIndex !== -1
            ? raw.slice(0, endTagIndex + closeLen)
            : raw

          // Extract inner content between the first opening '>' and the closing tag.
          let inner = ''
          const openEnd = findTagCloseIndexOutsideQuotes(raw)
          if (openEnd !== -1) {
            if (endTagIndex !== -1 && openEnd < endTagIndex) {
              inner = raw.slice(openEnd + 1, endTagIndex)
            }
            else if (endTagIndex === -1) {
              // Streaming mid-state: trim any trailing partial tag fragment.
              inner = raw.slice(openEnd + 1).replace(/<.*$/, '')
            }
          }

          t.children = [
            {
              type: tag,
              content: inner,
              raw: rawForNode,
              attrs,
              tag,
              loading,
            },
          ] as any[]
          if (endTagIndex !== -1) {
            // Always trim current token to the end of the closing tag.
            // This prevents later blocks (e.g. another custom tag) from being
            // included in the custom tag node's raw/content.
            t.content = rawForNode
            ;(t as any).raw = rawForNode

            const afterContent = raw.slice(endTagIndex + closeLen) || ''
            const afterTrimmed = afterContent.replace(/^\s+/, '')
            if (afterTrimmed) {
              toks.splice(i + 1, 0, afterTrimmed.startsWith('<')
                ? ({ type: 'html_block', content: afterTrimmed } as any)
                : ({ type: 'text', content: afterTrimmed, raw: afterTrimmed } as any))
            }
          }
        }
        else {
          t.children = [
            {
              type: 'html_block',
              content: t.content,
              tag,
              loading,
            },
          ] as any[]
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
        // 如果是常见的 inline标签（含用户自定义），则只追加结尾标签，否则转换成 html_block
        if (autoCloseInlineTagSet.has(tag)) {
          t.children[0].loading = true
          t.children[0].tag = tag
          t.children.push({
            type: 'html_inline',
            tag,
            loading: true,
            content: `</${tag}>`,
          } as any)
        }
        else {
          t.children = [
            {
              type: 'html_block',
              loading: true,
              tag,
              content: t.children[0].content + t.children[1].content,
            } as any,
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
          } as any,
        ]
        continue
      }
      // Only handle pathological cases where inline content is a single HTML-ish chunk
      if (!t.content?.startsWith('<') || (t as any).children?.length !== 1)
        continue

      const raw = String(t.content)
      const tagName = raw.match(/<([^\s>/]+)/)?.[1]?.toLowerCase() ?? ''
      if (!tagName)
        continue

      const selfClosing = /\/\s*>\s*$/.test(raw)
      const isVoid = selfClosing || VOID_TAGS.has(tagName)

      const htmlToken = t as unknown as { children: Array<{ type: string, content: string }> }

      if (isVoid) {
        // For void/self-closing tags, keep a single html_inline token
        htmlToken.children = [
          { type: 'html_inline', content: raw },
        ] as any
        continue
      }
      htmlToken.children.length = 0
    }
  })
}
