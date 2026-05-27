import type { MarkdownToken, ParagraphNode, ParseOptions } from '../../types'
import { parseInlineTokens } from '../inline-parsers'
import { withInlineSourceStart } from '../inline-source'

export function parseParagraph(
  tokens: MarkdownToken[],
  index: number,
  options?: ParseOptions,
): ParagraphNode {
  const paragraphContentToken = tokens[index + 1]
  const paragraphContent = String(paragraphContentToken.content ?? '')

  return {
    type: 'paragraph',
    children: parseInlineTokens(
      paragraphContentToken.children || [],
      paragraphContent,
      undefined,
      withInlineSourceStart(paragraphContentToken, options),
    ),
    raw: paragraphContent,
  }
}
