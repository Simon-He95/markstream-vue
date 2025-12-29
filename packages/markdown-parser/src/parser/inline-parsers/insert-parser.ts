import type { InsertNode, MarkdownToken, ParsedNode, ParseOptions } from '../../types'
import { parseInlineTokens } from '../index'

export function parseInsertToken(
  tokens: MarkdownToken[],
  startIndex: number,
  options?: ParseOptions,
): {
  node: InsertNode
  nextIndex: number
} {
  const children: ParsedNode[] = []
  let insText = ''
  let i = startIndex + 1
  const innerTokens: MarkdownToken[] = []

  // Process tokens between ins_open and ins_close
  while (i < tokens.length && tokens[i].type !== 'ins_close') {
    insText += String(tokens[i].content ?? '')
    innerTokens.push(tokens[i])
    i++
  }

  // Parse inner tokens to handle nested elements
  children.push(...parseInlineTokens(innerTokens, undefined, undefined, {
    requireClosingStrong: options?.requireClosingStrong,
    customHtmlTags: options?.customHtmlTags,
  }))

  const node: InsertNode = {
    type: 'insert',
    children,
    raw: `++${String(insText)}++`,
  }

  // Skip to after ins_close
  const nextIndex = i < tokens.length ? i + 1 : tokens.length

  return { node, nextIndex }
}
