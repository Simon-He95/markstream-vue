import type { InlineCodeNode, MarkdownToken, ParsedNode } from '../../types'
import { VOID_HTML_TAGS } from '../../htmlTags'
import { parseTagAttrs } from '../../htmlTagUtils'
import { readCustomHtmlFragmentAt, stripTrailingPartialClosingTag } from '../custom-html-source'
import { normalizeCustomTag } from '../customHtmlTags'
import { buildAllowedHtmlTagSet } from '../index'

type ParseInlineTokensFn = (
  tokens: MarkdownToken[],
  raw?: string,
  pPreToken?: MarkdownToken,
  options?: { requireClosingStrong?: boolean, customHtmlTags?: readonly string[] },
) => ParsedNode[]

interface TagSetCacheEntry {
  customTagSet: Set<string> | null
  allowedTagSet: Set<string>
}

let emptyTagSets: TagSetCacheEntry | null = null
const TAG_SET_CACHE = new WeakMap<readonly string[], TagSetCacheEntry>()

function getEmptyTagSets() {
  if (!emptyTagSets) {
    emptyTagSets = {
      customTagSet: null,
      allowedTagSet: buildAllowedHtmlTagSet(),
    }
  }
  return emptyTagSets
}

function getTagName(html: string) {
  const match = html.match(/^<\s*(?:\/\s*)?([\w-]+)/)
  return match ? match[1].toLowerCase() : ''
}

function isClosingTag(html: string) {
  return /^<\s*\//.test(html)
}

function isSelfClosing(tag: string, html: string) {
  return /\/\s*>\s*$/.test(html) || VOID_HTML_TAGS.has(tag)
}

function getTagSets(customTags?: readonly string[]) {
  if (!customTags || customTags.length === 0)
    return getEmptyTagSets()
  const cached = TAG_SET_CACHE.get(customTags)
  if (cached)
    return cached
  const normalized = customTags.map(normalizeCustomTag).filter(Boolean)
  if (!normalized.length) {
    const entry = getEmptyTagSets()
    TAG_SET_CACHE.set(customTags, entry)
    return entry
  }
  const entry = {
    customTagSet: new Set(normalized),
    allowedTagSet: buildAllowedHtmlTagSet({ customHtmlTags: customTags }),
  }
  TAG_SET_CACHE.set(customTags, entry)
  return entry
}

function tokenToRaw(token: MarkdownToken) {
  const shape = token as { raw?: string, markup?: string, content?: string }
  const raw = shape.raw ?? shape.content ?? shape.markup ?? ''
  return String(raw ?? '')
}

type AttrTuple = [string, string]

function getAttrValue(attrs: AttrTuple[], name: string): string | undefined {
  const lowerName = name.toLowerCase()
  for (let i = attrs.length - 1; i >= 0; i--) {
    const [key, value] = attrs[i]
    if (String(key).toLowerCase() === lowerName)
      return value
  }
  return undefined
}

function normalizeLinkAttrs(
  attrs: AttrTuple[],
  href: string,
  title: string | null,
): AttrTuple[] {
  const normalized = attrs.slice()

  if (!getAttrValue(normalized, 'href'))
    normalized.push(['href', href])
  if (title != null && !getAttrValue(normalized, 'title'))
    normalized.push(['title', title])

  return normalized
}

function stringifyTokens(tokens: MarkdownToken[]) {
  return tokens.map(tokenToRaw).join('')
}

function findClosingBacktickRun(raw: string, start: number, runLength: number) {
  const marker = '`'.repeat(runLength)
  return raw.indexOf(marker, start + runLength)
}

function findInlineLinkDestinationEnd(raw: string, openParen: number) {
  let depth = 0
  let quote: string | null = null
  for (let idx = openParen; idx < raw.length; idx++) {
    const char = raw[idx]
    if (char === '\\') {
      idx++
      continue
    }
    if (quote) {
      if (char === quote)
        quote = null
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      continue
    }
    if (char === '(') {
      depth++
      continue
    }
    if (char === ')') {
      depth--
      if (depth === 0)
        return idx + 1
    }
  }
  return -1
}

