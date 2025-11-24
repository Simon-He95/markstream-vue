import type {
  ListItemNode,
  ListNode,
  MarkdownToken,
  ParsedNode,
} from '../../types'
import { parseInlineTokens } from '../inline-parsers'
import { parseFenceToken } from '../inline-parsers/fence-parser'
import { parseAdmonition } from './admonition-parser'
import { parseBlockquote } from './blockquote-parser'
import { parseCodeBlock } from './code-block-parser'
import { parseDefinitionList } from './definition-list-parser'
import { parseFootnote } from './footnote-parser'
import { parseHeading } from './heading-parser'
import { parseMathBlock } from './math-block-parser'
import { parseTable } from './table-parser'
import { parseThematicBreak } from './thematic-break-parser'

export function parseList(
  tokens: MarkdownToken[],
  index: number,
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
            children: parseInlineTokens(contentToken.children || [], String(contentToken.content ?? ''), preToken),
            raw: String(contentToken.content ?? ''),
          })
          k += 3 // Skip paragraph_open, inline, paragraph_close
        }
        else if (tokens[k].type === 'blockquote_open') {
          // Parse blockquote within list item
          const [blockquoteNode, newIndex] = parseBlockquote(tokens, k)
          itemChildren.push(blockquoteNode)
          k = newIndex
        }
        else if (
          tokens[k].type === 'bullet_list_open'
          || tokens[k].type === 'ordered_list_open'
        ) {
          if (tokens[k].markup === '*') {
            k++
            continue
          }
          // Parse nested list
          const [nestedListNode, newIndex] = parseNestedList(tokens, k)
          itemChildren.push(nestedListNode)
          k = newIndex
        }
        else if (tokens[k].type === 'code_block') {
          // Parse code block
          itemChildren.push(parseCodeBlock(tokens[k]))
          k += 1
        }
        else if (tokens[k].type === 'fence') {
          // Parse fenced code block
          itemChildren.push(parseFenceToken(tokens[k]))
          k += 1
        }
        else if (tokens[k].type === 'math_block') {
          // Parse math block
          itemChildren.push(parseMathBlock(tokens[k]))
          k += 1
        }
        else if (tokens[k].type === 'table_open') {
          // Parse table
          const [tableNode, newIndex] = parseTable(tokens, k)
          itemChildren.push(tableNode)
          k = newIndex
        }
        else if (tokens[k].type === 'dl_open') {
          // Parse definition list
          const [defListNode, newIndex] = parseDefinitionList(tokens, k)
          itemChildren.push(defListNode)
          k = newIndex
        }
        else if (tokens[k].type === 'footnote_open') {
          // Parse footnote
          const [footnoteNode, newIndex] = parseFootnote(tokens, k)
          itemChildren.push(footnoteNode)
          k = newIndex
        }
        else if (tokens[k].type === 'heading_open') {
          // Parse heading (though headings in lists are unusual)
          const headingNode = parseHeading(tokens, k)
          itemChildren.push(headingNode)
          k += 3 // Skip heading_open, inline, heading_close
        }
        else if (tokens[k].type === 'hr') {
          // Parse thematic break
          itemChildren.push(parseThematicBreak())
          k += 1
        }
        else if (tokens[k].type === 'container_open') {
          // Handle admonition containers (warning, info, note, tip, danger, caution)
          const match
            = /^::: ?(warning|info|note|tip|danger|caution) ?(.*)$/.exec(
              String(tokens[k].info ?? ''),
            )
          if (match) {
            const [admonitionNode, newIndex] = parseAdmonition(tokens, k, match)
            itemChildren.push(admonitionNode)
            k = newIndex
          }
          else {
            k += 1 // Skip unknown container types
          }
        }
        else {
          k += 1
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

// Enhanced function to handle nested lists properly
function parseNestedList(
  tokens: MarkdownToken[],
  index: number,
): [ListNode, number] {
  // We can directly use parseList since we're in the same file
  // This avoids circular dependency issues
  const nestedToken = tokens[index]
  const nestedItems: ListItemNode[] = []
  let j = index + 1

  while (
    j < tokens.length
    && tokens[j].type !== 'bullet_list_close'
    && tokens[j].type !== 'ordered_list_close'
  ) {
    if (tokens[j].type === 'list_item_open') {
      const itemChildren: ParsedNode[] = []
      let k = j + 1

      while (k < tokens.length && tokens[k].type !== 'list_item_close') {
        // Handle different block types inside list items
        if (tokens[k].type === 'paragraph_open') {
          const contentToken = tokens[k + 1]
          const preToken = tokens[k - 1]
          itemChildren.push({
            type: 'paragraph',
            children: parseInlineTokens(contentToken.children || [], String(contentToken.content ?? ''), preToken),
            raw: String(contentToken.content ?? ''),
          })
          k += 3 // Skip paragraph_open, inline, paragraph_close
        }
        else if (
          tokens[k].type === 'bullet_list_open'
          || tokens[k].type === 'ordered_list_open'
        ) {
          if (tokens[k].markup === '*') {
            k++
            continue
          }

          // Handle deeper nested lists
          const [deeperNestedListNode, newIndex] = parseNestedList(tokens, k)
          itemChildren.push(deeperNestedListNode)
          k = newIndex
        }
        else if (tokens[k].type === 'code_block') {
          itemChildren.push(parseCodeBlock(tokens[k]))
          k += 1
        }
        else if (tokens[k].type === 'fence') {
          itemChildren.push(parseFenceToken(tokens[k]))
          k += 1
        }
        else if (tokens[k].type === 'math_block') {
          // Parse math block in nested lists
          itemChildren.push(parseMathBlock(tokens[k]))
          k += 1
        }
        else {
          // Skip other token types in nested lists for simplicity
          k += 1
        }
      }

      nestedItems.push({
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

  const nestedListNode: ListNode = {
    type: 'list',
    ordered: nestedToken.type === 'ordered_list_open',
    start: (() => {
      if (nestedToken.attrs && nestedToken.attrs.length) {
        const found = nestedToken.attrs.find(a => a[0] === 'start')
        if (found) {
          const parsed = Number(found[1])
          return Number.isFinite(parsed) && parsed !== 0 ? parsed : 1
        }
      }
      return undefined
    })(),
    items: nestedItems,
    raw: nestedItems.map(item => item.raw).join('\n'),
  }

  return [nestedListNode, j + 1] // Move past list_close
}
