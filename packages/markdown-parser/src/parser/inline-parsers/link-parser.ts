import type { InternalParseOptions, LinkNode, MarkdownToken, ParseOptions } from '../../types'
import { parseInlineTokens } from '../index'

type AttrTuple = [string, string]

function toAttrsTuple(attrs: MarkdownToken['attrs']): AttrTuple[] {
  const tuples: AttrTuple[] = []
  if (!Array.isArray(attrs))
    return tuples
  for (const attr of attrs) {
    const key = attr?.[0]
    if (!key)
      continue
    tuples.push([String(key), String(attr?.[1] ?? '')])
  }
  return tuples
}

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

export function parseLinkToken(
  tokens: MarkdownToken[],
  startIndex: number,
  options?: ParseOptions,
): {
  node: LinkNode
  nextIndex: number
} {
  const openToken = tokens[startIndex]
  const attrsTuple = toAttrsTuple(openToken.attrs)
  const href = String(getAttrValue(attrsTuple, 'href') ?? '')
  const _title = getAttrValue(attrsTuple, 'title')
  const title = _title == null ? null : String(_title)
  const normalizedAttrs = normalizeLinkAttrs(attrsTuple, href, title)

  let i = startIndex + 1
  const linkTokens: MarkdownToken[] = []
  let loading = true

  // Collect all tokens between link_open and link_close
  while (i < tokens.length && tokens[i].type !== 'link_close') {
    linkTokens.push(tokens[i])
    i++
  }

  if (tokens[i]?.type === 'link_close') {
    loading = false
  }

  const lastLinkToken = linkTokens[linkTokens.length - 1]
  if (
    (options as InternalParseOptions | undefined)?.__insideStrong
    && lastLinkToken?.type === 'text'
    && String(lastLinkToken.content ?? '').endsWith('**')
    && !linkTokens.some(token => token.type === 'strong_open')
  ) {
    const originalContent = String(lastLinkToken.content ?? '')
    const originalRaw = String(lastLinkToken.raw ?? originalContent)
    lastLinkToken.content = originalContent.slice(0, -2)
    lastLinkToken.raw = originalRaw.replace(/\*\*$/, '')
  }

  // Parse the collected tokens as inline content
  const children = parseInlineTokens(linkTokens, undefined, undefined, options)
  const linkText = children
    .map((node) => {
      const nodeAny = node as unknown as { content?: string, raw?: string }
      if ('content' in node)
        return String(nodeAny.content ?? '')
      return String(nodeAny.raw ?? '')
    })
    .join('')

  const node: LinkNode = {
    type: 'link',
    href,
    title,
    text: linkText,
    children,
    raw: String(`[${linkText}](${href}${title ? ` "${title}"` : ''})`),
    loading,
    attrs: normalizedAttrs,
  }

  // Skip to after link_close
  const nextIndex = i < tokens.length ? i + 1 : tokens.length

  return { node, nextIndex }
}
