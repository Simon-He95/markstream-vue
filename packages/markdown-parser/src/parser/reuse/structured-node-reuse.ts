import type { Token } from '../../markdown-it-types'
import type { MarkdownToken, ParsedNode, ParseOptions } from '../../types'
import type { ParseContext } from '../parse-context'
import type { ParserRuntime, StructuredStreamRuntimeState } from '../runtime'
import { isCacheStableLinkValidator, readSyntheticLinkOrigin } from '../../plugins/linkTokenMetadata'
import { getTopLevelStreamParseMode, shouldUseTopLevelStreamParse } from '../streaming/tokenizer'

interface ReusableTopLevelTokenGroups {
  mixed: boolean
  starts: number[]
}

interface StructuredNodeReuseCallbacks {
  processTokens: (tokens: MarkdownToken[], options: ParseContext) => ParsedNode[]
  recordReusedTopLevelNodes?: (count: number) => void
}

const REUSABLE_INLINE_TOKEN_TYPES = new Set([
  'code_inline',
  'em_close',
  'em_open',
  'emoji',
  'hardbreak',
  'html_block',
  'html_inline',
  'image',
  'ins_close',
  'ins_open',
  'link',
  'link_close',
  'link_open',
  'mark_close',
  'mark_open',
  'math_inline',
  's_close',
  's_open',
  'softbreak',
  'strong_close',
  'strong_open',
  'sub',
  'sup',
  'text',
])
const REUSABLE_TOP_LEVEL_PAIRED_TOKEN_TYPES = new Map([
  ['paragraph_open', 'paragraph_close'],
  ['heading_open', 'heading_close'],
  ['bullet_list_open', 'bullet_list_close'],
  ['ordered_list_open', 'ordered_list_close'],
  ['blockquote_open', 'blockquote_close'],
  ['table_open', 'table_close'],
])
const REUSABLE_TOP_LEVEL_SINGLE_TOKEN_TYPES = new Set([
  'code_block',
  'fence',
  'hr',
  'html_block',
  'inline',
  'math_block',
])

const FINAL_INVARIANT_BLOCK_TOKENS = new Set([
  'paragraph_open',
  'paragraph_close',
  'heading_open',
  'heading_close',
  'bullet_list_open',
  'bullet_list_close',
  'ordered_list_open',
  'ordered_list_close',
  'list_item_open',
  'list_item_close',
  'blockquote_open',
  'blockquote_close',
])

