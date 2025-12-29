import type { HighlightNode, MarkdownToken, ParsedNode, ParseOptions } from '../../types'
import { parseInlineTokens } from '../index'

export function parseHighlightToken(
  tokens: MarkdownToken[],
  startIndex: number,
  options?: ParseOptions,
): {
  node: HighlightNode
  nextIndex: number
} {
  const children: ParsedNode[] = []
  let markText = ''
  let i = startIndex + 1
  const innerTokens: MarkdownToken[] = []

  // Process tokens between mark_open and mark_close
  while (i < tokens.length && tokens[i].type !== 'mark_close') {
    markText += String(tokens[i].content ?? '')
    innerTokens.push(tokens[i])
    i++
  }

  // Parse inner tokens to handle nested elements
  children.push(...parseInlineTokens(innerTokens, undefined, undefined, {
    requireClosingStrong: options?.requireClosingStrong,
    customHtmlTags: options?.customHtmlTags,
  }))

  const node: HighlightNode = {
    type: 'highlight',
    children,
    raw: `==${markText}==`,
  }

  // Skip to after mark_close
  const nextIndex = i < tokens.length ? i + 1 : tokens.length

  return { node, nextIndex }
}
