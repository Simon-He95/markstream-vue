import type { AdmonitionNode, InternalParseOptions, MarkdownToken, ParagraphNode, ParsedNode, ParseOptions, VmrContainerNode } from '../../types'
import { escapeTagForRegExp, findTagCloseIndexOutsideQuotes } from '../../htmlTagUtils'
import { normalizeCustomTag } from '../customHtmlTags'
import { buildAllowedHtmlTagSet } from '../index'
import { parseInlineTokens } from '../inline-parsers'
import { parseFenceToken } from '../inline-parsers/fence-parser'
import { withInlineSourceStart } from '../inline-source'
import { createLinkifyDemotionContextTracker } from '../linkifyHeuristics'
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

interface HtmlTagSetCacheEntry {
  allowedTagSet: Set<string>
  customTagSet: Set<string> | null
}

let emptyHtmlTagSets: HtmlTagSetCacheEntry | null = null
const HTML_TAG_SET_CACHE = new WeakMap<readonly string[], HtmlTagSetCacheEntry>()

function getEmptyHtmlTagSets() {
  if (!emptyHtmlTagSets) {
    emptyHtmlTagSets = {
      allowedTagSet: buildAllowedHtmlTagSet(),
      customTagSet: null,
    }
  }
  return emptyHtmlTagSets
}

function getHtmlTagSets(customTags?: readonly string[]) {
  if (!customTags || customTags.length === 0)
    return getEmptyHtmlTagSets()
  const cached = HTML_TAG_SET_CACHE.get(customTags)
  if (cached)
    return cached
  const normalized = customTags.map(normalizeCustomTag).filter(Boolean)
  if (!normalized.length) {
    const entry = getEmptyHtmlTagSets()
    HTML_TAG_SET_CACHE.set(customTags, entry)
    return entry
  }
  const entry = {
    allowedTagSet: buildAllowedHtmlTagSet({ customHtmlTags: customTags }),
    customTagSet: new Set(normalized),
  }
  HTML_TAG_SET_CACHE.set(customTags, entry)
  return entry
}

