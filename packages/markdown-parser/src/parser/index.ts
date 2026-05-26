import type { MarkdownIt, Token } from 'markdown-it-ts'
import type { MarkdownToken, ParsedNode, ParseOptions } from '../types'
import { normalizeCustomHtmlTags } from '../customHtmlTags'
import { NON_STRUCTURING_HTML_TAGS, STANDARD_HTML_TAGS, VOID_HTML_TAGS } from '../htmlTags'
import { escapeTagForRegExp, findTagCloseIndexOutsideQuotes, parseTagAttrs } from '../htmlTagUtils'
import { parseInlineTokens } from './inline-parsers'
import { parseCommonBlockToken } from './node-parsers/block-token-parser'
import { parseBlockquote } from './node-parsers/blockquote-parser'
import { containerTokenHandlers } from './node-parsers/container-token-handlers'
import { parseHardBreak } from './node-parsers/hardbreak-parser'
import { parseHtmlBlock } from './node-parsers/html-block-parser'
import { parseList } from './node-parsers/list-parser'
import { parseParagraph } from './node-parsers/paragraph-parser'

function getCustomHtmlTagSet(options?: ParseOptions) {
  const custom = options?.customHtmlTags
  if (!Array.isArray(custom) || custom.length === 0)
    return null

  const normalized = normalizeCustomHtmlTags(custom)
  return normalized.length ? new Set(normalized) : null
}

export function buildAllowedHtmlTagSet(options?: ParseOptions) {
  const custom = options?.customHtmlTags
  if (!Array.isArray(custom) || custom.length === 0)
    return STANDARD_HTML_TAGS
  const set = new Set<string>(STANDARD_HTML_TAGS)
  for (const name of normalizeCustomHtmlTags(custom)) {
    if (name)
      set.add(name)
  }
  return set
}

function stringifyInlineNodeRaw(node: ParsedNode) {
  const raw = (node as any)?.raw
  if (typeof raw === 'string')
    return raw

  const content = (node as any)?.content
  if (typeof content === 'string')
    return content

  if ((node as any)?.type === 'hardbreak')
    return '<br>'

  return ''
}

function buildParagraphFromInlineChildren(children: ParsedNode[]): ParsedNode {
  return {
    type: 'paragraph',
    children,
    raw: children.map(stringifyInlineNodeRaw).join(''),
  } as ParsedNode
}

function maybePromoteCustomNodeFromParagraph(node: ParsedNode, options?: ParseOptions) {
  if (node.type !== 'paragraph')
    return null

  const children = Array.isArray((node as any).children) ? ((node as any).children as ParsedNode[]) : []
  if (children.length === 0)
    return null

  const customTagSet = getCustomHtmlTagSet(options)
  if (!customTagSet?.size)
    return null

  let customIndex = -1
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (!customTagSet.has(String(child?.type ?? '').toLowerCase()))
      continue

    const prefixChildren = children.slice(0, i)
    const childContent = String((child as any)?.content ?? '')
    if (!childContent.trim())
      continue
    const prefixHasHardbreak = prefixChildren.some(prefixChild => prefixChild?.type === 'hardbreak')
    if (!prefixHasHardbreak) {
      continue
    }

    customIndex = i
    break
  }
  if (customIndex === -1)
    return null

  const prefixChildren = children.slice(0, customIndex)
  const promoted = children[customIndex]
  if (!promoted)
    return null

  const result: ParsedNode[] = []
  if (prefixChildren.length)
    result.push(buildParagraphFromInlineChildren(prefixChildren))

  result.push(promoted)

  const suffixChildren = children.slice(customIndex + 1)
  if (suffixChildren.length)
    result.push(buildParagraphFromInlineChildren(suffixChildren))

  return result
}

function parseStandaloneHtmlDocument(markdown: string): ParsedNode[] | null {
  const trimmed = markdown.trim()
  if (!trimmed)
    return null

  const startsLikeHtmlDocument = /^(?:<!doctype\s+html[^>]*>\s*)?<html(?:\s[^>]*)?>/i.test(trimmed)
  const endsWithHtmlClose = /<\/html>\s*$/i.test(trimmed)
  if (!startsLikeHtmlDocument || !endsWithHtmlClose)
    return null

  return [
    {
      type: 'html_block',
      tag: 'html',
      raw: markdown,
      content: markdown,
      loading: false,
    } as ParsedNode,
  ]
}

function getMergeableNodeRaw(node: ParsedNode) {
  const raw = (node as any)?.raw
  if (typeof raw === 'string')
    return raw

  const content = (node as any)?.content
  if (typeof content === 'string')
    return content

  return ''
}

function isCloseOnlyHtmlBlockForTag(node: ParsedNode, tag: string) {
  if (node.type !== 'html_block' || !tag)
    return false

  const raw = String((node as any)?.raw ?? (node as any)?.content ?? '')
  return new RegExp(String.raw`^\s*<\s*\/\s*${escapeTagForRegExp(tag)}\s*>\s*$`, 'i').test(raw)
}

function findNextHtmlBlockFromSource(source: string, tag: string, startIndex: number) {
  if (!source || !tag)
    return null

  const lowerTag = tag.toLowerCase()
  const openRe = new RegExp(String.raw`<\s*${escapeTagForRegExp(lowerTag)}(?=\s|>|/)`, 'gi')
  openRe.lastIndex = Math.max(0, startIndex)
  const openMatch = openRe.exec(source)
  if (!openMatch || openMatch.index == null)
    return null

  const start = openMatch.index
  const openSlice = source.slice(start)
  const openEndRel = findTagCloseIndexOutsideQuotes(openSlice)
  if (openEndRel === -1)
    return null

  const openEnd = start + openEndRel
  const openTag = source.slice(start, openEnd + 1)
  if (VOID_HTML_TAGS.has(lowerTag) || /\/\s*>$/.test(openTag)) {
    return {
      raw: openTag,
      start,
      end: openEnd + 1,
      closed: true,
    }
  }

  let depth = 1
  let index = openEnd + 1

  const isOpenAt = (pos: number) => {
    const slice = source.slice(pos)
    return new RegExp(String.raw`^<\s*${escapeTagForRegExp(lowerTag)}(?=\s|>|/)`, 'i').test(slice)
  }
  const isCloseAt = (pos: number) => {
    const slice = source.slice(pos)
    return new RegExp(String.raw`^<\s*\/\s*${escapeTagForRegExp(lowerTag)}(?=\s|>)`, 'i').test(slice)
  }

  while (index < source.length) {
    const lt = source.indexOf('<', index)
    if (lt === -1) {
      return {
        raw: source.slice(start),
        start,
        end: source.length,
        closed: false,
      }
    }

    if (isCloseAt(lt)) {
      const endRel = findTagCloseIndexOutsideQuotes(source.slice(lt))
      if (endRel === -1)
        return null
      depth--
      const end = lt + endRel + 1
      if (depth === 0) {
        return {
          raw: source.slice(start, end),
          start,
          end,
          closed: true,
        }
      }
      index = end
      continue
    }

    if (isOpenAt(lt)) {
      const endRel = findTagCloseIndexOutsideQuotes(source.slice(lt))
      if (endRel === -1)
        return null
      const raw = source.slice(lt, lt + endRel + 1)
      if (!/\/\s*>$/.test(raw))
        depth++
      index = lt + endRel + 1
      continue
    }

    index = lt + 1
  }

  return {
    raw: source.slice(start),
    start,
    end: source.length,
    closed: false,
  }
}

function findApproximateConsumedPrefixEnd(exact: string, approximate: string) {
  if (!approximate)
    return 0

  let i = 0
  let j = 0
  while (i < exact.length && j < approximate.length) {
    if (exact[i] === approximate[j]) {
      i++
      j++
      continue
    }

    if (exact[i] === '\r' || exact[i] === '\n') {
      i++
      continue
    }

    return -1
  }

  return j === approximate.length ? i : -1
}

function buildHtmlBlockContent(raw: string, tag: string, closed: boolean) {
  if (closed)
    return raw
  return `${raw.replace(/<[^>]*$/, '')}\n</${tag}>`
}

function normalizeIndentedSourceForLookup(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/(^|\n)[ \t]{1,4}/g, '$1')
}

function canFindNodeRawAfterSourceIndex(source: string, startIndex: number, nodeRaw: string) {
  if (!nodeRaw)
    return false

  if (source.includes(nodeRaw, startIndex))
    return true

  const tail = source.slice(Math.max(0, startIndex))
  return normalizeIndentedSourceForLookup(tail).includes(normalizeIndentedSourceForLookup(nodeRaw))
}

function extendHtmlBlockCloseToLineEnding(source: string, startIndex: number) {
  let end = Math.max(0, startIndex)

  while (end < source.length && (source[end] === ' ' || source[end] === '\t'))
    end++

  if (source[end] === '\r') {
    end++
    if (source[end] === '\n')
      end++
    return end
  }

  if (source[end] === '\n')
    return end + 1

  return startIndex
}

