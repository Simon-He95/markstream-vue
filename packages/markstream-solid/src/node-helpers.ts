import type { SmoothMarkdownStreamOptions } from 'markstream-core'
import type { BaseNode, HtmlPolicy, MarkdownIt, ParsedNode, ParseOptions } from 'stream-markdown-parser'
import type { CodeBlockNodeProps } from './components/CodeBlockNode'
import type { D2BlockNodeProps } from './components/D2BlockNode'
import type { InfographicBlockNodeProps } from './components/InfographicBlockNode'
import type { MermaidBlockNodeProps } from './components/MermaidBlockNode'
import type { CustomComponentMap } from './customComponents'
import type { CodeBlockOptions, CodeBlockTheme, CodeBlockThemes } from './types/codeBlock'
import {
  getHtmlTagFromContent,
  getMarkdown,
  hasCompleteHtmlTagContent,
  normalizeCustomHtmlTags,
  normalizeCustomHtmlTagName as normalizeTagName,
  parseMarkdownToStructure,
  stripCustomHtmlWrapper,
} from 'stream-markdown-parser'
import { hydrateCustomTagContent } from './hydrateCustomTagContent'

export {
  getHtmlTagFromContent,
  hasCompleteHtmlTagContent,
  normalizeCustomHtmlTags,
  normalizeTagName,
  stripCustomHtmlWrapper,
}

export type SolidRenderableNode = (ParsedNode | BaseNode) & Record<string, unknown>

export interface CodeBlockPreviewPayload {
  node: SolidRenderableNode
  artifactType: 'text/html' | 'image/svg+xml'
  artifactTitle: string
  id: string
}

export type NodeRendererCodeBlockProps = Omit<CodeBlockNodeProps, 'node' | 'context' | 'isDark' | 'loading'>

export type NodeRendererMermaidProps = Omit<MermaidBlockNodeProps, 'node' | 'context' | 'isDark' | 'loading'>

export type NodeRendererD2Props = Omit<D2BlockNodeProps, 'node' | 'context' | 'isDark' | 'loading'>

export type NodeRendererInfographicProps = Omit<InfographicBlockNodeProps, 'node' | 'context' | 'isDark' | 'loading'>

export interface NodeRendererEvents {
  onCopy?: (code: string) => void
  onHandleArtifactClick?: (payload: CodeBlockPreviewPayload) => void
}

export interface NodeRendererProps {
  content?: string
  nodes?: readonly BaseNode[] | null
  final?: boolean
  parseOptions?: ParseOptions
  customMarkdownIt?: (md: MarkdownIt) => MarkdownIt
  /** When true, NodeRenderer logs `[markstream-solid][perf] parse(sync)` for each parse. Not a virtualization monitor. */
  debugPerformance?: boolean
  customHtmlTags?: readonly string[]
  htmlPolicy?: HtmlPolicy
  codeBlockStream?: boolean
  codeBlockDarkTheme?: CodeBlockTheme
  codeBlockLightTheme?: CodeBlockTheme
  renderCodeBlocksAsPre?: boolean
  codeBlockMinWidth?: string | number
  codeBlockMaxWidth?: string | number
  codeBlockOptions?: CodeBlockOptions
  codeBlockProps?: NodeRendererCodeBlockProps
  mermaidProps?: NodeRendererMermaidProps
  d2Props?: NodeRendererD2Props
  infographicProps?: NodeRendererInfographicProps
  customComponents?: CustomComponentMap
  showTooltips?: boolean
  themes?: CodeBlockThemes
  isDark?: boolean
  customId?: string
  indexKey?: number | string
  typewriter?: boolean
  fade?: boolean
  batchRendering?: boolean
  initialRenderBatchSize?: number
  renderBatchSize?: number
  renderBatchDelay?: number
  renderBatchBudgetMs?: number
  renderBatchIdleTimeoutMs?: number
  maxLiveNodes?: number
  allowHtml?: boolean
  smoothStreaming?: boolean | 'auto'
  /** Options are read when the renderer mounts; the core controller does not hot-swap them. */
  smoothStreamingOptions?: SmoothMarkdownStreamOptions
}

