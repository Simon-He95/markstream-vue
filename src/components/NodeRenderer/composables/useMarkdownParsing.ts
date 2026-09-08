import type {
  MarkdownIt,
  ParsedNode,
} from 'stream-markdown-parser'
import type { ComputedRef } from 'vue'
import type { CustomComponents } from '../../../types'
import type { NodeRendererProps } from '../../../types/node-renderer-props'
import {
  BLOCKED_HTML_TAGS,
  EXTENDED_STANDARD_HTML_TAGS,
  getMarkdown,
  mergeCustomHtmlTags,
  normalizeCustomHtmlTagName,
  parseMarkdownToStructure,
  resolveCustomHtmlTags,
} from 'stream-markdown-parser'
import { computed, markRaw, onScopeDispose, ref, watch } from 'vue'
import { getCustomCodeLanguageComponent } from '../../../utils/customCodeLanguageComponent'
import { isReservedNodeComponentKey } from '../../../utils/nodeComponents'

type RendererParseOptions = NonNullable<NodeRendererProps['parseOptions']>
interface StreamStatsLike {
  total?: number
  cacheHits?: number
  appendHits?: number
  tailHits?: number
  fullParses?: number
  chunkedParses?: number
  lastMode?: string
}

interface ParserTimingMetrics {
  tokenCloneMs?: number
  processTokensInputTokens?: number
  processTokensReusedTopLevelNodes?: number
  processTokensMs?: number
  safeMarkdownMs?: number
  tokenizeMs?: number
  htmlBlockPassesMs?: number
  parseMarkdownToStructureTotalMs?: number
}

interface ParsedNodeSignatureTimingMetrics {
  /** Instrumented wall time for timed signature calls, including timing overhead. */
  signatureMs: number
  stabilizeSignatureMs: number
  primeSignatureMs: number
  signatureCallCount: number
  stabilizeSignatureCallCount: number
  primeSignatureCallCount: number
}

interface ParsedNodeStabilizeMetrics {
  /** Count of reused nodes anywhere in nextNodes, including unchanged suffix nodes after dirtyStartIndex. */
  reusedNodeCount: number
  /** First boundary where previousNodes and nextNodes diverge; -1 means no dirty tail. */
  dirtyStartIndex: number
  /** Count of stable leading nodes in nextNodes. */
  stablePrefixNodeCount: number
  /** Count of nodes in the dirty tail across previousNodes and nextNodes. */
  dirtyTailNodeCount: number
}

interface ParsedNodeStabilizeResult {
  nodes: ParsedNode[]
  metrics: ParsedNodeStabilizeMetrics
}

interface ParsedNodeStabilizeOptions {
  canReuseNode?: (node: ParsedNode) => boolean
  reuseDirtyTail?: boolean
  scanStartIndex?: number
}

type GlobalReferenceScanner = (previous: string, next: string) => [
  mayAffectGlobalReferences: boolean,
  scannedChars: number,
]

interface StablePrefixReuseContext {
  content: string
  previousContent: string
  previousDirtyStartIndex: number
  parseOptions: RendererParseOptions
  customMarkdownIt: NodeRendererProps['customMarkdownIt']
  md: MarkdownIt
  scanGlobalReferenceAppend: GlobalReferenceScanner
}

export interface MarkdownParsingOptions {
  instanceMsgId: string
  renderContent: ComputedRef<string>
  effectiveFinal: ComputedRef<boolean | undefined>
  smoothStreamingEnabled?: ComputedRef<boolean>
  debugPerformanceEnabled: ComputedRef<boolean>
  customComponentsMap?: ComputedRef<Partial<CustomComponents>>
  logPerf: (label: string, data: Record<string, unknown>) => void
}

export interface MarkdownParsingState {
  effectiveCustomHtmlTags: ComputedRef<readonly string[]>
  effectiveCustomHtmlTagsSet: ComputedRef<Set<string>>
  mdBase: ComputedRef<MarkdownIt>
  mdInstance: ComputedRef<MarkdownIt>
  mergedParseOptions: ComputedRef<RendererParseOptions>
  getParsedNodesDirtyStartIndex: () => number
  getParsedNodesRevision: () => number
  parsedNodes: ComputedRef<ParsedNode[]>
}

function getAutoCustomHtmlTags(mapping: Partial<CustomComponents>) {
  return Object.entries(mapping)
    .map(([key, component]) => {
      const normalized = normalizeCustomHtmlTagName(key)
      return component != null
        && normalized
        && !isReservedNodeComponentKey(normalized)
        && !EXTENDED_STANDARD_HTML_TAGS.has(normalized)
        && !BLOCKED_HTML_TAGS.has(normalized)
        ? normalized
        : ''
    })
    .filter(Boolean)
}

function getCustomComponentsReuseKey(mapping: Partial<CustomComponents>) {
  return JSON.stringify(
    Object.entries(mapping)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, component]) => [key, getIdentityKey(component)]),
  )
}

// The reuse key is a pure function of the mapping's identity (component
// references are stable); cache it per mapping object so the JSON.stringify +
// sort + identity lookups don't rerun on every streaming commit. A new mapping
// reference still recomputes, so a consumer passing a fresh object per render
// simply misses the cache.
const customComponentsReuseKeyCache = new WeakMap<object, string>()

function getCachedCustomComponentsReuseKey(mapping: Partial<CustomComponents>) {
  const object = mapping as object
  const cached = customComponentsReuseKeyCache.get(object)
  if (cached !== undefined)
    return cached
  const key = getCustomComponentsReuseKey(mapping)
  customComponentsReuseKeyCache.set(object, key)
  return key
}

function hasCustomComponentBoundary(
  node: ParsedNode,
  mapping: Partial<CustomComponents>,
  cache: WeakMap<object, boolean>,
): boolean {
  const object = node as object
  if (cache.has(object))
    return cache.get(object)!

  const type = String(node.type).trim().toLowerCase()
  if (mapping[type]) {
    cache.set(object, true)
    return true
  }

  if (type === 'code_block') {
    const language = String((node as ParsedNode & { language?: string }).language ?? '').trim().toLowerCase()
    if (language && getCustomCodeLanguageComponent(mapping, language)) {
      cache.set(object, true)
      return true
    }
  }

  const record = node as ParsedNode & Record<string, unknown>
  cache.set(object, false)
  const hasBoundary = Object.values(record).some((value) => {
    if (Array.isArray(value)) {
      return value.some(child => isParsedNodeLike(child) && hasCustomComponentBoundary(child, mapping, cache))
    }
    return isParsedNodeLike(value) && hasCustomComponentBoundary(value, mapping, cache)
  })
  cache.set(object, hasBoundary)
  return hasBoundary
}

