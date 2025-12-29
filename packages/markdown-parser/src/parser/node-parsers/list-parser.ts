import type {
  ListItemNode,
  ListNode,
  MarkdownToken,
  ParsedNode,
  ParseOptions,
} from '../../types'
import { parseInlineTokens } from '../inline-parsers'
import { parseCommonBlockToken } from './block-token-parser'
import { parseBlockquote } from './blockquote-parser'
import { containerTokenHandlers } from './container-token-handlers'

export function parseList(
  tokens: MarkdownToken[],
  index: number,
  options?: ParseOptions,
): [ListNode, number] {
  const token = tokens[index]
  const listItems: ListItemNode[] = []
  let j = index + 1

  while (
    j < tokens.length
    && tokens[j].type !== 'bullet_list_close'
    && tokens[j].type !== 'ordered_list_close'
  ) {
    if (tokens[j].type === 'list_item_open') {
      // if (tokens[j].markup === '*') {
      //   j++
      //   continue
      // }
      const itemChildren: ParsedNode[] = []
      let k = j + 1
      while (k < tokens.length && tokens[k].type !== 'list_item_close') {
        // Handle different block types inside list items
        if (tokens[k].type === 'paragraph_open') {
          const contentToken = tokens[k + 1]
          const preToken = tokens[k - 1]
          const contentStr = String(contentToken.content ?? '')
          if (/\n\d+$/.test(contentStr)) {
            contentToken.content = contentStr.replace(/\n\d+$/, '')
            contentToken.children?.splice(-1, 1)
          }
          itemChildren.push({
            type: 'paragraph',
            children: parseInlineTokens(contentToken.children || [], String(contentToken.content ?? ''), preToken, {
              requireClosingStrong: options?.requireClosingStrong,
              customHtmlTags: options?.customHtmlTags,
            }),
            raw: String(contentToken.content ?? ''),
          })
          k += 3 // Skip paragraph_open, inline, paragraph_close
        }
        else if (tokens[k].type === 'blockquote_open') {
          // Parse blockquote within list item
          const [blockquoteNode, newIndex] = parseBlockquote(tokens, k, options)
          itemChildren.push(blockquoteNode)
          k = newIndex
        }
        else if (
          tokens[k].type === 'bullet_list_open'
          || tokens[k].type === 'ordered_list_open'
        ) {
          const [nestedListNode, newIndex] = parseList(tokens, k, options)
          itemChildren.push(nestedListNode)
          k = newIndex
        }
        else {
          const handled = parseCommonBlockToken(tokens, k, options, containerTokenHandlers)
          if (handled) {
            itemChildren.push(handled[0])
            k = handled[1]
          }
          else {
            k += 1
          }
        }
      }

      listItems.push({
        type: 'list_item',
        children: itemChildren,
        raw: itemChildren.map(child => child.raw).join(''),
      })

      j = k + 1 // Move past list_item_close
    }
    else {
      j += 1
    }
  }

  const listNode: ListNode = {
    type: 'list',
    ordered: token.type === 'ordered_list_open',
    // markdown-it may include attrs like [['start','2']] on ordered_list_open
    start: (() => {
      if (token.attrs && token.attrs.length) {
        const found = token.attrs.find(a => a[0] === 'start')
        if (found) {
          const parsed = Number(found[1])
          return Number.isFinite(parsed) && parsed !== 0 ? parsed : 1
        }
      }
      return undefined
    })(),
    items: listItems,
    raw: listItems.map(item => item.raw).join('\n'),
  }

  return [listNode, j + 1] // Move past list_close
}
