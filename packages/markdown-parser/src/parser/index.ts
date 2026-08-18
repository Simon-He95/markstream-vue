import type { MarkdownIt, Token } from '../markdown-it-types'
import type { HtmlBlockNode, InternalParseOptions, MarkdownToken, ParsedNode, ParseOptions } from '../types'
import { normalizeCustomHtmlTags } from '../customHtmlTags'
import { NON_STRUCTURING_HTML_TAGS, STANDARD_BLOCK_HTML_TAGS, STANDARD_HTML_TAGS, VOID_HTML_TAGS } from '../htmlTags'
import { escapeTagForRegExp, findTagCloseIndexOutsideQuotes, parseTagAttrs } from '../htmlTagUtils'
import { isMathLike } from '../plugins/isMathLike'
import { isCacheStableLinkValidator, readSyntheticLinkOrigin } from '../plugins/linkTokenMetadata'
import {
  getTolerantMathBlockBoundaryStreamKey,
  hasMarkstreamMathPlugin,
  mayContainTolerantMathBlockBoundaryOpener,
} from '../plugins/math'
import { parseInlineTokens } from './inline-parsers'
import { createLinkifyDemotionContextTracker } from './linkifyHeuristics'
import { parseCommonBlockToken } from './node-parsers/block-token-parser'
import { parseBlockquote } from './node-parsers/blockquote-parser'
import { containerTokenHandlers } from './node-parsers/container-token-handlers'
import { parseHardBreak } from './node-parsers/hardbreak-parser'
import { parseHtmlBlock } from './node-parsers/html-block-parser'
import { parseList } from './node-parsers/list-parser'
import { parseParagraph } from './node-parsers/paragraph-parser'
import { applyNodeSourceMap, createSourceMapFromOffsets } from './node-source-map'
import { cloneTokenWithMutableChildren } from './token-copy'

type ParsedNodeWithFields = ParsedNode & {
  children?: ParsedNode[]
  content?: unknown
  tag?: unknown
}

const streamParseEnvCache = new WeakMap<object, Map<string, Record<string, unknown>>>()
const internalNodeSourceRanges = new WeakMap<object, { start: number, end: number }>()
const sourceLineOffsetsCache = new WeakMap<object, number[]>()
const siblingHtmlChildrenCache = new WeakMap<object, {
  blocks: string[]
  children: ParsedNode[][]
  customHtmlTags: string
  final: boolean
  requireClosingStrong: boolean | undefined
  validateLink: ParseOptions['validateLink']
}>()

function recordInternalNodeSourceRange(node: ParsedNode, token: MarkdownToken | undefined, options?: ParseOptions) {
  const map = token?.map
  const internalOptions = options as InternalParseOptions | undefined
  const source = internalOptions?.__sourceMarkdown
  if (!Array.isArray(map) || map.length < 2 || typeof source !== 'string' || !options)
    return

  const startLine = Number(map[0])
  const endLine = Number(map[1])
  if (!Number.isFinite(startLine) || !Number.isFinite(endLine))
    return

  let offsets = sourceLineOffsetsCache.get(options)
  if (!offsets) {
    offsets = [0]
    for (let i = 0; i < source.length; i++) {
      if (source[i] === '\n')
        offsets.push(i + 1)
    }
    sourceLineOffsetsCache.set(options, offsets)
  }

  internalNodeSourceRanges.set(node, {
    start: offsets[Math.max(0, Math.trunc(startLine))] ?? source.length,
    end: offsets[Math.max(0, Math.trunc(endLine))] ?? source.length,
  })
}

interface ExplicitBracketMathContext {
  fenceChar: '`' | '~' | ''
  fenceInBlockquote: boolean
  fenceInList: boolean
  fenceLen: number
  fenceListIndent: number
  inDollarMath: boolean
  inFence: boolean
  inMath: boolean
  listContentIndent: number | null
  dollarMathOpenOffset: number | null
  mathOpenOffset: number | null
}

interface ExplicitBracketMathStreamState {
  committedContext: ExplicitBracketMathContext
  context: ExplicitBracketMathContext
  lineBuffer: string
}

const tolerantMathBoundaryStreamCache = new WeakMap<object, {
  explicitBracketMath: ExplicitBracketMathStreamState
  source: string
  key: string | null
  pendingCandidate: boolean
}>()
const pendingExplicitMathTailCache = new WeakMap<object, {
  source: string
  state: ExplicitBracketMathStreamState
}>()

const TOLERANT_BOUNDARY_SPLIT_OPENERS = ['$', '\\[']
const STREAMING_ADMONITION_OPEN_RE = /(^|\r?\n)[\t ]*:::[\t ]*(?:warning|info|note|tip|danger|caution|error)(?=[\t ]|\r?\n|$)[^\r\n]*(?:\r?\n[\t ]*)*$/
const SAFE_MARKDOWN_WINDOW_MARGIN = 1024
const SAFE_MARKDOWN_WINDOW_OVERLAP = 16
/**
 * Cached streaming safe-markdown transform, keyed by the md instance.
 *
 * The cache is owned by the TOP-LEVEL document stream: fragment parses
 * (e.g. `<details>` / custom html children, `__disableStructuredReuse`)
 * share the md instance and may overwrite the entry — benign, because the
 * transforms are deterministic functions of the source text, and the fast
 * path additionally guards with `mode` + `startsWith(previous.source)`, so
 * a stale/foreign entry either re-produces the identical transform or falls
 * back to a full-document transform.
 *
 * Memory: holds the full raw source + transformed output (~2-3x the document
 * size) per md instance for the instance lifetime; WeakMap-keyed so it is
 * collected with the instance. Cleared on the final auto-parse reset.
 */
const safeMarkdownCache = new WeakMap<object, {
  source: string
  safeMarkdown: string
  mode: string
}>()

interface ParseTimingMetrics {
  tokenCloneMs?: number
  processTokensInputTokens?: number
  processTokensReusedTopLevelNodes?: number
  processTokensMs?: number
  /** Wall time of the streaming-safe markdown pre-processing chain. */
  safeMarkdownMs?: number
  /** Wall time of markdown-it tokenization (stream or sync). */
  tokenizeMs?: number
  /** Wall time of the top-level html_block merge/combine/structure passes. */
  htmlBlockPassesMs?: number
  parseMarkdownToStructureTotalMs?: number
}

interface StructuredStreamCacheEntry {
  groupBoundaries: StructuredStreamGroupBoundary[]
  /** Absolute token indices where each reusable group starts. */
  groupStarts: number[]
  /** Number of top-level tokens when this cache was written. */
  tokenCount: number
  /** Reference to the token array from the parse that produced this cache. */
  tokens: MarkdownToken[]
  /** Whether any top-level group is a single-token (non-paired) reusable type. */
  mixed: boolean
  source: string
  nodes: ParsedNode[]
  /** Cached prefix node raws for incremental linkify demotion seeding. */
  seed: string[]
  stableGroupCount: number
  requireClosingStrong: boolean | undefined
  validateLink: ParseOptions['validateLink']
}

interface StructuredStreamGroupBoundary {
  firstToken: MarkdownToken
  lastToken: MarkdownToken
  tokenCount: number
}

interface ReusableTopLevelTokenGroups {
  mixed: boolean
  starts: number[]
}

const structuredStreamCache = new WeakMap<object, StructuredStreamCacheEntry>()
const topLevelStreamParseMode = new WeakMap<object, string>()
/**
 * Stitched `<details>` output cache keyed by md instance, then by the pre-pass
 * details opener html_block node. Reused prefix details keep the same opener
 * object across appends, so combineStructuredDetailsHtmlBlocks can skip
 * re-parsing + re-rendering the (unchanged) middle of closed details on every
 * append. Entries are written only when the top-level parse reused nodes.
 */
const detailsStitchCache = new WeakMap<object, WeakMap<object, {
  openRaw: string
  explicitClose: boolean
  closeSliceEnd: number
  middleSource: string
  node: ParsedNode
}>>()
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
  'inline',
  'math_block',
])

type TimedParseOptions = ParseOptions & {
  __timing?: ParseTimingMetrics
}

function getNodeFields(node: ParsedNode) {
  return node as ParsedNodeWithFields
}

function getParserNow() {
  return typeof performance !== 'undefined'
    ? performance.now()
    : Date.now()
}

function addTiming(metrics: ParseTimingMetrics | undefined, key: keyof ParseTimingMetrics, value: number) {
  if (!metrics)
    return

  metrics[key] = (metrics[key] ?? 0) + value
}

function getParseTiming(options: ParseOptions) {
  return (options as TimedParseOptions).__timing
}

function finishTimedParse<T extends ParsedNode[]>(result: T, timing: ParseTimingMetrics | undefined, startedAt: number) {
  if (timing)
    addTiming(timing, 'parseMarkdownToStructureTotalMs', getParserNow() - startedAt)

  return result
}

function applyPostTransformNodes<T extends ParsedNode[]>(nodes: T, options: ParseOptions): T | ParsedNode[] {
  const transform = options.postTransformNodes
  if (typeof transform !== 'function')
    return nodes

  const transformed = transform(nodes)
  return Array.isArray(transformed) ? transformed : nodes
}

function finishParsedNodes<T extends ParsedNode[]>(
  result: T,
  options: ParseOptions,
  timing: ParseTimingMetrics | undefined,
  startedAt: number,
) {
  return finishTimedParse(applyPostTransformNodes(result, options), timing, startedAt)
}

function processTokensWithTiming(tokens: MarkdownToken[], options: ParseOptions | undefined, timing: ParseTimingMetrics | undefined) {
  if (!timing)
    return processTokens(tokens, options)

  addTiming(timing, 'processTokensInputTokens', tokens.length)
  const startedAt = getParserNow()
  const result = processTokens(tokens, options)
  addTiming(timing, 'processTokensMs', getParserNow() - startedAt)
  return result
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
      // re-parse seeds the linkify demotion tracker with the reused prefix
      // context, so these pairs are safe to reuse.
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
  return /\r?\n[\t ]*\r?\n[\t ]*$/.test(source)
}

function canReuseStructuredStreamNodes(options: ParseOptions) {
  return (options as InternalParseOptions).__reuseStableTopLevelNodes === true
    && options.final !== true
    && !options.preTransformTokens
    && !options.postTransformTokens
    && !options.postTransformNodes
    && !options.customHtmlTags?.length
    && options.includeSourceMap !== true
}

