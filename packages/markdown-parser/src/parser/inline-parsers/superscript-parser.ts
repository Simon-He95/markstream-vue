import type { MarkdownToken, ParsedNode, ParseOptions, SuperscriptNode } from '../../types'
import { parseInlineTokens } from '../index'

export function parseSuperscriptToken(
  tokens: MarkdownToken[],
  startIndex: number,
  options?: ParseOptions,
): {
  node: SuperscriptNode
  nextIndex: number
} {
  const children: ParsedNode[] = []
  let supText = ''
  let i = startIndex + 1
  const innerTokens: MarkdownToken[] = []

  // Process tokens between sup_open and sup_close (if applicable)
  while (i < tokens.length && tokens[i].type !== 'sup_close') {
    supText += String(tokens[i].content ?? '')
    innerTokens.push(tokens[i])
    i++
  }

  // Parse inner tokens to handle nested elements
  children.push(...parseInlineTokens(innerTokens, undefined, undefined, {
    requireClosingStrong: options?.requireClosingStrong,
    customHtmlTags: options?.customHtmlTags,
  }))

  const node: SuperscriptNode = {
    type: 'superscript',
    children:
      children.length > 0
        ? children
        : [
            {
              type: 'text',
              // Fallback to the collected inner text (e.g., "2" in x^2^)
              content: supText || String(tokens[startIndex].content ?? ''),
              raw: supText || String(tokens[startIndex].content ?? ''),
            },
          ],
    raw: `^${supText || String(tokens[startIndex].content ?? '')}^`,
  }

  // Skip to after sup_close
  const nextIndex = i < tokens.length ? i + 1 : tokens.length

  return { node, nextIndex }
}
