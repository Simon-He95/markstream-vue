import type { AdmonitionNode, MarkdownToken, ParsedNode, ParseOptions, VmrContainerNode } from '../../types'
import { parseInlineTokens } from '../inline-parsers'
import { parseFenceToken } from '../inline-parsers/fence-parser'
import { parseBlockquote } from './blockquote-parser'
import { parseCodeBlock } from './code-block-parser'
import { parseDefinitionList } from './definition-list-parser'
import { parseFootnote } from './footnote-parser'
import { parseHeading } from './heading-parser'
import { parseHtmlBlock } from './html-block-parser'
import { parseList } from './list-parser'
import { parseMathBlock } from './math-block-parser'
import { parseTable } from './table-parser'
import { parseThematicBreak } from './thematic-break-parser'

function parseVmrContainer(
  tokens: MarkdownToken[],
  index: number,
  options?: ParseOptions,
): [VmrContainerNode, number] {
  const openToken = tokens[index]

  // Extract name from class attribute (e.g., "vmr-container vmr-container-viewcode:topo-test-001")
  // Handle multiple class values by looking for vmr-container-* anywhere in the string
  const attrs = openToken.attrs as [string, string][] | null
  let name = ''
  let containerAttrs: Record<string, string> = {}

  if (attrs) {
    for (const [key, value] of attrs) {
      if (key === 'class') {
        // Match vmr-container-* anywhere in the class string, not just at the end
        const match = value.match(/(?:\s|^)vmr-container-(\S+)/)
        if (match) {
          name = match[1]
        }
      }
      else if (key.startsWith('data-')) {
        // Extract data attributes (e.g., "data-devId" -> "devId")
        const attrName = key.slice(5)
        if (attrName === 'json-attrs') {
          containerAttrs = { ...JSON.parse(value), ...containerAttrs }
        }
        else {
          containerAttrs[attrName] = value
        }
      }
    }
  }

  const children: ParsedNode[] = []
  let j = index + 1

  // Parse children until we find the closing token
  while (j < tokens.length && tokens[j].type !== 'vmr_container_close') {
    if (tokens[j].type === 'paragraph_open') {
      // Handle paragraph tokens (plain text)
      const contentToken = tokens[j + 1]
      if (contentToken) {
        const childrenArr = (contentToken.children as MarkdownToken[]) || []
        children.push({
          type: 'paragraph',
          children: parseInlineTokens(childrenArr || [], undefined, undefined, {
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
      // Handle list tokens
      const [listNode, newIndex] = parseList(tokens, j, options)
      children.push(listNode)
      j = newIndex
    }
    else if (tokens[j].type === 'blockquote_open') {
      // Handle blockquote tokens
      const [blockquoteNode, newIndex] = parseBlockquote(tokens, j, options)
      children.push(blockquoteNode)
      j = newIndex
    }
    else {
      // Handle other basic block tokens (heading, code_block, fence, etc.)
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

  // Build raw content
  let raw = `::: ${name}`
  if (Object.keys(containerAttrs).length > 0) {
    raw += ` ${JSON.stringify(containerAttrs)}`
  }
  raw += '\n'
  if (children.length > 0) {
    raw += children.map(c => c.raw).join('\n')
    raw += '\n'
  }
  raw += ':::'

  const containerNode: VmrContainerNode = {
    type: 'vmr_container',
    name,
    attrs: Object.keys(containerAttrs).length > 0 ? containerAttrs : undefined,
    children,
    raw,
  }

  // Skip the closing token
  return [containerNode, j + 1]
}

function findTagCloseIndexOutsideQuotes(input: string) {
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (!inDouble && ch === '\'') {
      inSingle = !inSingle
      continue
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble
      continue
    }
    if (!inSingle && !inDouble && ch === '>')
      return i
  }
  return -1
}

function stripWrapperNewlines(s: string) {
  // Preserve inner whitespace/indentation, but drop a single leading/trailing newline
  // introduced by the common pattern: <tag>\n...\n</tag>
  return s.replace(/^\r?\n/, '').replace(/\r?\n$/, '')
}

function stripTrailingPartialClosingTag(inner: string, tag: string) {
  if (!inner || !tag)
    return inner
  const re = new RegExp(String.raw`[\t ]*<\s*\/\s*${tag}[^>]*$`, 'i')
  return inner.replace(re, '')
}

function findNextCustomHtmlBlockFromSource(
  source: string,
  tag: string,
  startIndex: number,
): { raw: string, end: number } | null {
  if (!source || !tag)
    return null

  const lowerTag = tag.toLowerCase()
  const openRe = new RegExp(String.raw`<\s*${lowerTag}(?=\s|>|/)`, 'gi')
  openRe.lastIndex = Math.max(0, startIndex || 0)
  const openMatch = openRe.exec(source)
  if (!openMatch || openMatch.index == null)
    return null

  const openStart = openMatch.index
  const openSlice = source.slice(openStart)
  const openEndRel = findTagCloseIndexOutsideQuotes(openSlice)
  if (openEndRel === -1)
    return null
  const openEnd = openStart + openEndRel

  // Self-closing custom tags: treat as a complete block
  if (/\/\s*>\s*$/.test(openSlice.slice(0, openEndRel + 1))) {
    const end = openEnd + 1
    return { raw: source.slice(openStart, end), end }
  }

  let depth = 1
  let i = openEnd + 1

  const isOpenAt = (pos: number) => {
    const s = source.slice(pos)
    return new RegExp(String.raw`^<\s*${lowerTag}(?=\s|>|/)`, 'i').test(s)
  }
  const isCloseAt = (pos: number) => {
    const s = source.slice(pos)
    return new RegExp(String.raw`^<\s*\/\s*${lowerTag}(?=\s|>)`, 'i').test(s)
  }

  while (i < source.length) {
    const lt = source.indexOf('<', i)
    if (lt === -1) {
      // No more tags in the remaining source; treat as unclosed streaming block.
      return { raw: source.slice(openStart), end: source.length }
    }

    if (isCloseAt(lt)) {
      const gt = source.indexOf('>', lt)
      if (gt === -1)
        return null
      depth--
      if (depth === 0) {
        const end = gt + 1
        return { raw: source.slice(openStart, end), end }
      }
      i = gt + 1
      continue
    }

    if (isOpenAt(lt)) {
      const rel = findTagCloseIndexOutsideQuotes(source.slice(lt))
      if (rel === -1)
        return null
      depth++
      i = lt + rel + 1
      continue
    }

    i = lt + 1
  }

  // If the closing tag hasn't arrived yet (streaming), return a partial block
  // from the opening tag to end-of-source. This preserves original lines like
  // `---` so inner markdown can render progressively.
  return { raw: source.slice(openStart), end: source.length }
}

export function parseBasicBlockToken(
  tokens: MarkdownToken[],
  index: number,
  options?: ParseOptions,
): [ParsedNode, number] | null {
  const token = tokens[index]
  switch (token.type) {
    case 'heading_open':
      return [parseHeading(tokens, index, options), index + 3]

    case 'code_block':
      return [parseCodeBlock(token), index + 1]

    case 'fence':
      return [parseFenceToken(token), index + 1]

    case 'math_block':
      return [parseMathBlock(token), index + 1]

    case 'html_block': {
      const htmlBlockNode = parseHtmlBlock(token)
      if (options?.customHtmlTags && htmlBlockNode.tag) {
        const set = new Set(
          options.customHtmlTags
            .map((t) => {
              const raw = String(t ?? '').trim()
              const m = raw.match(/^[<\s/]*([A-Z][\w-]*)/i)
              return m ? m[1].toLowerCase() : ''
            })
            .filter(Boolean),
        )
        if (set.has(htmlBlockNode.tag)) {
          const tag = htmlBlockNode.tag
          // markdown-it can normalize html_block token.content and lose original lines.
          // Re-extract the next full <tag>...</tag> block from the original source.
          const source = String((options as any)?.__sourceMarkdown ?? '')
          const cursor = Number((options as any)?.__customHtmlBlockCursor ?? 0)
          const fromSource = findNextCustomHtmlBlockFromSource(source, tag, cursor)
          if (fromSource)
            (options as any).__customHtmlBlockCursor = fromSource.end

          const rawHtml = String(fromSource?.raw ?? htmlBlockNode.content ?? '')

          const openEnd = findTagCloseIndexOutsideQuotes(rawHtml)
          const closeRe = new RegExp(`<\\s*\\/\\s*${tag}\\s*>`, 'i')
          const closeMatch = closeRe.exec(rawHtml)
          const closeIndex = closeMatch ? closeMatch.index : -1

          let inner = ''
          if (openEnd !== -1) {
            if (closeIndex !== -1 && openEnd < closeIndex)
              inner = rawHtml.slice(openEnd + 1, closeIndex)
            else
              inner = rawHtml.slice(openEnd + 1)
          }

          // Streaming mid-state: if the closing tag is being typed but not yet
          // complete, don't leak the partial `</tag` into content.
          if (closeIndex === -1)
            inner = stripTrailingPartialClosingTag(inner, tag)

          // Parse attrs from the opening tag only
          const attrs: [string, string][] = []
          const openTag = openEnd !== -1 ? rawHtml.slice(0, openEnd + 1) : rawHtml
          const attrRegex = /\s([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
          let m
          while ((m = attrRegex.exec(openTag)) !== null) {
            const name = m[1]
            if (!name || name.toLowerCase() === tag)
              continue
            const value = m[2] || m[3] || m[4] || ''
            attrs.push([name, value])
          }

          return [
            {
              type: tag,
              tag,
              content: stripWrapperNewlines(inner),
              raw: String(fromSource?.raw ?? htmlBlockNode.raw ?? rawHtml),
              loading: htmlBlockNode.loading,
              attrs: attrs.length ? attrs : undefined,
            } as ParsedNode,
            index + 1,
          ]
        }
      }
      return [htmlBlockNode, index + 1]
    }

    case 'table_open': {
      const [tableNode, newIndex] = parseTable(tokens, index, options)
      return [tableNode, newIndex]
    }

    case 'dl_open': {
      const [definitionListNode, newIndex] = parseDefinitionList(tokens, index, options)
      return [definitionListNode, newIndex]
    }

    case 'footnote_open': {
      const [footnoteNode, newIndex] = parseFootnote(tokens, index, options)
      return [footnoteNode, newIndex]
    }

    case 'hr':
      return [parseThematicBreak(), index + 1]
    default:
      break
  }

  return null
}

type ContainerParser = (
  tokens: MarkdownToken[],
  index: number,
  options?: ParseOptions,
) => [AdmonitionNode, number]

type ContainerMatcher = (
  tokens: MarkdownToken[],
  index: number,
  options?: ParseOptions,
) => [AdmonitionNode, number] | null

export function parseCommonBlockToken(
  tokens: MarkdownToken[],
  index: number,
  options?: ParseOptions,
  handlers?: {
    parseContainer?: ContainerParser
    matchAdmonition?: ContainerMatcher
  },
): [ParsedNode, number] | null {
  const basicResult = parseBasicBlockToken(tokens, index, options)
  if (basicResult)
    return basicResult

  const token = tokens[index]
  switch (token.type) {
    case 'container_warning_open':
    case 'container_info_open':
    case 'container_note_open':
    case 'container_tip_open':
    case 'container_danger_open':
    case 'container_caution_open':
    case 'container_error_open': {
      if (handlers?.parseContainer)
        return handlers.parseContainer(tokens, index, options)
      break
    }

    case 'container_open': {
      if (handlers?.matchAdmonition) {
        const result = handlers.matchAdmonition(tokens, index, options)
        if (result)
          return result
      }
      break
    }

    case 'vmr_container_open': {
      return parseVmrContainer(tokens, index, options)
    }
    default:
      break
  }

  return null
}