const DEFAULT_PARSE_COALESCE_MS = 80
const STREAM_STAT_COUNTER_KEYS: Array<keyof StreamStatsLike> = [
  'total',
  'cacheHits',
  'appendHits',
  'tailHits',
  'fullParses',
  'chunkedParses',
]
const PARSE_TIMING_KEYS: Array<keyof ParserTimingMetrics> = [
  'tokenCloneMs',
  'processTokensInputTokens',
  'processTokensReusedTopLevelNodes',
  'processTokensMs',
  'safeMarkdownMs',
  'tokenizeMs',
  'htmlBlockPassesMs',
  'parseMarkdownToStructureTotalMs',
]
const STRUCTURAL_OBJECT_FIELDS = new Set([
  'attrs',
  'data',
  'items',
  'header',
  'payload',
  'props',
  'rows',
  'cells',
  'term',
  'definition',
  'sourceMap',
])
const TEXT_SIGNATURE_FIELDS = ['raw', 'content', 'code', 'originalCode', 'updatedCode']
const MAX_SIGNATURE_DEPTH = 6
const MAX_SIGNATURE_KEYS = 80
const MAX_SIGNATURE_ARRAY_ITEMS = 200
const MAX_SIGNATURE_STRING_CHARS = 8192
const MAX_CHEAP_NODE_KEY_DEPTH = 4
const objectIdentityIds = new WeakMap<object, number>()
const nodeSignatureCache = new WeakMap<object, string>()
let nextObjectIdentityId = 1

function getNow() {
  return typeof performance !== 'undefined'
    ? performance.now()
    : Date.now()
}

function readStreamStats(md: MarkdownIt): StreamStatsLike | null {
  const stream = md.stream
  if (!stream || typeof stream.stats !== 'function')
    return null

  return stream.stats() as StreamStatsLike
}

function getIdentityKey(value: unknown) {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null)
    return ''

  const object = value as object
  let id = objectIdentityIds.get(object)
  if (!id) {
    id = nextObjectIdentityId++
    objectIdentityIds.set(object, id)
  }
  return String(id)
}

function stableParseKey(
  options: RendererParseOptions,
  md: MarkdownIt,
  customMarkdownIt: NodeRendererProps['customMarkdownIt'],
  config: { includeFinal?: boolean } = {},
) {
  const includeFinal = config.includeFinal !== false
  const key: Record<string, unknown> = {
    md: getIdentityKey(md),
    customMarkdownIt: getIdentityKey(customMarkdownIt),
    requireClosingStrong: options.requireClosingStrong === true,
    customHtmlTags: options.customHtmlTags ?? [],
    includeSourceMap: options.includeSourceMap === true,
    streamParse: options.streamParse ?? 'auto',
    validateLink: getIdentityKey(options.validateLink),
    preTransformTokens: getIdentityKey(options.preTransformTokens),
    postTransformTokens: getIdentityKey(options.postTransformTokens),
    postTransformNodes: getIdentityKey(options.postTransformNodes),
  }

  if (includeFinal)
    key.final = options.final === true

  return JSON.stringify(key)
}

function resetStreamParseCache(md: MarkdownIt) {
  md.stream?.reset?.()
}

function shouldFlushParseImmediately(previous: string, next: string) {
  if (!previous && next)
    return true

  if (next.length <= 80)
    return true

  if (next.length < previous.length || !next.startsWith(previous))
    return true

  const appended = next.slice(previous.length)
  if (!appended)
    return false

  if (endsWithTableDelimiterLine(next))
    return true

  // Setext heading underlines (`===`) and thematic break lines (`---`) are
  // structural boundaries: flushing here lets the previous line be re-rendered
  // as a heading (or the break appear) promptly, without reintroducing the
  // per-newline flush that bare trailing newlines would cause.
  if (endsWithSetextOrThematicBreakLine(next))
    return true

  if (appended.includes('\n\n')
    || /(?:^|\n)(?:#{1,6}\s|[-+*]\s+|\d+[.)]\s+|>\s*|`{3,}|~{3,})/.test(appended)
  ) {
    return true
  }

  // A bare trailing newline is intentionally NOT an immediate-flush trigger:
  // streaming chunks frequently end with a newline, and flushing here runs the
  // full parse synchronously inside the stream tick on every commit. Block
  // structure is still parsed promptly via the delimiter rules above and the
  // parse-coalesce timer (DEFAULT_PARSE_COALESCE_MS). Plain hard line breaks
  // (soft breaks inside a paragraph) therefore coalesce into the parse window
  // and can lag block rendering by up to parseCoalesceMs — an accepted
  // performance trade-off; the visible reveal is paced independently by the
  // smooth stream and the final DOM is unaffected.
  return false
}

function endsWithSetextOrThematicBreakLine(value: string) {
  return isSetextOrThematicBreakLine(getTrailingContentLine(value))
}

function isSetextOrThematicBreakLine(line: string) {
  return /^={3,}$/.test(line) || /^-{3,}$/.test(line)
}

function endsWithTableDelimiterLine(value: string) {
  return isTableDelimiterLine(getTrailingContentLine(value))
}

function getTrailingContentLine(value: string) {
  let end = value.length
  while (end > 0 && value.charCodeAt(end - 1) === 10)
    end -= 1

  const lineStart = value.lastIndexOf('\n', end - 1) + 1
  return value.slice(lineStart, end).trim()
}

function isTableDelimiterLine(line: string) {
  const cells = getTableLineCells(line)
  return cells.length >= 2 && cells.every((cell) => {
    const marker = cell.trim()
    return marker.length >= 1
      && marker.replace(/^:/, '').replace(/:$/, '').split('').every(char => char === '-')
  })
}

function getTableLineCells(line: string) {
  if (!line.includes('|'))
    return []

  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
}

function resolveParseCoalesceMs(props: Readonly<NodeRendererProps>) {
  const value = props.parseCoalesceMs
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : DEFAULT_PARSE_COALESCE_MS
}

function hashString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function signatureString(value: unknown) {
  const text = String(value ?? '')
  return `${text.length}:${hashString(text)}`
}

function stableStringSignature(value: string) {
  return value.length <= MAX_SIGNATURE_STRING_CHARS
    ? signatureString(value)
    : `${value.length}:${hashString(value.slice(0, MAX_SIGNATURE_STRING_CHARS))}:truncated`
}

function stableValueSignature(
  value: unknown,
  seen = new WeakMap<object, string>(),
  depth = 0,
): string {
  if (value == null || typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  if (typeof value === 'string')
    return `s:${stableStringSignature(value)}`
  if (typeof value === 'function')
    return `fn:${getIdentityKey(value)}`
  if (typeof value !== 'object')
    return typeof value

  const object = value as object
  const existing = seen.get(object)
  if (existing)
    return `cycle:${existing}`

  if (depth >= MAX_SIGNATURE_DEPTH)
    return `object:${getIdentityKey(object)}`

  const id = getIdentityKey(object)
  seen.set(object, id)

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_SIGNATURE_ARRAY_ITEMS)
    return `a:${value.length}:${items
      .map(item => stableValueSignature(item, seen, depth + 1))
      .join(',')}`
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    const sampledKeys = keys.slice(0, MAX_SIGNATURE_KEYS)
    return `o:${keys.length}:${sampledKeys
      .map(key => `${key}:${stableValueSignature(record[key], seen, depth + 1)}`)
      .join(';')}`
  }

  return typeof value
}

