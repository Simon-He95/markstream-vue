import type { FootnoteNode, MarkdownToken, ParsedNode, ParseOptions } from '../../types'
import { parseInlineTokens } from '../inline-parsers'

export function parseFootnote(
  tokens: MarkdownToken[],
  index: number,
  options?: ParseOptions,
): [FootnoteNode, number] {
  const token = tokens[index]
  const meta = (token.meta ?? {}) as unknown as { label?: number | string }
  const id = String(meta?.label ?? '0')
  const footnoteChildren: ParsedNode[] = []
  let j = index + 1

  while (j < tokens.length && tokens[j].type !== 'footnote_close') {
    if (tokens[j].type === 'paragraph_open') {
      const contentToken = tokens[j + 1]
      const children = contentToken.children || []
      if (tokens[j + 2].type === 'footnote_anchor') {
        children.push(tokens[j + 2] as any)
      }
      footnoteChildren.push({
        type: 'paragraph',
        children: parseInlineTokens(contentToken.children || [], String(contentToken.content ?? ''), undefined, {
          requireClosingStrong: options?.requireClosingStrong,
          customHtmlTags: options?.customHtmlTags,
        }),
        raw: String(contentToken.content ?? ''),
      })

      j += 3 // Skip paragraph_open, inline, paragraph_close
    }
    else {
      j++
    }
  }

  const footnoteNode: FootnoteNode = {
    type: 'footnote',
    id,
    children: footnoteChildren,
    raw: `[^${id}]: ${footnoteChildren.map(child => child.raw).join('\n')}`,
  }

  return [footnoteNode, j + 1] // Skip footnote_close
}