function collectInlineSkipRanges(raw: string) {
  const ranges: Array<[number, number]> = []
  let index = 0
  while (index < raw.length) {
    const char = raw[index]

    if (char === '\\') {
      ranges.push([index, Math.min(raw.length, index + 2)])
      index += 2
      continue
    }

    if (char === '`') {
      let runLength = 1
      while (raw[index + runLength] === '`')
        runLength++
      const close = findClosingBacktickRun(raw, index, runLength)
      const end = close === -1 ? index + runLength : close + runLength
      ranges.push([index, end])
      index = end
      continue
    }

    if (char === ']' && raw[index + 1] === '(') {
      const linkEnd = findInlineLinkDestinationEnd(raw, index + 1)
      if (linkEnd !== -1) {
        ranges.push([index + 1, linkEnd])
        index = linkEnd
        continue
      }
    }

    index++
  }

  return ranges
}

function isInsideRange(index: number, ranges: Array<[number, number]>) {
  return ranges.some(([start, end]) => index >= start && index < end)
}

function findInlineHtmlTokenOffset(raw: string | undefined, tokens: MarkdownToken[], targetIndex: number) {
  if (!raw)
    return -1

  const target = String(tokens[targetIndex]?.content ?? '')
  if (!target)
    return -1

  const skipRanges = collectInlineSkipRanges(raw)
  let offset = 0
  for (let idx = 0; idx < targetIndex; idx++) {
    const token = tokens[idx]
    const content = String(token?.content ?? '')

    if (token?.type === 'code_inline') {
      const markup = String(token.markup || '`')
      const literal = `${markup}${content}${markup}`
      const found = raw.indexOf(literal, offset)
      offset = found === -1 ? offset + literal.length : found + literal.length
      continue
    }

    if (token?.type === 'link') {
      const rawLink = String((token as any).raw ?? '')
      const foundRawLink = rawLink ? raw.indexOf(rawLink, offset) : -1
      if (foundRawLink !== -1) {
        const linkDestinationStart = raw.indexOf('](', foundRawLink)
        const linkEnd = linkDestinationStart === -1
          ? -1
          : findInlineLinkDestinationEnd(raw, linkDestinationStart + 1)
        offset = linkEnd === -1 ? foundRawLink + rawLink.length : linkEnd
      }
      continue
    }

    if (token?.type === 'html_inline') {
      const found = raw.indexOf(content, offset)
      offset = found === -1 ? offset + content.length : found + content.length
      continue
    }

    if (token?.type === 'softbreak' || token?.type === 'hardbreak') {
      const found = raw.indexOf('\n', offset)
      offset = found === -1 ? offset + 1 : found + 1
      continue
    }

    offset += content.length
  }

  let found = raw.indexOf(target, offset)
  while (found !== -1) {
    if (!isInsideRange(found, skipRanges))
      return found
    found = raw.indexOf(target, found + target.length)
  }
  return -1
}

function findNthUnskippedOccurrence(text: string, target: string, ordinal: number) {
  if (!text || !target || ordinal < 1)
    return -1

  const skipRanges = collectInlineSkipRanges(text)
  let count = 0
  let found = text.indexOf(target)
  while (found !== -1) {
    if (!isInsideRange(found, skipRanges)) {
      count++
      if (count === ordinal)
        return found
    }
    found = text.indexOf(target, found + target.length)
  }
  return -1
}

function findInlineHtmlTokenSourceStart(
  source: string,
  inlineSourceStart: number,
  raw: string | undefined,
  tokens: MarkdownToken[],
  targetIndex: number,
  target: string,
) {
  if (!source || !Number.isFinite(inlineSourceStart) || inlineSourceStart < 0)
    return -1

  const rawOffset = findInlineHtmlTokenOffset(raw, tokens, targetIndex)
  if (rawOffset === -1)
    return -1

  const rawText = String(raw ?? '')
  const ordinal = (() => {
    let count = 0
    let found = rawText.indexOf(target)
    const skipRanges = collectInlineSkipRanges(rawText)
    while (found !== -1 && found <= rawOffset) {
      if (!isInsideRange(found, skipRanges))
        count++
      found = rawText.indexOf(target, found + target.length)
    }
    return count
  })()

  const sourceTail = source.slice(inlineSourceStart)
  const sourceOffset = findNthUnskippedOccurrence(sourceTail, target, ordinal)
  return sourceOffset === -1 ? -1 : inlineSourceStart + sourceOffset
}

