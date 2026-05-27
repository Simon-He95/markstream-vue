import type { BaseNode, MarkdownIt, ParseOptions } from 'stream-markdown-parser'
import { getMarkdown, mergeCustomHtmlTags, parseMarkdownToStructure } from 'stream-markdown-parser'
import { hydrateCustomTagContent } from './hydrateCustomTagContent'

type NestedMarkdownSourceNode = BaseNode & {
  children?: BaseNode[]
  content?: string
}

export interface NestedMarkdownNodesInput {
  node?: NestedMarkdownSourceNode | null
  nodes?: readonly BaseNode[] | null
  content?: string | null
}

export interface NestedMarkdownNodesOptions {
  cacheKey?: string
  final?: boolean
  parseOptions?: ParseOptions
  customHtmlTags?: readonly string[]
  customMarkdownIt?: (markdown: MarkdownIt) => MarkdownIt
}

const DEFAULT_CACHE_KEY = 'markstream-angular-nested-nodes'
const markdownCache = new Map<string, MarkdownIt>()

export function parseNestedMarkdownToNodes(
  input: NestedMarkdownNodesInput,
  options: NestedMarkdownNodesOptions = {},
): BaseNode[] {
  if (Array.isArray(input.nodes))
    return input.nodes.slice()

  const nestedNode = input.node
  if (nestedNode) {
    const children = getNodeList(nestedNode.children)
    if (children.length > 0)
      return children.slice()
  }

  const content = resolveContent(input)
  if (!content)
    return []

  const parseOptions = resolveParseOptions(input, options)
  const markdown = resolveMarkdownInstance(options)
  return hydrateCustomTagContent(
    parseMarkdownToStructure(content, markdown, parseOptions),
    content,
    mergeCustomHtmlTags(options.customHtmlTags, parseOptions?.customHtmlTags),
  )
}

function resolveContent(input: NestedMarkdownNodesInput) {
  if (typeof input.content === 'string')
    return input.content
  if (typeof input.node?.content === 'string')
    return input.node.content
  return ''
}

function resolveParseOptions(
  input: NestedMarkdownNodesInput,
  options: NestedMarkdownNodesOptions,
): ParseOptions | undefined {
  const base = options.parseOptions ?? {}
  const resolvedFinal = options.final ?? resolveFinalFromNode(input.node)
  const customHtmlTags = mergeCustomHtmlTags(options.customHtmlTags, base.customHtmlTags)

  if (resolvedFinal == null && customHtmlTags.length === 0)
    return base

  return {
    ...base,
    ...(resolvedFinal == null ? {} : { final: resolvedFinal }),
    ...(customHtmlTags.length === 0 ? {} : { customHtmlTags }),
  } as ParseOptions
}

function resolveFinalFromNode(node?: NestedMarkdownSourceNode | null) {
  if (!node || typeof node !== 'object')
    return undefined
  if (typeof node.loading === 'boolean')
    return !node.loading
  return undefined
}

function resolveMarkdownInstance(options: NestedMarkdownNodesOptions) {
  const normalizedTags = mergeCustomHtmlTags(options.customHtmlTags, options.parseOptions?.customHtmlTags)
  const cacheKey = `${options.cacheKey || DEFAULT_CACHE_KEY}::${normalizedTags.join(',')}`
  let markdown = markdownCache.get(cacheKey)

  if (!markdown) {
    markdown = getMarkdown(cacheKey, {
      customHtmlTags: normalizedTags,
    })
    markdownCache.set(cacheKey, markdown)
  }

  return options.customMarkdownIt
    ? options.customMarkdownIt(markdown)
    : markdown
}

function getNodeList(value: unknown) {
  return Array.isArray(value) ? value as BaseNode[] : []
}
