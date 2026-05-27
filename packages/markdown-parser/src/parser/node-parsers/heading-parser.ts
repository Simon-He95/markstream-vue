import type { HeadingNode, MarkdownToken, ParseOptions } from '../../types'
import { parseInlineTokens } from '../inline-parsers'

export function parseHeading(
  tokens: MarkdownToken[],
  index: number,
  options?: ParseOptions,
): HeadingNode {
  const token = tokens[index]
  const attrs = token.attrs
  const attrsRecord = Array.isArray(attrs) && attrs.length
    ? Object.fromEntries(
        attrs
          .filter(pair => Array.isArray(pair) && pair.length >= 1 && pair[0])
          .map(([name, value]) => [String(name), value == null || value === '' ? true : String(value)]),
      )
    : undefined
  const levelStr = String(token.tag?.substring(1) ?? '1')
  const headingLevel = Number.parseInt(levelStr, 10)
  const headingContentToken = tokens[index + 1]
  const headingContent = String(headingContentToken.content ?? '')

  return {
    type: 'heading',
    level: headingLevel,
    text: headingContent,
    ...(attrsRecord ? { attrs: attrsRecord } : {}),
    children: parseInlineTokens(headingContentToken.children || [], headingContent, undefined, options),
    raw: headingContent,
  }
}
