import type {
  ListItemNode,
  ListNode,
  MarkdownToken,
  ParsedNode,
  ParseOptions,
} from '../../types'
import { parseInlineTokens } from '../inline-parsers'
import { withInlineSourceStart } from '../inline-source'
import { createLinkifyDemotionContextTracker } from '../linkifyHeuristics'
import { parseCommonBlockToken } from './block-token-parser'
import { parseBlockquote } from './blockquote-parser'
import { containerTokenHandlers } from './container-token-handlers'

function trimInlineTokenTail(token: MarkdownToken) {
  const rawContent = String(token.content ?? '')
  const trimmed = rawContent.replace(/[ \t\r\n]+$/g, '')
  if (trimmed === rawContent)
    return

  token.content = trimmed

  const children = token.children as MarkdownToken[] | undefined
  if (!Array.isArray(children) || children.length === 0)
    return

  while (children.length) {
    const last = children[children.length - 1]
    if (!last) {
      children.pop()
      continue
    }
    if (last.type === 'softbreak' || last.type === 'hardbreak') {
      children.pop()
      continue
    }
    if (last.type === 'text') {
      const lastContent = String(last.content ?? '')
      const next = lastContent.replace(/[ \t\r\n]+$/g, '')
      if (next === lastContent)
        break
      if (next) {
        last.content = next
        break
      }
      children.pop()
      continue
    }
    break
  }
}

function stripLeakedOrderedListMarkerSuffix(token: MarkdownToken) {
  // In streaming mode markdown-it can occasionally leak the next ordered-list
  // marker (e.g. "\n\n2" or "\n\n2.") into the previous list item's paragraph
  // content. Because our renderer uses `whitespace-pre-wrap`, those leaked
  // newlines can create a large blank vertical gap until the next parse tick.
  const rawContent = String(token.content ?? '')
  const leak = rawContent.match(/\r?\n\s*\d+[.)]?\s*$/)
  if (!leak || typeof leak.index !== 'number')
    return

  token.content = rawContent.slice(0, leak.index)

  const children = token.children as MarkdownToken[] | undefined
  if (!Array.isArray(children) || children.length === 0)
    return

  // Best-effort sync: drop trailing text/break tokens that likely correspond
  // to the leaked marker and whitespace.
  while (children.length) {
    const last = children[children.length - 1]
    if (!last) {
      children.pop()
      continue
    }
    if (last.type === 'softbreak' || last.type === 'hardbreak') {
      children.pop()
      continue
    }
    if (last.type === 'text') {
      const lastContent = String(last.content ?? '')
      if (/^[ \t\r\n\d.)]*$/.test(lastContent)) {
        children.pop()
        continue
      }
      const next = lastContent.replace(/[ \t\r\n\d.)]+$/g, '')
      if (next !== lastContent) {
        if (next)
          last.content = next
        else
          children.pop()
      }
    }
    break
  }
}

export function parseList(
  tokens: MarkdownToken[],
  index: number,
  options?: ParseOptions,
): [ListNode, number] {
  const token = tokens[index]
  const listItems: ListItemNode[] = []
  const linkifyContext = createLinkifyDemotionContextTracker(options, true)
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
          stripLeakedOrderedListMarkerSuffix(contentToken)
          trimInlineTokenTail(contentToken)
          itemChildren.push({
            type: 'paragraph',
            children: parseInlineTokens(
              contentToken.children || [],
              String(contentToken.content ?? ''),
              preToken,
              withInlineSourceStart(contentToken, linkifyContext.options()),
            ),
            raw: String(contentToken.content ?? ''),
          })
          linkifyContext.remember(String(contentToken.content ?? ''))
          k += 3 // Skip paragraph_open, inline, paragraph_close
        }
        else if (tokens[k].type === 'blockquote_open') {
          // Parse blockquote within list item
          const [blockquoteNode, newIndex] = parseBlockquote(tokens, k, linkifyContext.options())
          itemChildren.push(blockquoteNode)
          linkifyContext.remember(blockquoteNode.raw)
          k = newIndex
        }
        else if (
          tokens[k].type === 'bullet_list_open'
          || tokens[k].type === 'ordered_list_open'
        ) {
          const [nestedListNode, newIndex] = parseList(tokens, k, linkifyContext.options())
          itemChildren.push(nestedListNode)
          linkifyContext.remember(nestedListNode.raw)
          k = newIndex
        }
        else {
          const handled = parseCommonBlockToken(tokens, k, linkifyContext.options(), containerTokenHandlers)
          if (handled) {
            itemChildren.push(handled[0])
            linkifyContext.remember(handled[0].raw)
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