export interface SolidRenderContext {
  customId?: string
  isDark?: boolean
  indexKey?: string
  final?: boolean
  typewriter?: boolean
  fade?: boolean
  textStreamState?: Map<string, string>
  streamRenderVersion?: number
  showTooltips?: boolean
  codeBlockStream?: boolean
  renderCodeBlocksAsPre?: boolean
  allowHtml?: boolean
  htmlPolicy?: HtmlPolicy
  customHtmlTags?: readonly string[]
  parseOptions?: ParseOptions
  customMarkdownIt?: (md: MarkdownIt) => MarkdownIt
  codeBlockOptions?: CodeBlockOptions
  codeBlockProps?: NodeRendererCodeBlockProps
  mermaidProps?: NodeRendererMermaidProps
  d2Props?: NodeRendererD2Props
  infographicProps?: NodeRendererInfographicProps
  customComponents?: CustomComponentMap
  codeBlockThemes?: {
    themes?: CodeBlockThemes
    darkTheme?: CodeBlockTheme
    lightTheme?: CodeBlockTheme
    minWidth?: string | number
    maxWidth?: string | number
  }
  events: NodeRendererEvents
}

const markdownCache = new Map<string, MarkdownIt>()

export const BLOCK_LEVEL_TYPES = new Set([
  'table',
  'code_block',
  'html_block',
  'blockquote',
  'list',
  'list_item',
  'definition_list',
  'footnote',
  'admonition',
  'thematic_break',
  'math_block',
  'thinking',
  'vmr_container',
])

export function buildRenderContext(
  props: NodeRendererProps,
  events: NodeRendererEvents = {},
  textStreamState?: Map<string, string>,
  streamRenderVersion?: number,
): SolidRenderContext {
  const customHtmlTags = normalizeCustomHtmlTags([
    ...(props.customHtmlTags || []),
    ...(props.parseOptions?.customHtmlTags || []),
  ])

  return {
    customId: props.customId,
    isDark: props.isDark,
    indexKey: props.indexKey != null ? String(props.indexKey) : undefined,
    final: props.final,
    typewriter: props.typewriter,
    fade: props.fade,
    textStreamState,
    streamRenderVersion,
    showTooltips: props.showTooltips,
    codeBlockStream: props.codeBlockStream ?? true,
    renderCodeBlocksAsPre: props.renderCodeBlocksAsPre,
    allowHtml: props.allowHtml !== false,
    htmlPolicy: props.htmlPolicy ?? 'safe',
    customHtmlTags,
    parseOptions: props.parseOptions,
    customMarkdownIt: props.customMarkdownIt,
    codeBlockOptions: props.codeBlockOptions,
    codeBlockProps: {
      ...(typeof props.showTooltips === 'boolean' ? { showTooltips: props.showTooltips } : {}),
      ...(props.codeBlockProps || {}),
    },
    mermaidProps: props.mermaidProps,
    d2Props: props.d2Props,
    infographicProps: props.infographicProps,
    customComponents: props.customComponents,
    codeBlockThemes: {
      themes: props.themes,
      darkTheme: props.codeBlockDarkTheme,
      lightTheme: props.codeBlockLightTheme,
      minWidth: props.codeBlockMinWidth,
      maxWidth: props.codeBlockMaxWidth,
    },
    events,
  }
}

export function resolveParsedNodes(props: NodeRendererProps): SolidRenderableNode[] {
  if (Array.isArray(props.nodes))
    return props.nodes as SolidRenderableNode[]

  const content = getString(props.content)
  if (!content)
    return []

  const normalizedTags = normalizeCustomHtmlTags([
    ...(props.customHtmlTags || []),
    ...(props.parseOptions?.customHtmlTags || []),
  ])
  // `getMarkdown` shares parser instances by key across renderer packages.
  // Keep the Solid parser cache separate from the Svelte baseline when both
  // packages are installed in one application.
  const cacheKey = `${props.customId || 'markstream-solid'}::${normalizedTags.join(',')}`
  let markdown = markdownCache.get(cacheKey)
  if (!markdown) {
    markdown = getMarkdown(cacheKey, { customHtmlTags: normalizedTags })
    markdownCache.set(cacheKey, markdown)
  }

  const parser = props.customMarkdownIt
    ? props.customMarkdownIt(markdown)
    : markdown

  const options: ParseOptions = {
    ...(props.parseOptions ?? {}),
  }
  if (typeof props.final === 'boolean')
    options.final = props.final
  if (normalizedTags.length > 0)
    options.customHtmlTags = normalizedTags

  return hydrateCustomTagContent(
    parseMarkdownToStructure(content, parser, options) as SolidRenderableNode[],
    content,
    normalizedTags,
  ) as SolidRenderableNode[]
}

export function getNodeList(value: unknown): SolidRenderableNode[] {
  return Array.isArray(value)
    ? value.filter((item): item is SolidRenderableNode => !!item && typeof item === 'object')
    : []
}

export function isWhitespaceTextNode(node: SolidRenderableNode | null | undefined) {
  return getString((node as any)?.type) === 'text' && getString((node as any)?.content).trim() === ''
}