function updateStructuredStreamCache(
  md: MarkdownIt,
  source: string,
  tokens: MarkdownToken[],
  groups: ReusableTopLevelTokenGroups,
  nodes: ParsedNode[],
  options: ParseOptions,
) {
  const groupStarts = groups.starts
  if (groupStarts.length === 0 || nodes.length !== groupStarts.length) {
    structuredStreamCache.delete(md as unknown as object)
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

  structuredStreamCache.set(md as unknown as object, {
    groupBoundaries,
    groupStarts,
    tokenCount: tokens.length,
    tokens,
    mixed: groups.mixed,
    source,
    nodes,
    seed: nodes.map(node => String((node as Record<string, unknown>).raw ?? '')),
    stableGroupCount: groups.mixed
      ? Math.max(0, groupStarts.length - 1)
      : sourceEndsWithBlankLine(source) ? groupStarts.length : Math.max(0, groupStarts.length - 1),
    requireClosingStrong: options.requireClosingStrong,
    validateLink: options.validateLink,
  })
}

function hasStableStructuredStreamGroupBoundaries(
  previous: StructuredStreamCacheEntry,
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

function processTopLevelTokensWithReuse(
  md: MarkdownIt,
  source: string,
  tokens: MarkdownToken[],
  options: InternalParseOptions,
  timing: ParseTimingMetrics | undefined,
) {
  const owner = md as unknown as object
  const structuredReuseDisabled = (options as InternalParseOptions).__disableStructuredReuse === true
  const reuseEnabled = shouldUseTopLevelStreamParse(md, options)
    && canReuseStructuredStreamNodes(options)

  if (!reuseEnabled) {
    // Fragment parses (e.g. children of <details>/custom html blocks) run with
    // the same md instance and must not evict the top-level document's
    // structured reuse cache.
    if (!structuredReuseDisabled)
      structuredStreamCache.delete(owner)
    return processTokensWithTiming(tokens, options, timing)
  }

  if (structuredReuseDisabled)
    return processTokensWithTiming(tokens, options, timing)

  const previous = structuredStreamCache.get(owner)
  const mode = topLevelStreamParseMode.get(owner)
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
    structuredStreamCache.delete(owner)
    return processTokensWithTiming(tokens, options, timing)
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
    && source.startsWith(previous.source)
    && groupStarts.length >= stableGroupCount
    && (mode === 'append' || mode === 'tail')
    && hasStableStructuredStreamGroupBoundaries(previous, tokens, groupStarts, stableGroupCount)
  ) {
    const tailStart = groupStarts[stableGroupCount] ?? tokens.length
    const tailNodes = processTokensWithTiming(tokens.slice(tailStart), {
      ...options,
      // Prefix raws are cached and append-only: reuse the stored seed instead
      // of re-slicing + re-stringifying every prefix node on each append.
      __linkifyDemotionSeed: previous.seed.slice(0, stableGroupCount),
    } as InternalParseOptions, timing)
    const expectedTailNodes = groupStarts.length - stableGroupCount

    if (tailNodes.length === expectedTailNodes) {
      const result = previous.nodes.slice(0, stableGroupCount).concat(tailNodes)
      options.__structuredReuseTailStart = stableGroupCount
      addTiming(timing, 'processTokensReusedTopLevelNodes', stableGroupCount)
      updateStructuredStreamCache(md, source, tokens, groups, result, options)
      return result
    }
  }

  const result = processTokensWithTiming(tokens, options, timing)
  updateStructuredStreamCache(md, source, tokens, groups, result, options)
  return result
}

function getCustomHtmlTagSet(options?: ParseOptions) {
  const custom = options?.customHtmlTags
  if (!Array.isArray(custom) || custom.length === 0)
    return null

  const normalized = normalizeCustomHtmlTags(custom)
  return normalized.length ? new Set(normalized) : null
}

function getStableStreamEnv(md: MarkdownIt, env: Record<string, unknown>) {
  const mdKey = md as unknown as object
  let byMode = streamParseEnvCache.get(mdKey)
  if (!byMode) {
    byMode = new Map()
    streamParseEnvCache.set(mdKey, byMode)
  }

  const modeKey = env.__markstreamFinal === true ? 'final' : 'streaming'
  let stableEnv = byMode.get(modeKey)
  if (!stableEnv) {
    stableEnv = {}
    byMode.set(modeKey, stableEnv)
  }

  for (const key of Object.keys(stableEnv)) {
    if (!Object.prototype.hasOwnProperty.call(env, key))
      delete stableEnv[key]
  }
  Object.assign(stableEnv, env)
  return stableEnv
}

function isPlainObject(value: unknown) {
  if (!value || typeof value !== 'object')
    return false

  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function copyCloneableOwnDataProperties(source: object, target: Record<PropertyKey, unknown>, seen: WeakMap<object, unknown>) {
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = Object.getOwnPropertyDescriptor(source, key)
    if (!descriptor || !('value' in descriptor))
      continue

    const targetDescriptor = Object.getOwnPropertyDescriptor(target, key)
    if (targetDescriptor && (!('value' in targetDescriptor) || targetDescriptor.writable === false))
      continue

    target[key] = safeCloneTokenField(descriptor.value, seen)
  }
}

function safeCloneTokenField<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (!value || typeof value !== 'object')
    return value

  const object = value as object
  const existing = seen.get(object)
  if (existing)
    return existing as T

  if (Array.isArray(value)) {
    const cloned: unknown[] = []
    seen.set(object, cloned)
    for (const item of value)
      cloned.push(safeCloneTokenField(item, seen))
    return cloned as T
  }

  if (value instanceof Map) {
    const cloned = new Map()
    seen.set(object, cloned)
    for (const [key, item] of value)
      cloned.set(safeCloneTokenField(key, seen), safeCloneTokenField(item, seen))
    return cloned as T
  }

  if (value instanceof Set) {
    const cloned = new Set()
    seen.set(object, cloned)
    for (const item of value)
      cloned.add(safeCloneTokenField(item, seen))
    return cloned as T
  }

  if (value instanceof Date) {
    const cloned = new Date(value.getTime())
    seen.set(object, cloned)
    return cloned as T
  }

  if (value instanceof RegExp) {
    const cloned = new RegExp(value.source, value.flags)
    cloned.lastIndex = value.lastIndex
    seen.set(object, cloned)
    return cloned as T
  }

  if (typeof URL !== 'undefined' && value instanceof URL) {
    const cloned = new URL(value.href)
    seen.set(object, cloned)
    copyCloneableOwnDataProperties(object, cloned as unknown as Record<PropertyKey, unknown>, seen)
    return cloned as T
  }

  if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) {
    const cloned = new URLSearchParams(value.toString())
    seen.set(object, cloned)
    copyCloneableOwnDataProperties(object, cloned as unknown as Record<PropertyKey, unknown>, seen)
    return cloned as T
  }

  if (value instanceof Error) {
    let cloned: Error
    const ErrorCtor = value.constructor as new (message?: string) => Error
    try {
      cloned = new ErrorCtor(value.message)
    }
    catch {
      cloned = new Error(value.message)
    }
    Object.setPrototypeOf(cloned, Object.getPrototypeOf(value))
    seen.set(object, cloned)
    copyCloneableOwnDataProperties(object, cloned as unknown as Record<PropertyKey, unknown>, seen)
    return cloned as T
  }

  if (typeof Promise !== 'undefined' && value instanceof Promise) {
    seen.set(object, value)
    return value
  }

  if (typeof Node !== 'undefined' && value instanceof Node) {
    seen.set(object, value)
    return value
  }

  if (!isPlainObject(value)) {
    const cloned = Object.create(Object.getPrototypeOf(value)) as Record<PropertyKey, unknown>
    seen.set(object, cloned)
    copyCloneableOwnDataProperties(object, cloned, seen)
    return cloned as T
  }

  const cloned: Record<string, unknown> = {}
  seen.set(object, cloned)

  const record = value as Record<string, unknown>
  for (const key of Object.keys(record))
    cloned[key] = safeCloneTokenField(record[key], seen)

  return cloned as T
}

function cloneMarkdownToken(token: Token, cloneObjectFields = true): Token {
  if (!cloneObjectFields)
    return cloneTokenWithMutableChildren(token as unknown as MarkdownToken) as unknown as Token

  const cloned = Object.create(Object.getPrototypeOf(token)) as Token
  const seen = new WeakMap<object, unknown>()

  for (const key of Reflect.ownKeys(token as unknown as object)) {
    const descriptor = Object.getOwnPropertyDescriptor(token, key)
    if (!descriptor)
      continue

    if (!('value' in descriptor)) {
      Object.defineProperty(cloned, key, descriptor)
      continue
    }

    const value = descriptor.value
    let clonedValue = value

    if (key === 'attrs' && Array.isArray(value)) {
      clonedValue = value.map(attr => [...attr] as [string, string])
    }
    else if (key === 'map' && Array.isArray(value)) {
      clonedValue = [...value] as [number, number]
    }
    else if (key === 'children' && Array.isArray(value)) {
      clonedValue = value.map(child => cloneMarkdownToken(child, cloneObjectFields))
    }
    else if (cloneObjectFields && value && typeof value === 'object') {
      clonedValue = safeCloneTokenField(value, seen)
    }

    Object.defineProperty(cloned, key, {
      ...descriptor,
      value: clonedValue,
    })
  }

  return cloned
}

function cloneMarkdownTokens(tokens: Token[], cloneObjectFields = true) {
  return tokens.map(token => cloneMarkdownToken(token, cloneObjectFields))
}

function shouldUseTopLevelStreamParse(md: MarkdownIt, options: ParseOptions) {
  const internalOptions = options as InternalParseOptions
  const stream = md.stream
  const streamParse = options.streamParse ?? 'auto'
  return internalOptions.__disableStreamParse !== true
    && (md as unknown as Record<string, unknown>).__markstreamHasCustomParserExtensions !== true
    && (streamParse === true || (streamParse === 'auto' && options.final !== true))
    && stream?.enabled === true
    && typeof stream.parse === 'function'
}

function shouldResetTopLevelStreamCacheForFinalAutoParse(md: MarkdownIt, options: ParseOptions) {
  const internalOptions = options as InternalParseOptions
  const streamParse = options.streamParse ?? 'auto'
  const stream = md.stream

  return options.final === true
    && streamParse === 'auto'
    && internalOptions.__disableStreamParse !== true
    && (md as unknown as Record<string, unknown>).__markstreamHasCustomParserExtensions !== true
    && stream?.enabled === true
    && typeof stream.reset === 'function'
}

function clearTolerantMathBoundaryStreamCache(md: MarkdownIt) {
  tolerantMathBoundaryStreamCache.delete(md as unknown as object)
}

function createExplicitBracketMathContext(): ExplicitBracketMathContext {
  return {
    fenceChar: '',
    fenceInBlockquote: false,
    fenceInList: false,
    fenceLen: 0,
    fenceListIndent: 0,
    inDollarMath: false,
    inFence: false,
    inMath: false,
    listContentIndent: null,
    dollarMathOpenOffset: null,
    mathOpenOffset: null,
  }
}

function cloneExplicitBracketMathContext(context: ExplicitBracketMathContext): ExplicitBracketMathContext {
  return { ...context }
}

function setTolerantMathBoundaryStreamCache(
  md: MarkdownIt,
  source: string,
  key: string | null,
  explicitBracketMath: ExplicitBracketMathStreamState = scanExplicitBracketMathStreamState(source).state,
) {
  tolerantMathBoundaryStreamCache.set(md as unknown as object, {
    explicitBracketMath,
    source,
    key,
    pendingCandidate: key === null && mayContainTolerantMathBlockBoundaryOpener(source),
  })
}

function sourceEndsWithSplitTolerantBoundaryPrefix(source: string) {
  return source.endsWith('$') || source.endsWith('\\')
}

function sourceEndsWithCompleteTolerantBoundaryOpener(source: string) {
  const lastLineStart = Math.max(source.lastIndexOf('\n') + 1, 0)
  const lastLine = source.slice(lastLineStart).replace(/[\t ]+$/, '')
  return TOLERANT_BOUNDARY_SPLIT_OPENERS.some(open => lastLine.endsWith(open))
}

function appendedChunkMayAffectTolerantMathBoundary(previousSource: string, appended: string) {
  if (!appended)
    return false

  if (appended.includes('$$') || appended.includes('\\['))
    return true

  if (previousSource.endsWith('$') && appended[0] === '$')
    return true

  if (previousSource.endsWith('\\') && appended[0] === '[')
    return true

  // The opener may have arrived in the previous chunk:
  //
  //   "prefix $$" + "\na = 1"
  //   "prefix \\[" + "\nx + y = z"
  if (sourceEndsWithCompleteTolerantBoundaryOpener(previousSource) && /[\r\n]/.test(appended))
    return true

  return false
}

function isEscapedDelimiterAt(source: string, index: number) {
  let cursor = index - 1
  let backslashes = 0
  while (cursor >= 0 && source[cursor] === '\\') {
    backslashes++
    cursor--
  }
  return backslashes % 2 === 1
}

function isIndentWhitespace(ch: string) {
  return ch === ' ' || ch === '\t'
}

function advanceMarkdownIndentColumn(column: number, ch: string) {
  return ch === ' ' ? column + 1 : column + 4 - (column % 4)
}

