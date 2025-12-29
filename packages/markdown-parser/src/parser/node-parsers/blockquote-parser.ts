import type { BlockquoteNode, MarkdownToken, ParsedNode, ParseOptions } from '../../types'
import { parseInlineTokens } from '../inline-parsers'
import { parseCommonBlockToken } from './block-token-parser'
import { containerTokenHandlers } from './container-token-handlers'
import { parseList } from './list-parser'

export function parseBlockquote(
  tokens: MarkdownToken[],
  index: number,
  options?: ParseOptions,
): [BlockquoteNode, number] {
  const blockquoteChildren: ParsedNode[] = []
  let j = index + 1

  // Process blockquote content until closing tag is found
  while (j < tokens.length && tokens[j].type !== 'blockquote_close') {
    const token = tokens[j]
    switch (token.type) {
      case 'paragraph_open': {
        const contentToken = tokens[j + 1]
        blockquoteChildren.push({
          type: 'paragraph',
          children: parseInlineTokens(contentToken.children || [], String(contentToken.content ?? ''), undefined, {
            requireClosingStrong: options?.requireClosingStrong,
            customHtmlTags: options?.customHtmlTags,
          }),
          raw: String(contentToken.content ?? ''),
        })
        j += 3 // Skip paragraph_open, inline, paragraph_close
        break
      }
      case 'bullet_list_open':
      case 'ordered_list_open': {
        const [listNode, newIndex] = parseList(tokens, j, options)
        blockquoteChildren.push(listNode)
        j = newIndex
        break
      }
      case 'blockquote_open': {
        const [nestedBlockquote, newIndex] = parseBlockquote(tokens, j, options)
        blockquoteChildren.push(nestedBlockquote)
        j = newIndex
        break
      }
      default:{
        const handled = parseCommonBlockToken(tokens, j, options, containerTokenHandlers)
        if (handled) {
          blockquoteChildren.push(handled[0])
          j = handled[1]
        }
        else {
          j++
        }
        break
      }
    }
  }

  const blockquoteNode: BlockquoteNode = {
    type: 'blockquote',
    children: blockquoteChildren,
    raw: blockquoteChildren.map(child => child.raw).join('\n'),
  }

  return [blockquoteNode, j + 1] // Skip blockquote_close
}
