import type { InlineCodeNode, MarkdownToken, ParsedNode } from '../../types'
import { VOID_HTML_TAGS } from '../../htmlTags'
import { escapeTagForRegExp, findTagCloseIndexOutsideQuotes, parseTagAttrs } from '../../htmlTagUtils'
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

function findCustomHtmlFragmentFromSource(
  source: string,
  tag: string,
  startIndex: number,
): { raw: string, inner: string, end: number } | null {
  if (!source || !tag)
    return null

  const lowerTag = escapeTagForRegExp(tag.toLowerCase())
  const openRe = new RegExp(String.raw`<\s*${lowerTag}(?=\s|>|/)`, 'gi')
  openRe.lastIndex = Math.max(0, startIndex || 0)
  const openMatch = openRe.exec(source)
  if (!openMatch || openMatch.index == null)
    return null

  const openStart = openMatch.index
  const openEndRel = findTagCloseIndexOutsideQuotes(source.slice(openStart))
  if (openEndRel === -1)
    return null

  const openEnd = openStart + openEndRel
  const openTag = source.slice(openStart, openEnd + 1)
  if (/\/\s*>$/.test(openTag))
    return { raw: openTag, inner: '', end: openEnd + 1 }

  let depth = 1
  let index = openEnd + 1
  const isOpenAt = (pos: number) => new RegExp(String.raw`^<\s*${lowerTag}(?=\s|>|/)`, 'i').test(source.slice(pos))
  const isCloseAt = (pos: number) => new RegExp(String.raw`^<\s*\/\s*${lowerTag}(?=\s|>)`, 'i').test(source.slice(pos))

  while (index < source.length) {
    const lt = source.indexOf('<', index)
    if (lt === -1)
      return { raw: source.slice(openStart), inner: source.slice(openEnd + 1), end: source.length }

    if (isCloseAt(lt)) {
      const closeEndRel = findTagCloseIndexOutsideQuotes(source.slice(lt))
      if (closeEndRel === -1)
        return { raw: source.slice(openStart), inner: source.slice(openEnd + 1, lt), end: source.length }
      const closeEnd = lt + closeEndRel
      depth--
      if (depth === 0) {
        return {
          raw: source.slice(openStart, closeEnd + 1),
          inner: source.slice(openEnd + 1, lt),
          end: closeEnd + 1,
        }
      }
      index = closeEnd + 1
      continue
    }

    if (isOpenAt(lt)) {
      const nestedOpenEndRel = findTagCloseIndexOutsideQuotes(source.slice(lt))
      if (nestedOpenEndRel === -1)
        return null
      const nestedOpenEnd = lt + nestedOpenEndRel
      if (!/\/\s*>$/.test(source.slice(lt, nestedOpenEnd + 1)))
        depth++
      index = nestedOpenEnd + 1
      continue
    }

    index = lt + 1
  }

  return { raw: source.slice(openStart), inner: source.slice(openEnd + 1), end: source.length }
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
    const sourceFragment = findCustomHtmlFragmentFromSource(source, tag, cursor)
    if (sourceFragment)
      (options as any).__customHtmlSourceCursor = sourceFragment.end

    const _content = sourceFragment
      ? sourceFragment.inner
      : fragment.innerTokens.length
        ? stringifyTokens(fragment.innerTokens)
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