function getMarkdownIndent(line: string) {
  let index = 0
  let column = 0

  while (index < line.length && isIndentWhitespace(line[index])) {
    column = advanceMarkdownIndentColumn(column, line[index])
    index++
  }

  return { index, column }
}

function consumeMarkdownIndent(line: string) {
  const indent = getMarkdownIndent(line)
  return indent.column > 3 ? null : indent
}

function parseMarkdownFenceMarker(line: string) {
  const indent = consumeMarkdownIndent(line)
  if (!indent)
    return null

  const index = indent.index
  const markerChar = line[index]
  if (markerChar !== '`' && markerChar !== '~')
    return null

  let markerEnd = index
  while (markerEnd < line.length && line[markerEnd] === markerChar)
    markerEnd++

  const markerLen = markerEnd - index
  if (markerLen < 3)
    return null

  const rest = line.slice(markerEnd)
  if (markerChar === '`' && rest.includes('`'))
    return null

  return { markerChar: markerChar as '`' | '~', markerLen, rest }
}

function stripMarkdownListPrefix(line: string) {
  const indent = consumeMarkdownIndent(line)
  if (!indent)
    return null

  const rest = line.slice(indent.index)
  const marker = /^(?:[-+*]|\d{1,9}[.)])(?=[\t ]|$)/.exec(rest)?.[0]
  if (!marker)
    return null

  let index = indent.index + marker.length
  let column = indent.column + marker.length
  if (!isIndentWhitespace(line[index]))
    return null

  while (index < line.length && isIndentWhitespace(line[index])) {
    column = advanceMarkdownIndentColumn(column, line[index])
    index++
  }

  return {
    content: line.slice(index),
    contentIndent: column,
  }
}

function stripMarkdownBlockquotePrefix(line: string) {
  let rest = line
  let saw = false

  while (true) {
    const indent = consumeMarkdownIndent(rest)
    if (!indent)
      return saw ? rest : null

    let index = indent.index
    if (rest[index] !== '>')
      return saw ? rest : null

    saw = true
    index++
    if (rest[index] === ' ' || rest[index] === '\t')
      index++
    rest = rest.slice(index)
  }
}

function matchMarkdownFenceMarker(line: string) {
  const direct = parseMarkdownFenceMarker(line)
  if (direct)
    return { ...direct, inBlockquote: false, inList: false, listIndent: 0 }

  const quoted = stripMarkdownBlockquotePrefix(line)
  const quotedMarker = quoted == null ? null : parseMarkdownFenceMarker(quoted)
  if (quotedMarker)
    return { ...quotedMarker, inBlockquote: true, inList: false, listIndent: 0 }

  const listed = stripMarkdownListPrefix(line)
  if (!listed)
    return null

  const listedMarker = parseMarkdownFenceMarker(listed.content)
  return listedMarker == null
    ? null
    : { ...listedMarker, inBlockquote: false, inList: true, listIndent: listed.contentIndent }
}

function isInsideOpenMarkdownFenceBeforeOffset(markdown: string, offset: number) {
  let inFence = false
  let fenceChar: '`' | '~' | '' = ''
  let fenceLen = 0
  let fenceInBlockquote = false
  let fenceInList = false
  let fenceListIndent = 0
  let listContentIndent: number | null = null
  let index = 0

  while (index < offset) {
    const newlineIndex = markdown.indexOf('\n', index)
    const lineEnd = newlineIndex === -1 || newlineIndex >= offset ? offset : newlineIndex
    const rawLine = markdown.slice(index, lineEnd)
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    const lineIndent = getMarkdownIndent(line)
    const listPrefix = stripMarkdownListPrefix(line)

    if (inFence && fenceInBlockquote && line.trim() && stripMarkdownBlockquotePrefix(line) == null) {
      inFence = false
      fenceChar = ''
      fenceLen = 0
      fenceInBlockquote = false
      fenceInList = false
      fenceListIndent = 0
    }

    if (
      inFence
      && fenceInList
      && line.trim()
      && lineIndent.column < fenceListIndent
      && !listPrefix
    ) {
      inFence = false
      fenceChar = ''
      fenceLen = 0
      fenceInBlockquote = false
      fenceInList = false
      fenceListIndent = 0
    }

    if (listPrefix) {
      listContentIndent = listPrefix.contentIndent
    }
    else if (line.trim() && listContentIndent != null && lineIndent.column < listContentIndent && !inFence) {
      listContentIndent = null
    }

    const fenceMatch = matchMarkdownFenceMarker(line)
    if (fenceMatch) {
      if (inFence) {
        if (
          fenceMatch.markerChar === fenceChar
          && fenceMatch.markerLen >= fenceLen
          && /^\s*$/.test(fenceMatch.rest)
        ) {
          inFence = false
          fenceChar = ''
          fenceLen = 0
          fenceInBlockquote = false
          fenceInList = false
          fenceListIndent = 0
        }
      }
      else {
        inFence = true
        fenceChar = fenceMatch.markerChar
        fenceLen = fenceMatch.markerLen
        fenceInBlockquote = fenceMatch.inBlockquote
        fenceInList = fenceMatch.inList
          || (
            listContentIndent != null
            && !fenceMatch.inBlockquote
            && lineIndent.column >= listContentIndent
          )
        fenceListIndent = fenceMatch.listIndent || listContentIndent || 0
      }
    }

    if (newlineIndex === -1 || newlineIndex >= offset)
      break
    index = newlineIndex + 1
  }

  return inFence
}

function isInsideOpenStandardHtmlBlockBeforeOffset(markdown: string, offset: number) {
  const isWs = (ch: string) => ch === ' ' || ch === '\t'
  const isNameChar = (ch: string) => {
    const c = ch.charCodeAt(0)
    return (
      (c >= 65 && c <= 90)
      || (c >= 97 && c <= 122)
      || (c >= 48 && c <= 57)
      || ch === '_'
      || ch === '-'
      || ch === ':'
    )
  }
  const parseLineStartTag = (line: string) => {
    if (line[0] !== '<')
      return null

    let index = 1
    while (index < line.length && isWs(line[index]))
      index++

    const closing = line[index] === '/'
    if (closing) {
      index++
      while (index < line.length && isWs(line[index]))
        index++
    }

    const nameStart = index
    while (index < line.length && isNameChar(line[index]))
      index++
    if (index === nameStart)
      return null

    const tag = line.slice(nameStart, index).toLowerCase()
    if (!STANDARD_BLOCK_HTML_TAGS.has(tag))
      return null

    const boundary = line[index]
    if (boundary && boundary !== ' ' && boundary !== '\t' && boundary !== '>' && boundary !== '/')
      return null

    const tagEnd = findTagCloseIndexOutsideQuotes(line)
    if (tagEnd === -1)
      return null

    let beforeEnd = tagEnd - 1
    while (beforeEnd >= 0 && isWs(line[beforeEnd]))
      beforeEnd--

    return {
      closing,
      tag,
      selfClosing: !closing && line[beforeEnd] === '/',
      after: line.slice(tagEnd + 1),
    }
  }
  const hasSameLineClose = (line: string, tag: string) => {
    const lower = line.toLowerCase()
    let index = 0
    while (index < lower.length) {
      const closeStart = lower.indexOf('</', index)
      if (closeStart === -1)
        return false
      index = closeStart + 2
      while (index < lower.length && isWs(lower[index]))
        index++
      if (lower.startsWith(tag, index)) {
        const boundary = lower[index + tag.length]
        if (!boundary || boundary === ' ' || boundary === '\t' || boundary === '>')
          return true
      }
    }
    return false
  }

  const stack: string[] = []
  let inComment = false
  let inDeclaration = false
  let inProcessingInstruction = false
  let index = 0

  while (index < offset) {
    const newlineIndex = markdown.indexOf('\n', index)
    const lineEnd = newlineIndex === -1 || newlineIndex >= offset ? offset : newlineIndex
    const rawLine = markdown.slice(index, lineEnd)
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    const indent = consumeMarkdownIndent(line)
    if (indent) {
      const rest = line.slice(indent.index)
      if (inComment) {
        inComment = !rest.includes('-->')
      }
      else if (inDeclaration) {
        inDeclaration = !rest.includes('>')
      }
      else if (inProcessingInstruction) {
        inProcessingInstruction = !rest.includes('?>')
      }
      else if (rest.startsWith('<!--')) {
        inComment = !rest.includes('-->')
      }
      else if (rest.startsWith('<?')) {
        inProcessingInstruction = !rest.includes('?>')
      }
      else if (rest.startsWith('<!')) {
        inDeclaration = !rest.includes('>')
      }
      else {
        const tagInfo = parseLineStartTag(rest)
        if (tagInfo) {
          if (tagInfo.closing) {
            for (let i = stack.length - 1; i >= 0; i--) {
              if (stack[i] === tagInfo.tag) {
                stack.length = i
                break
              }
            }
          }
          else if (!tagInfo.selfClosing) {
            if (!hasSameLineClose(tagInfo.after, tagInfo.tag))
              stack.push(tagInfo.tag)
          }
        }
      }
    }

    if (newlineIndex === -1 || newlineIndex >= offset)
      break
    index = newlineIndex + 1
  }

  return inComment || inDeclaration || inProcessingInstruction || stack.length > 0
}

function isInsideOpenCustomHtmlBlockBeforeOffset(markdown: string, offset: number, customHtmlTags?: readonly string[]) {
  if (!customHtmlTags?.length)
    return false

  const tagSet = new Set(normalizeCustomHtmlTags(customHtmlTags))
  if (!tagSet.size)
    return false

  const isNameChar = (ch: string) => {
    const c = ch.charCodeAt(0)
    return (
      (c >= 65 && c <= 90)
      || (c >= 97 && c <= 122)
      || (c >= 48 && c <= 57)
      || ch === '_'
      || ch === '-'
      || ch === ':'
    )
  }
  const isWs = (ch: string) => ch === ' ' || ch === '\t'
  const parseLineStartTag = (line: string) => {
    if (line[0] !== '<')
      return null

    let index = 1
    while (index < line.length && isWs(line[index]))
      index++

    const closing = line[index] === '/'
    if (closing) {
      index++
      while (index < line.length && isWs(line[index]))
        index++
    }

    const nameStart = index
    while (index < line.length && isNameChar(line[index]))
      index++
    if (index === nameStart)
      return null

    const tag = line.slice(nameStart, index).toLowerCase()
    if (!tagSet.has(tag))
      return null

    const boundary = line[index]
    if (boundary && boundary !== ' ' && boundary !== '\t' && boundary !== '>' && boundary !== '/')
      return null

    const tagEnd = line.indexOf('>', index)
    if (tagEnd === -1)
      return null

    let beforeEnd = tagEnd - 1
    while (beforeEnd >= 0 && isWs(line[beforeEnd]))
      beforeEnd--

    return {
      closing,
      tag,
      selfClosing: !closing && line[beforeEnd] === '/',
      after: line.slice(tagEnd + 1),
    }
  }
  const hasSameLineClose = (line: string, tag: string) => {
    const lower = line.toLowerCase()
    let index = 0
    while (index < lower.length) {
      const closeStart = lower.indexOf('</', index)
      if (closeStart === -1)
        return false
      index = closeStart + 2
      while (index < lower.length && isWs(lower[index]))
        index++
      if (lower.startsWith(tag, index)) {
        const boundary = lower[index + tag.length]
        if (!boundary || boundary === ' ' || boundary === '\t' || boundary === '>')
          return true
      }
    }
    return false
  }

  const stack: string[] = []
  let index = 0

  while (index < offset) {
    const newlineIndex = markdown.indexOf('\n', index)
    const lineEnd = newlineIndex === -1 || newlineIndex >= offset ? offset : newlineIndex
    const rawLine = markdown.slice(index, lineEnd)
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    const indent = consumeMarkdownIndent(line)
    if (indent) {
      const rest = line.slice(indent.index)
      const tagInfo = parseLineStartTag(rest)
      if (tagInfo) {
        if (tagInfo.closing) {
          for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i] === tagInfo.tag) {
              stack.length = i
              break
            }
          }
        }
        else if (!tagInfo.selfClosing) {
          if (!hasSameLineClose(tagInfo.after, tagInfo.tag))
            stack.push(tagInfo.tag)
        }
      }
    }

    if (newlineIndex === -1 || newlineIndex >= offset)
      break
    index = newlineIndex + 1
  }

  return stack.length > 0
}

