import type { LinkNode, MarkdownToken, ParseOptions } from '../../types'
import { parseInlineTokens } from '../index'

export function parseLinkToken(
  tokens: MarkdownToken[],
  startIndex: number,
  options?: ParseOptions,
): {
  node: LinkNode
  nextIndex: number
} {
  const openToken = tokens[startIndex]
  const attrs = openToken.attrs ?? []
  const href = String(attrs.find(attr => attr[0] === 'href')?.[1] ?? '')
  const _title = attrs.find(attr => attr[0] === 'title')?.[1] ?? null
  const title = _title === null ? null : String(_title)

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

  // Parse the collected tokens as inline content
  const children = parseInlineTokens(linkTokens, undefined, undefined, {
    requireClosingStrong: options?.requireClosingStrong,
    customHtmlTags: options?.customHtmlTags,
  })
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
  }

  // Skip to after link_close
  const nextIndex = i < tokens.length ? i + 1 : tokens.length

  return { node, nextIndex }
}