function normalizeStandardHtmlChildren(children: ParsedNode[]) {
  const normalized: ParsedNode[] = []

  const pushText = (rawText: string) => {
    const text = String(rawText ?? '')
    if (!text)
      return
    const last = normalized[normalized.length - 1] as ParsedNode | undefined
    if (last?.type === 'text') {
      last.content = `${last.content}${text}`
      last.raw = `${last.raw}${text}`
      return
    }
    normalized.push({
      type: 'text',
      content: text,
      raw: text,
    } as ParsedNode)
  }

  for (const child of children) {
    if (!child)
      continue

    if (child.type === 'reference' || child.type === 'footnote_reference') {
      pushText(String(child.raw ?? ''))
      continue
    }

    if ('children' in child && Array.isArray(child.children)) {
      normalized.push({
        ...child,
        children: normalizeStandardHtmlChildren(child.children),
      } as ParsedNode)
      continue
    }

    normalized.push(child)
  }

  return normalized
}

function findMatchingClosing(tokens: MarkdownToken[], startIndex: number, tag: string) {
  let depth = 0
  for (let idx = startIndex; idx < tokens.length; idx++) {
    const t = tokens[idx]
    if (t.type !== 'html_inline')
      continue
    const content = String(t.content ?? '')
    const tTag = getTagName(content)
    const closing = isClosingTag(content)
    const selfClosing = isSelfClosing(tTag, content)
    if (!closing && !selfClosing && tTag === tag) {
      depth++
      continue
    }
    if (closing && tTag === tag) {
      if (depth === 0)
        return idx
      depth--
    }
  }
  return -1
}

function collectHtmlFragment(tokens: MarkdownToken[], startIndex: number, tag: string) {
  const openToken = tokens[startIndex]
  const fragmentTokens: MarkdownToken[] = [openToken]
  let innerTokens: MarkdownToken[] = []
  let nextIndex = startIndex + 1
  let closed = false

  const closingIndex = tag ? findMatchingClosing(tokens, startIndex + 1, tag) : -1
  if (closingIndex !== -1) {
    innerTokens = tokens.slice(startIndex + 1, closingIndex)
    fragmentTokens.push(...innerTokens, tokens[closingIndex])
    nextIndex = closingIndex + 1
    closed = true
  }
  else {
    // Streaming mid-state: if no matching closing tag exists yet,
    // treat all following inline tokens as the inner content of this tag.
    innerTokens = tokens.slice(startIndex + 1)
    if (innerTokens.length)
      fragmentTokens.push(...innerTokens)
    nextIndex = tokens.length
  }

  return {
    closed,
    html: stringifyTokens(fragmentTokens),
    innerTokens,
    nextIndex,
  }
}

