import type {
  DefinitionItemNode,
  DefinitionListNode,
  MarkdownToken,
  ParsedNode,
  ParseOptions,
} from '../../types'
import { parseInlineTokens } from '../inline-parsers'

export function parseDefinitionList(
  tokens: MarkdownToken[],
  index: number,
  options?: ParseOptions,
): [DefinitionListNode, number] {
  const items: DefinitionItemNode[] = []
  let j = index + 1
  let termNodes: ParsedNode[] = []
  let definitionNodes: ParsedNode[] = []

  while (j < tokens.length && tokens[j].type !== 'dl_close') {
    if (tokens[j].type === 'dt_open') {
      // Process term
      const termToken = tokens[j + 1]
      termNodes = parseInlineTokens(termToken.children || [], undefined, undefined, {
        requireClosingStrong: options?.requireClosingStrong,
        customHtmlTags: options?.customHtmlTags,
      })
      j += 3 // Skip dt_open, inline, dt_close
    }
    else if (tokens[j].type === 'dd_open') {
      // Process definition
      let k = j + 1
      definitionNodes = []

      while (k < tokens.length && tokens[k].type !== 'dd_close') {
        if (tokens[k].type === 'paragraph_open') {
          const contentToken = tokens[k + 1]
          definitionNodes.push({
            type: 'paragraph',
            children: parseInlineTokens(contentToken.children || [], String(contentToken.content ?? ''), undefined, {
              requireClosingStrong: options?.requireClosingStrong,
              customHtmlTags: options?.customHtmlTags,
            }),
            raw: String(contentToken.content ?? ''),
          })
          k += 3 // Skip paragraph_open, inline, paragraph_close
        }
        else {
          k++
        }
      }

      // Add definition item
      if (termNodes.length > 0) {
        items.push({
          type: 'definition_item',
          term: termNodes,
          definition: definitionNodes,
          raw: `${termNodes.map(term => term.raw).join('')}: ${definitionNodes
            .map(def => def.raw)
            .join('\n')}`,
        })

        // Reset term nodes
        termNodes = []
      }

      j = k + 1 // Skip dd_close
    }
    else {
      j++
    }
  }

  const definitionListNode: DefinitionListNode = {
    type: 'definition_list',
    items,
    raw: items.map(item => item.raw).join('\n'),
  }

  return [definitionListNode, j + 1] // Skip dl_close
}