function getStreamingAdmonitionOpenTailReplacement(markdown: string, customHtmlTags?: readonly string[]) {
  const match = STREAMING_ADMONITION_OPEN_RE.exec(markdown)
  if (!match)
    return null

  const separator = match[1] ?? ''
  const lineStart = match.index + separator.length
  const lineEnd = markdown.indexOf('\n', lineStart)
  const rawLine = markdown.slice(lineStart, lineEnd === -1 ? markdown.length : lineEnd)
  const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
  if (!consumeMarkdownIndent(line))
    return null

  if (isInsideOpenMarkdownFenceBeforeOffset(markdown, lineStart))
    return null

  if (isInsideOpenStandardHtmlBlockBeforeOffset(markdown, lineStart))
    return null

  if (isInsideOpenCustomHtmlBlockBeforeOffset(markdown, lineStart, customHtmlTags))
    return null

  return `${markdown.slice(0, match.index)}${separator}`
}

function countRepeatedChar(source: string, index: number, ch: string) {
  let end = index
  while (end < source.length && source[end] === ch)
    end++
  return end - index
}

function findCodeSpanCloseIndex(line: string, start: number, markerLen: number) {
  let index = start

  while (index < line.length) {
    const next = line.indexOf('`', index)
    if (next === -1)
      return -1

    const runLen = countRepeatedChar(line, next, '`')
    if (runLen === markerLen)
      return next

    index = next + runLen
  }

  return -1
}

function resetExplicitBracketFenceContext(context: ExplicitBracketMathContext) {
  context.inFence = false
  context.fenceChar = ''
  context.fenceLen = 0
  context.fenceInBlockquote = false
  context.fenceInList = false
  context.fenceListIndent = 0
}

function scanLineForExplicitBracketMathState(
  line: string,
  context: ExplicitBracketMathContext,
  lineStart: number,
  appendStart: number | null,
  openAtAppendStart: boolean,
) {
  let index = 0
  let closedOpenMath = false

  while (index < line.length) {
    const sourceIndex = index

    if (context.inMath) {
      if (line.startsWith('\\]', index) && !isEscapedDelimiterAt(line, sourceIndex)) {
        if (appendStart != null && openAtAppendStart && lineStart + index + 2 > appendStart)
          closedOpenMath = true
        context.inMath = false
        context.mathOpenOffset = null
        index += 2
        continue
      }

      index++
      continue
    }

    if (context.inDollarMath) {
      if (line.startsWith('$$', index) && !isEscapedDelimiterAt(line, sourceIndex)) {
        if (appendStart != null && openAtAppendStart && lineStart + index + 2 > appendStart)
          closedOpenMath = true
        context.inDollarMath = false
        context.dollarMathOpenOffset = null
        index += 2
        continue
      }

      index++
      continue
    }

    if (line[index] === '`' && !isEscapedDelimiterAt(line, sourceIndex)) {
      const markerLen = countRepeatedChar(line, index, '`')
      const closeIndex = findCodeSpanCloseIndex(line, index + markerLen, markerLen)
      if (closeIndex === -1)
        break
      index = closeIndex + markerLen
      continue
    }

    if (line.startsWith('\\[', index) && !isEscapedDelimiterAt(line, sourceIndex)) {
      context.inMath = true
      context.mathOpenOffset = lineStart + index
      index += 2
      continue
    }

    if (line.startsWith('$$', index) && !isEscapedDelimiterAt(line, sourceIndex)) {
      context.inDollarMath = true
      context.dollarMathOpenOffset = lineStart + index
      index += 2
      continue
    }

    index++
  }

  return closedOpenMath
}

