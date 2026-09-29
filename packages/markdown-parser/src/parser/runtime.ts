import type { MarkdownIt } from '../markdown-it-types'
import type { MarkdownToken, ParsedNode, ParseOptions } from '../types'
import type { LinkifyDemotionContext } from './linkifyHeuristics'

export interface ExplicitBracketMathContext {
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

export interface ExplicitBracketMathStreamState {
  committedContext: ExplicitBracketMathContext
  context: ExplicitBracketMathContext
  lineBuffer: string
}

export interface SafeMarkdownRuntimeState {
  source: string
  safeMarkdown: string
  mode: string
}

export interface TolerantMathBoundaryRuntimeState {
  explicitBracketMath: ExplicitBracketMathStreamState
  source: string
  key: string | null
  pendingCandidate: boolean
  scanWindow: {
    lineOffset: number
    windowStart: number
  }
}

export interface PendingExplicitMathTailRuntimeState {
  source: string
  state: ExplicitBracketMathStreamState
}

export interface StructuredStreamGroupBoundary {
  firstToken: MarkdownToken
  lastToken: MarkdownToken
  tokenCount: number
}

export interface StructuredStreamRuntimeState {
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
  linkifyDemotionContext?: LinkifyDemotionContext
  stableGroupCount: number
  requireClosingStrong: boolean | undefined
  validateLink: ParseOptions['validateLink']
}

export interface SiblingHtmlChildrenRuntimeState {
  blocks: string[]
  children: ParsedNode[][]
  customHtmlTags: string
  final: boolean
  requireClosingStrong: boolean | undefined
  validateLink: ParseOptions['validateLink']
}

export interface SourceLineOffsetsRuntimeState {
  /** The safe-markdown source the offsets were computed for. */
  source: string
  /** Position after the k-th newline (offsets[0] = 0). */
  offsets: number[]
}

/**
 * Resolve (and cache) the line-start offsets for a source string.
 *
 * Streaming commits grow the source append-only, so a previously cached
 * offset array can be extended by scanning only the appended tail instead of
 * re-scanning the whole document on every commit (the previous behavior
 * rebuilt the offsets from scratch once per parse). Correctness is preserved
 * by keying on the actual string: if the new source is not an extension of
 * the cached one, the cache is rebuilt from scratch.
 */
export function getCachedSourceLineOffsets(runtime: ParserRuntime, source: string): number[] {
  const cached = runtime.sourceLineOffsets

  if (cached?.source === source)
    return cached.offsets

  if (cached && source.length > cached.source.length && runtime.sourceExtends(cached.source, source)) {
    const offsets = cached.offsets
    for (let i = cached.source.length; i < source.length; i++) {
      if (source.charCodeAt(i) === 10)
        offsets.push(i + 1)
    }
    cached.source = source
    return offsets
  }

  const offsets = computeSourceLineOffsets(source)
  runtime.sourceLineOffsets = { source, offsets }
  return offsets
}

/**
 * Line-start offsets for one source string. Pure, no caching.
 */
export function computeSourceLineOffsets(source: string): number[] {
  const offsets = [0]
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10)
      offsets.push(i + 1)
  }
  return offsets
}

export interface ParserRuntimeSemantics {
  customHtmlTags: string
  hasCustomParserExtensions: boolean
  includeSourceMap: boolean
  postTransformNodes: ParseOptions['postTransformNodes']
  postTransformTokens: ParseOptions['postTransformTokens']
  preTransformTokens: ParseOptions['preTransformTokens']
  requireClosingStrong: boolean | undefined
  reuseStableTopLevelNodes: boolean
  streamParse: ParseOptions['streamParse']
  validateLink: ParseOptions['validateLink']
}

const parserRuntimes = new WeakMap<object, ParserRuntime>()
const wrappedMarkdownItInstances = new WeakSet<object>()
const wrappedStreamInstances = new WeakSet<object>()