function isDetailsOpenHtmlBlock(node: ParsedNode) {
  if (node.type !== 'html_block')
    return false
  if (String((node as any).tag ?? '').toLowerCase() !== 'details')
    return false
  const raw = String((node as any).raw ?? (node as any).content ?? '')
  return /^\s*<details\b/i.test(raw)
}

function isDetailsCloseHtmlBlock(node: ParsedNode) {
  if (node.type !== 'html_block')
    return false
  const raw = String((node as any).raw ?? (node as any).content ?? '')
  return /^\s*<\/details\b/i.test(raw)
}

function findLastClosingTagStart(raw: string, tag: string) {
  const closeRe = new RegExp(String.raw`<\s*\/\s*${escapeTagForRegExp(tag)}(?=\s|>)`, 'gi')
  let last = -1
  let match: RegExpExecArray | null

  while ((match = closeRe.exec(raw)) !== null)
    last = match.index

  return last
}

function buildDetailsChildParseOptions(options: ParseOptions, final: boolean): ParseOptions {
  return {
    final,
    requireClosingStrong: options.requireClosingStrong,
    customHtmlTags: options.customHtmlTags,
    validateLink: options.validateLink,
  }
}

const STRUCTURED_HTML_WRAPPER_BLOCK_TYPES = new Set([
  'admonition',
  'blockquote',
  'code_block',
  'definition_list',
  'footnote',
  'heading',
  'list',
  'math_block',
  'table',
  'thematic_break',
])

const STRUCTURED_HTML_WRAPPER_MARKER_RE = /(?:^|\n)\s{0,3}(?:#{1,6}\s+\S|[-+*]\s+\S|\d+[.)]\s+\S|>\s*\S|`{3,}|~{3,}|(?:\*{3,}|-{3,}|_{3,})(?:\s|$)|\|.*\|)/m

function hasStructuredHtmlWrapperMarkers(fragment: string) {
  return /\n\s*\n/.test(fragment) || STRUCTURED_HTML_WRAPPER_MARKER_RE.test(fragment)
}

function shouldStructureGenericHtmlBlockChildren(
  innerRaw: string,
  children: ParsedNode[],
) {
  if (!innerRaw.trim() || children.length === 0)
    return false

  if (children.some(child => STRUCTURED_HTML_WRAPPER_BLOCK_TYPES.has(String(child?.type ?? '').toLowerCase())))
    return true

  if (children.some((child) => {
    if (child?.type !== 'html_block')
      return false
    return Array.isArray((child as any)?.children) && (child as any).children.length > 0
  })) {
    return true
  }

  if (!hasStructuredHtmlWrapperMarkers(innerRaw))
    return false

  if (children.length > 1)
    return true

  const [first] = children
  return Boolean(first && first.type === 'paragraph')
}

function structureGenericHtmlBlockChildren(
  nodes: ParsedNode[],
  md: MarkdownIt,
  options: ParseOptions,
  final: boolean,
): ParsedNode[] {
  return nodes.map((node) => {
    if (node?.type !== 'html_block')
      return node

    const tag = String((node as any)?.tag ?? '').toLowerCase()
    if (!tag || tag === 'details' || NON_STRUCTURING_HTML_TAGS.has(tag) || Array.isArray((node as any)?.children))
      return node

    const raw = String((node as any)?.raw ?? (node as any)?.content ?? '')
    if (!raw)
      return node

    const openEnd = findTagCloseIndexOutsideQuotes(raw)
    if (openEnd === -1)
      return node

    const closeStart = findLastClosingTagStart(raw, tag)
    const hasClose = closeStart !== -1 && closeStart >= openEnd + 1
    const innerRaw = hasClose
      ? raw.slice(openEnd + 1, closeStart)
      : raw.slice(openEnd + 1)

    if (!innerRaw.trim())
      return node

    const children = parseDetailsFragmentChildren(innerRaw, md, buildDetailsChildParseOptions(options, final))
    if (!shouldStructureGenericHtmlBlockChildren(innerRaw, children))
      return node

    return {
      ...node,
      children,
    } as ParsedNode
  })
}

function parseDetailsFragmentChildren(
  fragment: string,
  md: MarkdownIt,
  options: ParseOptions,
) {
  if (!fragment.trim())
    return []

  return parseMarkdownToStructure(fragment, md, options)
}

function buildStructuredSummaryNode(
  summaryRaw: string,
  md: MarkdownIt,
  options: ParseOptions,
) {
  const summaryNode = parseHtmlBlock({ content: summaryRaw } as MarkdownToken) as ParsedNode & Record<string, unknown>
  const openEnd = findTagCloseIndexOutsideQuotes(summaryRaw)
  const closeStart = findLastClosingTagStart(summaryRaw, 'summary')

  if (openEnd !== -1 && closeStart !== -1 && closeStart >= openEnd + 1) {
    const summaryInner = summaryRaw.slice(openEnd + 1, closeStart)
    const children = parseDetailsFragmentChildren(summaryInner, md, options)
    if (children.length > 0)
      summaryNode.children = children
  }

  summaryNode.raw = summaryRaw
  return summaryNode as ParsedNode
}

function buildDetailsPrefixChildren(
  openRaw: string,
  md: MarkdownIt,
  options: ParseOptions,
) {
  const openEnd = findTagCloseIndexOutsideQuotes(openRaw)
  if (openEnd === -1)
    return []

  const innerPrefix = openRaw.slice(openEnd + 1)
  if (!innerPrefix.trim())
    return []

  const summaryBlock = findNextHtmlBlockFromSource(innerPrefix, 'summary', 0)
  if (!summaryBlock)
    return parseDetailsFragmentChildren(innerPrefix, md, options)

  const beforeSummary = innerPrefix.slice(0, summaryBlock.start)
  const afterSummary = innerPrefix.slice(summaryBlock.end)

  return [
    ...parseDetailsFragmentChildren(beforeSummary, md, options),
    buildStructuredSummaryNode(summaryBlock.raw, md, options),
    ...parseDetailsFragmentChildren(afterSummary, md, options),
  ]
}

function combineStructuredDetailsHtmlBlocks(
  nodes: ParsedNode[],
  source: string,
  md: MarkdownIt,
  options: ParseOptions,
  final: boolean,
  sourceCursor = 0,
): [ParsedNode[], number] {
  const merged: ParsedNode[] = []
  let cursor = sourceCursor

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const nodeRaw = getMergeableNodeRaw(node)
    let nodePos = -1
    if (nodeRaw) {
      nodePos = source.indexOf(nodeRaw, cursor)
      if (nodePos !== -1)
        cursor = nodePos + nodeRaw.length
    }

    if (!isDetailsOpenHtmlBlock(node)) {
      merged.push(node)
      continue
    }

    const openRaw = String((node as any).raw ?? getMergeableNodeRaw(node) ?? '')
    const openStart = nodePos !== -1 ? nodePos : source.indexOf(openRaw, Math.max(0, cursor - openRaw.length))
    if (openStart === -1) {
      merged.push(node)
      continue
    }

    let depth = 1
    let closeIndex = -1
    for (let j = i + 1; j < nodes.length; j++) {
      const current = nodes[j]
      if (isDetailsOpenHtmlBlock(current)) {
        depth++
        continue
      }
      if (!isDetailsCloseHtmlBlock(current))
        continue
      depth--
      if (depth === 0) {
        closeIndex = j
        break
      }
    }

    const exact = findNextHtmlBlockFromSource(source, 'details', openStart)
    const selfContained = closeIndex === -1 && exact?.closed === true

    const effectiveOpenRaw = selfContained
      ? (() => {
          const ct = findLastClosingTagStart(openRaw, 'details')
          return ct !== -1 ? openRaw.slice(0, ct) : openRaw
        })()
      : openRaw

    const middleNodes = selfContained
      ? []
      : closeIndex === -1 ? nodes.slice(i + 1) : nodes.slice(i + 1, closeIndex)
    const [children] = combineStructuredDetailsHtmlBlocks(
      middleNodes,
      source,
      md,
      options,
      final,
      openStart + openRaw.length,
    )
    const prefixChildren = buildDetailsPrefixChildren(
      effectiveOpenRaw,
      md,
      buildDetailsChildParseOptions(options, final),
    )

    const closeRaw = closeIndex === -1
      ? '</details>'
      : String((nodes[closeIndex] as any)?.raw ?? getMergeableNodeRaw(nodes[closeIndex]) ?? '</details>')
    const explicitClose = selfContained || (closeIndex !== -1 && exact?.closed === true)
    const trimmedCloseRaw = closeRaw.replace(/[\t\r\n ]+$/, '')
    const closeStart = explicitClose
      ? (() => {
          const closeOffset = (exact?.raw ?? '').lastIndexOf(trimmedCloseRaw)
          return closeOffset === -1 ? source.length : openStart + closeOffset
        })()
      : source.length
    const openTagEndIndex = findTagCloseIndexOutsideQuotes(openRaw)
    const middleSourceStart = selfContained && openTagEndIndex !== -1
      ? openStart + openTagEndIndex + 1
      : openStart + openRaw.length
    const middleSource = source.slice(middleSourceStart, closeStart === -1 ? source.length : closeStart)
    const middleTokens = md.parse(middleSource, { __markstreamFinal: final }) as unknown as MarkdownToken[]
    const renderedMiddle = md.renderer.render(
      middleTokens as unknown as Token[],
      (md as any).options,
      { __markstreamFinal: final },
    )
    const closeMarkupEnd = closeStart + trimmedCloseRaw.length
    const closeSliceEnd = explicitClose
      ? Math.max(closeStart + closeRaw.length, extendHtmlBlockCloseToLineEnding(source, closeMarkupEnd))
      : source.length
    const renderedCloseRaw = explicitClose
      ? source.slice(closeStart, closeSliceEnd)
      : closeRaw
    const mergedRaw = explicitClose
      ? source.slice(openStart, closeSliceEnd)
      : source.slice(openStart)

    const contentPrefix = selfContained && openTagEndIndex !== -1
      ? openRaw.slice(0, openTagEndIndex + 1)
      : openRaw

    merged.push({
      ...(node as any),
      tag: 'details',
      attrs: parseTagAttrs(openRaw.slice(0, openTagEndIndex + 1)),
      raw: mergedRaw,
      content: `${contentPrefix}${renderedMiddle}${renderedCloseRaw}`,
      children: [...prefixChildren, ...children],
      loading: !final && !explicitClose,
    } as ParsedNode)

    cursor = explicitClose ? closeSliceEnd : source.length
    if (closeIndex === -1 && !selfContained)
      break
    if (closeIndex !== -1)
      i = closeIndex
  }

  return [merged, cursor]
}