function isParsedNodeLike(value: unknown): value is ParsedNode {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { type?: unknown }).type === 'string'
    && typeof (value as { raw?: unknown }).raw === 'string'
}

function structuralFieldSignature(
  value: unknown,
  seen = new WeakMap<object, string>(),
  depth = 0,
): string {
  if (Array.isArray(value)) {
    return `a:${value.length}:${value
      .slice(0, MAX_SIGNATURE_ARRAY_ITEMS)
      .map(item => isParsedNodeLike(item) ? getParsedNodeSignature(item, seen, depth + 1) : structuralFieldSignature(item, seen, depth + 1))
      .join(',')}`
  }
  if (isParsedNodeLike(value))
    return getParsedNodeSignature(value, seen, depth)
  return stableValueSignature(value, seen, depth)
}

function buildPrimitiveFieldSignature(
  record: Record<string, unknown>,
  seen: WeakMap<object, string>,
  depth: number,
) {
  return Object.keys(record)
    .sort()
    .filter(key => key !== 'children' && !TEXT_SIGNATURE_FIELDS.includes(key))
    .map((key) => {
      const value = record[key]

      if (typeof value === 'string')
        return `${key}=s:${signatureString(value)}`
      if (typeof value === 'number' || typeof value === 'boolean' || value == null)
        return `${key}=${String(value)}`
      if (typeof value === 'function')
        return `${key}=fn:${getIdentityKey(value)}`
      if (STRUCTURAL_OBJECT_FIELDS.has(key) && (Array.isArray(value) || typeof value === 'object'))
        return `${key}=${structuralFieldSignature(value, seen, depth + 1)}`
      if (value && typeof value === 'object')
        return `${key}=object:${getIdentityKey(value)}`

      return ''
    })
    .filter(Boolean)
    .join(';')
}

function buildTextFieldSignature(record: Record<string, unknown>) {
  return TEXT_SIGNATURE_FIELDS
    .map((key) => {
      const value = record[key]
      return typeof value === 'string'
        ? `${key}=s:${signatureString(value)}`
        : ''
    })
    .filter(Boolean)
    .join(';')
}

function buildCheapNodeSignature(
  node: ParsedNode,
  seen: WeakMap<object, string>,
  depth: number,
) {
  const record = node as Record<string, unknown>
  const children = Array.isArray(record.children)
    ? record.children as ParsedNode[]
    : []
  const childSignature = children.length
    ? children
        .slice(0, MAX_SIGNATURE_ARRAY_ITEMS)
        .map(child => getParsedNodeSignature(child, seen, depth + 1))
        .join('|')
    : ''

  return [
    node.type,
    buildTextFieldSignature(record),
    buildPrimitiveFieldSignature(record, seen, depth),
    children.length,
    childSignature,
  ].join(':')
}

function getParsedNodeSignature(
  node: ParsedNode,
  seen = new WeakMap<object, string>(),
  depth = 0,
) {
  const cached = nodeSignatureCache.get(node as object)
  if (cached)
    return cached

  const object = node as object
  const existing = seen.get(object)
  if (existing)
    return `node-cycle:${existing}`

  if (depth >= MAX_SIGNATURE_DEPTH)
    return `node:${node.type}:${getIdentityKey(object)}`

  const id = getIdentityKey(object)
  seen.set(object, id)

  const signature = buildCheapNodeSignature(node, seen, depth)
  nodeSignatureCache.set(object, signature)
  return signature
}

function isParsedNodeStable(previous: ParsedNode, next: ParsedNode) {
  return getParsedNodeSignature(previous) === getParsedNodeSignature(next)
}

function trackSignatureTiming<T>(
  metrics: ParsedNodeSignatureTimingMetrics,
  metricKey: 'stabilizeSignatureMs' | 'primeSignatureMs',
  callback: () => T,
) {
  const startedAt = getNow()
  const countKey = metricKey === 'stabilizeSignatureMs'
    ? 'stabilizeSignatureCallCount'
    : 'primeSignatureCallCount'
  try {
    return callback()
  }
  finally {
    metrics[metricKey] += getNow() - startedAt
    metrics[countKey] += 1
    metrics.signatureMs = metrics.stabilizeSignatureMs + metrics.primeSignatureMs
    metrics.signatureCallCount = metrics.stabilizeSignatureCallCount + metrics.primeSignatureCallCount
  }
}

function getParsedNodeSignatureWithTiming(
  node: ParsedNode,
  metrics: ParsedNodeSignatureTimingMetrics,
  metricKey: 'stabilizeSignatureMs' | 'primeSignatureMs',
) {
  return trackSignatureTiming(
    metrics,
    metricKey,
    () => getParsedNodeSignature(node),
  )
}