function parseVmrContainer(
  tokens: MarkdownToken[],
  index: number,
  options?: InternalParseOptions,
): [VmrContainerNode, number] {
  const openToken = tokens[index]

  // Extract name from class attribute (e.g., "vmr-container vmr-container-viewcode:topo-test-001")
  // Handle multiple class values by looking for vmr-container-* anywhere in the string
  const attrs = openToken.attrs as [string, string][] | null
  let name = ''
  const containerAttrs: Record<string, string> = {}

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
        // Try to parse JSON values; fallback to raw string if parsing fails
        try {
          containerAttrs[attrName] = JSON.parse(value)
        }
        catch {
          containerAttrs[attrName] = value
        }
      }
    }
  }

  const children: ParsedNode[] = []
  const linkifyContext = createLinkifyDemotionContextTracker(options, true)
  let j = index + 1

  // Parse children until we find the closing token
  while (j < tokens.length && tokens[j].type !== 'vmr_container_close') {
    if (tokens[j].type === 'paragraph_open') {
      // Handle paragraph tokens (plain text)
      const contentToken = tokens[j + 1]
      if (contentToken) {
        const childrenArr = (contentToken.children as MarkdownToken[]) || []
        const paragraphNode = {
          type: 'paragraph',
          children: parseInlineTokens(
            childrenArr || [],
            String(contentToken.content ?? ''),
            undefined,
            withInlineSourceStart(contentToken, linkifyContext.options()),
          ),
          raw: String(contentToken.content ?? ''),
        } as ParsedNode
        children.push(paragraphNode)
        linkifyContext.remember(paragraphNode.raw)
      }
      j += 3 // Skip paragraph_open, inline, paragraph_close
    }
    else if (
      tokens[j].type === 'bullet_list_open'
      || tokens[j].type === 'ordered_list_open'
    ) {
      // Handle list tokens
      const [listNode, newIndex] = parseList(tokens, j, linkifyContext.options())
      children.push(listNode)
      linkifyContext.remember(listNode.raw)
      j = newIndex
    }
    else if (tokens[j].type === 'blockquote_open') {
      // Handle blockquote tokens
      const [blockquoteNode, newIndex] = parseBlockquote(tokens, j, linkifyContext.options())
      children.push(blockquoteNode)
      linkifyContext.remember(blockquoteNode.raw)
      j = newIndex
    }
    else {
      // Handle other basic block tokens (heading, code_block, fence, etc.)
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

  const hasCloseToken = j < tokens.length && tokens[j].type === 'vmr_container_close'
  const closed = hasCloseToken || !!options?.final

  // Build raw content
  let raw = `::: ${name}`
  if (Object.keys(containerAttrs).length > 0) {
    raw += ` ${JSON.stringify(containerAttrs)}`
  }
  raw += '\n'
  if (children.length > 0) {
    // Prefer original Markdown (openToken.raw); rebuilding from tokens may lose formatting.
    raw += openToken.raw ?? children.map(c => c.raw).join('\n')
    raw += '\n'
  }
  raw += ':::'

  const containerNode: VmrContainerNode = {
    type: 'vmr_container',
    name,
    loading: !closed,
    attrs: Object.keys(containerAttrs).length > 0 ? containerAttrs : undefined,
    children,
    raw,
  }

  // Skip the closing token when present; otherwise we're already at the end.
  return [containerNode, hasCloseToken ? (j + 1) : j]
}

function stripWrapperNewlines(s: string) {
  // Preserve inner whitespace/indentation, but drop a single leading/trailing newline
  // introduced by the common pattern: <tag>\n...\n</tag>
  return s.replace(/^\r?\n/, '').replace(/\r?\n$/, '')
}

function stripTrailingPartialClosingTag(inner: string, tag: string) {
  if (!inner || !tag)
    return inner
  const lastOpen = inner.lastIndexOf('<')
  if (lastOpen !== -1) {
    const trailing = inner.slice(lastOpen).trimStart().toLowerCase()
    const closingTag = `</${tag.toLowerCase()}>`
    if (trailing.length > 1 && closingTag.startsWith(trailing))
      return inner.slice(0, lastOpen).replace(/[\t ]+$/g, '')
  }
  const re = new RegExp(String.raw`[\t ]*<\s*\/\s*${tag}[^>]*$`, 'i')
  return inner.replace(re, '')
}

function findMatchingCloseTagRange(
  rawHtml: string,
  tag: string,
  startIndex: number,
) {
  if (!rawHtml || !tag)
    return null

  const lowerTag = tag.toLowerCase()
  const openTagRe = new RegExp(String.raw`^<\s*${escapeTagForRegExp(lowerTag)}(?=\s|>|/)`, 'i')
  const closeTagRe = new RegExp(String.raw`^<\s*\/\s*${escapeTagForRegExp(lowerTag)}(?=\s|>)`, 'i')

  let depth = 0
  let index = Math.max(0, startIndex)

  while (index < rawHtml.length) {
    const lt = rawHtml.indexOf('<', index)
    if (lt === -1)
      break

    const slice = rawHtml.slice(lt)
    if (closeTagRe.test(slice)) {
      const endRel = findTagCloseIndexOutsideQuotes(slice)
      if (endRel === -1)
        return null
      if (depth === 0) {
        return {
          start: lt,
          end: lt + endRel + 1,
        }
      }
      depth--
      index = lt + endRel + 1
      continue
    }

    if (openTagRe.test(slice)) {
      const endRel = findTagCloseIndexOutsideQuotes(slice)
      if (endRel === -1)
        return null
      const raw = slice.slice(0, endRel + 1)
      if (!/\/\s*>$/.test(raw))
        depth++
      index = lt + endRel + 1
      continue
    }

    index = lt + 1
  }

  return null
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

function clampNonNegative(n: number) {
  return Number.isFinite(n) && n > 0 ? n : 0
}

function lineToIndex(source: string, line: number) {
  // markdown-it token.map uses 0-based line numbers.
  const targetLine = clampNonNegative(line)
  if (!source || targetLine <= 0)
    return 0

  let currentLine = 0
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') {
      currentLine++
      if (currentLine === targetLine)
        return i + 1
    }
  }
  return source.length
}

