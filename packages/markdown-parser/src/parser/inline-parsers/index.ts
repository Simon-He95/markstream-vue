import type { MarkdownToken, ParsedNode, ParseOptions, TextNode } from '../../types'
import type { ParseContext } from '../parse-context'
import type { InlineParseState } from './inline-parser-state'
import { inferLinkifyDemotionContext } from '../linkifyHeuristics'
import { ensureParseContext } from '../parse-context'
import { cloneTokenWithMutableChildren } from '../token-copy'
import { dispatchInlineToken } from './inline-token-dispatcher'

export { isLikelyUrl } from './link-image-recovery'

const TEXT_RECOVERY_MARKER_RE = /[!$(*[\\\]_`|~]/

// Process inline tokens (for text inside paragraphs, headings, etc.)
export function parseInlineTokens(
  tokens: MarkdownToken[],
  raw?: string,
  pPreToken?: MarkdownToken,
  options?: ParseOptions,
): ParsedNode[] {
  if (!tokens || tokens.length === 0)
    return []

  if (tokens.length === 1 && tokens[0].type === 'text') {
    const content = tokens[0].content
    if (typeof content === 'string' && content && content !== '<' && !content.endsWith('undefined') && !TEXT_RECOVERY_MARKER_RE.test(content))
      return [{ type: 'text', content, raw: content, center: false }]
  }

  let parseContext = ensureParseContext(options)
  const inheritedContext = parseContext.linkifyDemotionContext
  const inferredContext = inferLinkifyDemotionContext(raw)
  const linkifyDemotionContext = {
    filename: inheritedContext?.filename || inferredContext.filename,
    explicitFilename: inheritedContext?.explicitFilename || inferredContext.explicitFilename,
    marketTicker: inheritedContext?.marketTicker || inferredContext.marketTicker,
  }
  if (linkifyDemotionContext.filename || linkifyDemotionContext.explicitFilename || linkifyDemotionContext.marketTicker) {
    parseContext = {
      ...parseContext,
      linkifyDemotionContext,
    } as ParseContext
  }

  options = parseContext
  // Default to strict matching for strong unless caller explicitly sets false
  const requireClosingStrong = options?.requireClosingStrong
  const originalTokens = tokens
  const state: InlineParseState = {
    currentTextNode: null,
    index: 0,
    options: parseContext,
    parseInlineTokens,
    pPreToken,
    raw,
    requireClosingStrong,
    result: [],
    tokens,
    dispatchToken: token => dispatchInlineToken(state, token),
    ensureWorkingTokens,
    pushParsed,
    pushText,
    pushToken,
    resetCurrentTextNode,
  }

  function ensureWorkingTokens() {
    if (state.tokens === originalTokens)
      state.tokens = state.tokens.slice()
    return state.tokens
  }

  // Helpers to manage text node merging and pushing parsed nodes
  function resetCurrentTextNode() {
    state.currentTextNode = null
  }

  function pushParsed(node: ParsedNode) {
    // ensure the ongoing text node is closed when pushing non-text nodes
    resetCurrentTextNode()
    state.result.push(node)
  }

  function pushToken(token: MarkdownToken) {
    // push a raw token into result as a ParsedNode (best effort cast)
    resetCurrentTextNode()
    const node = cloneTokenWithMutableChildren(token) as unknown as ParsedNode
    state.result.push(node)
  }

  function pushText(content: string, raw?: string) {
    if (state.currentTextNode) {
      state.currentTextNode.content += content
      state.currentTextNode.raw += raw ?? content
    }
    else {
      state.currentTextNode = {
        type: 'text',
        content: String(content ?? ''),
        raw: String(raw ?? content ?? ''),
      } as TextNode
      state.result.push(state.currentTextNode)
    }
  }

  while (state.index < state.tokens.length) {
    const token = state.tokens[state.index] as MarkdownToken
    dispatchInlineToken(state, token)
  }

  return state.result
}