function isParsedNodeStableWithMetrics(
  previous: ParsedNode,
  next: ParsedNode,
  metrics: ParsedNodeSignatureTimingMetrics,
) {
  return getParsedNodeSignatureWithTiming(previous, metrics, 'stabilizeSignatureMs')
    === getParsedNodeSignatureWithTiming(next, metrics, 'stabilizeSignatureMs')
}

function getInitialStabilizeMetrics(nodeCount: number): ParsedNodeStabilizeMetrics {
  return {
    reusedNodeCount: 0,
    dirtyStartIndex: nodeCount > 0 ? 0 : -1,
    stablePrefixNodeCount: 0,
    dirtyTailNodeCount: nodeCount,
  }
}

function getDirtyTailNodeCount(
  dirtyStartIndex: number,
  nextNodes: ParsedNode[],
  previousNodes: ParsedNode[],
) {
  return dirtyStartIndex < 0
    ? 0
    : Math.max(nextNodes.length, previousNodes.length) - dirtyStartIndex
}

function createGlobalReferenceScanner(): GlobalReferenceScanner {
  let content = ''
  // 0: outside a label; 1: inside `[...]`; 2: after the closing `]`.
  let phase: 0 | 1 | 2 = 0
  let escaped = false
  let pendingDefinition = false
  let lineHasContent = false
  let previousWasCarriageReturn = false

  function reset() {
    content = ''
    phase = 0
    escaped = false
    pendingDefinition = false
    lineHasContent = false
    previousWasCarriageReturn = false
  }

  function scan(value: string) {
    let mayAffectGlobalReferences = false

    for (let index = 0; index < value.length; index++) {
      const char = value.charCodeAt(index)

      if (char === 10 || char === 13) {
        const isCrLfContinuation = char === 10 && previousWasCarriageReturn
        previousWasCarriageReturn = char === 13
        escaped = false
        if (!isCrLfContinuation) {
          if (!lineHasContent) {
            pendingDefinition = false
            phase = 0
          }
          lineHasContent = false
        }
        continue
      }

      previousWasCarriageReturn = false
      const whitespace = char === 9 || char === 32
      if (!whitespace) {
        lineHasContent = true
        if (pendingDefinition)
          mayAffectGlobalReferences = true
      }

      if (!phase) {
        if (char === 91)
          phase = 1
        continue
      }

      if (phase === 1) {
        if (escaped) {
          escaped = false
          continue
        }
        if (char === 92) {
          escaped = true
          continue
        }
        if (char === 93)
          phase = 2
        continue
      }

      if (whitespace)
        continue
      if (char === 58) {
        mayAffectGlobalReferences = true
        pendingDefinition = true
        continue
      }

      phase = char === 91 ? 1 : 0
    }

    return mayAffectGlobalReferences
  }

  return (previous, next) => {
    if (!previous || !next.startsWith(previous) || next.length <= previous.length) {
      reset()
      return [true, 0]
    }

    let scannedChars = 0
    if (content !== previous) {
      reset()
      scan(previous)
      scannedChars = previous.length
    }

    const appended = next.slice(previous.length)
    const mayAffectGlobalReferences = scan(appended)
    content = next
    return [mayAffectGlobalReferences, scannedChars + appended.length]
  }
}

function hasRegisteredMarkdownPlugins(md: MarkdownIt) {
  return Number((md as unknown as Record<string, unknown>).__markstreamRegisteredPluginCount ?? 0) > 0
}

function hasCustomParserExtensions(md: MarkdownIt) {
  return (md as unknown as Record<string, unknown>).__markstreamHasCustomParserExtensions === true
    || hasRegisteredMarkdownPlugins(md)
}

function getStablePrefixScanStartIndex(context: StablePrefixReuseContext) {
  const [mayAffectGlobalReferences, referenceDefinitionScanChars] = context.scanGlobalReferenceAppend(
    context.previousContent,
    context.content,
  )
  const options = context.parseOptions
  const scanStartIndex = context.previousDirtyStartIndex > 0
    && options.final !== true
    && !context.customMarkdownIt
    && !hasCustomParserExtensions(context.md)
    && !mayAffectGlobalReferences
    && typeof options.preTransformTokens !== 'function'
    && typeof options.postTransformTokens !== 'function'
    && typeof options.postTransformNodes !== 'function'
    && (options.customHtmlTags?.length ?? 0) === 0
    ? context.previousDirtyStartIndex
    : 0

  return [scanStartIndex, referenceDefinitionScanChars] as const
}

function compareCheapStringIfSafe(previous: string, next: string) {
  return previous.length === next.length && previous === next
}

function compareCheapParsedNodesIfSafe(
  previous: ParsedNode,
  next: ParsedNode,
  depth = 0,
): boolean | null {
  if (depth >= MAX_CHEAP_NODE_KEY_DEPTH)
    return null

  if (previous.type !== next.type)
    return false

  const previousRecord = previous as Record<string, unknown>
  const nextRecord = next as Record<string, unknown>
  const previousKeys = Object.keys(previousRecord)
    .filter(key => key !== 'type' && key !== 'children')
    .sort()
  const nextKeys = Object.keys(nextRecord)
    .filter(key => key !== 'type' && key !== 'children')
    .sort()

  if (previousKeys.length !== nextKeys.length)
    return false

  for (let index = 0; index < previousKeys.length; index++) {
    const key = previousKeys[index]!
    if (key !== nextKeys[index])
      return false

    const previousValue = previousRecord[key]
    const nextValue = nextRecord[key]

    if (typeof previousValue !== typeof nextValue)
      return false

    if (typeof previousValue === 'string') {
      if (typeof nextValue !== 'string')
        return false

      if (!compareCheapStringIfSafe(previousValue, nextValue))
        return false

      continue
    }

    if (
      typeof previousValue === 'number'
      || typeof previousValue === 'boolean'
      || previousValue == null
    ) {
      if (!Object.is(previousValue, nextValue))
        return false
      continue
    }

    return null
  }

  const previousHasChildren = Object.prototype.hasOwnProperty.call(previousRecord, 'children')
  const nextHasChildren = Object.prototype.hasOwnProperty.call(nextRecord, 'children')

  if (previousHasChildren !== nextHasChildren)
    return false

  if (!previousHasChildren)
    return true

  const previousChildren = previousRecord.children
  const nextChildren = nextRecord.children

  if (!Array.isArray(previousChildren) || !Array.isArray(nextChildren))
    return null

  if (previousChildren.length !== nextChildren.length)
    return false

  for (let index = 0; index < previousChildren.length; index++) {
    const previousChild = previousChildren[index]
    const nextChild = nextChildren[index]

    if (!isParsedNodeLike(previousChild) || !isParsedNodeLike(nextChild))
      return null

    const childResult = compareCheapParsedNodesIfSafe(
      previousChild,
      nextChild,
      depth + 1,
    )

    if (childResult == null)
      return null

    if (!childResult)
      return false
  }

  return true
}