function mergeSplitTopLevelHtmlBlocks(nodes: ParsedNode[], final: boolean, source: string) {
  if (!source)
    return nodes

  const merged = nodes.slice()
  let sourceHtmlCursor = 0

  for (let i = 0; i < merged.length; i++) {
    const node = merged[i] as any
    const nodeRaw = getMergeableNodeRaw(node)
    const nodePos = nodeRaw ? source.indexOf(nodeRaw, sourceHtmlCursor) : -1
    if (node?.type !== 'html_block') {
      if (nodePos !== -1)
        sourceHtmlCursor = nodePos + nodeRaw.length
      continue
    }

    const tag = String(node?.tag ?? '').toLowerCase()
    if (!tag)
      continue
    if (tag === 'details') {
      if (nodePos !== -1)
        sourceHtmlCursor = nodePos + nodeRaw.length
      continue
    }

    const exact = findNextHtmlBlockFromSource(
      source,
      tag,
      nodePos !== -1 ? nodePos : sourceHtmlCursor,
    )
    if (!exact)
      continue
    sourceHtmlCursor = exact.end

    const currentContent = String(node?.content ?? nodeRaw)
    const currentRaw = String(node?.raw ?? currentContent)
    const nextContent = buildHtmlBlockContent(exact.raw, tag, exact.closed)
    const desiredLoading = !final && !exact.closed
    const needsExpansion = currentContent !== nextContent || currentRaw !== exact.raw || Boolean(node?.loading) !== desiredLoading
    const exactOpenEnd = findTagCloseIndexOutsideQuotes(exact.raw)
    const exactOpenTag = exactOpenEnd === -1 ? '' : exact.raw.slice(0, exactOpenEnd + 1)
    const exactAttrs = exactOpenTag ? parseTagAttrs(exactOpenTag) : []

    node.content = nextContent
    node.raw = exact.raw
    node.loading = desiredLoading
    node.attrs = exactAttrs.length ? exactAttrs : undefined

    if (!needsExpansion)
      continue

    let tailCursor = findApproximateConsumedPrefixEnd(exact.raw, currentRaw)
    if (tailCursor === -1)
      tailCursor = 0

    const j = i + 1
    while (j < merged.length) {
      if (exact.closed && isCloseOnlyHtmlBlockForTag(merged[j], tag)) {
        merged.splice(j, 1)
        continue
      }
      const nextRaw = getMergeableNodeRaw(merged[j])
      if (!nextRaw)
        break
      const nextPos = exact.raw.indexOf(nextRaw, tailCursor)
      if (nextPos === -1) {
        if (canFindNodeRawAfterSourceIndex(source, exact.end, nextRaw))
          break
        merged.splice(j, 1)
        continue
      }
      tailCursor = nextPos + nextRaw.length
      merged.splice(j, 1)
    }
  }

  return merged
}

function stripDanglingHtmlLikeTail(markdown: string) {
  const isWs = (ch: string) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'

  const isLikelyHtmlTagPrefix = (tail: string) => {
    // Deterministic scanner (avoids ReDoS/backtracking regexes).
    // Accepts prefixes like "<think", "</think", "<div class", "<a href=\"x"
    // and treats them as "HTML-ish" tails that can be stripped in streaming mode.
    if (!tail || tail[0] !== '<')
      return false
    if (tail.includes('>'))
      return false

    let i = 1
    // "< " is likely comparison ("x < y"), not a tag
    if (i < tail.length && isWs(tail[i]))
      return false

    if (tail[i] === '/') {
      i++
      // "</ " isn't a tag start
      if (i < tail.length && isWs(tail[i]))
        return false
    }

    const isAlpha = (ch: string) => {
      const c = ch.charCodeAt(0)
      return (c >= 65 && c <= 90) || (c >= 97 && c <= 122)
    }
    const isDigit = (ch: string) => {
      const c = ch.charCodeAt(0)
      return c >= 48 && c <= 57
    }
    const isNameStart = (ch: string) => ch === '!' || isAlpha(ch)
    const isNameChar = (ch: string) => isAlpha(ch) || isDigit(ch) || ch === ':' || ch === '-'
    const isAttrStart = (ch: string) => isAlpha(ch) || isDigit(ch) || ch === '_' || ch === '.' || ch === ':' || ch === '-'
    const isAttrChar = isAttrStart

    if (i >= tail.length || !isNameStart(tail[i]))
      return false

    // tag name
    i++
    while (i < tail.length && isNameChar(tail[i]))
      i++

    while (i < tail.length) {
      // trailing whitespace ok
      while (i < tail.length && isWs(tail[i]))
        i++
      if (i >= tail.length)
        return true

      // allow self-closing slash at end (e.g. "<br/")
      if (tail[i] === '/') {
        i++
        while (i < tail.length && isWs(tail[i]))
          i++
        return i >= tail.length
      }

      // attribute name
      if (!isAttrStart(tail[i]))
        return false
      i++
      while (i < tail.length && isAttrChar(tail[i]))
        i++

      while (i < tail.length && isWs(tail[i]))
        i++

      if (i < tail.length && tail[i] === '=') {
        i++
        while (i < tail.length && isWs(tail[i]))
          i++
        if (i >= tail.length)
          return true // incomplete value

        const quote = tail[i]
        if (quote === '"' || quote === '\'') {
          i++
          while (i < tail.length && tail[i] !== quote)
            i++
          // If we don't see the closing quote (tail ends), it's still a tag prefix
          if (i >= tail.length)
            return true
          i++ // consume closing quote
        }
        else {
          // unquoted value: scan until whitespace or forbidden delimiters
          while (i < tail.length) {
            const ch = tail[i]
            if (isWs(ch) || ch === '<' || ch === '>' || ch === '"' || ch === '\'' || ch === '`')
              break
            i++
          }
          if (i >= tail.length)
            return true // incomplete unquoted value
        }
      }
      // else: boolean attr, continue
    }

    return true
  }

  const isInsideFencedCodeBlock = (src: string, pos: number) => {
    let inFence = false
    let fenceChar: '`' | '~' | '' = ''
    let fenceLen = 0

    const isIndentWs = (ch: string) => ch === ' ' || ch === '\t'

    const parseFenceMarker = (line: string) => {
      let i = 0
      while (i < line.length && isIndentWs(line[i])) i++
      const ch = line[i]
      if (ch !== '`' && ch !== '~')
        return null
      let j = i
      while (j < line.length && line[j] === ch) j++
      const len = j - i
      if (len < 3)
        return null
      return { markerChar: ch as '`' | '~', markerLen: len, rest: line.slice(j) }
    }

    const stripBlockquotePrefix = (line: string) => {
      let i = 0
      while (i < line.length && isIndentWs(line[i])) i++
      let saw = false
      while (i < line.length && line[i] === '>') {
        saw = true
        i++
        while (i < line.length && isIndentWs(line[i])) i++
      }
      return saw ? line.slice(i) : null
    }

    const matchFence = (rawLine: string) => {
      const direct = parseFenceMarker(rawLine)
      if (direct)
        return direct

      const afterQuote = stripBlockquotePrefix(rawLine)
      if (afterQuote == null)
        return null

      return parseFenceMarker(afterQuote)
    }

    let offset = 0
    const lines = src.split(/\r?\n/)
    for (const line of lines) {
      const lineStart = offset
      const lineEnd = offset + line.length

      const pastTargetLine = pos < lineStart
      if (pastTargetLine)
        break

      const fenceMatch = matchFence(line)
      if (fenceMatch) {
        const markerChar = fenceMatch.markerChar
        const markerLen = fenceMatch.markerLen
        if (inFence) {
          if (markerChar === fenceChar && markerLen >= fenceLen) {
            if (/^\s*$/.test(fenceMatch.rest)) {
              inFence = false
              fenceChar = ''
              fenceLen = 0
            }
          }
        }
        else {
          inFence = true
          fenceChar = markerChar
          fenceLen = markerLen
        }
      }

      if (pos <= lineEnd)
        break

      offset = lineEnd + 1
    }

    return inFence
  }

  // In streaming mode it's common to have an incomplete HTML-ish fragment at
  // the very end of the current buffer (e.g. '<fo' or '</think'). Letting it
  // reach markdown-it can produce visible mid-state text nodes. We only strip
  // the *tail* when there is no closing '>' anywhere after the last '<'.
  const s = String(markdown ?? '')
  const lastLt = s.lastIndexOf('<')
  if (lastLt === -1)
    return s
  if (isInsideFencedCodeBlock(s, lastLt))
    return s

  // Only treat it as an HTML-ish tail when "<" looks like a tag start.
  // This avoids truncating normal text/math like "y_{<i}" or "x < y".
  if (lastLt > 0) {
    const prev = s[lastLt - 1]
    const prevIsWs = prev === ' ' || prev === '\t' || prev === '\n' || prev === '\r'
    // Some stream transports escape newlines as "\\n" / "\\r\\n". Treat those
    // sequences as line boundaries too.
    const prev2 = s[lastLt - 2]
    const prevLooksLikeEscapedNewline = (prev === 'n' || prev === 'r') && prev2 === '\\'
    if (!prevIsWs && !prevLooksLikeEscapedNewline)
      return s
  }

  const tail = s.slice(lastLt)
  if (tail.includes('>'))
    return s
  // If the char after '<' is whitespace, it's more likely a comparison ("x < y")
  // than a tag start ("<div").
  if (tail.length > 1 && (tail[1] === ' ' || tail[1] === '\t' || tail[1] === '\n' || tail[1] === '\r'))
    return s

  if (!isLikelyHtmlTagPrefix(tail))
    return s
  return s.slice(0, lastLt)
}

