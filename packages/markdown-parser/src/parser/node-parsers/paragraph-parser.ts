import type { MarkdownToken, ParagraphNode, ParseOptions } from '../../types'
import { parseInlineTokens } from '../inline-parsers'

export function parseParagraph(
  tokens: MarkdownToken[],
  index: number,
  options?: ParseOptions,
): ParagraphNode {
  const paragraphContentToken = tokens[index + 1]
  const paragraphContent = String(paragraphContentToken.content ?? '')

  return {
    type: 'paragraph',
    children: parseInlineTokens(paragraphContentToken.children || [], paragraphContent, undefined, {
      requireClosingStrong: options?.requireClosingStrong,
      customHtmlTags: options?.customHtmlTags,
    }),
    raw: paragraphContent,
  }
}
