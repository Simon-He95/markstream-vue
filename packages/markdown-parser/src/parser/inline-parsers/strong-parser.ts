import type { InternalParseOptions, MarkdownToken, ParsedNode, ParseOptions, StrongNode } from '../../types'
import { parseInlineTokens } from '../index'

const ESCAPED_PUNCTUATION_RE = /\\([\\()[\]`$|*_\-!])/g

function resolveInnerRaw(raw: string | undefined, strongText: string) {
  if (!raw)
    return undefined

  const rawText = String(raw)
  if (!rawText)
    return undefined

  if (rawText === strongText)
    return rawText

  const decodedRawText = rawText.replace(ESCAPED_PUNCTUATION_RE, '$1')
  if (decodedRawText === strongText)
    return rawText

  return undefined
}

export function parseStrongToken(
  tokens: MarkdownToken[],
  startIndex: number,
  raw?: string,
  options?: ParseOptions,
): {
  node: StrongNode
  nextIndex: number
} {
  const children: ParsedNode[] = []
  let strongText = ''
  let i = startIndex + 1
  const innerTokens: MarkdownToken[] = []

  // Process tokens between strong_open and strong_close
  // 这里可能会遇到多个 strong_open, 需要记录嵌套层级
  let openCount = 1
  while (i < tokens.length) {
    if (tokens[i].type === 'strong_close') {
      if (openCount === 1)
        break
      openCount--
    }
    if (tokens[i].type === 'strong_open') {
      openCount++
    }
    strongText += String(tokens[i].content ?? '')
    innerTokens.push(tokens[i])
    i++
  }

  // Parse inner tokens to handle nested elements
  const innerOptions: InternalParseOptions = {
    ...(options),
    __insideStrong: true,
  }
  children.push(...parseInlineTokens(innerTokens, resolveInnerRaw(raw, strongText), undefined, innerOptions))

  const node: StrongNode = {
    type: 'strong',
    children,
    raw: `**${String(strongText)}**`,
  }

  // Skip to after strong_close
  const nextIndex = i < tokens.length ? i + 1 : tokens.length

  return { node, nextIndex }
}