function reuseParsedDescendants(previous: ParsedNode, next: ParsedNode, depth = 0) {
  if (previous === next || previous.type !== next.type || depth >= MAX_SIGNATURE_DEPTH)
    return

  const previousRecord = previous as Record<string, unknown>
  const nextRecord = next as Record<string, unknown>
  for (const key of ['children', 'items', 'rows', 'cells']) {
    const previousChildren = previousRecord[key]
    const nextChildren = nextRecord[key]
    if (!Array.isArray(previousChildren) || !Array.isArray(nextChildren))
      continue

    const limit = Math.min(previousChildren.length, nextChildren.length)
    for (let index = 0; index < limit; index++) {
      const previousChild = previousChildren[index]
      const nextChild = nextChildren[index]
      if (previousChild === nextChild || !isParsedNodeLike(previousChild) || !isParsedNodeLike(nextChild))
        continue
      if (compareCheapParsedNodesIfSafe(previousChild, nextChild) === true)
        nextChildren[index] = previousChild
      else
        reuseParsedDescendants(previousChild, nextChild, depth + 1)
    }
  }
}

function areTopLevelNodesStable(previous: ParsedNode | undefined, next: ParsedNode | undefined) {
  if (!previous || !next)
    return false
  if (previous === next)
    return true
  if (previous.type !== next.type)
    return false

  const cheapResult = compareCheapParsedNodesIfSafe(previous, next)
  if (cheapResult != null)
    return cheapResult

  return isParsedNodeStable(previous, next)
}

function areTopLevelNodesStableWithMetrics(
  previous: ParsedNode | undefined,
  next: ParsedNode | undefined,
  signatureTiming: ParsedNodeSignatureTimingMetrics,
) {
  if (!previous || !next)
    return false
  if (previous === next)
    return true
  if (previous.type !== next.type)
    return false

  let cheapResult: boolean | null = null
  trackSignatureTiming(
    signatureTiming,
    'stabilizeSignatureMs',
    () => {
      cheapResult = compareCheapParsedNodesIfSafe(previous, next)
    },
  )

  if (cheapResult != null)
    return cheapResult

  return isParsedNodeStableWithMetrics(previous, next, signatureTiming)
}

function findDirtyStartIndex(
  nextNodes: ParsedNode[],
  previousNodes: ParsedNode[],
  options: ParsedNodeStabilizeOptions,
) {
  const limit = Math.min(nextNodes.length, previousNodes.length)
  const startIndex = Math.min(limit, Math.max(0, options.scanStartIndex ?? 0))

  for (let index = startIndex; index < limit; index++) {
    const previous = previousNodes[index]
    const next = nextNodes[index]

    if (
      (options.canReuseNode && (!options.canReuseNode(previous) || !options.canReuseNode(next)))
      || !areTopLevelNodesStable(previous, next)
    ) {
      return index
    }
  }

  return nextNodes.length === previousNodes.length ? -1 : limit
}

function findDirtyStartIndexWithMetrics(
  nextNodes: ParsedNode[],
  previousNodes: ParsedNode[],
  signatureTiming: ParsedNodeSignatureTimingMetrics,
  options: ParsedNodeStabilizeOptions,
) {
  const limit = Math.min(nextNodes.length, previousNodes.length)
  const startIndex = Math.min(limit, Math.max(0, options.scanStartIndex ?? 0))

  for (let index = startIndex; index < limit; index++) {
    const previous = previousNodes[index]
    const next = nextNodes[index]

    if (
      (options.canReuseNode && (!options.canReuseNode(previous) || !options.canReuseNode(next)))
      || !areTopLevelNodesStableWithMetrics(previous, next, signatureTiming)
    ) {
      return index
    }
  }

  return nextNodes.length === previousNodes.length ? -1 : limit
}

function stabilizeParsedNodes(
  nextNodes: ParsedNode[],
  previousNodes: ParsedNode[],
  options: ParsedNodeStabilizeOptions = {},
): ParsedNodeStabilizeResult {
  if (!previousNodes.length) {
    return {
      nodes: nextNodes,
      metrics: getInitialStabilizeMetrics(nextNodes.length),
    }
  }

  const reuseDirtyTail = options.reuseDirtyTail !== false
  const dirtyStartIndex = findDirtyStartIndex(nextNodes, previousNodes, options)

  if (dirtyStartIndex < 0) {
    return {
      nodes: previousNodes,
      metrics: {
        reusedNodeCount: nextNodes.length,
        dirtyStartIndex,
        stablePrefixNodeCount: nextNodes.length,
        dirtyTailNodeCount: 0,
      },
    }
  }

  const stableNodes = nextNodes.slice()
  let reusedNodeCount = dirtyStartIndex

  for (let index = 0; index < dirtyStartIndex; index++)
    stableNodes[index] = previousNodes[index]!

  if (reuseDirtyTail) {
    for (let index = dirtyStartIndex; index < nextNodes.length; index++) {
      const previous = previousNodes[index]
      const next = nextNodes[index]

      if (
        previous
        && (!options.canReuseNode || (options.canReuseNode(previous) && options.canReuseNode(next)))
        && isParsedNodeStable(previous, next)
      ) {
        stableNodes[index] = previous
        reusedNodeCount += 1
      }
    }
  }

  return {
    nodes: stableNodes,
    metrics: {
      reusedNodeCount,
      dirtyStartIndex,
      stablePrefixNodeCount: dirtyStartIndex,
      dirtyTailNodeCount: getDirtyTailNodeCount(dirtyStartIndex, nextNodes, previousNodes),
    },
  }
}