export function getMeaningfulLinkChildren(node: SolidRenderableNode | null | undefined) {
  if (getString((node as any)?.type) !== 'link')
    return []

  return getNodeList((node as any)?.children).filter(child => !isWhitespaceTextNode(child))
}

export function isImageOnlyLinkNode(node: SolidRenderableNode | null | undefined) {
  const linkChildren = getMeaningfulLinkChildren(node)
  return linkChildren.length === 1 && getString((linkChildren[0] as any)?.type) === 'image'
}

export function isMediaOnlyParagraphNodes(children: readonly SolidRenderableNode[]) {
  const meaningfulChildren = getNodeList(children).filter(child => !isWhitespaceTextNode(child))
  return meaningfulChildren.length > 0
    && meaningfulChildren.every(child => getString((child as any)?.type) === 'image' || isImageOnlyLinkNode(child))
}

export function normalizeMediaOnlyParagraphNodes(children: readonly SolidRenderableNode[]) {
  const source = getNodeList(children)
  const meaningfulChildren = source.filter(child => !isWhitespaceTextNode(child))

  if (!isMediaOnlyParagraphNodes(source) || meaningfulChildren.length <= 1)
    return source

  const normalized: SolidRenderableNode[] = []
  for (let index = 0; index < source.length; index += 1) {
    const child = source[index]
    if (!isWhitespaceTextNode(child)) {
      normalized.push(child)
      continue
    }

    const hasPrevious = normalized.length > 0
    const hasNext = source.slice(index + 1).some(nextChild => !isWhitespaceTextNode(nextChild))
    if (!hasPrevious || !hasNext)
      continue

    normalized.push({
      ...(child as Record<string, unknown>),
      content: ' ',
      raw: ' ',
    } as SolidRenderableNode)
  }

  return normalized
}

export function getString(value: unknown): string {
  return typeof value === 'string'
    ? value
    : value == null
      ? ''
      : String(value)
}

export function isSafeAttrName(value: string): boolean {
  return /^[^\s"'<>`=]+$/.test(value) && !/^on/i.test(value)
}

export function escapeHtml(value: unknown): string {
  return getString(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function escapeAttr(value: unknown): string {
  return escapeHtml(value).replace(/`/g, '&#96;')
}

export function sanitizeClassToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
}

export function clampHeadingLevel(value: unknown): number {
  const level = Math.trunc(Number(value) || 1)
  return Math.min(6, Math.max(1, level))
}

export function capitalize(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : ''
}

export function normalizeCodeLanguage(raw: unknown) {
  const head = String(String(raw ?? '').split(/\s+/g)[0] ?? '').toLowerCase()
  const safe = head.replace(/[^\w-]/g, '')
  return safe || 'plaintext'
}

export function resolveCodeBlockLanguage(node: SolidRenderableNode) {
  return normalizeCodeLanguage((node as any)?.language)
}

export function encodeDataPayload(value: string) {
  if (!value)
    return ''

  const globalBuffer = (globalThis as any)?.require?.('buffer')?.Buffer
  if (globalBuffer?.from)
    return globalBuffer.from(value, 'utf8').toString('base64')

  if (typeof TextEncoder !== 'undefined' && typeof globalThis.btoa === 'function') {
    const bytes = new TextEncoder().encode(value)
    let binary = ''
    for (const byte of bytes)
      binary += String.fromCharCode(byte)
    return globalThis.btoa(binary)
  }

  return ''
}

export function normalizeTokenAttrs(attrs?: Array<[string, string | null]> | null) {
  if (!Array.isArray(attrs) || attrs.length === 0)
    return null
  return attrs.reduce<Record<string, string | true>>((acc, [name, value]) => {
    if (!name || !isSafeAttrName(name))
      return acc
    acc[name] = value ?? true
    return acc
  }, {})
}

export function splitParagraphChildren(children: readonly SolidRenderableNode[]) {
  const parts: Array<
    | { kind: 'inline', nodes: SolidRenderableNode[] }
    | { kind: 'block', node: SolidRenderableNode }
  > = []

  const inlineBuffer: SolidRenderableNode[] = []
  const flushInline = () => {
    if (!inlineBuffer.length)
      return
    parts.push({ kind: 'inline', nodes: inlineBuffer.slice() })
    inlineBuffer.length = 0
  }

  for (const child of children) {
    if (BLOCK_LEVEL_TYPES.has(String(child?.type || ''))) {
      flushInline()
      parts.push({ kind: 'block', node: child })
    }
    else {
      inlineBuffer.push(child)
    }
  }
  flushInline()

  return parts
}