function stripPendingExplicitMathTail(markdown: string, md: MarkdownIt) {
  if (!hasMarkstreamMathPlugin(md))
    return markdown

  const owner = md as unknown as object
  const previous = pendingExplicitMathTailCache.get(owner)
  const state = previous?.source === markdown
    ? previous.state
    : previous && markdown.startsWith(previous.source)
      ? updateExplicitBracketMathStreamState(
        previous.state,
        markdown.slice(previous.source.length),
        previous.source.length - previous.state.lineBuffer.length,
      ).state
      : scanExplicitBracketMathStreamState(markdown).state
  pendingExplicitMathTailCache.set(owner, { source: markdown, state })

  const { context } = state
  const openOffset = context.inMath
    ? context.mathOpenOffset
    : context.inDollarMath ? context.dollarMathOpenOffset : null
  if (openOffset == null)
    return markdown

  const content = markdown.slice(openOffset + 2)
  const lineStart = markdown.lastIndexOf('\n', openOffset - 1) + 1
  const startsBlockLine = markdown.slice(lineStart, openOffset).trim() === ''
  if (!startsBlockLine && !/^\r?\n/.test(content))
    return markdown
  if (/^\s*!\[/.test(content))
    return markdown

  const stripped = content.trim()
  const weakSingleVariable = /^(?:[a-z]|pi)$/i.test(stripped)
  if (isMathLike(content) && !weakSingleVariable)
    return markdown

  return markdown.slice(0, openOffset)
}

function scanExplicitBracketMathLine(
  line: string,
  context: ExplicitBracketMathContext,
  lineStart: number,
  appendStart: number | null,
  openAtAppendStart: boolean,
) {
  const lineIndent = getMarkdownIndent(line)
  const listPrefix = stripMarkdownListPrefix(line)

  if (context.inFence && context.fenceInBlockquote && line.trim() && stripMarkdownBlockquotePrefix(line) == null)
    resetExplicitBracketFenceContext(context)

  if (
    context.inFence
    && context.fenceInList
    && line.trim()
    && lineIndent.column < context.fenceListIndent
    && !listPrefix
  ) {
    resetExplicitBracketFenceContext(context)
  }

  if (listPrefix) {
    context.listContentIndent = listPrefix.contentIndent
  }
  else if (
    line.trim()
    && context.listContentIndent != null
    && lineIndent.column < context.listContentIndent
    && !context.inFence
  ) {
    context.listContentIndent = null
  }

  if (!context.inMath && !context.inDollarMath) {
    const fenceMatch = matchMarkdownFenceMarker(line)
    if (fenceMatch) {
      if (context.inFence) {
        if (
          fenceMatch.markerChar === context.fenceChar
          && fenceMatch.markerLen >= context.fenceLen
          && /^\s*$/.test(fenceMatch.rest)
        ) {
          resetExplicitBracketFenceContext(context)
        }
      }
      else {
        context.inFence = true
        context.fenceChar = fenceMatch.markerChar
        context.fenceLen = fenceMatch.markerLen
        context.fenceInBlockquote = fenceMatch.inBlockquote
        context.fenceInList = fenceMatch.inList
          || (
            context.listContentIndent != null
            && !fenceMatch.inBlockquote
            && lineIndent.column >= context.listContentIndent
          )
        context.fenceListIndent = fenceMatch.listIndent || context.listContentIndent || 0
      }
    }
    else if (!context.inFence) {
      return scanLineForExplicitBracketMathState(line, context, lineStart, appendStart, openAtAppendStart)
    }
  }
  else {
    return scanLineForExplicitBracketMathState(line, context, lineStart, appendStart, openAtAppendStart)
  }

  return false
}

function scanExplicitBracketMathStreamState(
  source: string,
  initialContext: ExplicitBracketMathContext = createExplicitBracketMathContext(),
  appendStart: number | null = null,
  openAtAppendStart = false,
  sourceOffset = 0,
) {
  const context = cloneExplicitBracketMathContext(initialContext)
  let committedContext = cloneExplicitBracketMathContext(initialContext)
  let lineBuffer = ''
  let closedOpenMath = false
  let index = 0

  while (index < source.length) {
    const newlineIndex = source.indexOf('\n', index)
    const hasNewline = newlineIndex !== -1
    const lineEnd = hasNewline && newlineIndex > index && source[newlineIndex - 1] === '\r'
      ? newlineIndex - 1
      : hasNewline ? newlineIndex : source.length
    const line = source.slice(index, lineEnd)

    if (scanExplicitBracketMathLine(line, context, sourceOffset + index, appendStart, openAtAppendStart))
      closedOpenMath = true

    if (hasNewline) {
      committedContext = cloneExplicitBracketMathContext(context)
      lineBuffer = ''
    }
    else {
      lineBuffer = line
    }

    index = hasNewline ? newlineIndex + 1 : source.length
  }

  return {
    closedOpenMath,
    state: {
      committedContext,
      context,
      lineBuffer,
    },
  }
}

function updateExplicitBracketMathStreamState(
  previous: ExplicitBracketMathStreamState,
  appended: string,
  lineBufferStartOffset = 0,
) {
  if (
    appended
    && !previous.context.inMath
    && !previous.context.inDollarMath
    && !previous.context.inFence
    && !previous.committedContext.inFence
    && !/[\\$`~\r\n]/.test(appended)
    && !(previous.lineBuffer.endsWith('\\') && (appended[0] === '[' || appended[0] === ']'))
  ) {
    return {
      closedOpenMath: false,
      state: {
        committedContext: cloneExplicitBracketMathContext(previous.committedContext),
        context: cloneExplicitBracketMathContext(previous.context),
        lineBuffer: previous.lineBuffer + appended,
      },
    }
  }

  return scanExplicitBracketMathStreamState(
    previous.lineBuffer + appended,
    previous.committedContext,
    lineBufferStartOffset + previous.lineBuffer.length,
    previous.context.inMath || previous.context.inDollarMath,
    lineBufferStartOffset,
  )
}

function syncTolerantMathBoundaryStreamCache(md: MarkdownIt, source: string) {
  if (!hasMarkstreamMathPlugin(md))
    return

  const stream = md.stream
  if (typeof stream?.reset !== 'function')
    return

  const owner = md as unknown as object
  const previous = tolerantMathBoundaryStreamCache.get(owner)

  if (previous?.source === source)
    return

  const sourceExtendsPrevious = previous ? source.startsWith(previous.source) : false
  const appended = sourceExtendsPrevious && previous ? source.slice(previous.source.length) : ''
  const explicitBracketMathUpdate = sourceExtendsPrevious && previous
    ? updateExplicitBracketMathStreamState(
        previous.explicitBracketMath,
        appended,
        previous.source.length - previous.explicitBracketMath.lineBuffer.length,
      )
    : scanExplicitBracketMathStreamState(source)
  const nextExplicitBracketMath = explicitBracketMathUpdate.state
  const completesExplicitBracketMathClose = sourceExtendsPrevious && previous
    ? explicitBracketMathUpdate.closedOpenMath
    : false

  if (previous && sourceExtendsPrevious) {
    if (
      previous.key === null
      && previous.pendingCandidate === false
      && !completesExplicitBracketMathClose
      && !appendedChunkMayAffectTolerantMathBoundary(previous.source, appended)
      && !sourceEndsWithSplitTolerantBoundaryPrefix(source)
    ) {
      previous.source = source
      previous.explicitBracketMath = nextExplicitBracketMath
      return
    }
  }

  const nextKey = getTolerantMathBlockBoundaryStreamKey(source)
  const sourceWasReplaced = previous ? !sourceExtendsPrevious : false

  if (previous && (sourceWasReplaced || previous.key !== nextKey || completesExplicitBracketMathClose))
    stream.reset()
  else if (!previous && nextKey)
    stream.reset()

  setTolerantMathBoundaryStreamCache(md, source, nextKey, nextExplicitBracketMath)
}

function shouldCloneTopLevelStreamTokens(options: ParseOptions) {
  return typeof options.preTransformTokens === 'function'
    || typeof options.postTransformTokens === 'function'
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

function isSameTokenShape(left: Token | undefined, right: Token | undefined) {
  return !!left
    && !!right
    && left.type === right.type
    && left.tag === right.tag
    && left.nesting === right.nesting
    && left.markup === right.markup
    && left.content === right.content
    && sameTokenMap(left, right)
}

function isParagraphTokenTriplet(tokens: Token[], index: number) {
  return tokens[index]?.type === 'paragraph_open'
    && tokens[index + 1]?.type === 'inline'
    && tokens[index + 2]?.type === 'paragraph_close'
}

function hasAdjacentDuplicateParagraphTokenTriplet(tokens: Token[]) {
  for (let index = 0; index + 5 < tokens.length; index++) {
    if (
      isParagraphTokenTriplet(tokens, index)
      && isParagraphTokenTriplet(tokens, index + 3)
      && isSameTokenShape(tokens[index], tokens[index + 3])
      && isSameTokenShape(tokens[index + 1], tokens[index + 4])
      && isSameTokenShape(tokens[index + 2], tokens[index + 5])
    ) {
      return true
    }
  }

  return false
}

function shouldFallbackDuplicateTolerantMathStreamTokens(
  md: MarkdownIt,
  source: string,
  tokens: Token[],
) {
  return hasMarkstreamMathPlugin(md)
    && mayContainTolerantMathBlockBoundaryOpener(source)
    && hasAdjacentDuplicateParagraphTokenTriplet(tokens)
}

function shouldUseSyncParseForPendingTolerantMathBoundary(md: MarkdownIt) {
  const cache = tolerantMathBoundaryStreamCache.get(md as unknown as object)
  return typeof cache?.key === 'string' && cache.key.startsWith('pending:')
}

function parseTopLevelTokens(
  md: MarkdownIt,
  source: string,
  env: Record<string, unknown>,
  options: ParseOptions,
) {
  const owner = md as unknown as object
  if (options.customHtmlTags?.length)
    env.__markstreamCustomHtmlTags = options.customHtmlTags

  if (!shouldUseTopLevelStreamParse(md, options)) {
    topLevelStreamParseMode.set(owner, 'sync')
    return md.parse(source, env)
  }

  syncTolerantMathBoundaryStreamCache(md, source)
  if (shouldUseSyncParseForPendingTolerantMathBoundary(md)) {
    topLevelStreamParseMode.set(owner, 'sync')
    return md.parse(source, env)
  }

  const tokens = md.stream!.parse!(source, getStableStreamEnv(md, env))
  if (shouldFallbackDuplicateTolerantMathStreamTokens(md, source, tokens)) {
    md.stream?.reset?.()
    topLevelStreamParseMode.set(owner, 'sync')
    return md.parse(source, env)
  }

  const stats = md.stream?.stats?.() as { lastMode?: string } | undefined
  topLevelStreamParseMode.set(owner, stats?.lastMode ?? 'stream')

  if (!shouldCloneTopLevelStreamTokens(options))
    return tokens

  const timing = getParseTiming(options)
  if (!timing)
    return cloneMarkdownTokens(tokens, true)

  const startedAt = getParserNow()
  const cloned = cloneMarkdownTokens(tokens, true)
  addTiming(timing, 'tokenCloneMs', getParserNow() - startedAt)
  return cloned
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
  const raw = node.raw
  if (typeof raw === 'string')
    return raw

  const content = getNodeFields(node).content
  if (typeof content === 'string')
    return content

  if (node.type === 'hardbreak')
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

function inheritSourceMap(nodes: ParsedNode[], sourceNode: ParsedNode) {
  if (!sourceNode.sourceMap)
    return

  for (const node of nodes) {
    if (!node.sourceMap)
      node.sourceMap = sourceNode.sourceMap
  }
}

function maybePromoteCustomNodeFromParagraph(node: ParsedNode, options?: ParseOptions) {
  if (node.type !== 'paragraph')
    return null

  const nodeChildren = getNodeFields(node).children
  const children: ParsedNode[] = Array.isArray(nodeChildren) ? nodeChildren : []
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
    const childContent = String(getNodeFields(child).content ?? '')
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
  const raw = node.raw
  if (typeof raw === 'string')
    return raw

  const content = getNodeFields(node).content
  if (typeof content === 'string')
    return content

  return ''
}

function isCloseOnlyHtmlBlockForTag(node: ParsedNode, tag: string) {
  if (node.type !== 'html_block' || !tag)
    return false

  const raw = String(node.raw ?? node.content ?? '')
  return new RegExp(String.raw`^\s*<\s*\/\s*${escapeTagForRegExp(tag)}\s*>\s*$`, 'i').test(raw)
}

const RAW_TEXT_HTML_TAGS = new Set(['iframe', 'script', 'style', 'textarea', 'title'])

function findNextHtmlBlockFromSource(source: string, tag: string, startIndex: number) {
  if (!source || !tag)
    return null

  const lowerTag = tag.toLowerCase()
  const readMarkup = (start: number) => {
    if (source.startsWith('<!--', start)) {
      const commentEnd = source.indexOf('-->', start + 4)
      return {
        closing: false,
        end: commentEnd === -1 ? source.length : commentEnd + 3,
        selfClosing: false,
        tag: '',
      }
    }

    if (source.startsWith('<![CDATA[', start)) {
      const cdataEnd = source.indexOf(']]>', start + 9)
      return {
        closing: false,
        end: cdataEnd === -1 ? source.length : cdataEnd + 3,
        selfClosing: false,
        tag: '',
      }
    }

    const endRel = findTagCloseIndexOutsideQuotes(source.slice(start))
    if (endRel === -1)
      return null

    const end = start + endRel + 1
    const raw = source.slice(start, end)
    if (/^<\s*[!?]/.test(raw)) {
      return {
        closing: false,
        end,
        selfClosing: false,
        tag: '',
      }
    }

    let body = raw.slice(1).trimStart()
    const closing = body.startsWith('/')
    if (closing)
      body = body.slice(1).trimStart()
    const tagMatch = body.match(/^([A-Z][\w:-]*)/i)
    if (!tagMatch?.[1]) {
      return {
        closing: false,
        end: start + 1,
        selfClosing: false,
        tag: '',
      }
    }

    return {
      closing,
      end,
      selfClosing: /\/\s*>$/.test(raw),
      tag: tagMatch[1].toLowerCase(),
    }
  }

  const findRawTextClose = (rawTextTag: string, from: number) => {
    const closeRe = new RegExp(String.raw`<\s*\/\s*${escapeTagForRegExp(rawTextTag)}(?=\s|>)`, 'gi')
    closeRe.lastIndex = from
    const match = closeRe.exec(source)
    if (!match || match.index == null)
      return null
    const markup = readMarkup(match.index)
    return markup ? { start: match.index, end: markup.end } : null
  }

  let start = -1
  let openEnd = -1
  let searchIndex = Math.max(0, startIndex)
  while (searchIndex < source.length) {
    const lt = source.indexOf('<', searchIndex)
    if (lt === -1)
      return null
    const markup = readMarkup(lt)
    if (!markup)
      return null
    if (!markup.closing && markup.tag === lowerTag) {
      start = lt
      openEnd = markup.end - 1
      break
    }
    if (!markup.closing && RAW_TEXT_HTML_TAGS.has(markup.tag)) {
      const close = findRawTextClose(markup.tag, markup.end)
      searchIndex = close?.end ?? source.length
      continue
    }
    searchIndex = markup.end
  }

  if (start === -1 || openEnd === -1)
    return null

  const openTag = source.slice(start, openEnd + 1)
  if (VOID_HTML_TAGS.has(lowerTag) || /\/\s*>$/.test(openTag)) {
    return {
      raw: openTag,
      start,
      end: openEnd + 1,
      closed: true,
    }
  }

  if (RAW_TEXT_HTML_TAGS.has(lowerTag)) {
    const close = findRawTextClose(lowerTag, openEnd + 1)
    if (!close) {
      return {
        raw: source.slice(start),
        start,
        end: source.length,
        closed: false,
      }
    }
    return {
      raw: source.slice(start, close.end),
      start,
      end: close.end,
      closeStart: close.start,
      closed: true,
    }
  }

  let depth = 1
  let index = openEnd + 1

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

    const markup = readMarkup(lt)
    if (!markup)
      return null

    if (markup.closing && markup.tag === lowerTag) {
      depth--
      const end = markup.end
      if (depth === 0) {
        return {
          raw: source.slice(start, end),
          start,
          end,
          closeStart: lt,
          closed: true,
        }
      }
      index = end
      continue
    }

    if (!markup.closing && markup.tag === lowerTag) {
      if (!markup.selfClosing && !VOID_HTML_TAGS.has(markup.tag))
        depth++
      index = markup.end
      continue
    }

    if (!markup.closing && RAW_TEXT_HTML_TAGS.has(markup.tag)) {
      const close = findRawTextClose(markup.tag, markup.end)
      index = close?.end ?? source.length
      continue
    }

    index = markup.end
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

function isDetailsOpenHtmlBlock(node: ParsedNode): node is HtmlBlockNode {
  if (node.type !== 'html_block')
    return false
  if (String(node.tag ?? '').toLowerCase() !== 'details')
    return false
  const raw = String(node.raw ?? node.content ?? '')
  return /^\s*<details\b/i.test(raw)
}

function isDetailsCloseHtmlBlock(node: ParsedNode): node is HtmlBlockNode {
  if (node.type !== 'html_block')
    return false
  const raw = String(node.raw ?? node.content ?? '')
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

function buildDetailsChildParseOptions(options: ParseOptions, final: boolean): InternalParseOptions {
  return {
    final,
    __disableStreamParse: true,
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
    const childFields = getNodeFields(child)
    return Array.isArray(childFields.children) && childFields.children.length > 0
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

function splitSiblingHtmlBlockFragments(fragment: string) {
  const blocks: string[] = []
  let cursor = 0

  while (cursor < fragment.length) {
    while (/\s/.test(fragment[cursor] ?? ''))
      cursor++
    if (cursor >= fragment.length)
      break

    const tagMatch = fragment.slice(cursor).match(/^<([A-Z][\w:-]*)/i)
    if (!tagMatch?.[1])
      return null

    const exact = findNextHtmlBlockFromSource(fragment, tagMatch[1], cursor)
    if (!exact || exact.start !== cursor)
      return null

    blocks.push(exact.raw)
    cursor = exact.end
  }

  return blocks.length > 1 ? blocks : null
}

function parseSiblingHtmlBlockChildren(
  blocks: string[],
  md: MarkdownIt,
  options: ParseOptions,
  final: boolean,
) {
  const customHtmlTags = options.customHtmlTags?.join('\0') ?? ''
  const cacheOwner = md as unknown as object
  const previous = siblingHtmlChildrenCache.get(cacheOwner)
  const canReuse = previous
    && previous.final === final
    && previous.customHtmlTags === customHtmlTags
    && previous.requireClosingStrong === options.requireClosingStrong
    && previous.validateLink === options.validateLink

  const children = blocks.map((block, index) => {
    if (canReuse && previous.blocks[index] === block)
      return previous.children[index]
    return parseDetailsFragmentChildren(block, md, options)
  })

  siblingHtmlChildrenCache.set(cacheOwner, {
    blocks,
    children,
    customHtmlTags,
    final,
    requireClosingStrong: options.requireClosingStrong,
    validateLink: options.validateLink,
  })

  return children.flat()
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

    const fields = getNodeFields(node)
    const tag = String(fields.tag ?? '').toLowerCase()
    if (!tag || tag === 'details' || NON_STRUCTURING_HTML_TAGS.has(tag) || Array.isArray(fields.children))
      return node

    const raw = String(node.raw ?? fields.content ?? '')
    if (!raw)
      return node

    const openEnd = findTagCloseIndexOutsideQuotes(raw)
    if (openEnd === -1)
      return node

    const exact = findNextHtmlBlockFromSource(raw, tag, 0)
    const closeStart = exact?.closeStart ?? -1
    const hasClose = exact?.closed === true && closeStart >= openEnd + 1
    const innerRaw = hasClose
      ? raw.slice(openEnd + 1, closeStart)
      : raw.slice(openEnd + 1)

    if (!innerRaw.trim())
      return node

    const childOptions = buildDetailsChildParseOptions(options, final)
    const siblingHtmlBlocks = hasClose ? null : splitSiblingHtmlBlockFragments(innerRaw)
    const children = siblingHtmlBlocks
      ? parseSiblingHtmlBlockChildren(siblingHtmlBlocks, md, childOptions, final)
      : parseDetailsFragmentChildren(innerRaw, md, childOptions)
    if (!shouldStructureGenericHtmlBlockChildren(innerRaw, children))
      return node

    return {
      ...node,
      children,
    } as ParsedNode
  })
}

function hasTopLevelHtmlBlock(nodes: ParsedNode[]) {
  for (const node of nodes) {
    if (node?.type === 'html_block')
      return true
  }
  return false
}

function parseDetailsFragmentChildren(
  fragment: string,
  md: MarkdownIt,
  options: ParseOptions,
) {
  if (!fragment.trim())
    return []

  const internalOptions: InternalParseOptions = {
    ...(options as InternalParseOptions),
    __disableStreamParse: true,
    __disableStructuredReuse: true,
  }

  return parseMarkdownToStructure(fragment, md, internalOptions)
}

function parseSummaryChildren(
  fragment: string,
  md: MarkdownIt,
  options: ParseOptions,
) {
  const children = parseDetailsFragmentChildren(fragment, md, options)
  const onlyChild = children[0] as ParsedNode & { children?: ParsedNode[] } | undefined
  if (children.length === 1 && onlyChild?.type === 'paragraph' && Array.isArray(onlyChild.children))
    return onlyChild.children
  return children
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
    const children = parseSummaryChildren(summaryInner, md, options)
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

    const openRaw = String(node.raw ?? getMergeableNodeRaw(node) ?? '')
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

    const closeRaw = closeIndex === -1
      ? '</details>'
      : String(nodes[closeIndex].raw ?? getMergeableNodeRaw(nodes[closeIndex]) ?? '</details>')
    const explicitClose = selfContained || (closeIndex !== -1 && exact?.closed === true)
    const trimmedCloseRaw = closeRaw.replace(/[\t\r\n ]+$/, '')
    const closeStart = explicitClose
      ? (() => {
          const closeOffset = (exact?.raw ?? '').lastIndexOf(trimmedCloseRaw)
          return closeOffset === -1 ? source.length : openStart + closeOffset
        })()
      : source.length
    const openTagEndIndex = findTagCloseIndexOutsideQuotes(openRaw)
    // Derive the content boundaries from the source open tag rather than the
    // cached fragment raw: the stream can commit the `<details>` opener as a
    // stable group before its `<summary>` arrives, freezing a partial fragment
    // (`<details open>\n`). Only the source is authoritative for where the
    // opener ends and the rendered middle begins, so a full parse and the
    // split-fragment stream produce identical content.
    const middleSourceStart = openTagEndIndex !== -1
      ? openStart + openTagEndIndex + 1
      : openStart + openRaw.length
    const middleSource = source.slice(middleSourceStart, closeStart === -1 ? source.length : closeStart)
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

    // Cached path: a reused (stable-prefix) details opener keeps the same node
    // identity across appends, and its middle source is unchanged, so the
    // stitched output from a previous append can be reused instead of
    // re-parsing + re-rendering the whole (unchanged) middle on every commit.
    // Only consulted when the current top-level parse actually reused nodes;
    // on full-reparse commits the opener objects are fresh, so a cache lookup
    // would be pure overhead.
    const reuseActive = (options as InternalParseOptions).__structuredReuseTailStart !== undefined
      && (options as InternalParseOptions).__structuredReuseTailStart! > 0
    const perMdStitchCache = reuseActive
      ? (detailsStitchCache.get(md as unknown as object) ?? (() => {
          const inner = new WeakMap<object, { openRaw: string, explicitClose: boolean, closeSliceEnd: number, middleSource: string, node: ParsedNode }>()
          detailsStitchCache.set(md as unknown as object, inner)
          return inner
        })())
      : undefined
    const cachedDetails = perMdStitchCache?.get(node)
    if (cachedDetails
      && cachedDetails.openRaw === openRaw
      && cachedDetails.explicitClose === explicitClose
      && cachedDetails.closeSliceEnd === closeSliceEnd
      && cachedDetails.middleSource === middleSource) {
      merged.push(cachedDetails.node)
      cursor = explicitClose ? closeSliceEnd : source.length
      if (closeIndex === -1 && !selfContained)
        break
      if (closeIndex !== -1)
        i = closeIndex
      continue
    }

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
    let prefixChildren = buildDetailsPrefixChildren(
      effectiveOpenRaw,
      md,
      buildDetailsChildParseOptions(options, final),
    )

    // The stream can commit the `<details>` opener as a stable group before its
    // `<summary>` arrives, freezing a partial fragment that contains no summary
    // (and, depending on the split, the summary may or may not have its own
    // node in the array). A full parse always structures the summary, so
    // recover it here to keep the streamed output identical to the cold parse:
    // - if the summary is a leading raw middle fragment, structure it in place;
    // - otherwise reconstruct it from the source and prepend it to the prefix.
    let structuredChildren = children
    const leadingChild = children[0] as ParsedNodeWithFields | undefined
    const hasPrefixSummary = prefixChildren.some((child) => {
      const fields = child as ParsedNodeWithFields
      return fields?.type === 'html_block' && String(fields.tag ?? '').toLowerCase() === 'summary'
    })
    if (!hasPrefixSummary) {
      if (leadingChild?.type === 'html_block'
        && String(leadingChild.tag ?? '').toLowerCase() === 'summary'
        && !Array.isArray(leadingChild.children)) {
        structuredChildren = [
          buildStructuredSummaryNode(String(leadingChild.raw ?? leadingChild.content ?? ''), md, buildDetailsChildParseOptions(options, final)),
          ...children.slice(1),
        ]
      }
      else if (openTagEndIndex !== -1) {
        const summaryBlock = findNextHtmlBlockFromSource(source, 'summary', openStart + openTagEndIndex + 1)
        if (summaryBlock && summaryBlock.closed) {
          const gap = source.slice(openStart + openTagEndIndex + 1, summaryBlock.start)
          if (/^[\t \r\n]*$/.test(gap)) {
            prefixChildren = [
              buildStructuredSummaryNode(summaryBlock.raw, md, buildDetailsChildParseOptions(options, final)),
              ...prefixChildren,
            ]
          }
        }
      }
    }

    const middleTokens = md.parse(middleSource, { __markstreamFinal: final }) as unknown as MarkdownToken[]
    const renderedMiddle = md.renderer.render(
      middleTokens as unknown as Token[],
      md.options,
      { __markstreamFinal: final },
    )

    const contentPrefix = openTagEndIndex !== -1
      ? source.slice(openStart, openStart + openTagEndIndex + 1)
      : openRaw

    const detailsNode = {
      ...node,
      tag: 'details',
      attrs: parseTagAttrs(openRaw.slice(0, openTagEndIndex + 1)),
      raw: mergedRaw,
      content: `${contentPrefix}${renderedMiddle}${renderedCloseRaw}`,
      children: [...prefixChildren, ...structuredChildren],
      loading: !final && !explicitClose,
    } as ParsedNode

    if (options.includeSourceMap)
      detailsNode.sourceMap = createSourceMapFromOffsets(source, openStart, explicitClose ? closeSliceEnd : source.length, options)

    // Only closed details are cached: an open details grows every append, so
    // caching it would return a stale (still-loading) node once its close
    // arrives (the open-to-closed transition can share the same middleSource).
    if (perMdStitchCache && explicitClose)
      perMdStitchCache.set(node, { openRaw, explicitClose, closeSliceEnd, middleSource, node: detailsNode })

    merged.push(detailsNode)

    cursor = explicitClose ? closeSliceEnd : source.length
    if (closeIndex === -1 && !selfContained)
      break
    if (closeIndex !== -1)
      i = closeIndex
  }

  return [merged, cursor]
}

function mergeSplitTopLevelHtmlBlocks(nodes: ParsedNode[], final: boolean, source: string, options?: ParseOptions) {
  if (!source)
    return nodes

  const merged = nodes.slice()
  let sourceHtmlCursor = 0

  for (let i = 0; i < merged.length; i++) {
    const node = merged[i]
    const nodeRaw = getMergeableNodeRaw(node)
    const nodePos = nodeRaw ? source.indexOf(nodeRaw, sourceHtmlCursor) : -1
    if (node?.type !== 'html_block') {
      if (nodePos !== -1)
        sourceHtmlCursor = nodePos + nodeRaw.length
      continue
    }

    const tag = String(node.tag ?? '').toLowerCase()
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

    const currentContent = String(node.content ?? nodeRaw)
    const currentRaw = String(node.raw ?? currentContent)
    const currentRawEnd = nodePos + currentRaw.length
    if (
      nodePos !== -1
      && exact.end < currentRawEnd
      && source.slice(nodePos, currentRawEnd) === currentRaw
    ) {
      sourceHtmlCursor = currentRawEnd
      if (options?.includeSourceMap)
        node.sourceMap = createSourceMapFromOffsets(source, nodePos, currentRawEnd, options)
      continue
    }

    const nextContent = buildHtmlBlockContent(exact.raw, tag, exact.closed)
    const desiredLoading = !final && !exact.closed
    const needsExpansion = currentContent !== nextContent || currentRaw !== exact.raw || Boolean(node.loading) !== desiredLoading
    const exactOpenEnd = findTagCloseIndexOutsideQuotes(exact.raw)
    const exactOpenTag = exactOpenEnd === -1 ? '' : exact.raw.slice(0, exactOpenEnd + 1)
    const exactAttrs = exactOpenTag ? parseTagAttrs(exactOpenTag) : []

    node.content = nextContent
    node.raw = exact.raw
    node.loading = desiredLoading
    node.attrs = exactAttrs.length ? exactAttrs : undefined
    if (options?.includeSourceMap)
      node.sourceMap = createSourceMapFromOffsets(source, exact.start, exact.end, options)

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
        const range = internalNodeSourceRanges.get(merged[j])
        if (!range)
          break
        if (range.start >= exact.start && range.end <= exact.end) {
          merged.splice(j, 1)
          continue
        }
        break
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

    if (tail.startsWith('<!--') || tail.startsWith('<?') || tail.startsWith('<!'))
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

  // Delegate to the full fence scanner used elsewhere: the previous local
  // scanner only recognized direct and blockquote-prefixed fences, so a
  // fence nested inside a list item (`- ```html` / `  <div`) was invisible
  // and the incomplete `<div` tail got truncated from the code content on
  // every non-final commit. `isInsideOpenMarkdownFenceBeforeOffset` also
  // handles list/blockquote fence exit conditions (de-dent ends the fence).
  const isInsideFencedCodeBlock = (src: string, pos: number) =>
    isInsideOpenMarkdownFenceBeforeOffset(src, pos)

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

function createSourceLineMapper(source: string, parsedSource: string) {
  if (source === parsedSource)
    return undefined

  const sourceLines = source.split(/\r?\n/)
  const parsedLines = parsedSource.split(/\r?\n/)
  const mappedLines: Array<{ startLine: number, endLine: number }> = []
  let sourceCursor = 0

  for (let parsedLine = 0; parsedLine < parsedLines.length; parsedLine++) {
    const line = parsedLines[parsedLine] ?? ''

    if (sourceLines[sourceCursor] === line) {
      mappedLines[parsedLine] = {
        startLine: sourceCursor,
        endLine: sourceCursor + 1,
      }
      sourceCursor++
      continue
    }

    const sourceLine = sourceLines[sourceCursor] ?? ''
    if (line !== '' && sourceLine !== line && sourceLine.startsWith(line)) {
      let joinedLine = line
      let splitEnd = -1
      for (let nextParsedLine = parsedLine + 1; nextParsedLine < parsedLines.length; nextParsedLine++) {
        joinedLine += parsedLines[nextParsedLine] ?? ''
        if (joinedLine === sourceLine) {
          splitEnd = nextParsedLine
          break
        }
        if (!sourceLine.startsWith(joinedLine))
          break
      }

      if (splitEnd !== -1) {
        for (let mappedLine = parsedLine; mappedLine <= splitEnd; mappedLine++) {
          mappedLines[mappedLine] = {
            startLine: sourceCursor,
            endLine: sourceCursor + 1,
          }
        }
        sourceCursor++
        parsedLine = splitEnd
        continue
      }

      mappedLines[parsedLine] = {
        startLine: sourceCursor,
        endLine: sourceCursor + 1,
      }
      continue
    }

    let collapsedLine = sourceLines[sourceCursor] ?? ''
    let collapsedEnd = -1
    for (let sourceLine = sourceCursor + 1; sourceLine < sourceLines.length; sourceLine++) {
      collapsedLine += `\\n${sourceLines[sourceLine] ?? ''}`
      if (collapsedLine === line) {
        collapsedEnd = sourceLine + 1
        break
      }
      if (!line.startsWith(collapsedLine))
        break
    }

    if (collapsedEnd !== -1) {
      mappedLines[parsedLine] = {
        startLine: sourceCursor,
        endLine: collapsedEnd,
      }
      sourceCursor = collapsedEnd
      continue
    }

    let found = -1
    if (line !== '') {
      const searchEnd = Math.min(sourceLines.length, sourceCursor + 80)
      for (let sourceLine = sourceCursor; sourceLine < searchEnd; sourceLine++) {
        if (sourceLines[sourceLine] === line) {
          found = sourceLine
          break
        }
      }
    }

    if (found !== -1) {
      mappedLines[parsedLine] = {
        startLine: found,
        endLine: found + 1,
      }
      sourceCursor = found + 1
      continue
    }

    const fallbackLine = Math.min(
      Math.max(0, sourceLines.length - 1),
      Math.max(0, sourceCursor - 1),
    )
    mappedLines[parsedLine] = {
      startLine: fallbackLine,
      endLine: fallbackLine + 1,
    }
  }

  return (line: number) => {
    const index = Number.isFinite(line) ? Math.max(0, Math.trunc(line)) : 0
    if (index < mappedLines.length)
      return mappedLines[index] ?? { startLine: 0, endLine: 0 }

    const lastMapped = mappedLines[mappedLines.length - 1] ?? {
      startLine: Math.max(0, sourceLines.length - 1),
      endLine: sourceLines.length,
    }
    const startLine = Math.min(sourceLines.length, lastMapped.endLine + index - mappedLines.length)
    return {
      startLine,
      endLine: Math.min(sourceLines.length, startLine + 1),
    }
  }
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

/**
 * Math-context scanner used to gate the transport-split LaTeX-command
 * reconstruction. Tracks fenced code (including list/blockquote-prefixed
 * fences via matchMarkdownFenceMarker), backtick spans, $$...$$ blocks,
 * \[...\] spans and single-$ math.
 *
 * Single-$ math is line-scoped (markdown-it-math never lets $...$ span a
 * line break): the opener state resets at every line break. A $ that is the
 * last char of a line counts as an opener because a transport split can land
 * exactly after it (`$\nabla$` -> "$" + newline + "abla$").
 *
 * The scanner is a pure function of the consumed text, so the append-only
 * windowed fast path in getSafeMarkdown stays deterministic.
 */
function createLatexSplitMathScanner(source: string) {
  let inFence = false
  let fenceMarker: '`' | '~' | '' = ''
  let fenceLen = 0
  let inDollarBlock = false
  let inBracketMath = false
  let singleDollarOpen = false
  let scanned = 0

  const processLine = (line: string, _lineStartOffset: number) => {
    const fenceMatch = matchMarkdownFenceMarker(line)
    if (fenceMatch) {
      if (inFence) {
        if (fenceMatch.markerChar === fenceMarker && fenceMatch.markerLen >= fenceLen && /^\s*$/.test(fenceMatch.rest)) {
          inFence = false
          fenceMarker = ''
          fenceLen = 0
        }
      }
      else {
        inFence = true
        fenceMarker = fenceMatch.markerChar
        fenceLen = fenceMatch.markerLen
      }
      return
    }

    if (inFence)
      return

    let i = 0
    while (i < line.length) {
      if (inDollarBlock) {
        if (line.startsWith('$$', i) && !isEscapedDelimiterAt(line, i)) {
          inDollarBlock = false
          i += 2
        }
        else {
          i++
        }
        continue
      }

      if (inBracketMath) {
        if (line.startsWith('\\]', i) && !isEscapedDelimiterAt(line, i)) {
          inBracketMath = false
          i += 2
        }
        else {
          i++
        }
        continue
      }

      const ch = line[i]
      if (ch === '`') {
        const runLen = countRepeatedChar(line, i, '`')
        const closeIndex = findCodeSpanCloseIndex(line, i + runLen, runLen)
        if (closeIndex === -1)
          break // unclosed span: the rest of the line is code
        i = closeIndex + runLen
        continue
      }

      if (ch === '\\') {
        const next = line[i + 1]
        if (next === '[' && !isEscapedDelimiterAt(line, i)) {
          inBracketMath = true
          i += 2
        }
        else if (next === ']' && !isEscapedDelimiterAt(line, i) && !inBracketMath) {
          i += 2
        }
        else {
          i += 2 // escaped char (\$, \`, \\, ...)
        }
        continue
      }

      if (ch === '$') {
        if (line[i + 1] === '$' && !isEscapedDelimiterAt(line, i)) {
          inDollarBlock = true
          singleDollarOpen = false
          i += 2
          continue
        }
        if (singleDollarOpen) {
          singleDollarOpen = false
          i++
          continue
        }
        // Opener when followed by non-whitespace, or at end of line (a split
        // can land right after the opener). A $ followed by a digit is
        // currency in prose ("$5 total") and must not open math.
        const after = line[i + 1]
        if (after === undefined || ((after !== ' ' && after !== '\t') && !/\d/.test(after)))
          singleDollarOpen = true
        i++
        continue
      }

      i++
    }
  }

  const scanTo = (target: number) => {
    while (scanned < target) {
      const newlineIndex = source.indexOf('\n', scanned)
      const lineEndRaw = newlineIndex === -1 || newlineIndex >= target ? target : newlineIndex
      const lineEnd = lineEndRaw > scanned && source[lineEndRaw - 1] === '\r' ? lineEndRaw - 1 : lineEndRaw
      const line = source.slice(scanned, lineEnd)
      processLine(line, scanned)
      if (newlineIndex === -1 || newlineIndex >= target) {
        scanned = target
        break
      }
      singleDollarOpen = false // single-$ math never spans a line
      scanned = newlineIndex + 1
    }
  }

  return {
    scanTo,
    inMath: () => inDollarBlock || inBracketMath || singleDollarOpen,
  }
}

function transformStreamingSafeMarkdown(
  source: string,
  isFinal: boolean,
  md: MarkdownIt,
  options: ParseOptions,
) {
  // Reconstruct transport-split LaTeX commands ONLY inside open math contexts
  // ($...$ / $$...$$ / \[...\]). The previous version rewrote every soft line
  // break followed by `abla|eq|ot|exists`, which corrupted ordinary prose
  // ("First.\nother things" gained a literal backslash-n and merged
  // paragraphs). A bare CR (the \rho/\right split) cannot occur in prose, so
  // that reconstruction stays ungated.
  let safeMarkdown = source.replace(/([^\\])\r(ight|ho)/g, '$1\\r$2')
  const latexSplitMathScanner = createLatexSplitMathScanner(safeMarkdown)
  safeMarkdown = safeMarkdown.replace(/([^\\])\r?\n(abla|eq|ot|exists)/g, (full, before, cmd, offset) => {
    // Consume up to (not including) the newline at offset+1: the $ that opens
    // math may sit anywhere on this line, including as its last char.
    latexSplitMathScanner.scanTo(offset + 1)
    const shouldReconstruct = latexSplitMathScanner.inMath()
    // Consume the newline itself: single-$ math is line-scoped and resets.
    latexSplitMathScanner.scanTo(offset + full.length)
    return shouldReconstruct ? `${before}\\n${cmd}` : full
  })

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

    // The tolerant-math boundary scan is applied by the caller to the full
    // document (it carries incremental fence/math state across commits).
    safeMarkdown = getStreamingAdmonitionOpenTailReplacement(safeMarkdown, options.customHtmlTags) ?? safeMarkdown
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

  return safeMarkdown
}

function getSafeMarkdown(md: MarkdownIt, sourceMarkdown: string, isFinal: boolean, options: ParseOptions) {
  const owner = md as unknown as object
  const mode = `${isFinal ? 'final' : 'stream'}:${(options.customHtmlTags ?? []).join(',')}`
  const previous = safeMarkdownCache.get(owner)

  let safeMarkdown: string
  if (
    // Append-only streaming fast path: only the appended tail can introduce
    // new mid-state markers, and the prefix of the previous safe markdown was
    // already transformed identically. Transform a tail window of the RAW
    // source (old tail margin + appended chunk) and stitch it onto the cached
    // prefix, avoiding O(doc) regex scans on every commit (quadratic total
    // for long streaming documents).
    !isFinal
    && !options.customHtmlTags?.length
    && previous
    && previous.mode === mode
    && sourceMarkdown.length >= previous.source.length
    && sourceMarkdown.startsWith(previous.source)
  ) {
    // The window cut MUST be a raw-source index. The previous implementation
    // cut `previous.safeMarkdown` at a safeMarkdown index but sliced the raw
    // source with it: any char-inserting fix earlier in the document (e.g.
    // `\n(abla|eq|ot|exists)` / `\r(ight|ho)`) made the two index spaces
    // diverge and silently dropped/repeated chars at the seam.
    const windowStart = Math.max(0, previous.source.length - SAFE_MARKDOWN_WINDOW_MARGIN - SAFE_MARKDOWN_WINDOW_OVERLAP)
    const window = sourceMarkdown.slice(windowStart)
    const transformed = transformStreamingSafeMarkdown(window, isFinal, md, options)
    // Overlap verification: the part of the window that overlaps the previous
    // source (its first `previous.source.length - windowStart` chars) must be
    // byte-identical to the previous safe markdown tail. A re-transform of
    // unchanged source is deterministic, so equality proves the overlap region
    // had no char-inserting fixes (which would shift the seam) AND that the
    // appended chunk did not complete a cross-boundary fix (e.g. a trailing
    // `\r` followed by an appended `ight`). Any divergence falls back to a
    // full-document transform, which is always correct.
    const overlapLength = previous.source.length - windowStart
    const overlapOk = transformed.length >= overlapLength
      && transformed.slice(0, overlapLength) === previous.safeMarkdown.slice(-overlapLength)
    safeMarkdown = overlapOk
      ? previous.safeMarkdown.slice(0, previous.safeMarkdown.length - overlapLength) + transformed
      : transformStreamingSafeMarkdown(sourceMarkdown, isFinal, md, options)
  }
  else {
    safeMarkdown = transformStreamingSafeMarkdown(sourceMarkdown, isFinal, md, options)
  }

  // The tolerant-math boundary scan carries incremental fence/math state in
  // its own cache keyed by md, so it must always run on the full document
  // (not a tail window) — otherwise pre-window math openers would be
  // invisible and ambiguous tails would not be hidden.
  if (!isFinal)
    safeMarkdown = stripPendingExplicitMathTail(safeMarkdown, md)

  safeMarkdownCache.set(owner, { source: sourceMarkdown, safeMarkdown, mode })
  return safeMarkdown
}

export function parseMarkdownToStructure(
  markdown: string,
  md: MarkdownIt,
  options: ParseOptions = {},
): ParsedNode[] {
  const timing = getParseTiming(options)
  const parseStartedAt = timing ? getParserNow() : 0
  const isFinal = !!options.final
  // Ensure markdown is a string — guard against null/undefined inputs from callers
  // todo: 下面的特殊 math 其实应该更精确匹配到() 或者 $ $ 或者 \[ \] 内部的内容
  const sourceMarkdown = (markdown ?? '').toString()
  if (shouldResetTopLevelStreamCacheForFinalAutoParse(md, options)) {
    md.stream!.reset!()
    clearTolerantMathBoundaryStreamCache(md)
    // The safe-markdown cache is owned by the top-level streaming session;
    // a final auto-parse ends that session, so drop the retained source +
    // transform (the next stream parse starts a fresh document).
    safeMarkdownCache.delete(md as unknown as object)
    detailsStitchCache.delete(md as unknown as object)
  }

  const safeMarkdown = getSafeMarkdown(md, sourceMarkdown, isFinal, options)

  if (timing)
    addTiming(timing, 'safeMarkdownMs', getParserNow() - parseStartedAt)

  const standaloneHtmlDocument = parseStandaloneHtmlDocument(safeMarkdown)
  if (standaloneHtmlDocument) {
    if (options.includeSourceMap) {
      const sourceMapOptions: InternalParseOptions = {
        ...options,
        __sourceLineMapper: createSourceLineMapper(sourceMarkdown, safeMarkdown),
      }
      standaloneHtmlDocument[0].sourceMap = createSourceMapFromOffsets(safeMarkdown, 0, safeMarkdown.length, sourceMapOptions)
    }

    // Keep pre/post hooks observable for callers that rely on them for
    // instrumentation, but preserve the full-document html_block shape.
    const preHook = options.preTransformTokens
    const postHook = options.postTransformTokens
    if (shouldUseTopLevelStreamParse(md, options) || typeof preHook === 'function' || typeof postHook === 'function') {
      const rawTokens = parseTopLevelTokens(md, safeMarkdown, { __markstreamFinal: isFinal }, options) as unknown as MarkdownToken[]
      const hookedTokens = typeof preHook === 'function' ? (preHook(rawTokens) || rawTokens) : rawTokens
      if (typeof postHook === 'function')
        postHook(hookedTokens)
    }
    return finishParsedNodes(standaloneHtmlDocument, options, timing, parseStartedAt)
  }

  // Get tokens from markdown-it
  const tokenizeStartedAt = timing ? getParserNow() : 0
  const tokens = parseTopLevelTokens(md, safeMarkdown, { __markstreamFinal: isFinal }, options)
  if (timing)
    addTiming(timing, 'tokenizeMs', getParserNow() - tokenizeStartedAt)
  // Defensive: ensure tokens is an array
  if (!tokens || !Array.isArray(tokens))
    return finishParsedNodes([], options, timing, parseStartedAt)
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
  const mdAny = md as {
    options?: { validateLink?: (url: string) => boolean }
    validateLink?: (url: string) => boolean
    __markstreamOriginalValidateLink?: (url: string) => boolean
  }
  const directValidateLink = typeof mdAny.validateLink === 'function'
    && mdAny.__markstreamOriginalValidateLink
    && mdAny.validateLink !== mdAny.__markstreamOriginalValidateLink
    ? mdAny.validateLink
    : undefined
  const validateLink = options.validateLink
    ?? directValidateLink
    ?? mdAny.options?.validateLink
    ?? (typeof mdAny.validateLink === 'function' ? mdAny.validateLink : undefined)
  const internalOptions: InternalParseOptions = {
    ...options,
    validateLink,
    __markdownIt: md,
    __sourceLineMapper: options.includeSourceMap === true
      ? createSourceLineMapper(sourceMarkdown, safeMarkdown)
      : undefined,
    __sourceMarkdown: safeMarkdown,
    __customHtmlBlockCursor: 0,
  }
  let result = processTopLevelTokensWithReuse(md, safeMarkdown, transformedTokens, internalOptions, timing)

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
        const postProcessOptions: InternalParseOptions = {
          ...internalOptions,
          __customHtmlBlockCursor: 0,
        }
        result = processTokensWithTiming(postResult as unknown as MarkdownToken[], postProcessOptions, timing)
      }
      else {
        // Otherwise assume it returned ParsedNode[] and use it as-is
        result = postResult as unknown as ParsedNode[]
      }
    }
  }

  if (hasTopLevelHtmlBlock(result)) {
    const htmlPassesStartedAt = timing ? getParserNow() : 0
    result = mergeSplitTopLevelHtmlBlocks(result, isFinal, safeMarkdown, internalOptions)
    result = combineStructuredDetailsHtmlBlocks(result, safeMarkdown, md, internalOptions, isFinal)[0]
    result = structureGenericHtmlBlockChildren(result, md, internalOptions, isFinal)
    if (timing)
      addTiming(timing, 'htmlBlockPassesMs', getParserNow() - htmlPassesStartedAt)
  }

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

  result = applyPostTransformNodes(result, options) as ParsedNode[]

  if (options.debug) {
    console.log('Parsed Markdown Tree Structure:', result)
  }
  return finishTimedParse(result, timing, parseStartedAt)
}

// Process markdown-it tokens into our structured format
export function processTokens(tokens: MarkdownToken[], options?: ParseOptions): ParsedNode[] {
  // Defensive: ensure tokens is an array
  if (!tokens || !Array.isArray(tokens))
    return []

  const result: ParsedNode[] = []
  const linkifyContext = createLinkifyDemotionContextTracker(options)
  const seedRaws = (options as InternalParseOptions | undefined)?.__linkifyDemotionSeed
  if (Array.isArray(seedRaws) && seedRaws.length) {
    // Replay the reused prefix node raws into the demotion tracker. This is a
    // top-level-node granularity approximation: a full parse remembers raws at
    // nested granularity too (per-list-item paragraphs etc.). The demotion
    // heuristics absorb the difference (continuation inheritance + per-block
    // re-inference), and `test/linkify-seed-granularity.test.ts` pins the
    // streamed == cold behavior for mixed-feature prefixes.
    for (const raw of seedRaws)
      linkifyContext.remember(String(raw ?? ''))
  }
  const includeSourceMap = options?.includeSourceMap === true
  let i = 0
  // Note: table token normalization is applied during markdown-it parsing
  // via the `applyFixTableTokens` plugin (core.ruler.after('block')).
  // Link/strong/list-item fixes are applied during the inline stage by
  // their respective plugins. That keeps parsing-time fixes centralized
  // and avoids ad-hoc post-processing here.
  while (i < tokens.length) {
    const handled = parseCommonBlockToken(tokens, i, linkifyContext.options(), containerTokenHandlers)
    if (handled) {
      recordInternalNodeSourceRange(handled[0], tokens[i], options)
      result.push(handled[0])
      linkifyContext.remember(handled[0].raw)
      i = handled[1]
      continue
    }

    const token = tokens[i]
    switch (token.type) {
      case 'paragraph_open':
      {
        const paragraphRaw = String(tokens[i + 1]?.content ?? '')
        const paragraphNode = parseParagraph(tokens, i, linkifyContext.options(paragraphRaw)) as ParsedNode
        if (includeSourceMap)
          applyNodeSourceMap(paragraphNode, token, options)
        const promoted = maybePromoteCustomNodeFromParagraph(paragraphNode, options)
        if (promoted) {
          if (includeSourceMap)
            inheritSourceMap(promoted, paragraphNode)
          for (const node of promoted)
            recordInternalNodeSourceRange(node, token, options)
          result.push(...promoted)
        }
        else {
          recordInternalNodeSourceRange(paragraphNode, token, options)
          result.push(paragraphNode)
        }
        linkifyContext.remember(paragraphNode.raw)
        i += 3 // Skip paragraph_open, inline, paragraph_close
        break
      }

      case 'bullet_list_open':
      case 'ordered_list_open': {
        const [listNode, newIndex] = parseList(tokens, i, linkifyContext.options())
        if (includeSourceMap)
          applyNodeSourceMap(listNode, token, options)
        recordInternalNodeSourceRange(listNode, token, options)
        result.push(listNode)
        linkifyContext.remember(listNode.raw)
        i = newIndex
        break
      }

      case 'blockquote_open': {
        const [blockquoteNode, newIndex] = parseBlockquote(tokens, i, linkifyContext.options())
        if (includeSourceMap)
          applyNodeSourceMap(blockquoteNode, token, options)
        recordInternalNodeSourceRange(blockquoteNode, token, options)
        result.push(blockquoteNode)
        linkifyContext.remember(blockquoteNode.raw)
        i = newIndex
        break
      }

      case 'footnote_anchor':{
        const meta = (token.meta ?? {}) as Record<string, unknown>
        const id = String(meta.label ?? token.content ?? '')
        const footnoteAnchorNode = {
          type: 'footnote_anchor',
          id,
          raw: String(token.content ?? ''),
        } as ParsedNode
        if (includeSourceMap)
          applyNodeSourceMap(footnoteAnchorNode, token, options)
        recordInternalNodeSourceRange(footnoteAnchorNode, token, options)
        result.push(footnoteAnchorNode)
        linkifyContext.remember(String(token.content ?? ''))

        i++
        break
      }

      case 'hardbreak':
        result.push(parseHardBreak())
        linkifyContext.reset()
        i++
        break

      case 'text': {
        const content = String(token.content ?? '')
        // In stream mode, markdown-it can occasionally emit a root-level `text`
        // token (e.g. immediately after an HTML/custom block closes). Treat it
        // as a normal paragraph so the content isn't dropped.
        const paragraphNode = {
          type: 'paragraph',
          raw: content,
          children: content
            ? [{ type: 'text', content, raw: content } as ParsedNode]
            : [],
        } as ParsedNode
        if (includeSourceMap)
          applyNodeSourceMap(paragraphNode, token, options)
        recordInternalNodeSourceRange(paragraphNode, token, options)
        result.push(paragraphNode)
        linkifyContext.remember(content)
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
          const raw = String(token.content ?? '')
          const parsed = parseInlineTokens(token.children || [], raw, undefined, linkifyContext.options(raw))
          if (parsed.length === 0) {
            // no-op (matches previous behavior)
          }
          else if (parsed.every(n => n.type === 'html_block')) {
            if (includeSourceMap) {
              for (const node of parsed)
                applyNodeSourceMap(node, token, options)
            }
            for (const node of parsed)
              recordInternalNodeSourceRange(node, token, options)
            result.push(...parsed)
          }
          else {
            const paragraphNode = {
              type: 'paragraph',
              raw,
              children: parsed,
            } as ParsedNode
            if (includeSourceMap)
              applyNodeSourceMap(paragraphNode, token, options)
            const promoted = maybePromoteCustomNodeFromParagraph(paragraphNode, options)
            if (promoted) {
              if (includeSourceMap)
                inheritSourceMap(promoted, paragraphNode)
              for (const node of promoted)
                recordInternalNodeSourceRange(node, token, options)
              result.push(...promoted)
            }
            else {
              recordInternalNodeSourceRange(paragraphNode, token, options)
              result.push(paragraphNode)
            }
          }
          linkifyContext.remember(raw)
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
