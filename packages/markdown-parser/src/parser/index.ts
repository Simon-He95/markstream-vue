import type { MarkdownIt } from '../markdown-it-types'
import type { MarkdownToken, ParsedNode, ParseOptions } from '../types'
import type { HtmlStructureContext } from './html/structure'
import type { ParseContext } from './parse-context'
import { parseStandaloneHtmlDocument } from './html/source-scanner'
import {
  combineStructuredDetailsHtmlBlocks,
  hasTopLevelHtmlBlock,
  mergeSplitTopLevelHtmlBlocks,
  structureGenericHtmlBlockChildren,
} from './html/structure'
import { parseInlineTokens } from './inline-parsers'
import { createSourceMapFromOffsets } from './node-source-map'
import { applyPostTransformNodes, finalizeHtmlBlockLoading } from './nodes/finalize-nodes'
import { getInternalNodeSourceRange, processTokensWithContext } from './nodes/token-to-nodes'
import { createParseContext, ensureParseContext } from './parse-context'
import { processTopLevelTokensWithReuse } from './reuse/structured-node-reuse'
import { computeSourceLineOffsets, getCachedSourceLineOffsets, getParserRuntime } from './runtime'
import { createSourceLineMapper } from './source-line-mapper'
import { getSafeMarkdown } from './streaming/safe-markdown'
import {
  parseTopLevelTokens,
  resetTopLevelTokenizerForFinalAutoParse,
  shouldUseTopLevelStreamParse,
} from './streaming/tokenizer'

type ParseTimingMetrics = NonNullable<ParseOptions['parserMetrics']>

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
  return options.parserMetrics
}

function finishTimedParse<T extends ParsedNode[]>(result: T, timing: ParseTimingMetrics | undefined, startedAt: number) {
  if (timing)
    addTiming(timing, 'parseMarkdownToStructureTotalMs', getParserNow() - startedAt)

  return result
}

function finishParsedNodes<T extends ParsedNode[]>(
  result: T,
  options: ParseOptions,
  timing: ParseTimingMetrics | undefined,
  startedAt: number,
) {
  return finishTimedParse(applyPostTransformNodes(result, options), timing, startedAt)
}

export function processTokens(tokens: MarkdownToken[], options?: ParseOptions): ParsedNode[] {
  return processTokensWithContext(tokens, ensureParseContext(options), parseInlineTokens)
}

function processTokensWithTiming(tokens: MarkdownToken[], options: ParseContext, timing: ParseTimingMetrics | undefined) {
  if (!timing)
    return processTokensWithContext(tokens, options, parseInlineTokens)

  addTiming(timing, 'processTokensInputTokens', tokens.length)
  const startedAt = getParserNow()
  const result = processTokensWithContext(tokens, options, parseInlineTokens)
  addTiming(timing, 'processTokensMs', getParserNow() - startedAt)
  return result
}

function resolveValidateLink(md: MarkdownIt, options: ParseOptions) {
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
  return options.validateLink
    ?? directValidateLink
    ?? mdAny.options?.validateLink
    ?? (typeof mdAny.validateLink === 'function' ? mdAny.validateLink : undefined)
}