function sameSemantics(left: ParserRuntimeSemantics, right: ParserRuntimeSemantics) {
  return left.customHtmlTags === right.customHtmlTags
    && left.hasCustomParserExtensions === right.hasCustomParserExtensions
    && left.includeSourceMap === right.includeSourceMap
    && left.postTransformNodes === right.postTransformNodes
    && left.postTransformTokens === right.postTransformTokens
    && left.preTransformTokens === right.preTransformTokens
    && left.requireClosingStrong === right.requireClosingStrong
    && left.reuseStableTopLevelNodes === right.reuseStableTopLevelNodes
    && left.streamParse === right.streamParse
    && left.validateLink === right.validateLink
}

export class ParserRuntime {
  readonly markdownIt: MarkdownIt
  safeMarkdown?: SafeMarkdownRuntimeState
  tolerantMathBoundary?: TolerantMathBoundaryRuntimeState
  pendingExplicitMathTail?: PendingExplicitMathTailRuntimeState
  readonly streamParseEnvs = new Map<string, Record<string, unknown>>()
  topLevelStreamParseMode?: string
  structuredStream?: StructuredStreamRuntimeState
  /**
   * Number of reused (stable) prefix nodes when the last
   * processTopLevelTokensWithReuse call actually reused nodes; undefined when
   * it re-processed the whole document. Lets downstream passes tail-window.
   */
  structuredReuseTailStart?: number
  htmlPassIdentityPreserving = false
  /**
   * Stitched `<details>` output cache keyed by the pre-pass details opener
   * html_block node. Reused prefix details keep the same opener object across
   * appends, so combineStructuredDetailsHtmlBlocks can skip re-parsing and
   * re-rendering the (unchanged) middle of closed details on every append.
   */
  detailsStitchCache = new WeakMap<object, { openRaw: string, explicitClose: boolean, closeSliceEnd: number, middleSource: string, node: ParsedNode }>()
  siblingHtmlChildren?: SiblingHtmlChildrenRuntimeState
  nodeSourceRanges = new WeakMap<object, { start: number, end: number }>()
  sourceLineOffsets?: SourceLineOffsetsRuntimeState
  private documentSource?: string
  private semantics?: ParserRuntimeSemantics
  private sourceRelationPrevious?: string
  private sourceRelationCurrent?: string
  private finalized = false
  private resettingStream = false
  private streamStateActive = false
  private streamResetInCurrentRootParse = false

  constructor(markdownIt: MarkdownIt) {
    this.markdownIt = markdownIt
  }

  sourceExtends(previousSource: string, currentSource: string) {
    if (this.sourceRelationPrevious === previousSource && this.sourceRelationCurrent === currentSource)
      return true

    if (!currentSource.startsWith(previousSource))
      return false

    this.sourceRelationPrevious = previousSource
    this.sourceRelationCurrent = currentSource
    return true
  }

  beginRootParse(source: string, semantics: ParserRuntimeSemantics) {
    this.streamResetInCurrentRootParse = false
    const sourceChangedNonAppend = this.documentSource !== undefined
      && source !== this.documentSource
      && !this.sourceExtends(this.documentSource, source)
    const semanticsChanged = this.semantics !== undefined && !sameSemantics(this.semantics, semantics)

    if (this.finalized || sourceChangedNonAppend || semanticsChanged)
      this.resetDocument(this.streamStateActive)

    this.finalized = false
    this.documentSource = source
    this.semantics = semantics
  }

  finishRootParse(final: boolean) {
    // Relation sharing is scoped to one root parse; do not retain its previous source.
    this.sourceRelationPrevious = undefined
    this.sourceRelationCurrent = undefined

    if (!final)
      return

    this.clearDocumentCaches()
    this.documentSource = undefined
    this.semantics = undefined
    this.finalized = true
  }

  resetForFinalAutoParse() {
    if (!this.streamResetInCurrentRootParse)
      this.resetStreamOnly()
    this.clearDocumentCaches()
  }

