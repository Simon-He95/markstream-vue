import type { AdmonitionNode, MarkdownToken, ParsedNode, ParseOptions } from '../../types'
import { parseInlineTokens } from '../inline-parsers'
import { parseBasicBlockToken } from './block-token-parser'
import { parseBlockquote } from './blockquote-parser'
import { parseList } from './list-parser'

export function parseAdmonition(
  tokens: MarkdownToken[],
  index: number,
  match: RegExpExecArray,
  options?: ParseOptions,
): [AdmonitionNode, number] {
  const kind = String(match[1] ?? 'note')
  const title = String(match[2] ?? (kind.charAt(0).toUpperCase() + kind.slice(1)))
  const admonitionChildren: ParsedNode[] = []
  let j = index + 1

  while (j < tokens.length && tokens[j].type !== 'container_close') {
    if (tokens[j].type === 'paragraph_open') {
      const contentToken = tokens[j + 1]
      if (contentToken) {
        admonitionChildren.push({
          type: 'paragraph',
          children: parseInlineTokens(contentToken.children || [], String(contentToken.content ?? ''), undefined, {
            requireClosingStrong: options?.requireClosingStrong,
            customHtmlTags: options?.customHtmlTags,
          }),
          raw: String(contentToken.content ?? ''),
        })
      }
      j += 3 // Skip paragraph_open, inline, paragraph_close
    }
    else if (
      tokens[j].type === 'bullet_list_open'
      || tokens[j].type === 'ordered_list_open'
    ) {
      const [listNode, newIndex] = parseList(tokens, j, options)
      admonitionChildren.push(listNode)
      j = newIndex
    }
    else if (tokens[j].type === 'blockquote_open') {
      const [blockquoteNode, newIndex] = parseBlockquote(tokens, j, options)
      admonitionChildren.push(blockquoteNode)
      j = newIndex
    }
    else {
      const handled = parseBasicBlockToken(tokens, j, options)
      if (handled) {
        admonitionChildren.push(handled[0])
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
    children: admonitionChildren,
    raw: `:::${kind} ${title}\n${admonitionChildren
      .map(child => child.raw)
      .join('\n')}\n:::`,
  }

  return [admonitionNode, j + 1] // Skip container_close
}
