import type { MarkdownIt, Token } from '../../markdown-it-types'
import type { ParseOptions } from '../../types'
import type { ParseContext } from '../parse-context'
import type { ParserRuntime } from '../runtime'
import {
  hasMarkstreamMathPlugin,
  mayContainTolerantMathBlockBoundaryOpener,
} from '../../plugins/math'
import { cloneMarkdownTokens } from '../token-clone'
import {
  shouldUseSyncParseForPendingTolerantMathBoundary,
  syncTolerantMathBoundaryStreamCache,
} from './boundary-state'

interface TokenizerTimingCallbacks {
  recordTokenCloneMs?: (durationMs: number) => void
}

function getParserNow() {
  return typeof performance !== 'undefined'
    ? performance.now()
    : Date.now()
}

function getStableStreamEnv(runtime: ParserRuntime, env: Record<string, unknown>) {
  const modeKey = env.__markstreamFinal === true ? 'final' : 'streaming'
  let stableEnv = runtime.streamParseEnvs.get(modeKey)
  if (!stableEnv) {
    stableEnv = {}
    runtime.streamParseEnvs.set(modeKey, stableEnv)
  }

  for (const key of Object.keys(stableEnv)) {
    if (!Object.prototype.hasOwnProperty.call(env, key))
      delete stableEnv[key]
  }
  Object.assign(stableEnv, env)
  return stableEnv
}

export function shouldUseTopLevelStreamParse(runtime: ParserRuntime, options: ParseContext) {
  const md = runtime.markdownIt
  const stream = md.stream
  const streamParse = options.streamParse ?? 'auto'
  return options.disableStreamParse !== true
    && (md as unknown as Record<string, unknown>).__markstreamHasCustomParserExtensions === false
    && (streamParse === true || (streamParse === 'auto' && options.final !== true))
    && stream?.enabled === true
    && typeof stream.parse === 'function'
}

function shouldResetTopLevelStreamCacheForFinalAutoParse(runtime: ParserRuntime, options: ParseContext) {
  const md = runtime.markdownIt
  const streamParse = options.streamParse ?? 'auto'
  const stream = md.stream

  return options.final === true
    && streamParse === 'auto'
    && options.disableStreamParse !== true
    && (md as unknown as Record<string, unknown>).__markstreamHasCustomParserExtensions === false
    && stream?.enabled === true
    && typeof stream.reset === 'function'
}

export function resetTopLevelTokenizerForFinalAutoParse(runtime: ParserRuntime, options: ParseContext) {
  if (!shouldResetTopLevelStreamCacheForFinalAutoParse(runtime, options))
    return false

  runtime.resetForFinalAutoParse()
  return true
}

function shouldCloneTopLevelStreamTokens(options: ParseOptions) {
  return typeof options.preTransformTokens === 'function'
    || typeof options.postTransformTokens === 'function'
}

function sameTokenizerTokenMap(left: Token | undefined, right: Token | undefined) {
  const leftMap = left?.map
  const rightMap = right?.map

  if (leftMap === rightMap)
    return true

  if (!Array.isArray(leftMap) || !Array.isArray(rightMap))
    return false

  return leftMap.length === rightMap.length
    && leftMap.every((value, index) => value === rightMap[index])
}

function isSameTokenShape(left: Token | undefined, right: Token | undefined) {
  return !!left
    && !!right
    && left.type === right.type
    && left.tag === right.tag
    && left.nesting === right.nesting
    && left.markup === right.markup
    && left.content === right.content
    && sameTokenizerTokenMap(left, right)
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

export function getTopLevelStreamParseMode(runtime: ParserRuntime) {
  return runtime.topLevelStreamParseMode
}

export function parseTopLevelTokens(
  runtime: ParserRuntime,
  source: string,
  env: Record<string, unknown>,
  options: ParseContext,
  timingCallbacks?: TokenizerTimingCallbacks,
) {
  const md = runtime.markdownIt
  if (options.customHtmlTags?.length)
    env.__markstreamCustomHtmlTags = options.customHtmlTags

  if (!shouldUseTopLevelStreamParse(runtime, options)) {
    if (!options.isFragment)
      runtime.topLevelStreamParseMode = 'sync'
    return md.parse(source, env)
  }

  syncTolerantMathBoundaryStreamCache(runtime, source)
  if (shouldUseSyncParseForPendingTolerantMathBoundary(runtime)) {
    runtime.topLevelStreamParseMode = 'sync'
    return md.parse(source, env)
  }

  const previousTokens = md.stream!.peek?.()
  const previousTailIndex = (previousTokens?.length ?? 0) - 1
  const listBeforeRule = previousTokens?.[previousTailIndex]?.type === 'hr'
    && previousTokens?.[previousTailIndex - 1]?.type === 'bullet_list_close'
    ? previousTokens[previousTailIndex - 1].markup
    : undefined

  runtime.markStreamParseStarted()
  const tokens = md.stream!.parse!(source, getStableStreamEnv(runtime, env))
  // A trailing `* **` can turn from a rule into a continuation of the preceding list.
  // Reparse both groups instead of retaining the list closed by the temporary rule.
  const continuedList = listBeforeRule !== undefined
    && tokens[previousTailIndex]?.type === 'bullet_list_open'
    && tokens[previousTailIndex].markup === listBeforeRule
  if (continuedList || shouldFallbackDuplicateTolerantMathStreamTokens(md, source, tokens)) {
    runtime.resetStreamOnly()
    runtime.topLevelStreamParseMode = 'sync'
    return md.parse(source, env)
  }

  const stats = md.stream?.stats?.() as { lastMode?: string } | undefined
  runtime.topLevelStreamParseMode = stats?.lastMode ?? 'stream'

  if (!shouldCloneTopLevelStreamTokens(options))
    return tokens

  if (!timingCallbacks?.recordTokenCloneMs)
    return cloneMarkdownTokens(tokens, true)

  const startedAt = getParserNow()
  const cloned = cloneMarkdownTokens(tokens, true)
  timingCallbacks.recordTokenCloneMs(getParserNow() - startedAt)
  return cloned
}
