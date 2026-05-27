import type { InternalParseOptions, MarkdownToken, ParagraphNode, ParseOptions } from '../../types'
import { parseInlineTokens } from '../inline-parsers'

function clampNonNegative(n: number) {
  return Number.isFinite(n) && n > 0 ? n : 0
}

function lineToIndex(source: string, line: number) {
  const targetLine = clampNonNegative(line)
  if (!source || targetLine <= 0)
    return 0

  let currentLine = 0
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') {
      currentLine++
      if (currentLine === targetLine)
        return i + 1
    }
  }
  return source.length
}

function withInlineSourceStart(token: MarkdownToken, options?: ParseOptions): ParseOptions | undefined {
  const source = String((options as InternalParseOptions | undefined)?.__sourceMarkdown ?? '')
  if (!source || !Array.isArray(token.map))
    return options

  return {
    ...options,
    __inlineSourceStart: lineToIndex(source, Number(token.map?.[0] ?? 0)),
  } as InternalParseOptions
}

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
