import type { InlineCodeNode, MarkdownToken, ParsedNode } from '../../types'

type ParseInlineTokensFn = (
  tokens: MarkdownToken[],
  raw?: string,
  pPreToken?: MarkdownToken,
  options?: { requireClosingStrong?: boolean, customHtmlTags?: readonly string[] },
) => ParsedNode[]

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

function getTagName(html: string) {
  const match = html.match(/^<\s*(?:\/\s*)?([\w-]+)/)
  return match ? match[1].toLowerCase() : ''
}

function isClosingTag(html: string) {
  return /^<\s*\//.test(html)
}

function isSelfClosing(tag: string, html: string) {
  return /\/\s*>\s*$/.test(html) || VOID_TAGS.has(tag)
}

function normalizeCustomTag(t: unknown) {
  const raw = String(t ?? '').trim()
  if (!raw)
    return ''
  const m = raw.match(/^[<\s/]*([A-Z][\w-]*)/i)
  return m ? m[1].toLowerCase() : ''
}

function tokenToRaw(token: MarkdownToken) {
  const shape = token as { raw?: string, markup?: string, content?: string }
  const raw = shape.raw ?? shape.content ?? shape.markup ?? ''
  return String(raw ?? '')
}

function stringifyTokens(tokens: MarkdownToken[]) {
  return tokens.map(tokenToRaw).join('')
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
  const customTags = options?.customHtmlTags
  const customTagSet = customTags && customTags.length
    ? new Set(customTags.map(normalizeCustomTag).filter(Boolean))
    : null

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
    const innerTokens = fragment.innerTokens
    const hrefMatch = code.match(/href\s*=\s*"([^"]+)"|href\s*=\s*'([^']+)'|href\s*=\s*([^\s>]+)/i)
    const href = hrefMatch ? (hrefMatch[1] || hrefMatch[2] || hrefMatch[3]) : ''
    const children = innerTokens.length
      ? parseInlineTokens(innerTokens, raw, pPreToken, options)
      : []
    const textContent = innerTokens.length ? stringifyTokens(innerTokens) : href || ''

    if (!children.length && textContent) {
      children.push({
        type: 'text',
        content: textContent,
        raw: textContent,
      } as ParsedNode)
    }

    return [
      {
        type: 'link',
        href: String(href ?? ''),
        title: null,
        text: textContent,
        children,
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
    return [
      {
        type: 'paragraph',
        children,
        raw: fragment.html,
      } as ParsedNode,
      fragment.nextIndex,
    ]
  }

  const children = fragment.innerTokens.length
    ? parseInlineTokens(fragment.innerTokens, raw, pPreToken, options)
    : []

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
    const _content = fragment.innerTokens.length
      ? stringifyTokens(fragment.innerTokens)
      : ''

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
        raw: content,
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
      children,
      raw: content,
      loading,
      autoClosed,
    } as ParsedNode,
    fragment.nextIndex,
  ]
}