function stabilizeParsedNodesWithMetrics(
  nextNodes: ParsedNode[],
  previousNodes: ParsedNode[],
  signatureTiming: ParsedNodeSignatureTimingMetrics,
  options: ParsedNodeStabilizeOptions = {},
): ParsedNodeStabilizeResult {
  if (!previousNodes.length) {
    return {
      nodes: nextNodes,
      metrics: getInitialStabilizeMetrics(nextNodes.length),
    }
  }

  const reuseDirtyTail = options.reuseDirtyTail !== false
  const dirtyStartIndex = findDirtyStartIndexWithMetrics(nextNodes, previousNodes, signatureTiming, options)

  if (dirtyStartIndex < 0) {
    return {
      nodes: previousNodes,
      metrics: {
        reusedNodeCount: nextNodes.length,
        dirtyStartIndex,
        stablePrefixNodeCount: nextNodes.length,
        dirtyTailNodeCount: 0,
      },
    }
  }

  const stableNodes = nextNodes.slice()
  let reusedNodeCount = dirtyStartIndex

  for (let index = 0; index < dirtyStartIndex; index++)
    stableNodes[index] = previousNodes[index]!

  if (reuseDirtyTail) {
    for (let index = dirtyStartIndex; index < nextNodes.length; index++) {
      const previous = previousNodes[index]
      const next = nextNodes[index]

      if (
        previous
        && (!options.canReuseNode || (options.canReuseNode(previous) && options.canReuseNode(next)))
        && isParsedNodeStableWithMetrics(previous, next, signatureTiming)
      ) {
        stableNodes[index] = previous
        reusedNodeCount += 1
      }
    }
  }

  return {
    nodes: stableNodes,
    metrics: {
      reusedNodeCount,
      dirtyStartIndex,
      stablePrefixNodeCount: dirtyStartIndex,
      dirtyTailNodeCount: getDirtyTailNodeCount(dirtyStartIndex, nextNodes, previousNodes),
    },
  }
}

function primeParsedNodeSignatures(nodes: ParsedNode[], startIndex = 0) {
  for (let index = Math.max(0, startIndex); index < nodes.length; index++)
    getParsedNodeSignature(nodes[index]!)
}

function primeParsedNodeSignaturesWithMetrics(
  nodes: ParsedNode[],
  signatureTiming: ParsedNodeSignatureTimingMetrics,
  startIndex = 0,
) {
  for (let index = Math.max(0, startIndex); index < nodes.length; index++) {
    trackSignatureTiming(
      signatureTiming,
      'primeSignatureMs',
      () => getParsedNodeSignature(nodes[index]!),
    )
  }
}

function getStreamStatsDelta(current: StreamStatsLike, previous: StreamStatsLike | null) {
  const delta: Record<string, number> = {}

  for (const key of STREAM_STAT_COUNTER_KEYS) {
    const currentValue = current[key]
    const previousValue = previous?.[key]
    if (typeof currentValue === 'number')
      delta[key] = currentValue - (typeof previousValue === 'number' ? previousValue : 0)
  }

  return delta
}