// Parse inline HTML and return an appropriate ParsedNode depending on tag.
export function parseHtmlInlineCodeToken(
  token: MarkdownToken,
  tokens: MarkdownToken[],
  i: number,
  parseInlineTokens: ParseInlineTokensFn,
  raw?: string,
  pPreToken?: MarkdownToken,
  options?: { requireClosingStrong?: boolean, customHtmlTags?: readonly string[] },
): [ParsedNode, number] {
  const code = String(token.content ?? '')
  const tag = getTagName(code)
  const { customTagSet, allowedTagSet } = getTagSets(options?.customHtmlTags)

  if (!tag) {
    return [
      {
        type: 'inline_code',
        code,
        raw: code,
      } as InlineCodeNode,
      i + 1,
    ]
  }

  // If it's not a standard HTML tag and not in customHtmlTags, default to
  // rendering it as literal text (方案 A). However, if the tag is already
  // properly closed within the inline token stream, keep it as HTML so
  // HtmlInlineNode can still render custom components via HTML parsing.
  if (!allowedTagSet.has(tag)) {
    const fragment = collectHtmlFragment(tokens, i, tag)
    if (!fragment.closed) {
      const content = tokenToRaw(token)
      return [{ type: 'text', content, raw: content } as ParsedNode, i + 1]
    }
  }

  if (tag === 'br') {
    return [
      {
        type: 'hardbreak',
        raw: code,
      } as ParsedNode,
      i + 1,
    ]
  }

  const closing = isClosingTag(code)
  const selfClosing = isSelfClosing(tag, code)

  if (closing) {
    return [
      {
        type: 'html_inline',
        tag,
        content: code,
        children: [],
        raw: code,
        loading: false,
      } as ParsedNode,
      i + 1,
    ]
  }

  if (tag === 'a') {
    const fragment = collectHtmlFragment(tokens, i, tag)
    const attrs = parseTagAttrs(code)
    const innerTokens = fragment.innerTokens
    const href = String(getAttrValue(attrs, 'href') ?? '')
    const titleAttr = getAttrValue(attrs, 'title')
    const title = titleAttr == null ? null : String(titleAttr)
    const normalizedAttrs = normalizeLinkAttrs(attrs, href, title)
    const children = innerTokens.length
      ? parseInlineTokens(innerTokens, raw, pPreToken, options)
      : []
    const normalizedChildren = normalizeStandardHtmlChildren(children)
    const textContent = innerTokens.length ? stringifyTokens(innerTokens) : href || ''

    if (!normalizedChildren.length && textContent) {
      normalizedChildren.push({
        type: 'text',
        content: textContent,
        raw: textContent,
      } as ParsedNode)
    }

    return [
      {
        type: 'link',
        href,
        title,
        text: textContent,
        attrs: normalizedAttrs,
        children: normalizedChildren,
        loading: !fragment.closed,
        raw: fragment.html || code,
      } as ParsedNode,
      fragment.nextIndex,
    ]
  }

  if (selfClosing) {
    const nodeType = customTagSet?.has(tag) ? tag : 'html_inline'
    return [
      {
        type: nodeType,
        tag,
        content: code,
        children: [],
        raw: code,
        loading: false,
      } as ParsedNode,
      i + 1,
    ]
  }

  const fragment = collectHtmlFragment(tokens, i, tag)

  if (tag === 'p' || tag === 'div') {
    const children = fragment.innerTokens.length
      ? parseInlineTokens(fragment.innerTokens, raw, pPreToken, options)
      : []
    const normalizedChildren = normalizeStandardHtmlChildren(children)
    return [
      {
        type: 'paragraph',
        children: normalizedChildren,
        raw: fragment.html,
      } as ParsedNode,
      fragment.nextIndex,
    ]
  }

  const children = fragment.innerTokens.length
    ? parseInlineTokens(fragment.innerTokens, raw, pPreToken, options)
    : []
  const normalizedChildren = normalizeStandardHtmlChildren(children)

  let content = fragment.html || code
  let loading = !fragment.closed
  let autoClosed = false
  if (!fragment.closed) {
    const closeTag = `</${tag}>`
    if (!content.toLowerCase().includes(closeTag.toLowerCase()))
      content += closeTag
    autoClosed = true
    // Still mark loading for mid-state, even though we auto-closed for rendering.
    loading = true
  }
  const attrs = []
  // 解析属性
  const attrRegex = /\s([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  let match
  while ((match = attrRegex.exec(code)) !== null) {
    const attrName = match[1]
    const attrValue = match[2] || match[3] || match[4] || ''
    attrs.push([attrName, attrValue])
  }
  if (customTagSet?.has(tag)) {
    const source = String((options as any)?.__sourceMarkdown ?? '')
    const cursor = Number((options as any)?.__customHtmlSourceCursor ?? 0)
    const inlineSourceStart = Number((options as any)?.__inlineSourceStart ?? Number.NaN)
    const openStart = findInlineHtmlTokenSourceStart(source, inlineSourceStart, raw, tokens, i, code)
    const sourceFragment = readCustomHtmlFragmentAt(source, tag, openStart, code)
    if (sourceFragment)
      (options as any).__customHtmlSourceCursor = Math.max(cursor, sourceFragment.end)

    const _content = sourceFragment
      ? sourceFragment.inner
      : fragment.innerTokens.length
        ? stripTrailingPartialClosingTag(stringifyTokens(fragment.innerTokens), tag)
        : ''
    const rawHtml = sourceFragment?.raw ?? content

    const customChildren = fragment.innerTokens.length
      ? parseInlineTokens(fragment.innerTokens, raw, pPreToken, options)
      : []
    return [
      {
        type: tag,
        tag,
        attrs,
        content: _content,
        children: customChildren,
        raw: rawHtml,
        loading: token.loading || loading,
        autoClosed,
      } as ParsedNode,
      fragment.nextIndex,
    ]
  }
  return [
    {
      type: 'html_inline',
      tag,
      attrs,
      content,
      children: normalizedChildren,
      raw: content,
      loading,
      autoClosed,
    } as ParsedNode,
    fragment.nextIndex,
  ]
}
