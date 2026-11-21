import type { MarkdownIt } from '../markdown-it-types'
import type { MarkdownNodeSourceMap, ParseOptions } from '../types'
import type { LinkifyDemotionContext } from './linkifyHeuristics'
import type { ParserRuntime } from './runtime'

const PARSE_CONTEXT = Symbol('markstream.parse-context')

export interface ParseContext extends ParseOptions {
  [PARSE_CONTEXT]: true
  customHtmlBlockCursor: number
  disableStreamParse: boolean
  disableStructuredReuse: boolean
  insideStrong: boolean
  isFragment: boolean
  linkifyDemotionContext?: LinkifyDemotionContext
  linkifyDemotionResultContexts?: Array<LinkifyDemotionContext | undefined>
  linkifyDemotionSeedContext?: LinkifyDemotionContext
  markdownIt?: MarkdownIt
  /**
   * Reference definitions of the enclosing document, so that reference links
   * inside a re-parsed HTML wrapper fragment can resolve against them.
   */
  referenceDefinitions?: Record<string, unknown>
  runtime?: ParserRuntime
  sourceLineMapper?: (line: number) => MarkdownNodeSourceMap
  sourceLineOffsets?: number[]
  sourceMarkdown?: string
}

export function isParseContext(options: ParseOptions | undefined): options is ParseContext {
  return Boolean(options && (options as ParseContext)[PARSE_CONTEXT] === true)
}

export function createParseContext(
  options: ParseOptions = {},
  overrides: Partial<ParseContext> = {},
): ParseContext {
  return {
    ...options,
    [PARSE_CONTEXT]: true,
    customHtmlBlockCursor: 0,
    disableStreamParse: false,
    disableStructuredReuse: false,
    insideStrong: false,
    isFragment: false,
    ...overrides,
  }
}

export function ensureParseContext(options?: ParseOptions): ParseContext {
  return isParseContext(options) ? options : createParseContext(options)
}

export function createChildParseContext(
  parent: ParseContext,
  options: ParseOptions = parent,
  overrides: Partial<ParseContext> = {},
): ParseContext {
  return createParseContext(options, {
    runtime: parent.runtime,
    markdownIt: parent.markdownIt,
    referenceDefinitions: parent.referenceDefinitions,
    ...overrides,
  })
}