export function useMarkdownParsing(
  props: Readonly<NodeRendererProps>,
  options: MarkdownParsingOptions,
): MarkdownParsingState {
  const defaultMd = getMarkdown(options.instanceMsgId)
  const customTagCache = new Map<string, MarkdownIt>()
  const smoothStreamingEnabled = options.smoothStreamingEnabled ?? computed(() => false)
  const contentToParse = ref(options.renderContent.value)
  let previousParsedNodes: ParsedNode[] = []
  let previousParserCacheSemanticKey = ''
  let previousNodeReuseSemanticKey = ''
  let previousContent = ''
  let previousExternalNodeMutationBoundary = false
  let previousCustomComponentsReuseKey = ''
  let customComponentBoundaryCache = new WeakMap<object, boolean>()
  const scanGlobalReferenceAppend = createGlobalReferenceScanner()
  let parseCoalesceTimer: ReturnType<typeof setTimeout> | undefined
  let parseCommitCount = 0
  let parseCoalescedCount = 0
  let lastParseFlushAt = getNow()
  let parsedNodesDirtyStartIndexValue = -1
  let parsedNodesRevisionCount = 0

  function commitParsedNodesDirtyStartIndex(dirtyStartIndex: number) {
    parsedNodesDirtyStartIndexValue = Number.isInteger(dirtyStartIndex)
      ? dirtyStartIndex
      : 0
    parsedNodesRevisionCount += 1
  }

  function clearParseCoalesceTimer() {
    if (!parseCoalesceTimer)
      return

    clearTimeout(parseCoalesceTimer)
    parseCoalesceTimer = undefined
  }

  function flushParseContent() {
    clearParseCoalesceTimer()
    const nextContent = options.renderContent.value
    if (contentToParse.value !== nextContent)
      contentToParse.value = nextContent
    lastParseFlushAt = getNow()
  }

  function scheduleParseContentFlush() {
    parseCoalescedCount += 1

    if (parseCoalesceTimer)
      return

    const delay = Math.max(0, resolveParseCoalesceMs(props) - (getNow() - lastParseFlushAt))
    if (delay <= 0) {
      flushParseContent()
      return
    }

    parseCoalesceTimer = setTimeout(flushParseContent, delay)
  }

  watch(
    [options.renderContent, options.effectiveFinal, smoothStreamingEnabled],
    ([nextContent, final, smoothEnabled]) => {
      if (contentToParse.value === nextContent)
        return

      if (!smoothEnabled || final || shouldFlushParseImmediately(contentToParse.value, nextContent)) {
        flushParseContent()
        return
      }

      scheduleParseContentFlush()
    },
    { flush: 'sync', immediate: true },
  )

  onScopeDispose(clearParseCoalesceTimer)

  const effectiveCustomHtmlTags = computed(() => {
    return mergeCustomHtmlTags(
      props.customHtmlTags,
      props.parseOptions?.customHtmlTags,
      getAutoCustomHtmlTags(options.customComponentsMap?.value ?? {}),
    )
  })

  const mdBase = computed(() => {
    const { key, tags } = resolveCustomHtmlTags(effectiveCustomHtmlTags.value)

    if (!key)
      return defaultMd

    const cached = customTagCache.get(key)

    if (cached)
      return cached

    const md = getMarkdown(options.instanceMsgId, {
      customHtmlTags: tags,
    })

    customTagCache.set(key, md)

    return md
  })

  const mdInstance = computed(() => {
    const base = mdBase.value

    if (!props.customMarkdownIt)
      return base

    const customized = props.customMarkdownIt(base)
    ;(base as unknown as Record<string, unknown>).__markstreamHasCustomParserExtensions = true
    ;(customized as unknown as Record<string, unknown>).__markstreamHasCustomParserExtensions = true
    return customized
  })

  const mergedParseOptions = computed(() => {
    const base = (props.parseOptions ?? {}) as RendererParseOptions
    const resolvedFinal = options.effectiveFinal.value
    const customHtmlTags = effectiveCustomHtmlTags.value

    const hasFinal = resolvedFinal != null
    const hasCustom = customHtmlTags.length > 0

    if (!hasFinal && !hasCustom && base.streamParse != null)
      return base

    return {
      ...base,
      // Keep renderer content parses on the stream parser by default. Final
      // transitions reset parser cache without invalidating unchanged node reuse.
      streamParse: base.streamParse ?? true,
      ...(hasFinal ? { final: resolvedFinal } : {}),
      ...(hasCustom ? { customHtmlTags } : {}),
    } as RendererParseOptions
  })

  const effectiveCustomHtmlTagsSet = computed(() => {
    return new Set(
      (mergedParseOptions.value.customHtmlTags ?? [])
        .map(tag => String(tag).trim().toLowerCase())
        .filter(Boolean),
    )
  })

  const parserCacheSemanticKey = computed(() => stableParseKey(
    mergedParseOptions.value,
    mdInstance.value,
    props.customMarkdownIt,
    { includeFinal: true },
  ))

  const nodeReuseSemanticKey = computed(() => stableParseKey(
    mergedParseOptions.value,
    mdInstance.value,
    props.customMarkdownIt,
    { includeFinal: false },
  ))

  watch(
    [parserCacheSemanticKey, nodeReuseSemanticKey],
    ([currentParserCacheKey, currentNodeReuseKey], [previousParserCacheKey, previousNodeReuseKey]) => {
      if (!previousParserCacheKey)
        return

      if (
        currentParserCacheKey === previousParserCacheKey
        && currentNodeReuseKey === previousNodeReuseKey
      ) {
        return
      }

      flushParseContent()

      if (currentNodeReuseKey !== previousNodeReuseKey) {
        previousParsedNodes = []
        previousContent = ''
      }
    },
    { flush: 'sync' },
  )

  const parsedNodes = computed<ParsedNode[]>(() => {
    if (props.nodes?.length) {
      previousParsedNodes = []
      previousContent = ''
      commitParsedNodesDirtyStartIndex(0)
      return markRaw((props.nodes as unknown as ParsedNode[]).slice())
    }

    const content = contentToParse.value

    if (!content) {
      previousParsedNodes = []
      previousContent = ''
      commitParsedNodesDirtyStartIndex(-1)
      return []
    }

    const collectPerformanceMetrics = options.debugPerformanceEnabled.value
    const parseStart = collectPerformanceMetrics
      ? getNow()
      : 0
    const md = mdInstance.value
    const currentParserCacheSemanticKey = parserCacheSemanticKey.value
    const currentNodeReuseSemanticKey = nodeReuseSemanticKey.value

    if (
      previousParserCacheSemanticKey
      && currentParserCacheSemanticKey !== previousParserCacheSemanticKey
    ) {
      resetStreamParseCache(md)
    }

    if (
      previousNodeReuseSemanticKey
      && currentNodeReuseSemanticKey !== previousNodeReuseSemanticKey
    ) {
      previousParsedNodes = []
      previousContent = ''
    }

    const customComponents = options.customComponentsMap?.value ?? {}
    const customComponentsReuseKey = getCachedCustomComponentsReuseKey(customComponents)
    if (
      previousCustomComponentsReuseKey
      && customComponentsReuseKey !== previousCustomComponentsReuseKey
    ) {
      previousParsedNodes = []
      previousContent = ''
      customComponentBoundaryCache = new WeakMap<object, boolean>()
    }
    const hasCustomComponents = Object.keys(customComponents).length > 0
    const hasExternalNodeMutationBoundary = typeof mergedParseOptions.value.postTransformNodes === 'function'
    if (hasExternalNodeMutationBoundary !== previousExternalNodeMutationBoundary) {
      previousParsedNodes = []
      previousContent = ''
    }
    const canReuseParsedNodes = !hasExternalNodeMutationBoundary
      && previousParsedNodes.length > 0
      && content.startsWith(previousContent)
      && currentNodeReuseSemanticKey === previousNodeReuseSemanticKey

    const streamStatsBefore = collectPerformanceMetrics
      ? readStreamStats(md)
      : null

    const parserTiming: ParserTimingMetrics | undefined = collectPerformanceMetrics
      ? {}
      : undefined
    const parserHasCustomExtensions = hasCustomParserExtensions(md)
    const previousHasCustomComponentBoundary = hasCustomComponents
      && previousParsedNodes.some(node => hasCustomComponentBoundary(
        node,
        customComponents,
        customComponentBoundaryCache,
      ))
    const reuseStableTopLevelNodes = !parserHasCustomExtensions
      && !hasExternalNodeMutationBoundary
      && (
        !hasCustomComponents
        || (previousParsedNodes.length > 0 && !previousHasCustomComponentBoundary)
      )
    const parseOptionsForCall = {
      ...mergedParseOptions.value,
      reuseStableTopLevelNodes,
      ...(parserTiming ? { parserMetrics: parserTiming } : {}),
    } as RendererParseOptions & {
      reuseStableTopLevelNodes: boolean
      parserMetrics?: ParserTimingMetrics
    }

    const nextParsed = parseMarkdownToStructure(
      content,
      md,
      parseOptionsForCall,
    )
    const reuseStart = collectPerformanceMetrics
      ? getNow()
      : 0
    if (
      canReuseParsedNodes
      && !parserHasCustomExtensions
      && !hasCustomComponents
      && !mergedParseOptions.value.preTransformTokens
      && !mergedParseOptions.value.postTransformTokens
    ) {
      const limit = Math.min(previousParsedNodes.length, nextParsed.length)
      for (let index = 0; index < limit; index++)
        reuseParsedDescendants(previousParsedNodes[index]!, nextParsed[index]!)
    }
    const signatureTiming: ParsedNodeSignatureTimingMetrics | undefined = collectPerformanceMetrics
      ? {
          signatureMs: 0,
          stabilizeSignatureMs: 0,
          primeSignatureMs: 0,
          signatureCallCount: 0,
          stabilizeSignatureCallCount: 0,
          primeSignatureCallCount: 0,
        }
      : undefined
    let stabilizeMetrics: ParsedNodeStabilizeMetrics | undefined = collectPerformanceMetrics
      ? getInitialStabilizeMetrics(nextParsed.length)
      : undefined
    let stabilizeMs = 0
    let parsed: ParsedNode[]
    let primeStartIndex = 0
    let referenceDefinitionScanChars = 0

    if (canReuseParsedNodes) {
      const stabilizeStart = collectPerformanceMetrics
        ? getNow()
        : 0
      const [scanStartIndex, scannedChars] = hasCustomComponents
        ? [0, 0]
        : getStablePrefixScanStartIndex({
            content,
            previousContent,
            previousDirtyStartIndex: parsedNodesDirtyStartIndexValue,
            parseOptions: mergedParseOptions.value,
            customMarkdownIt: props.customMarkdownIt,
            md,
            scanGlobalReferenceAppend,
          })
      referenceDefinitionScanChars = scannedChars
      const reuseDirtyTail = scanStartIndex <= 0
      const canReuseNode = hasCustomComponents
        ? (node: ParsedNode) => !hasCustomComponentBoundary(
            node,
            customComponents,
            customComponentBoundaryCache,
          )
        : undefined
      if (signatureTiming) {
        const result = stabilizeParsedNodesWithMetrics(nextParsed, previousParsedNodes, signatureTiming, {
          canReuseNode,
          reuseDirtyTail,
          scanStartIndex,
        })
        parsed = result.nodes
        stabilizeMetrics = result.metrics
      }
      else {
        const result = stabilizeParsedNodes(nextParsed, previousParsedNodes, {
          canReuseNode,
          reuseDirtyTail,
          scanStartIndex,
        })
        parsed = result.nodes
        stabilizeMetrics = result.metrics
      }
      stabilizeMs = collectPerformanceMetrics
        ? getNow() - stabilizeStart
        : 0
      if (!reuseDirtyTail) {
        primeStartIndex = parsed.length
      }
      else {
        primeStartIndex = stabilizeMetrics?.dirtyStartIndex == null || stabilizeMetrics.dirtyStartIndex < 0
          ? parsed.length
          : stabilizeMetrics.dirtyStartIndex
      }
    }
    else {
      parsed = nextParsed
      stabilizeMetrics = getInitialStabilizeMetrics(parsed.length)
    }

    if (options.effectiveFinal.value !== true) {
      if (signatureTiming)
        primeParsedNodeSignaturesWithMetrics(parsed, signatureTiming, primeStartIndex)
      else
        primeParsedNodeSignatures(parsed, primeStartIndex)
    }

    if (hasCustomComponents) {
      // Only the dirty tail can contain nodes not yet in the boundary cache:
      // reused prefix nodes were warmed in a previous commit, and a fully
      // reused parse (dirtyStartIndex < 0) has nothing new either. Warming
      // only the tail skips the O(prefix) WeakMap hits per streaming commit.
      const warmStart = stabilizeMetrics?.dirtyStartIndex != null && stabilizeMetrics.dirtyStartIndex >= 0
        ? stabilizeMetrics.dirtyStartIndex
        : parsed.length
      for (let index = warmStart; index < parsed.length; index++)
        hasCustomComponentBoundary(parsed[index]!, customComponents, customComponentBoundaryCache)
    }
    const nodeReuseMs = collectPerformanceMetrics
      ? getNow() - reuseStart
      : 0
    parseCommitCount += 1
    previousContent = content
    previousParserCacheSemanticKey = currentParserCacheSemanticKey
    previousNodeReuseSemanticKey = currentNodeReuseSemanticKey
    previousExternalNodeMutationBoundary = hasExternalNodeMutationBoundary
    previousCustomComponentsReuseKey = customComponentsReuseKey
    previousParsedNodes = parsed
    commitParsedNodesDirtyStartIndex(stabilizeMetrics?.dirtyStartIndex ?? 0)

    if (collectPerformanceMetrics) {
      const streamStats = readStreamStats(md)
      const usedStream = typeof streamStats?.total === 'number'
        && streamStats.total > (streamStatsBefore?.total ?? 0)

      options.logPerf(usedStream ? 'parse(stream)' : 'parse(sync)', {
        rendererId: options.instanceMsgId,
        ms: Math.round(getNow() - parseStart),
        nodes: parsed.length,
        contentLength: content.length,
        parseCommitCount,
        parseCoalescedCount,
        nodeReuseMs,
        referenceDefinitionScanChars,
        signatureMs: signatureTiming?.signatureMs ?? 0,
        stabilizeSignatureMs: signatureTiming?.stabilizeSignatureMs ?? 0,
        primeSignatureMs: signatureTiming?.primeSignatureMs ?? 0,
        signatureCallCount: signatureTiming?.signatureCallCount ?? 0,
        stabilizeSignatureCallCount: signatureTiming?.stabilizeSignatureCallCount ?? 0,
        primeSignatureCallCount: signatureTiming?.primeSignatureCallCount ?? 0,
        stabilizeMs,
        ...(stabilizeMetrics ?? {}),
        ...(parserTiming
          ? Object.fromEntries(PARSE_TIMING_KEYS.map(key => [key, parserTiming[key] ?? 0]))
          : {}),
        ...(streamStats
          ? {
              streamMode: streamStats.lastMode,
              streamDelta: getStreamStatsDelta(streamStats, streamStatsBefore),
              streamStats,
            }
          : {}),
      })
    }

    return markRaw(parsed)
  })

  return {
    effectiveCustomHtmlTags,
    effectiveCustomHtmlTagsSet,
    mdBase,
    mdInstance,
    mergedParseOptions,
    getParsedNodesDirtyStartIndex: () => parsedNodesDirtyStartIndexValue,
    getParsedNodesRevision: () => parsedNodesRevisionCount,
    parsedNodes,
  }
}