export function parseBasicBlockToken(
  tokens: MarkdownToken[],
  index: number,
  options?: InternalParseOptions,
): [ParsedNode, number] | null {
  const token = tokens[index]
  switch (token.type) {
    case 'heading_open':
      return [parseHeading(tokens, index, options), index + 3]

    case 'code_block': {
      return [parseCodeBlock(token), index + 1]
    }

    case 'fence':
      return [parseFenceToken(token), index + 1]

    case 'math_block':
      return [parseMathBlock(token), index + 1]

    case 'html_block': {
      const htmlBlockNode = parseHtmlBlock(token)
      const tagSets = htmlBlockNode.tag ? getHtmlTagSets(options?.customHtmlTags) : null
      if (htmlBlockNode.tag && htmlBlockNode.loading && tagSets && !tagSets.allowedTagSet.has(htmlBlockNode.tag)) {
        const raw = String(token.content ?? '')
        const content = raw.replace(/\n+$/, '')
        const paragraphNode: ParagraphNode = {
          type: 'paragraph',
          children: content ? [{ type: 'text', content, raw: content }] : [],
          raw: content,
        }
        return [
          paragraphNode,
          index + 1,
        ]
      }
      if (htmlBlockNode.tag && tagSets?.customTagSet?.has(htmlBlockNode.tag)) {
        const tag = htmlBlockNode.tag
        // markdown-it can normalize html_block token.content and lose original lines.
        // Re-extract the next full <tag>...</tag> block from the original source.
        const source = String((options as any)?.__sourceMarkdown ?? '')
        const cursor = Number((options as any)?.__customHtmlSourceCursor ?? (options as any)?.__customHtmlBlockCursor ?? 0)

        // If markdown-it provides a source map for this token, prefer anchoring the
        // re-extraction to that line range. This avoids accidentally matching an
        // earlier occurrence of the same custom tag that was tokenized as inline.
        const mappedLineStart = Array.isArray(token.map)
          ? lineToIndex(source, Number(token.map?.[0] ?? 0))
          : 0
        const searchStart = Math.max(clampNonNegative(cursor), clampNonNegative(mappedLineStart))

        const fromSource = findNextCustomHtmlBlockFromSource(source, tag, searchStart)
        if (fromSource) {
          (options as any).__customHtmlBlockCursor = fromSource.end
          ;(options as any).__customHtmlSourceCursor = fromSource.end
        }

        const rawHtml = String(fromSource?.raw ?? htmlBlockNode.raw ?? '')

        const openEnd = findTagCloseIndexOutsideQuotes(rawHtml)
        const openTag = openEnd !== -1 ? rawHtml.slice(0, openEnd + 1) : rawHtml
        const selfClosing = openEnd !== -1 && /\/\s*>\s*$/.test(openTag)
        const closeRange = openEnd === -1
          ? null
          : findMatchingCloseTagRange(rawHtml, tag, openEnd + 1)
        const closeIndex = closeRange?.start ?? -1

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
        const attrRegex = /\s([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
        let m
        while ((m = attrRegex.exec(openTag)) !== null) {
          const name = m[1]
          if (!name || name.toLowerCase() === tag)
            continue
          const value = m[2] || m[3] || m[4] || ''
          attrs.push([name, value])
        }

        const loading = !options?.final && !selfClosing && closeRange == null

        return [
          {
            type: tag,
            tag,
            content: stripWrapperNewlines(inner),
            raw: String(fromSource?.raw ?? htmlBlockNode.raw ?? rawHtml),
            loading,
            attrs: attrs.length ? attrs : undefined,
          } as ParsedNode,
          index + 1,
        ]
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