function parseMarkdownWithContext(markdown: string, inputContext: ParseContext): ParsedNode[] {
  const runtime = inputContext.runtime!
  const md = inputContext.markdownIt!
  const options: ParseContext = {
    ...inputContext,
    customHtmlBlockCursor: 0,
    sourceLineOffsets: undefined,
  }
  const timing = getParseTiming(options)
  const tokenizerTiming = timing
    ? { recordTokenCloneMs: (durationMs: number) => addTiming(timing, 'tokenCloneMs', durationMs) }
    : undefined
  const parseStartedAt = timing ? getParserNow() : 0
  const isFinal = !!options.final
  // Ensure markdown is a string — guard against null/undefined inputs from callers
  // todo: 下面的特殊 math 其实应该更精确匹配到() 或者 $ $ 或者 \[ \] 内部的内容
  const sourceMarkdown = (markdown ?? '').toString()
  if (!options.isFragment)
    resetTopLevelTokenizerForFinalAutoParse(runtime, options)

  const safeMarkdown = getSafeMarkdown(runtime, sourceMarkdown, isFinal, options)

  if (timing)
    addTiming(timing, 'safeMarkdownMs', getParserNow() - parseStartedAt)

  const standaloneHtmlDocument = parseStandaloneHtmlDocument(safeMarkdown)
  if (standaloneHtmlDocument) {
    if (options.includeSourceMap) {
      const sourceMapOptions: ParseContext = {
        ...options,
        sourceLineMapper: createSourceLineMapper(sourceMarkdown, safeMarkdown),
      }
      standaloneHtmlDocument[0].sourceMap = createSourceMapFromOffsets(safeMarkdown, 0, safeMarkdown.length, sourceMapOptions)
    }

    // Keep pre/post hooks observable for callers that rely on them for
    // instrumentation, but preserve the full-document html_block shape.
    const preHook = options.preTransformTokens
    const postHook = options.postTransformTokens
    if (shouldUseTopLevelStreamParse(runtime, options) || typeof preHook === 'function' || typeof postHook === 'function') {
      const rawTokens = parseTopLevelTokens(runtime, safeMarkdown, { __markstreamFinal: isFinal }, options, tokenizerTiming) as unknown as MarkdownToken[]
      const hookedTokens = typeof preHook === 'function' ? (preHook(rawTokens) || rawTokens) : rawTokens
      if (typeof postHook === 'function')
        postHook(hookedTokens)
    }
    return finishParsedNodes(standaloneHtmlDocument, options, timing, parseStartedAt)
  }

  // Get tokens from markdown-it
  const tokenizeStartedAt = timing ? getParserNow() : 0
  const tokens = parseTopLevelTokens(runtime, safeMarkdown, { __markstreamFinal: isFinal }, options, tokenizerTiming)
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
  const internalOptions: ParseContext = {
    ...options,
    sourceLineMapper: options.includeSourceMap === true
      ? createSourceLineMapper(sourceMarkdown, safeMarkdown)
      : undefined,
    sourceMarkdown: safeMarkdown,
    // Line-start offsets are a pure function of the source; cache them on the
    // runtime and extend incrementally across streaming appends so the
    // per-commit O(document) newline scan only touches the appended tail.
    // Fragment parses are not prefixes of the document, so they must not evict
    // that cache: a fragment gets its own offsets without touching the runtime.
    sourceLineOffsets: options.isFragment
      ? computeSourceLineOffsets(safeMarkdown)
      : getCachedSourceLineOffsets(runtime, safeMarkdown),
    customHtmlBlockCursor: 0,
  }
  let result = processTopLevelTokensWithReuse(runtime, safeMarkdown, transformedTokens, internalOptions, {
    processTokens: (nextTokens, nextOptions) => processTokensWithTiming(nextTokens, nextOptions, timing),
    recordReusedTopLevelNodes: count => addTiming(timing, 'processTokensReusedTopLevelNodes', count),
  })

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
        const postProcessOptions: ParseContext = {
          ...internalOptions,
          customHtmlBlockCursor: 0,
        }
        result = processTokensWithTiming(postResult as unknown as MarkdownToken[], postProcessOptions, timing)
      }
      else {
        // Otherwise assume it returned ParsedNode[] and use it as-is
        result = postResult as unknown as ParsedNode[]
      }
    }
  }

  // The structured-reuse path rebuilds nodes from the dirty tail. Reuse the
  // same window for HTML passes only when the previous pass kept every node
  // identity and the reused prefix contains no details blocks; otherwise the
  // passes must see the full result to merge across node boundaries.
  const reuseTailStart = runtime.structuredReuseTailStart
  const tailStart = reuseTailStart && reuseTailStart > 0 && reuseTailStart < result.length
    ? reuseTailStart
    : 0
  const hasHtml = hasTopLevelHtmlBlock(result)
  if (hasHtml) {
    const htmlPassesStartedAt = timing ? getParserNow() : 0
    const htmlStructureContext: HtmlStructureContext = {
      getInternalNodeSourceRange: node => getInternalNodeSourceRange(node, runtime),
      markdownIt: md,
      parseFragment: (fragment, fragmentOptions) => parseMarkdownWithContext(fragment, fragmentOptions),
    }
    const canReuseHtmlPrefix = tailStart > 0 && runtime.htmlPassIdentityPreserving
    const tailSourceStart = canReuseHtmlPrefix
      ? getInternalNodeSourceRange(result[tailStart]!, runtime)?.start
      : undefined
    let hasDetailsInput = false
    for (let i = canReuseHtmlPrefix ? tailStart : 0; i < result.length; i++) {
      const node = result[i]!
      if (node.type === 'html_block' && String(node.tag ?? '').toLowerCase() === 'details') {
        hasDetailsInput = true
        break
      }
    }
    const useHtmlTail = canReuseHtmlPrefix
      && !hasDetailsInput
      && tailSourceStart != null
    const prefix = useHtmlTail ? result.slice(0, tailStart) : []
    const htmlInput = useHtmlTail ? result.slice(tailStart) : result
    const htmlSourceStart = useHtmlTail ? tailSourceStart : 0
    let htmlResult = mergeSplitTopLevelHtmlBlocks(
      htmlInput,
      isFinal,
      safeMarkdown,
      htmlStructureContext,
      internalOptions,
      htmlSourceStart,
    )
    const mergeIdentityPreserving = htmlResult.length === htmlInput.length
      && htmlResult.every((node, index) => node === htmlInput[index])
    if (hasDetailsInput)
      htmlResult = combineStructuredDetailsHtmlBlocks(htmlResult, safeMarkdown, htmlStructureContext, internalOptions, isFinal, htmlSourceStart)[0]
    htmlResult = structureGenericHtmlBlockChildren(htmlResult, htmlStructureContext, internalOptions, isFinal)
    result = useHtmlTail ? prefix.concat(htmlResult) : htmlResult
    runtime.htmlPassIdentityPreserving = !hasDetailsInput && mergeIdentityPreserving
    if (timing)
      addTiming(timing, 'htmlBlockPassesMs', getParserNow() - htmlPassesStartedAt)
  }
  else {
    runtime.htmlPassIdentityPreserving = true
  }

  if (isFinal)
    finalizeHtmlBlockLoading(result)

  result = applyPostTransformNodes(result, options) as ParsedNode[]

  if (options.debug) {
    console.log('Parsed Markdown Tree Structure:', result)
  }
  return finishTimedParse(result, timing, parseStartedAt)
}

