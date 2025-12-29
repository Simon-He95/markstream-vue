import type { AdmonitionNode, MarkdownToken, ParsedNode, ParseOptions, TextNode } from '../../types'
import { parseInlineTokens } from '../inline-parsers'
import { parseBasicBlockToken } from './block-token-parser'
import { parseBlockquote } from './blockquote-parser'
import { parseList } from './list-parser'

export function parseContainer(
  tokens: MarkdownToken[],
  index: number,
  options?: ParseOptions,
): [AdmonitionNode, number] {
  const openToken = tokens[index]

  // Determine kind and optional title
  let kind = 'note'
  let title = ''

  const typeMatch = openToken.type.match(/^container_(\w+)_open$/)
  if (typeMatch) {
    kind = typeMatch[1]
    // some implementations set info to remaining title text
    const info = String(openToken.info ?? '').trim()
    if (info && !info.startsWith(':::')) {
      // if info looks like 'warning title', drop leading kind token
      const maybe = info.replace(new RegExp(`^${kind}`), '').trim()
      if (maybe)
        title = maybe
    }
  }
  else {
    // container_open: info usually contains the marker like ' warning Title'
    const info = String(openToken.info ?? '').trim()

    const match
      // eslint-disable-next-line regexp/no-super-linear-backtracking
      = /^:{1,3}\s*(warning|info|note|tip|danger|caution)\s*(.*)$/i.exec(info)
    if (match) {
      kind = match[1]
      title = String(match[2] ?? '')
    }
  }

  if (!title)
    title = kind.charAt(0).toUpperCase() + kind.slice(1)

  const children: ParsedNode[] = []
  let j = index + 1

  // Accept closing tokens: 'container_close' or 'container_<kind>_close'
  const closeType = new RegExp(`^container_${kind}_close$`)

  while (
    j < tokens.length
    && tokens[j].type !== 'container_close'
    && !closeType.test(tokens[j].type)
  ) {
    if (tokens[j].type === 'paragraph_open') {
      const contentToken = tokens[j + 1]
      if (contentToken) {
        const childrenArr = (contentToken.children as MarkdownToken[]) || []
        let i = -1
        for (let k = childrenArr.length - 1; k >= 0; k--) {
          const t = childrenArr[k] as TextNode
          if (t.type === 'text' && /:+/.test(t.content)) {
            i = k
            break
          }
        }
        const _children = i !== -1 ? childrenArr.slice(0, i) : childrenArr
        children.push({
          type: 'paragraph',
          children: parseInlineTokens(_children || [], undefined, undefined, {
            requireClosingStrong: options?.requireClosingStrong,
            customHtmlTags: options?.customHtmlTags,
          }),
          raw: String(contentToken.content ?? '').replace(/\n:+$/, '').replace(/\n\s*:::\s*$/, ''),
        })
      }
      j += 3
    }
    else if (
      tokens[j].type === 'bullet_list_open'
      || tokens[j].type === 'ordered_list_open'
    ) {
      const [listNode, newIndex] = parseList(tokens, j, options)
      children.push(listNode)
      j = newIndex
    }
    else if (tokens[j].type === 'blockquote_open') {
      const [blockquoteNode, newIndex] = parseBlockquote(tokens, j, options)
      children.push(blockquoteNode)
      j = newIndex
    }
    else {
      const handled = parseBasicBlockToken(tokens, j, options)
      if (handled) {
        children.push(handled[0])
        j = handled[1]
      }
      else {
        j++
      }
    }
  }

  const admonitionNode: AdmonitionNode = {
    type: 'admonition',
    kind,
    title,
    children,
    raw: `:::${kind} ${title}\n${children.map(c => c.raw).join('\n')}\n:::`,
  }

  // Skip the closing token
  const closingIndex = j
  return [admonitionNode, closingIndex + 1]
}
