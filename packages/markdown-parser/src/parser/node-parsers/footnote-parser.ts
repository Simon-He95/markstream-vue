import type { FootnoteNode, MarkdownToken, ParsedNode, ParseOptions } from '../../types'
import type { ParseInlineTokensFn } from '../inline-parsers/inline-parser-types'
import { createLinkifyDemotionContextTracker } from '../linkifyHeuristics'
import { parseCommonBlockToken } from './block-token-parser'
import { parseBlockquote } from './blockquote-parser'
import { containerTokenHandlers } from './container-token-handlers'
import { parseList } from './list-parser'

export function parseFootnote(
  tokens: MarkdownToken[],
  index: number,
  options: ParseOptions | undefined,
  parseInlineTokens: ParseInlineTokensFn,
): [FootnoteNode, number] {
  const token = tokens[index]
  const meta = (token.meta ?? {}) as unknown as { label?: number | string }
  const id = String(meta?.label ?? '0')
  const footnoteChildren: ParsedNode[] = []
  const linkifyContext = createLinkifyDemotionContextTracker(options, true)
  let j = index + 1

  while (j < tokens.length && tokens[j].type !== 'footnote_close') {
    const child = tokens[j]
    if (child.type === 'paragraph_open') {
      const contentToken = tokens[j + 1]
      const children = contentToken.children ? [...contentToken.children] : []
      if (tokens[j + 2].type === 'footnote_anchor') {
        children.push(tokens[j + 2])
      }
      const paragraphNode = {
        type: 'paragraph',
        children: parseInlineTokens(children, String(contentToken.content ?? ''), undefined, linkifyContext.options()),
        raw: String(contentToken.content ?? ''),
      } as ParsedNode
      footnoteChildren.push(paragraphNode)
      linkifyContext.remember(paragraphNode.raw)

      j += 3
      continue
    }

    if (child.type === 'footnote_anchor') {
      // Backlinks follow the last block when the footnote doesn't end in a paragraph.
      if (footnoteChildren.length && tokens[j - 1].type !== 'footnote_anchor')
        footnoteChildren.push(...parseInlineTokens([child], undefined, undefined, linkifyContext.options()))
      j++
      continue
    }

    const blockOptions = linkifyContext.options()
    let block: [ParsedNode, number] | null
    switch (child.type) {
      case 'bullet_list_open':
      case 'ordered_list_open':
        block = parseList(tokens, j, blockOptions, parseInlineTokens)
        break
      case 'blockquote_open':
        block = parseBlockquote(tokens, j, blockOptions, parseInlineTokens)
        break
      default:
        block = parseCommonBlockToken(tokens, j, blockOptions, containerTokenHandlers, parseInlineTokens)
    }
    if (block) {
      footnoteChildren.push(block[0])
      linkifyContext.remember(block[0].raw)
      j = block[1]
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
