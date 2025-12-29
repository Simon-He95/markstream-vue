import type { EmphasisNode, MarkdownToken, ParsedNode, ParseOptions } from '../../types'
import { parseInlineTokens } from '../index'

export function parseEmphasisToken(
  tokens: MarkdownToken[],
  startIndex: number,
  options?: ParseOptions,
): {
  node: EmphasisNode
  nextIndex: number
} {
  const children: ParsedNode[] = []
  let emText = ''
  let i = startIndex + 1
  const innerTokens: MarkdownToken[] = []

  // Process tokens between em_open and em_close
  while (i < tokens.length && tokens[i].type !== 'em_close') {
    emText += String(tokens[i].content ?? (tokens[i] as any)?.text ?? '')
    innerTokens.push(tokens[i])
    i++
  }

  // Parse inner tokens to handle nested elements
  children.push(...parseInlineTokens(innerTokens, undefined, undefined, {
    requireClosingStrong: options?.requireClosingStrong,
    customHtmlTags: options?.customHtmlTags,
  }))

  const node: EmphasisNode = {
    type: 'emphasis',
    children,
    raw: `*${emText}*`,
  }

  // Skip to after em_close
  const nextIndex = i < tokens.length ? i + 1 : tokens.length

  return { node, nextIndex }
}