  markStreamParseStarted() {
    this.streamStateActive = true
  }

  resetDocument(resetStream: boolean) {
    if (resetStream)
      this.resetStreamOnly()
    this.clearDocumentCaches()
    this.documentSource = undefined
    this.semantics = undefined
    this.finalized = false
  }

  resetStreamOnly() {
    const stream = this.markdownIt.stream
    const reset = stream?.reset
    if (!stream || typeof reset !== 'function')
      return

    this.resettingStream = true
    try {
      reset.call(stream)
      this.streamStateActive = false
      this.streamResetInCurrentRootParse = true
    }
    finally {
      this.resettingStream = false
    }
  }

  isResettingStream() {
    return this.resettingStream
  }

  handleExternalStreamReset() {
    this.streamStateActive = false
    this.streamResetInCurrentRootParse = true
    this.clearDocumentCaches()
    this.documentSource = undefined
    this.semantics = undefined
    this.finalized = false
  }

  invalidateConfiguration() {
    this.resetDocument(true)
  }

  dispose() {
    this.resetDocument(true)
    parserRuntimes.delete(this.markdownIt as unknown as object)
  }

  private clearDocumentCaches() {
    this.safeMarkdown = undefined
    this.tolerantMathBoundary = undefined
    this.pendingExplicitMathTail = undefined
    this.streamParseEnvs.clear()
    this.topLevelStreamParseMode = undefined
    this.structuredStream = undefined
    this.htmlPassIdentityPreserving = false
    this.siblingHtmlChildren = undefined
    this.detailsStitchCache = new WeakMap()
    this.nodeSourceRanges = new WeakMap()
    this.sourceLineOffsets = undefined
    this.sourceRelationPrevious = undefined
    this.sourceRelationCurrent = undefined
  }
}

function wrapMarkdownItBoundaries(md: MarkdownIt) {
  const owner = md as unknown as object
  const ownerState = md as unknown as Record<string, unknown>
  if (!wrappedMarkdownItInstances.has(owner)) {
    wrappedMarkdownItInstances.add(owner)

    const originalUse = md.use
    md.use = function (this: MarkdownIt, ...args: Parameters<MarkdownIt['use']>) {
      try {
        ownerState.__markstreamHasCustomParserExtensions = true
        return Reflect.apply(originalUse, this, args)
      }
      finally {
        parserRuntimes.get(owner)?.invalidateConfiguration()
      }
    } as MarkdownIt['use']

    const originalSet = md.set
    md.set = function (this: MarkdownIt, ...args: Parameters<MarkdownIt['set']>) {
      try {
        return Reflect.apply(originalSet, this, args)
      }
      finally {
        parserRuntimes.get(owner)?.invalidateConfiguration()
      }
    } as MarkdownIt['set']
  }

  const stream = md.stream
  if (!stream || typeof stream.reset !== 'function')
    return

  const streamOwner = stream as unknown as object
  if (wrappedStreamInstances.has(streamOwner))
    return
  wrappedStreamInstances.add(streamOwner)

  const originalReset = stream.reset
  stream.reset = function (this: NonNullable<MarkdownIt['stream']>, ...args: Parameters<NonNullable<typeof originalReset>>) {
    const runtime = parserRuntimes.get(owner)
    try {
      return Reflect.apply(originalReset, this, args)
    }
    finally {
      if (!runtime?.isResettingStream())
        runtime?.handleExternalStreamReset()
    }
  }
}

export function getParserRuntime(md: MarkdownIt) {
  const owner = md as unknown as object
  let runtime = parserRuntimes.get(owner)
  if (!runtime) {
    runtime = new ParserRuntime(md)
    parserRuntimes.set(owner, runtime)
  }
  wrapMarkdownItBoundaries(md)
  return runtime
}

export function disposeParserRuntime(md: MarkdownIt) {
  parserRuntimes.get(md as unknown as object)?.dispose()
}