function ensureBlankLineBeforeInlineMultilineCustomHtmlBlocks(markdown: string, tags: string[]) {
  if (!markdown || !tags.length)
    return markdown

  const tagSet = new Set(tags.map(t => String(t ?? '').toLowerCase()).filter(Boolean))
  if (!tagSet.size)
    return markdown

  const isIndentWs = (ch: string) => ch === ' ' || ch === '\t'
  const isNameChar = (ch: string) => {
    const c = ch.charCodeAt(0)
    return (
      (c >= 65 && c <= 90) // A-Z
      || (c >= 97 && c <= 122) // a-z
      || (c >= 48 && c <= 57) // 0-9
      || ch === '_'
      || ch === '-'
      || ch === ':'
    )
  }

  const isIndentedCodeLine = (line: string) => {
    if (!line)
      return false
    if (line[0] === '\t')
      return true
    let spaces = 0
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === ' ') {
        spaces++
        if (spaces >= 4)
          return true
        continue
      }
      if (ch === '\t')
        return true
      break
    }
    return false
  }

  const findTagCloseIndexOutsideQuotes = (input: string) => {
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

  const parseFenceMarker = (line: string) => {
    let i = 0
    while (i < line.length && isIndentWs(line[i])) i++
    const ch = line[i]
    if (ch !== '`' && ch !== '~')
      return null
    let j = i
    while (j < line.length && line[j] === ch) j++
    const len = j - i
    if (len < 3)
      return null
    return { markerChar: ch as '`' | '~', markerLen: len, rest: line.slice(j) }
  }

  const findInlineCustomBlockSplitIndex = (line: string, lineStart: number) => {
    if (isIndentedCodeLine(line))
      return -1

    const trimmed = line.replace(/^[ \t]+/, '')
    if (!trimmed || trimmed.startsWith('>') || trimmed.startsWith('|') || /^(?:[*+-]|\d+[.)])[\t ]+/.test(trimmed))
      return -1

    let hasRenderablePrefix = false
    let i = 0
    while (i < line.length) {
      const ch = line[i]
      if (ch !== '<') {
        if (!isIndentWs(ch))
          hasRenderablePrefix = true
        i++
        continue
      }

      const closeIdxRel = findTagCloseIndexOutsideQuotes(line.slice(i))
      if (closeIdxRel === -1) {
        hasRenderablePrefix = true
        i++
        continue
      }

      const tagSlice = line.slice(i, i + closeIdxRel + 1)
      let cursor = 1
      while (cursor < tagSlice.length && isIndentWs(tagSlice[cursor])) cursor++
      if (cursor >= tagSlice.length) {
        hasRenderablePrefix = true
        i++
        continue
      }

      const marker = tagSlice[cursor]
      if (marker === '!' || marker === '?') {
        hasRenderablePrefix = true
        i += closeIdxRel + 1
        continue
      }

      const isClosing = marker === '/'
      if (isClosing) {
        hasRenderablePrefix = true
        i += closeIdxRel + 1
        continue
      }

      const nameStart = cursor
      while (cursor < tagSlice.length && isNameChar(tagSlice[cursor])) cursor++
      if (cursor === nameStart) {
        hasRenderablePrefix = true
        i++
        continue
      }

      const tagName = tagSlice.slice(nameStart, cursor).toLowerCase()
      const boundary = tagSlice[cursor]
      if (boundary && boundary !== ' ' && boundary !== '\t' && boundary !== '>' && boundary !== '/') {
        hasRenderablePrefix = true
        i++
        continue
      }

      const sameLineCloseRe = new RegExp(String.raw`<\s*\/\s*${tagName}\s*>`, 'i')
      const selfClosing = /\/\s*>$/.test(tagSlice)
      const closesOnSameLine = sameLineCloseRe.test(line.slice(i + closeIdxRel + 1))
      const closesLater = sameLineCloseRe.test(markdown.slice(lineStart + i + closeIdxRel + 1))
      const continuesOnLaterLine = /[\r\n]/.test(markdown.slice(lineStart + i + closeIdxRel + 1))

      if (hasRenderablePrefix && tagSet.has(tagName) && !selfClosing && !closesOnSameLine && (closesLater || continuesOnLaterLine))
        return i

      hasRenderablePrefix = true
      i += closeIdxRel + 1
    }

    return -1
  }

  let inFence = false
  let fenceChar: '`' | '~' | '' = ''
  let fenceLen = 0
  let out = ''
  let idx = 0

  while (idx < markdown.length) {
    const nl = markdown.indexOf('\n', idx)
    const hasNl = nl !== -1
    const isCrlf = hasNl && nl > idx && markdown[nl - 1] === '\r'
    const lineEnd = hasNl ? (isCrlf ? nl - 1 : nl) : markdown.length
    const line = markdown.slice(idx, lineEnd)
    const newline = hasNl ? (isCrlf ? '\r\n' : '\n') : ''

    const fenceMatch = parseFenceMarker(line)
    let nextLine = line
    if (!inFence && !fenceMatch) {
      const splitAt = findInlineCustomBlockSplitIndex(line, idx)
      if (splitAt !== -1) {
        const separator = newline || '\n'
        const before = line.slice(0, splitAt).replace(/[ \t]+$/, '')
        const after = line.slice(splitAt).replace(/^[ \t]+/, '')
        nextLine = `${before}${separator}${separator}${after}`
      }
    }

    out += nextLine
    out += newline

    if (fenceMatch) {
      if (inFence) {
        if (fenceMatch.markerChar === fenceChar && fenceMatch.markerLen >= fenceLen) {
          if (/^\s*$/.test(fenceMatch.rest)) {
            inFence = false
            fenceChar = ''
            fenceLen = 0
          }
        }
      }
      else {
        inFence = true
        fenceChar = fenceMatch.markerChar
        fenceLen = fenceMatch.markerLen
      }
    }

    idx = hasNl ? nl + 1 : markdown.length
  }

  return out
}