export function reuseFinalizedStreamNodes(runtime: ParserRuntime, source: string, options: ParseContext) {
  const previous = runtime.structuredStream
  if (!previous || options.final !== true || options.isFragment
    || options.reuseStableTopLevelNodes !== true
    || options.preTransformTokens || options.postTransformTokens || options.postTransformNodes
    || options.customHtmlTags?.length || options.includeSourceMap
    || (runtime.markdownIt as unknown as Record<string, unknown>).__markstreamHasCustomParserExtensions
    || runtime.safeMarkdown?.source !== source || runtime.safeMarkdown.safeMarkdown !== source
    || previous.source !== source) {
    return undefined
  }

  // Only reuse syntax whose final form is proven by the tokenizer. Literal
  // recovery markers, HTML, math, tables and extensions need the full final pass.
  for (const token of previous.tokens) {
    if (FINAL_INVARIANT_BLOCK_TOKENS.has(token.type))
      continue
    if (token.type !== 'inline' || !Array.isArray(token.children))
      return undefined
    let reconstructed = ''
    for (const child of token.children) {
      if (child.type === 'text') {
        if (typeof child.content !== 'string')
          return undefined
        if (/[\\`*_[\]$<>|]/.test(child.content) || /\(\s*$/.test(child.content))
          return undefined
        reconstructed += child.content
      }
      else if (child.type === 'softbreak') {
        reconstructed += '\n'
      }
      else if (child.type === 'code_inline') {
        if (!child.markup)
          return undefined
        reconstructed += child.markup + child.content + child.markup
      }
      else if (child.type === 'strong_open' || child.type === 'strong_close'
        || child.type === 'em_open' || child.type === 'em_close') {
        reconstructed += child.markup
      }
      else {
        return undefined
      }
    }
    if (reconstructed !== token.content)
      return undefined
  }
  return previous.nodes
}

function hasOnlyReusableInlineTokens(tokens: MarkdownToken[], validateLink: ParseOptions['validateLink']): boolean {
  return tokens.every((token) => {
    if (!REUSABLE_INLINE_TOKEN_TYPES.has(token.type))
      return false
    if (
      (token.type === 'link' || token.type === 'link_open' || token.type === 'link_close')
      && !isCacheStableLinkValidator(validateLink)
    ) {
      return false
    }
    if (token.type === 'link') {
      // fixLinkTokens emits `link` single tokens with a recorded origin.
      // explicit/linkify/autolink origins produce nodes deterministically
      // from the token + its inline group (recovery paths are group-local);
      // `recovery` tokens are emitted for broken streaming link tails and
      // stay excluded.
      const origin = readSyntheticLinkOrigin(token)
      if (origin !== 'explicit' && origin !== 'linkify' && origin !== 'autolink')
        return false
    }
    if (token.type === 'link_open' || token.type === 'link_close') {
      // Explicit links carry an empty markup. markdown-it linkify emits
      // `link_open`/`link_close` pairs with markup `linkify`/`autolink`;
      // their node output is deterministic given the token, and the tail
      // re-parse restores the linkify demotion context at the reused prefix
      // boundary, so these pairs are safe to reuse.
      const markup = token.markup ?? ''
      if (markup !== '' && markup !== 'linkify' && markup !== 'autolink')
        return false
    }

    const children = token.children as MarkdownToken[] | null
    return !Array.isArray(children) || hasOnlyReusableInlineTokens(children, validateLink)
  })
}

function getReusableTopLevelPairedCloseType(tokenType: string) {
  const known = REUSABLE_TOP_LEVEL_PAIRED_TOKEN_TYPES.get(tokenType)
  if (known)
    return known

  // markdown-it-container emits `container_<kind>_open` / `container_<kind>_close`
  // at level 0 for every registered container name. The node output is a pure
  // function of the token pair (attrs/info + children), so these groups are as
  // reusable as the statically known pairs.
  const containerMatch = /^container_(.+)_open$/.exec(tokenType)
  return containerMatch ? `container_${containerMatch[1]}_close` : undefined
}

/**
 * Compute reusable top-level token groups. With `startIndex > 0` the prefix is
 * assumed to have been validated on a previous call (the caller only does this
 * when the token array identity proves the prefix is unchanged), so only the
 * tail tokens are scanned.
 */
function getReusableTopLevelTokenGroups(
  tokens: MarkdownToken[],
  validateLink: ParseOptions['validateLink'],
  startIndex = 0,
): ReusableTopLevelTokenGroups | null {
  const groupStarts: number[] = []
  let mixed = false
  let index = startIndex

  while (index < tokens.length) {
    const token = tokens[index]
    if (!token || token.level !== 0)
      return null

    const closeType = getReusableTopLevelPairedCloseType(token.type)
    let groupEnd = index + 1

    if (closeType) {
      if (token.nesting !== 1)
        return null

      while (groupEnd < tokens.length) {
        const current = tokens[groupEnd]
        if (current.level === 0) {
          if (current.type !== closeType || current.nesting !== -1)
            return null
          groupEnd++
          break
        }
        groupEnd++
      }

      if (tokens[groupEnd - 1]?.type !== closeType)
        return null

      if (token.type === 'paragraph_open' || token.type === 'heading_open') {
        if (groupEnd !== index + 3 || tokens[index + 1]?.type !== 'inline')
          return null
      }
      else {
        mixed = true
      }
    }
    else if (REUSABLE_TOP_LEVEL_SINGLE_TOKEN_TYPES.has(token.type)) {
      if (token.nesting !== 0)
        return null
      mixed = true
    }
    else {
      return null
    }

    for (let tokenIndex = index; tokenIndex < groupEnd; tokenIndex++) {
      const current = tokens[tokenIndex]
      if (current.type !== 'inline')
        continue
      const children = current.children as MarkdownToken[] | null
      if (!Array.isArray(children) || !hasOnlyReusableInlineTokens(children, validateLink))
        return null
    }

    groupStarts.push(index)
    index = groupEnd
  }

  return {
    mixed,
    starts: groupStarts,
  }
}

function sourceEndsWithBlankLine(source: string) {
  let index = source.length - 1
  while (source.charCodeAt(index) === 32 || source.charCodeAt(index) === 9)
    index--
  if (source.charCodeAt(index--) !== 10)
    return false
  if (source.charCodeAt(index) === 13)
    index--
  while (source.charCodeAt(index) === 32 || source.charCodeAt(index) === 9)
    index--
  return source.charCodeAt(index) === 10
}

export function canReuseStructuredStreamNodes(options: ParseOptions) {
  return options.reuseStableTopLevelNodes === true
    && options.final !== true
    && !options.preTransformTokens
    && !options.postTransformTokens
    && !options.postTransformNodes
    && !options.customHtmlTags?.length
    && options.includeSourceMap !== true
}

function sameTokenMap(left: Token | MarkdownToken | undefined, right: Token | MarkdownToken | undefined) {
  const leftMap = left?.map
  const rightMap = right?.map

  if (leftMap === rightMap)
    return true

  if (!Array.isArray(leftMap) || !Array.isArray(rightMap))
    return false

  return leftMap.length === rightMap.length
    && leftMap.every((value, index) => value === rightMap[index])
}

function sameTokenAttrs(left: Token | MarkdownToken | undefined, right: Token | MarkdownToken | undefined) {
  const leftAttrs = left?.attrs
  const rightAttrs = right?.attrs

  if (leftAttrs === rightAttrs)
    return true

  if (!Array.isArray(leftAttrs) || !Array.isArray(rightAttrs))
    return false

  if (leftAttrs.length !== rightAttrs.length)
    return false

  for (let index = 0; index < leftAttrs.length; index++) {
    const leftAttr = leftAttrs[index]
    const rightAttr = rightAttrs[index]
    if (leftAttr[0] !== rightAttr[0] || leftAttr[1] !== rightAttr[1])
      return false
  }

  return true
}

/**
 * Shape equality for reuse-boundary tokens, used when the stream parser
 * recreates prefix tokens after a full re-parse or a container tail merge
 * (identity comparison fails because the tokens are new objects).
 *
 * Correctness rests on markdown-it tokenization being a deterministic
 * function of the source text: identical source in the stream re-parse
 * yields tokens with identical shape INCLUDING fields not compared here
 * (children, meta, interior group tokens). The shape fallback therefore
 * never detects a change that identity comparison would have caught; it
 * only re-admits groups whose source provably did not change (interior
 * groups never receive appended content). `level` is compared because a
 * re-parsed boundary token at a different nesting depth cannot be the
 * same group.
 */
function isSameTokenShapeForReuse(left: Token | MarkdownToken | undefined, right: Token | MarkdownToken | undefined) {
  return !!left
    && !!right
    && left.type === right.type
    && left.tag === right.tag
    && left.nesting === right.nesting
    && left.level === right.level
    && left.markup === right.markup
    && left.content === right.content
    && left.info === right.info
    && sameTokenMap(left, right)
    && sameTokenAttrs(left, right)
}

function updateStructuredStreamCache(
  runtime: ParserRuntime,
  source: string,
  tokens: MarkdownToken[],
  groups: ReusableTopLevelTokenGroups,
  nodes: ParsedNode[],
  options: ParseOptions,
  linkifyDemotionContexts?: ParseContext['linkifyDemotionResultContexts'],
  linkifyDemotionContextOffset = 0,
  fallbackLinkifyDemotionContext?: ParseContext['linkifyDemotionSeedContext'],
) {
  const groupStarts = groups.starts
  if (groupStarts.length === 0 || nodes.length !== groupStarts.length) {
    runtime.structuredStream = undefined
    return
  }

  const groupBoundaries = groupStarts.map((start, index) => {
    const end = groupStarts[index + 1] ?? tokens.length
    return {
      firstToken: tokens[start],
      lastToken: tokens[end - 1],
      tokenCount: end - start,
    }
  })

  const stableGroupCount = groups.mixed
    ? Math.max(0, groupStarts.length - 1)
    : sourceEndsWithBlankLine(source) ? groupStarts.length : Math.max(0, groupStarts.length - 1)
  const linkifyContextIndex = stableGroupCount - linkifyDemotionContextOffset - 1
  const linkifyDemotionContext = linkifyContextIndex >= 0
    ? linkifyDemotionContexts?.[linkifyContextIndex]
    : fallbackLinkifyDemotionContext

  runtime.structuredStream = {
    groupBoundaries,
    groupStarts,
    tokenCount: tokens.length,
    tokens,
    mixed: groups.mixed,
    source,
    nodes,
    ...(runtime.chunkUpdate
      ? {
          hasTopLevelHtml: nodes.some(node => node.type === 'html_block'),
          contexts: linkifyDemotionContexts,
        }
      : {}),
    linkifyDemotionContext,
    stableGroupCount,
    requireClosingStrong: options.requireClosingStrong,
    validateLink: options.validateLink,
  }
}

function hasStableStructuredStreamGroupBoundaries(
  previous: StructuredStreamRuntimeState,
  tokens: MarkdownToken[],
  groupStarts: number[],
  stableGroupCount: number,
) {
  // Fast path: markdown-it-ts returns the SAME cached token array across
  // append/tail parses, so array identity proves the entire prefix (including
  // every group boundary) is byte-for-byte unchanged — O(1) instead of O(groups).
  if (previous.tokens === tokens)
    return true

  const lastGroupIndex = groupStarts.length - 1
  for (let index = 0; index < stableGroupCount; index++) {
    const start = groupStarts[index]
    const end = groupStarts[index + 1] ?? tokens.length
    const boundary = previous.groupBoundaries[index]
    if (
      !boundary
      || boundary.tokenCount !== end - start
    ) {
      return false
    }
    const identical = boundary.firstToken === tokens[start]
      && boundary.lastToken === tokens[end - 1]
    if (identical)
      continue
    // The stream parser can recreate prefix tokens on a full re-parse or a
    // container tail merge. A deterministic re-parse of unchanged source
    // produces shape-equal tokens, so boundary shape equality proves the
    // group content is unchanged — EXCEPT for the last group, which may
    // legitimately gain new content while its boundary tokens keep the same
    // shape (e.g. a tail merge that recreates the open/close pair). Interior
    // groups can never receive appended content, so shape fallback is safe
    // only below the last group.
    if (index >= lastGroupIndex || !isSameTokenShapeForReuse(boundary.firstToken, tokens[start])
      || !isSameTokenShapeForReuse(boundary.lastToken, tokens[end - 1])) {
      return false
    }
  }

  return true
}

export function processTopLevelTokensWithReuse(
  runtime: ParserRuntime,
  source: string,
  tokens: MarkdownToken[],
  options: ParseContext,
  callbacks: StructuredNodeReuseCallbacks,
) {
  const structuredReuseDisabled = options.disableStructuredReuse
  const reuseEnabled = shouldUseTopLevelStreamParse(runtime, options)
    && canReuseStructuredStreamNodes(options)

  // Reset the reuse-tail marker only for top-level parses: fragment parses
  // (details/div children) run with the same runtime and must not clobber the
  // outer document's marker, which the html passes consult while stitching.
  if (!options.isFragment)
    runtime.structuredReuseTailStart = undefined

  if (!reuseEnabled) {
    // Fragment parses (e.g. children of <details>/custom html blocks) run with
    // the same md instance and must not evict the top-level document's
    // structured reuse cache.
    if (!structuredReuseDisabled)
      runtime.structuredStream = undefined
    return callbacks.processTokens(tokens, options)
  }

  if (structuredReuseDisabled)
    return callbacks.processTokens(tokens, options)

  const previous = runtime.structuredStream
  const update = runtime.chunkUpdate
  if (update && previous?.contexts && !previous.hasTopLevelHtml
    && previous.tokens === tokens && update.tokenStart > 0) {
    let stableGroups = previous.groupStarts.length
    while (stableGroups > 0 && previous.groupStarts[stableGroups - 1]! >= update.tokenStart)
      stableGroups--
    if (stableGroups > 0 && update.tokenStart < previous.tokenCount
      && previous.groupStarts[stableGroups] !== update.tokenStart) {
      stableGroups--
    }
    const tailStart = previous.groupStarts[stableGroups] ?? update.tokenStart
    const groups = getReusableTopLevelTokenGroups(tokens, options.validateLink, tailStart)
    if (groups) {
      const tailOptions = {
        ...options,
        linkifyDemotionSeedContext: previous.contexts[stableGroups - 1],
      }
      const tailNodes = callbacks.processTokens(tokens.slice(tailStart), tailOptions)
      const contexts = tailOptions.linkifyDemotionResultContexts
      if (tailNodes.length === groups.starts.length && contexts
        && !tailNodes.some(node => node.type === 'html_block')) {
        previous.nodes.length = stableGroups
        previous.groupStarts.length = stableGroups
        previous.contexts.length = stableGroups
        for (const node of tailNodes)
          previous.nodes.push(node)
        for (const start of groups.starts)
          previous.groupStarts.push(start)
        for (const context of contexts)
          previous.contexts.push(context)
        previous.tokenCount = tokens.length
        previous.source = source
        update.start = stableGroups
        return previous.nodes
      }
    }
  }

  // A reset or unsupported tail requires a full snapshot, including HTML processing.
  if (update) {
    const groups = getReusableTopLevelTokenGroups(tokens, options.validateLink)
    const result = callbacks.processTokens(tokens, options)
    if (groups)
      updateStructuredStreamCache(runtime, source, tokens, groups, result, options, options.linkifyDemotionResultContexts)
    else
      runtime.structuredStream = undefined
    return result
  }
  const mode = getTopLevelStreamParseMode(runtime)
  // markdown-it-ts returns the SAME cached token array (with the same prefix
  // token objects) across append/tail parses, so identity proves the prefix is
  // unchanged without re-scanning any prefix token.
  const prefixUnchanged = !!previous
    && (mode === 'append' || mode === 'tail')
    && previous.tokenCount !== undefined
    && previous.tokenCount <= tokens.length
    && tokens === previous.tokens

  let groups: ReusableTopLevelTokenGroups | null
  if (prefixUnchanged) {
    // Incremental scan: prefix groups were validated on the previous call and
    // the token array identity guarantees they are unchanged, so only the new
    // tail tokens need scanning.
    const tailGroups = getReusableTopLevelTokenGroups(tokens, options.validateLink, previous.tokenCount)
    groups = tailGroups
      ? {
          starts: previous.groupStarts.concat(tailGroups.starts),
          mixed: previous.mixed || tailGroups.mixed,
        }
      : getReusableTopLevelTokenGroups(tokens, options.validateLink)
  }
  else {
    groups = getReusableTopLevelTokenGroups(tokens, options.validateLink)
  }
  if (!groups) {
    runtime.structuredStream = undefined
    return callbacks.processTokens(tokens, options)
  }

  const groupStarts = groups.starts
  const stableGroupCount = previous && groups.mixed
    ? Math.min(previous.stableGroupCount, Math.max(0, previous.groupBoundaries.length - 1))
    : previous?.stableGroupCount ?? 0
  if (
    previous
    && stableGroupCount > 0
    && previous.requireClosingStrong === options.requireClosingStrong
    && previous.validateLink === options.validateLink
    && runtime.sourceExtends(previous.source, source)
    && groupStarts.length >= stableGroupCount
    && (mode === 'append' || mode === 'tail')
    && hasStableStructuredStreamGroupBoundaries(previous, tokens, groupStarts, stableGroupCount)
  ) {
    const tailStart = groupStarts[stableGroupCount] ?? tokens.length
    const tailOptions = {
      ...options,
      linkifyDemotionSeedContext: previous.linkifyDemotionContext,
    } as ParseContext
    const tailNodes = callbacks.processTokens(tokens.slice(tailStart), tailOptions)
    const expectedTailNodes = groupStarts.length - stableGroupCount

    if (tailNodes.length === expectedTailNodes) {
      const result = previous.nodes.slice(0, stableGroupCount).concat(tailNodes)
      runtime.structuredReuseTailStart = stableGroupCount
      callbacks.recordReusedTopLevelNodes?.(stableGroupCount)
      updateStructuredStreamCache(
        runtime,
        source,
        tokens,
        groups,
        result,
        options,
        tailOptions.linkifyDemotionResultContexts,
        stableGroupCount,
        previous.linkifyDemotionContext,
      )
      return result
    }
  }

  const result = callbacks.processTokens(tokens, options)
  updateStructuredStreamCache(runtime, source, tokens, groups, result, options, options.linkifyDemotionResultContexts)
  return result
}
