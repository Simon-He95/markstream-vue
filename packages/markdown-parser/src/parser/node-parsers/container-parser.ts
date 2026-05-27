import type { AdmonitionNode, MarkdownToken, ParsedNode, ParseOptions, TextNode } from '../../types'
import { parseInlineTokens } from '../inline-parsers'
import { withInlineSourceStart } from '../inline-source'
import { createLinkifyDemotionContextTracker } from '../linkifyHeuristics'
import { parseBasicBlockToken } from './block-token-parser'
import { parseBlockquote } from './blockquote-parser'
import { parseList } from './list-parser'

const CONTAINER_KINDS = new Set(['warning', 'info', 'note', 'tip', 'danger', 'caution'])

function parseContainerInfo(info: string) {
  let markerEnd = 0
  while (markerEnd < info.length && markerEnd < 3 && info[markerEnd] === ':')
    markerEnd++

  if (markerEnd === 0 || info[markerEnd] === ':')
    return null

  const rest = info.slice(markerEnd).trimStart()
  if (!rest)
    return null

  const firstWhitespace = rest.search(/\s/)
  const rawKind = (firstWhitespace === -1 ? rest : rest.slice(0, firstWhitespace)).toLowerCase()
  if (!CONTAINER_KINDS.has(rawKind))
    return null

  const title = firstWhitespace === -1 ? '' : rest.slice(firstWhitespace).trim()
  return { kind: rawKind, title }
}

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
      const lowerInfo = info.toLowerCase()
      if (lowerInfo.startsWith(kind)) {
        const maybe = info.slice(kind.length).trim()
        if (maybe)
          title = maybe
      }
    }
  }
  else {
    // container_open: info usually contains the marker like ' warning Title'
    const info = String(openToken.info ?? '').trim()
    const parsedInfo = parseContainerInfo(info)
    if (parsedInfo) {
      kind = parsedInfo.kind
      title = parsedInfo.title
    }
  }

  if (!title)
    title = kind.charAt(0).toUpperCase() + kind.slice(1)

  const children: ParsedNode[] = []
  const linkifyContext = createLinkifyDemotionContextTracker(options, true)
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
        const paragraphNode = {
          type: 'paragraph',
          children: parseInlineTokens(
            _children || [],
            String(contentToken.content ?? ''),
            undefined,
            withInlineSourceStart(contentToken, linkifyContext.options()),
          ),
          raw: String(contentToken.content ?? '').replace(/\n:+$/, '').replace(/\n\s*:::\s*$/, ''),
        } as ParsedNode
        children.push(paragraphNode)
        linkifyContext.remember(paragraphNode.raw)
      }
      j += 3
    }
    else if (
      tokens[j].type === 'bullet_list_open'
      || tokens[j].type === 'ordered_list_open'
    ) {
      const [listNode, newIndex] = parseList(tokens, j, linkifyContext.options())
      children.push(listNode)
      linkifyContext.remember(listNode.raw)
      j = newIndex
    }
    else if (tokens[j].type === 'blockquote_open') {
      const [blockquoteNode, newIndex] = parseBlockquote(tokens, j, linkifyContext.options())
      children.push(blockquoteNode)
      linkifyContext.remember(blockquoteNode.raw)
      j = newIndex
    }
    else {
      const handled = parseBasicBlockToken(tokens, j, linkifyContext.options())
      if (handled) {
        children.push(handled[0])
        linkifyContext.remember(handled[0].raw)
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
