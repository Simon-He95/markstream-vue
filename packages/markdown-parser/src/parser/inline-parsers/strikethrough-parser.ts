import type {
  MarkdownToken,
  ParsedNode,
  ParseOptions,
  StrikethroughNode,
} from '../../types'
import { parseInlineTokens } from '../index'

export function parseStrikethroughToken(
  tokens: MarkdownToken[],
  startIndex: number,
  options?: ParseOptions,
): {
  node: StrikethroughNode
  nextIndex: number
} {
  const children: ParsedNode[] = []
  let sText = ''
  let i = startIndex + 1
  const innerTokens: MarkdownToken[] = []

  // Process tokens between s_open and s_close
  while (i < tokens.length && tokens[i].type !== 's_close') {
    sText += String(tokens[i].content ?? '')
    innerTokens.push(tokens[i])
    i++
  }

  // Parse inner tokens to handle nested elements
  children.push(...parseInlineTokens(innerTokens, undefined, undefined, {
    requireClosingStrong: options?.requireClosingStrong,
    customHtmlTags: options?.customHtmlTags,
  }))

  const node: StrikethroughNode = {
    type: 'strikethrough',
    children,
    raw: `~~${sText}~~`,
  }

  // Skip to after s_close
  const nextIndex = i < tokens.length ? i + 1 : tokens.length

  return { node, nextIndex }
}