function normalizeCustomHtmlOpeningTagSameLine(markdown: string, tags: string[]) {
  if (!markdown || !tags.length)
    return markdown

  const tagSet = new Set(tags.map(t => String(t ?? '').toLowerCase()))
  if (!tagSet.size)
    return markdown

  const isIndentWs = (ch: string) => ch === ' ' || ch === '\t'
  const isNameChar = (ch: string) => {
    const c = ch.charCodeAt(0)
    return (
      (c >= 65 && c <= 90) // A-Z
      || (c >= 97 && c <= 122) // a-z
      || (c >= 48 && c <= 57) // 0-9
      || ch === '_'
      || ch === '-'
    )
  }

  const trimStartIndentWs = (s: string) => {
    let i = 0
    while (i < s.length && isIndentWs(s[i])) i++
    return s.slice(i)
  }

  const findTagCloseIndexOutsideQuotes = (input: string) => {
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

  const hasClosingTagOnLine = (line: string, from: number, tag: string) => {
    const lowerTag = tag.toLowerCase()
    let pos = line.indexOf('<', from)
    while (pos !== -1) {
      let i = pos + 1
      while (i < line.length && isIndentWs(line[i])) i++
      if (i >= line.length || line[i] !== '/') {
        pos = line.indexOf('<', pos + 1)
        continue
      }
      i++
      while (i < line.length && isIndentWs(line[i])) i++
      if (i + lowerTag.length > line.length) {
        pos = line.indexOf('<', pos + 1)
        continue
      }

      // Case-insensitive match for the closing tag name.
      let matched = true
      for (let j = 0; j < lowerTag.length; j++) {
        const ch = line[i + j]
        const lc = ch >= 'A' && ch <= 'Z' ? String.fromCharCode(ch.charCodeAt(0) + 32) : ch
        if (lc !== lowerTag[j]) {
          matched = false
          break
        }
      }
      if (!matched) {
        pos = line.indexOf('<', pos + 1)
        continue
      }

      let k = i + lowerTag.length
      // Ensure exact tag name (no extra name characters).
      if (k < line.length && isNameChar(line[k])) {
        pos = line.indexOf('<', pos + 1)
        continue
      }
      while (k < line.length && isIndentWs(line[k])) k++
      if (k < line.length && line[k] === '>')
        return true

      pos = line.indexOf('<', pos + 1)
    }
    return false
  }

  const normalizeLine = (line: string) => {
    let i = 0
    while (i < line.length && isIndentWs(line[i])) i++
    if (i >= line.length || line[i] !== '<')
      return line

    i++
    while (i < line.length && isIndentWs(line[i])) i++
    if (i >= line.length || line[i] === '/')
      return line

    const nameStart = i
    while (i < line.length && isNameChar(line[i])) i++
    if (i === nameStart)
      return line

    const tagName = line.slice(nameStart, i).toLowerCase()
    if (!tagSet.has(tagName))
      return line

    const gtRel = findTagCloseIndexOutsideQuotes(line.slice(i))
    if (gtRel === -1)
      return line
    const gt = i + gtRel

    if (hasClosingTagOnLine(line, gt + 1, tagName))
      return line

    const rest = trimStartIndentWs(line.slice(gt + 1))
    if (!rest)
      return line

    return `${line.slice(0, gt + 1)}\n${rest}`
  }

  let out = ''
  let idx = 0
  while (idx < markdown.length) {
    const nl = markdown.indexOf('\n', idx)
    if (nl === -1) {
      out += normalizeLine(markdown.slice(idx))
      break
    }

    const isCrlf = nl > idx && markdown[nl - 1] === '\r'
    const lineEnd = isCrlf ? nl - 1 : nl
    const line = markdown.slice(idx, lineEnd)
    out += normalizeLine(line)
    out += isCrlf ? '\r\n' : '\n'
    idx = nl + 1
  }

  return out
}

function ensureBlankLineAfterCustomHtmlCloseBeforeBlockMarkerSameLine(markdown: string, tags: string[]) {
  if (!markdown || !tags.length)
    return markdown

  const tagSet = new Set(tags.map(t => String(t ?? '').toLowerCase()))
  if (!tagSet.size)
    return markdown

  const isIndentWs = (ch: string) => ch === ' ' || ch === '\t'

  const parseBlockquotePrefix = (rawLine: string) => {
    let i = 0
    let saw = false
    let prefixEnd = 0

    while (i < rawLine.length) {
      while (i < rawLine.length && isIndentWs(rawLine[i])) i++
      if (i >= rawLine.length || rawLine[i] !== '>')
        break
      saw = true
      i++
      while (i < rawLine.length && isIndentWs(rawLine[i])) i++
      prefixEnd = i
    }

    if (!saw)
      return null

    const prefix = rawLine.slice(0, prefixEnd)
    return { prefix, content: rawLine.slice(prefixEnd) }
  }

  const parseFenceMarker = (line: string) => {
    let i = 0
    while (i < line.length && isIndentWs(line[i])) i++
    const ch = line[i]
    if (ch !== '`' && ch !== '~')
      return null
    let j = i
    while (j < line.length && line[j] === ch) j++
    const len = j - i
    if (len < 3)
      return null
    return { markerChar: ch as '`' | '~', markerLen: len, rest: line.slice(j) }
  }

  const closeTagRes = Array.from(tagSet).map((tag) => {
    // Insert a blank line after the close tag when the remaining same-line
    // content begins with a block-level marker (e.g. "## ", "- ", "> ", "```", "|", "$$", ":::").
    //
    // Note: this is intentionally conservative and only targets constructs that
    // require line-start to be recognized by markdown-it.
    const blockMarkerLookahead = '(?=[\\t ]*(?:#{1,6}[\\t ]+|>|(?:[*+-]|\\d+[.)])[\\t ]+|(?:`{3,}|~{3,})|\\||\\$\\$|:{3,}|\\[\\^[^\\]]+\\]:|(?:-{3,}|\\*{3,}|_{3,})))'
    return new RegExp(String.raw`(<\s*\/\s*${tag}\s*>)${blockMarkerLookahead}`, 'gi')
  })

  let inFence = false
  let fenceChar: '`' | '~' | '' = ''
  let fenceLen = 0

  let out = ''
  let idx = 0

  while (idx < markdown.length) {
    const nl = markdown.indexOf('\n', idx)
    const hasNl = nl !== -1
    const isCrlf = hasNl && nl > idx && markdown[nl - 1] === '\r'
    const lineEnd = hasNl ? (isCrlf ? nl - 1 : nl) : markdown.length
    const rawLine = markdown.slice(idx, lineEnd)
    const newline = hasNl ? (isCrlf ? '\r\n' : '\n') : ''

    const bq = parseBlockquotePrefix(rawLine)
    const prefix = bq?.prefix ?? ''
    const contentLine = bq?.content ?? rawLine

    // Track fenced code blocks (including those nested in blockquotes) so we
    // don't mutate their contents.
    const fenceMatch = parseFenceMarker(contentLine)
    if (fenceMatch) {
      if (inFence) {
        if (fenceMatch.markerChar === fenceChar && fenceMatch.markerLen >= fenceLen) {
          if (/^\s*$/.test(fenceMatch.rest)) {
            inFence = false
            fenceChar = ''
            fenceLen = 0
          }
        }
      }
      else {
        inFence = true
        fenceChar = fenceMatch.markerChar
        fenceLen = fenceMatch.markerLen
      }
    }

    let nextContent = contentLine
    if (!inFence && nextContent.includes('</')) {
      for (const re of closeTagRes) {
        nextContent = nextContent.replace(re, (match, closeTag: string, offset: number, src: string) => {
          // Inside table rows like:
          //   | A | <my_component></my_component>## heading-like |
          // do not inject blank lines after the closing tag, otherwise the row
          // gets split and table parsing breaks after this custom cell.
          const lineTrimmed = src.replace(/^[\t ]+/, '')
          if (lineTrimmed.startsWith('|'))
            return match

          const before = src.slice(0, offset).replace(/^[\t ]+/, '')
          // Keep same-line boundary splitting conservative:
          // only split when the line starts with the custom tag block itself,
          // or when the close tag is at line start (e.g. "</tag>## heading").
          // This avoids breaking list/blockquote/paragraph inline contexts like:
          // "- text <my_component></my_component>## h"
          // "> text <my_component></my_component>- item"
          // "text <my_component></my_component>## h"
          if (before.length > 0) {
            const closeTagName = closeTag.match(/^<\s*\/\s*([A-Z][\w:-]*)/i)?.[1]?.toLowerCase() ?? ''
            const openTagName = before.match(/^<\s*([A-Z][\w:-]*)/i)?.[1]?.toLowerCase() ?? ''
            if (!closeTagName || !openTagName || closeTagName !== openTagName)
              return match
          }

          return `${closeTag}\n\n`
        })
      }
    }

    if (prefix) {
      const withPrefix = prefix + nextContent.split('\n').join(`\n${prefix}`)
      out += withPrefix
    }
    else {
      out += nextContent
    }

    out += newline
    idx = hasNl ? nl + 1 : markdown.length
  }

  return out
}

function ensureBlankLineBeforeCustomHtmlBlocks(markdown: string, tags: string[]) {
  if (!markdown || !tags.length)
    return markdown

  const tagSet = new Set(tags.map(t => String(t ?? '').toLowerCase()))
  if (!tagSet.size)
    return markdown

  const isIndentWs = (ch: string) => ch === ' ' || ch === '\t'
  const isIndentedCodeLine = (line: string) => {
    if (!line)
      return false
    if (line[0] === '\t')
      return true
    let spaces = 0
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === ' ') {
        spaces++
        if (spaces >= 4)
          return true
        continue
      }
      if (ch === '\t')
        return true
      break
    }
    return false
  }
  const isNameChar = (ch: string) => {
    const c = ch.charCodeAt(0)
    return (
      (c >= 65 && c <= 90) // A-Z
      || (c >= 97 && c <= 122) // a-z
      || (c >= 48 && c <= 57) // 0-9
      || ch === '_'
      || ch === '-'
      || ch === ':'
    )
  }

  const trimStartIndentWs = (s: string) => {
    let i = 0
    while (i < s.length && isIndentWs(s[i])) i++
    return s.slice(i)
  }

  const parseBlockquotePrefix = (rawLine: string) => {
    let i = 0
    let saw = false
    let prefixEnd = 0

    while (i < rawLine.length) {
      // allow indentation before every marker
      while (i < rawLine.length && isIndentWs(rawLine[i])) i++
      if (i >= rawLine.length || rawLine[i] !== '>')
        break
      saw = true
      i++ // consume '>'
      while (i < rawLine.length && isIndentWs(rawLine[i])) i++
      prefixEnd = i
    }

    if (!saw)
      return null

    const prefix = rawLine.slice(0, prefixEnd)
    const key = prefix.replace(/[ \t]+$/, '')
    return {
      prefix,
      key,
      content: rawLine.slice(prefixEnd),
    }
  }

  // Keep behavior conservative: only insert a blank line before a custom tag
  // when it follows a non-blank, non-HTML-ish line. This fixes the common case:
  //
  //   paragraph text
  //   <CustomTag>...</CustomTag>
  //
  // Without the blank line, CommonMark HTML block type 7 cannot interrupt a
  // paragraph, so markdown-it tokenizes the tag as inline HTML inside the
  // paragraph.
  const previousLineLooksHtmlish = (line: string) => {
    const trimmed = trimStartIndentWs(line)
    return trimmed.startsWith('<')
  }

  const lineIsBlank = (line: string) => {
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch !== ' ' && ch !== '\t')
        return false
    }
    return true
  }

  const parseOpeningCustomTagName = (line: string) => {
    if (isIndentedCodeLine(line))
      return ''
    const trimmed = trimStartIndentWs(line)
    if (!trimmed.startsWith('<'))
      return ''

    let i = 1
    while (i < trimmed.length && isIndentWs(trimmed[i])) i++
    if (i >= trimmed.length)
      return ''
    if (trimmed[i] === '/' || trimmed[i] === '!' || trimmed[i] === '?')
      return ''

    const nameStart = i
    while (i < trimmed.length && isNameChar(trimmed[i])) i++
    if (i === nameStart)
      return ''

    const name = trimmed.slice(nameStart, i).toLowerCase()
    if (!tagSet.has(name))
      return ''

    // Require a boundary after tag name to avoid matching prefixes.
    const next = trimmed[i]
    if (next && next !== ' ' && next !== '\t' && next !== '>' && next !== '/')
      return ''

    return name
  }

  const parseLineStartCustomTag = (line: string) => {
    if (isIndentedCodeLine(line))
      return null
    const trimmed = trimStartIndentWs(line)
    if (!trimmed.startsWith('<'))
      return null

    let i = 1
    while (i < trimmed.length && isIndentWs(trimmed[i])) i++
    if (i >= trimmed.length)
      return null

    const isClose = trimmed[i] === '/'
    if (isClose) {
      i++
      while (i < trimmed.length && isIndentWs(trimmed[i])) i++
    }
    // Ignore non-element markup (comments/doctypes/pi)
    const next = trimmed[i]
    if (!next || next === '!' || next === '?')
      return null

    const nameStart = i
    while (i < trimmed.length && isNameChar(trimmed[i])) i++
    if (i === nameStart)
      return null

    const name = trimmed.slice(nameStart, i).toLowerCase()
    if (!tagSet.has(name))
      return null

    // Require boundary after name so we don't match prefixes
    const boundary = trimmed[i]
    if (boundary && boundary !== ' ' && boundary !== '\t' && boundary !== '>' && boundary !== '/')
      return null

    if (isClose)
      return { type: 'close' as const, name }

    // opening tag: treat "<tag .../>" as complete on one line
    if (/\/\s*>\s*$/.test(trimmed))
      return { type: 'open' as const, name, complete: true as const }

    const gt = trimmed.indexOf('>', i)
    if (gt !== -1) {
      const after = trimmed.slice(gt + 1)
      const closeRe = new RegExp(`<\\s*\\/\\s*${name}\\s*>`, 'i')
      if (closeRe.test(after))
        return { type: 'open' as const, name, complete: true as const }
    }

    return { type: 'open' as const, name, complete: false as const }
  }

  const parseStandaloneCompleteHtmlTagLine = (line: string) => {
    if (isIndentedCodeLine(line))
      return null

    const trimmed = trimStartIndentWs(line).replace(/[ \t]+$/, '')
    if (!trimmed.startsWith('<'))
      return null
    if (/^<\s*(?:!--|!doctype\b|\?)/i.test(trimmed))
      return null

    const selfClosingMatch = trimmed.match(/^<\s*([A-Z][\w:-]*)\b[^>]*\/\s*>\s*$/i)
    if (selfClosingMatch?.[1])
      return selfClosingMatch[1].toLowerCase()

    const fullMatch = trimmed.match(/^<\s*([A-Z][\w:-]*)\b[^>]*>[\s\S]*<\s*\/\s*([A-Z][\w:-]*)\s*>\s*$/i)
    if (!fullMatch?.[1] || !fullMatch[2])
      return null

    const openTag = fullMatch[1].toLowerCase()
    const closeTag = fullMatch[2].toLowerCase()
    return openTag === closeTag ? openTag : null
  }

  // Track fenced code blocks so we don't touch their contents.
  let inFence = false
  let fenceChar: '`' | '~' | '' = ''
  let fenceLen = 0

  const parseFenceMarker = (line: string) => {
    let i = 0
    while (i < line.length && isIndentWs(line[i])) i++
    const ch = line[i]
    if (ch !== '`' && ch !== '~')
      return null
    let j = i
    while (j < line.length && line[j] === ch) j++
    const len = j - i
    if (len < 3)
      return null
    return { markerChar: ch as '`' | '~', markerLen: len, rest: line.slice(j) }
  }

  const fenceMatchLine = (rawLine: string) => parseFenceMarker(rawLine)

  const lineStartsWithBlockMarker = (line: string) => {
    const trimmed = trimStartIndentWs(line)
    if (!trimmed)
      return false
    if (isIndentedCodeLine(line))
      return true
    return /^(?:#{1,6}[ \t]+|>|[*+-][ \t]+|\d+[.)][ \t]+|`{3,}|~{3,}|\||\$\$|:{3,}|\[\^[^\]]+\]:|-{3,}|\*{3,}|_{3,})/.test(trimmed)
  }

  const currentCustomBlockNeedsBoundary = (lineStart: number, currentQuoteKey: string, tagName: string) => {
    let scanIdx = lineStart
    let depth = 0

    while (scanIdx < markdown.length) {
      const nl = markdown.indexOf('\n', scanIdx)
      const hasNl = nl !== -1
      const isCrlf = hasNl && nl > scanIdx && markdown[nl - 1] === '\r'
      const lineEnd = hasNl ? (isCrlf ? nl - 1 : nl) : markdown.length
      const rawLine = markdown.slice(scanIdx, lineEnd)

      const blockquote = parseBlockquotePrefix(rawLine)
      const quoteKey = blockquote?.key ?? ''
      if (depth > 0 && currentQuoteKey && quoteKey !== currentQuoteKey)
        break

      const contentLine = blockquote?.content ?? rawLine
      const lineTag = parseLineStartCustomTag(contentLine)

      if (lineTag?.name === tagName) {
        if (lineTag.type === 'open') {
          if (!lineTag.complete)
            depth++
        }
        else if (depth > 0) {
          depth--
          if (depth === 0)
            return false
        }
      }
      else if (depth > 0) {
        if (lineIsBlank(contentLine) || lineStartsWithBlockMarker(contentLine))
          return true
      }

      if (hasNl)
        scanIdx = nl + 1
      else
        break
    }

    return false
  }

  let out = ''
  let idx = 0
  let prevLineBlank = true
  let prevLineHtmlish = false
  let prevLineStandaloneCompleteHtmlTag = false
  // Use the last seen newline sequence to insert a blank line that matches the file.
  let lastNewline = '\n'
  const customBlockStack: string[] = []
  let prevQuoteKey = ''

  while (idx < markdown.length) {
    const nl = markdown.indexOf('\n', idx)
    const hasNl = nl !== -1
    const isCrlf = hasNl && nl > idx && markdown[nl - 1] === '\r'
    const lineEnd = hasNl ? (isCrlf ? nl - 1 : nl) : markdown.length
    const line = markdown.slice(idx, lineEnd)
    const newline = hasNl ? (isCrlf ? '\r\n' : '\n') : ''

    const blockquote = parseBlockquotePrefix(line)
    const quoteKey = blockquote?.key ?? ''
    const contentLine = blockquote?.content ?? line

    // Maintain fence state based on the original line.
    const fenceMatch = fenceMatchLine(contentLine)
    if (fenceMatch) {
      if (inFence) {
        if (fenceMatch.markerChar === fenceChar && fenceMatch.markerLen >= fenceLen) {
          if (/^\s*$/.test(fenceMatch.rest)) {
            inFence = false
            fenceChar = ''
            fenceLen = 0
          }
        }
      }
      else {
        inFence = true
        fenceChar = fenceMatch.markerChar
        fenceLen = fenceMatch.markerLen
      }
    }

    const insideCustomBlock = customBlockStack.length > 0
    if (!inFence && !insideCustomBlock) {
      const opening = parseOpeningCustomTagName(contentLine)
      const needsBoundaryAfterStandaloneHtml
        = !!opening
          && !prevLineBlank
          && prevLineHtmlish
          && prevLineStandaloneCompleteHtmlTag
          && currentCustomBlockNeedsBoundary(idx, quoteKey, opening)
      if (opening && !prevLineBlank && (!prevLineHtmlish || needsBoundaryAfterStandaloneHtml)) {
        // Insert a blank line boundary between the previous paragraph line and the custom block.
        // In blockquotes, the blank line must also carry the `>` markers, otherwise the
        // blockquote would end and the tag would escape the quote.
        if (quoteKey && prevQuoteKey && quoteKey === prevQuoteKey) {
          out += `${quoteKey}${lastNewline}`
        }
        else if (!quoteKey) {
          out += lastNewline
        }
      }
    }

    out += line
    out += newline

    if (newline)
      lastNewline = newline

    // Maintain custom-tag "block stack" only when not inside fenced code.
    // This avoids accidentally inserting blank lines inside <CustomTag> blocks
    // which would mutate their captured inner content.
    if (!inFence) {
      const tag = parseLineStartCustomTag(contentLine)
      if (tag) {
        if (tag.type === 'open') {
          if (!tag.complete)
            customBlockStack.push(tag.name)
        }
        else {
          // Close: pop matching tag (or unwind to it if nesting is malformed)
          for (let j = customBlockStack.length - 1; j >= 0; j--) {
            if (customBlockStack[j] === tag.name) {
              customBlockStack.length = j
              break
            }
          }
        }
      }
    }

    // Update "previous line" info for the next iteration (based on the original line).
    const blank = lineIsBlank(contentLine)
    prevLineBlank = blank
    prevLineHtmlish = !blank && previousLineLooksHtmlish(contentLine)
    prevLineStandaloneCompleteHtmlTag = !blank && !!parseStandaloneCompleteHtmlTagLine(contentLine)
    prevQuoteKey = quoteKey

    idx = hasNl ? nl + 1 : markdown.length
  }

  return out
}