export function parseMarkdownToStructure(
  markdown: string,
  md: MarkdownIt,
  options: ParseOptions = {},
): ParsedNode[] {
  const sourceMarkdown = (markdown ?? '').toString()
  const runtime = getParserRuntime(md)
  const validateLink = resolveValidateLink(md, options)
  const context = createParseContext(options, {
    markdownIt: md,
    runtime,
    validateLink,
  })
  const mdState = md as unknown as Record<string, unknown>
  runtime.beginRootParse(sourceMarkdown, {
    customHtmlTags: (options.customHtmlTags ?? []).join('\0'),
    hasCustomParserExtensions: mdState.__markstreamHasCustomParserExtensions === true,
    includeSourceMap: options.includeSourceMap === true,
    postTransformNodes: options.postTransformNodes,
    postTransformTokens: options.postTransformTokens,
    preTransformTokens: options.preTransformTokens,
    requireClosingStrong: options.requireClosingStrong,
    reuseStableTopLevelNodes: options.reuseStableTopLevelNodes === true,
    streamParse: options.streamParse,
    validateLink,
  })

  try {
    return parseMarkdownWithContext(sourceMarkdown, context)
  }
  finally {
    runtime.finishRootParse(options.final === true)
  }
}

export { buildAllowedHtmlTagSet } from './html-tag-sets'
export { parseInlineTokens }