export function parseMarkdownToStructure(
  markdown: string,
  md: MarkdownIt,
  options: ParseOptions = {},
): ParsedNode[] {
  const isFinal = !!options.final
  // Ensure markdown is a string — guard against null/undefined inputs from callers
  // todo: 下面的特殊 math 其实应该更精确匹配到() 或者 $$ $$ 或者 \[ \] 内部的内容
  let safeMarkdown = (markdown ?? '').toString().replace(/([^\\])\r(ight|ho)/g, '$1\\r$2').replace(/([^\\])\n(abla|eq|ot|exists)/g, '$1\\n$2')
  if (!isFinal) {
    if (safeMarkdown.endsWith('- *')) {
      // 放置markdown 解析 - * 会被处理成多个 ul >li 嵌套列表
      safeMarkdown = safeMarkdown.replace(/- \*$/, '- \\*')
    }
    if (/(?:^|\n)\s*-\s*$/.test(safeMarkdown)) {
      // streaming 中间态：单独的 "-" 行（或以换行结尾的 "-\n"）会被渲染成文本/列表前缀，
      // 也会导致输入 "---" 时第一个 "-" 先闪出来再跳成 hr。
      safeMarkdown = safeMarkdown.replace(/(?:^|\n)\s*-\s*$/, (m) => {
        return m.startsWith('\n') ? '\n' : ''
      })
    }
    else if (/(?:^|\n)\s*--\s*$/.test(safeMarkdown)) {
      // streaming 中间态：输入 "---" 时的 "--" 前缀也不应该作为文本渲染，避免跳动。
      safeMarkdown = safeMarkdown.replace(/(?:^|\n)\s*--\s*$/, (m) => {
        return m.startsWith('\n') ? '\n' : ''
      })
    }
    else if (/(?:^|\n)\s*>\s*$/.test(safeMarkdown)) {
      // streaming 中间态：单独的 ">" 行会先被识别成 blockquote，导致 UI 闪烁/跳动。
      // 只裁剪末尾这一个 marker，等后续内容到齐再正常解析。
      safeMarkdown = safeMarkdown.replace(/(?:^|\n)\s*>\s*$/, (m) => {
        return m.startsWith('\n') ? '\n' : ''
      })
    }
    else if (/\n\s*[*+]\s*$/.test(safeMarkdown)) {
      // streaming 中间态：单独的 "*"/"+" 行会被识别成空的 list item，导致 UI 闪出一个圆点
      safeMarkdown = safeMarkdown.replace(/\n\s*[*+]\s*$/, '\n')
    }
    else if (/(?:^|\n)\s*\d+\s*$/.test(safeMarkdown)) {
      // streaming 中间态：单独的 "2" / "10" 行常是有序列表 marker 的前缀（下一字符才到 "." / ")"）。
      // 在此状态下 markdown-it 会把它解析成 paragraph/text，导致先撑开一段空白再被下一次解析替换，形成抖动。
      // 只裁剪末尾这一行，等 marker 完整或有内容后再正常解析。
      // 但当整个文档本身就是纯数字（例如 "1234567"）时，这不是列表前缀，而是正常文本内容，
      // 不应被裁剪为空，否则会导致 parse 结果一直为空。
      if (!/^\d+$/.test(safeMarkdown.trim())) {
        safeMarkdown = safeMarkdown.replace(/(?:^|\n)\s*\d+\s*$/, (m) => {
          return m.startsWith('\n') ? '\n' : ''
        })
      }
    }
    else if (/(?:^|\n)\s*\d+[.)]\s+\*{1,3}\s*$/.test(safeMarkdown)) {
      // streaming 中间态：有序列表项刚开始输出 "**"（粗体）时，常会经历 "1. *" / "1. **" 等尾部状态。
      // markdown-it 在这些状态下可能把 "*" 当作空的 bullet list marker（嵌套列表），导致 UI 先闪一个圆点/空块再恢复。
      // 将尾部孤立的星号临时转义，避免被当作列表 marker。
      safeMarkdown = safeMarkdown.replace(
        /((?:^|\n)\s*\d+[.)]\s+)(\*{1,3})\s*$/,
        (_, prefix: string, stars: string) => `${prefix}${stars.split('').map(() => '\\*').join('')}`,
      )
    }
    else if (/(?:^|\n)\s*\d+[.)]\s*$/.test(safeMarkdown)) {
      // streaming 中间态：单独的 "2." / "3)" 行会先被渲染成列表/段落占位，随后合并成真正的 list item，导致抖动。
      // 裁剪末尾这一个 marker，等后续内容到齐再正常解析。
      safeMarkdown = safeMarkdown.replace(/(?:^|\n)\s*\d+[.)]\s*$/, (m) => {
        return m.startsWith('\n') ? '\n' : ''
      })
    }
    else if (/\n[[(]\n*$/.test(safeMarkdown)) {
      // 此时 markdown 解析会出错要跳过
      safeMarkdown = safeMarkdown.replace(/(\n\[|\n\()+\n*$/g, '\n')
    }
  }

  // For custom HTML-like blocks (e.g. <thinking>...</thinking>), markdown-it may
  // keep parsing subsequent lines as part of the HTML block unless there's a
  // blank line boundary. To ensure content immediately following a closing tag
  // (like a list/table/blockquote/fence) is parsed as Markdown blocks, insert
  // a single empty line after the closing tag when the next line begins with a
  // block-level marker.
  if (options.customHtmlTags?.length && safeMarkdown.includes('<')) {
    const tags = normalizeCustomHtmlTags(options.customHtmlTags)

    if (tags.length) {
      safeMarkdown = ensureBlankLineBeforeInlineMultilineCustomHtmlBlocks(safeMarkdown, tags)
      // markdown-it doesn't always treat custom tags as html_block when the opening
      // tag and the first content token live on the same line (e.g. "<thinking> foo").
      // That causes the tag to be parsed as inline HTML and breaks custom block parsing.
      // Normalize "<tag> ..." (line-start only) into "<tag>\n..." so it becomes a block.
      safeMarkdown = normalizeCustomHtmlOpeningTagSameLine(safeMarkdown, tags)
      // CommonMark HTML blocks of type 7 cannot interrupt paragraphs. When a custom
      // tag line (e.g. "<RadioBtn>") immediately follows paragraph text, markdown-it
      // will tokenize it as inline HTML and merge it into the paragraph. Insert a
      // blank line boundary before custom tags that follow non-HTML-ish text lines.
      safeMarkdown = ensureBlankLineBeforeCustomHtmlBlocks(safeMarkdown, tags)
      // In streaming output, models sometimes emit "</tag>## Heading" without a
      // newline after the custom block close. Split it into separate lines so the
      // "##" can be parsed as a heading (and to avoid being swallowed by HTML block parsing).
      safeMarkdown = ensureBlankLineAfterCustomHtmlCloseBeforeBlockMarkerSameLine(safeMarkdown, tags)

      // Fast path: no closing tag marker at all.
      if (!safeMarkdown.includes('</')) {
        // no-op
      }
      else {
        for (const tag of tags) {
          const re = new RegExp(
          // After a closing tag at end-of-line, if the next line is not blank
          // (ignoring whitespace) and we're not at end-of-string, insert a
          // blank line to force markdown-it to resume normal block parsing.
          // Restrict to lines that contain ONLY the closing tag (plus whitespace)
          // to avoid affecting inline occurrences like "x</thinking>y".
            String.raw`(^[\t ]*<\s*\/\s*${tag}\s*>[\t ]*)(\r?\n)(?![\t ]*\r?\n|$)`,
            'gim',
          )
          safeMarkdown = safeMarkdown.replace(re, '$1$2$2')
        }
      }
    }
  }

  // 마지막에 남아있는 미완성 '<...'(예: '<fo', '</think') 꼬리 조각은
  // streaming 중간 상태에서 화면에 그대로 찍힐 수 있으므로, markdown-it
  // 파싱 전에 제거한다.
  if (!isFinal)
    safeMarkdown = stripDanglingHtmlLikeTail(safeMarkdown)

  const standaloneHtmlDocument = parseStandaloneHtmlDocument(safeMarkdown)
  if (standaloneHtmlDocument) {
    // Keep pre/post hooks observable for callers that rely on them for
    // instrumentation, but preserve the full-document html_block shape.
    const preHook = options.preTransformTokens
    const postHook = options.postTransformTokens
    if (typeof preHook === 'function' || typeof postHook === 'function') {
      const rawTokens = md.parse(safeMarkdown, { __markstreamFinal: isFinal }) as unknown as MarkdownToken[]
      const hookedTokens = typeof preHook === 'function' ? (preHook(rawTokens) || rawTokens) : rawTokens
      if (typeof postHook === 'function')
        postHook(hookedTokens)
    }
    return standaloneHtmlDocument
  }

  // Get tokens from markdown-it
  const tokens = md.parse(safeMarkdown, { __markstreamFinal: isFinal })
  // Defensive: ensure tokens is an array
  if (!tokens || !Array.isArray(tokens))
    return []
  // Allow consumers to transform tokens before processing
  const pre = options.preTransformTokens
  const post = options.postTransformTokens
  let transformedTokens = tokens as unknown as MarkdownToken[]
  if (pre && typeof pre === 'function') {
    transformedTokens = pre(transformedTokens) || transformedTokens
  }

  // Process the tokens into our structured format.
  // Note: markdown-it's `html_block` token.content can be normalized in ways
  // that drop some original lines. Keep the original source around so block
  // parsers can reconstruct raw slices using token.map when needed.
  // Respect link validation from the md instance so customMarkdownIt(md) with
  // md.set({ validateLink }) is applied when we emit link nodes (tokens may
  // bypass the tokenizer's link rule, e.g. synthetic links from fixLinkTokens).
  const mdAny = md as { options?: { validateLink?: (url: string) => boolean }, validateLink?: (url: string) => boolean }
  const validateLink = options.validateLink ?? mdAny.options?.validateLink ?? (typeof mdAny.validateLink === 'function' ? mdAny.validateLink : undefined)
  const internalOptions = {
    ...options,
    validateLink,
    __markdownIt: md,
    __sourceMarkdown: safeMarkdown,
    __customHtmlSourceCursor: 0,
    __customHtmlBlockCursor: 0,
  } as any
  let result = processTokens(transformedTokens, internalOptions)

  // Backwards compatible token-level post hook: if provided and returns
  // a modified token array, re-process tokens and override node-level result.
  if (post && typeof post === 'function') {
    const postResult = post(transformedTokens)
    if (Array.isArray(postResult)) {
      // Backwards compatibility: if the hook returns an array of tokens
      // (they have a `type` string property), re-process them into nodes.
      const first = (postResult as unknown[])[0] as unknown
      const firstType = (first as Record<string, unknown>)?.type
      if (first && typeof firstType === 'string') {
        result = processTokens(postResult as unknown as MarkdownToken[])
      }
      else {
        // Otherwise assume it returned ParsedNode[] and use it as-is
        result = postResult as unknown as ParsedNode[]
      }
    }
  }

  result = mergeSplitTopLevelHtmlBlocks(result, isFinal, safeMarkdown)
  result = combineStructuredDetailsHtmlBlocks(result, safeMarkdown, md, options, isFinal)[0]
  result = structureGenericHtmlBlockChildren(result, md, options, isFinal)

  if (isFinal) {
    const seen = new WeakSet<object>()
    const finalizeHtmlBlockLoading = (value: unknown) => {
      if (!value || typeof value !== 'object')
        return
      if (seen.has(value as object))
        return
      seen.add(value as object)

      if (Array.isArray(value)) {
        for (const item of value)
          finalizeHtmlBlockLoading(item)
        return
      }

      const node = value as Record<string, unknown>
      if (node.type === 'html_block' && node.loading === true)
        node.loading = false

      for (const child of Object.values(node))
        finalizeHtmlBlockLoading(child)
    }

    finalizeHtmlBlockLoading(result)
  }

  if (options.debug) {
    console.log('Parsed Markdown Tree Structure:', result)
  }
  return result
}

// Process markdown-it tokens into our structured format
export function processTokens(tokens: MarkdownToken[], options?: ParseOptions): ParsedNode[] {
  // Defensive: ensure tokens is an array
  if (!tokens || !Array.isArray(tokens))
    return []

  const result: ParsedNode[] = []
  let i = 0
  // Note: table token normalization is applied during markdown-it parsing
  // via the `applyFixTableTokens` plugin (core.ruler.after('block')).
  // Link/strong/list-item fixes are applied during the inline stage by
  // their respective plugins. That keeps parsing-time fixes centralized
  // and avoids ad-hoc post-processing here.
  while (i < tokens.length) {
    const handled = parseCommonBlockToken(tokens, i, options, containerTokenHandlers)
    if (handled) {
      result.push(handled[0])
      i = handled[1]
      continue
    }

    const token = tokens[i]
    switch (token.type) {
      case 'paragraph_open':
      {
        const paragraphNode = parseParagraph(tokens, i, options) as ParsedNode
        const promoted = maybePromoteCustomNodeFromParagraph(paragraphNode, options)
        if (promoted)
          result.push(...promoted)
        else
          result.push(paragraphNode)
        i += 3 // Skip paragraph_open, inline, paragraph_close
        break
      }

      case 'bullet_list_open':
      case 'ordered_list_open': {
        const [listNode, newIndex] = parseList(tokens, i, options)
        result.push(listNode)
        i = newIndex
        break
      }

      case 'blockquote_open': {
        const [blockquoteNode, newIndex] = parseBlockquote(tokens, i, options)
        result.push(blockquoteNode)
        i = newIndex
        break
      }

      case 'footnote_anchor':{
        const meta = (token.meta ?? {}) as Record<string, unknown>
        const id = String(meta.label ?? token.content ?? '')
        result.push({
          type: 'footnote_anchor',
          id,
          raw: String(token.content ?? ''),
        } as ParsedNode)

        i++
        break
      }

      case 'hardbreak':
        result.push(parseHardBreak())
        i++
        break

      case 'text': {
        const content = String(token.content ?? '')
        // In stream mode, markdown-it can occasionally emit a root-level `text`
        // token (e.g. immediately after an HTML/custom block closes). Treat it
        // as a normal paragraph so the content isn't dropped.
        result.push({
          type: 'paragraph',
          raw: content,
          children: content
            ? [{ type: 'text', content, raw: content } as ParsedNode]
            : [],
        } as ParsedNode)
        i++
        break
      }

      case 'inline':
        // In stream mode and after token-fix plugins (e.g. custom HTML blocks),
        // markdown-it can occasionally emit a root-level `inline` token (not
        // wrapped in paragraph_open/close).
        //
        // - If it expands to inline siblings like "我是" + "**strong**", renderers
        //   that virtualize/wrap each top-level node in a block container will
        //   introduce unintended line breaks between those inline siblings.
        // - If it expands to one or more standalone `html_block` nodes, keep the
        //   historical behavior and emit them as top-level blocks (not wrapped in
        //   a paragraph), since they represent block-like HTML structures.
        {
          const parsed = parseInlineTokens(token.children || [], String(token.content ?? ''), undefined, options as any)
          if (parsed.length === 0) {
            // no-op (matches previous behavior)
          }
          else if (parsed.every(n => n.type === 'html_block')) {
            result.push(...parsed)
          }
          else {
            const paragraphNode = {
              type: 'paragraph',
              raw: String(token.content ?? ''),
              children: parsed,
            } as ParsedNode
            const promoted = maybePromoteCustomNodeFromParagraph(paragraphNode, options)
            if (promoted)
              result.push(...promoted)
            else
              result.push(paragraphNode)
          }
        }
        i += 1
        break
      default:
        // Handle other token types or skip them
        i += 1
        break
    }
  }

  return result
}

export { parseInlineTokens }
