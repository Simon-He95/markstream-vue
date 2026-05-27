import type { SmoothMarkdownStreamOptions } from 'markstream-core'
import type { BaseNode, HtmlPolicy, MarkdownIt, ParsedNode, ParseOptions } from 'stream-markdown-parser'
import type { CustomComponentMap } from '../../customComponents'
import type { CodeBlockMonacoOptions, CodeBlockMonacoTheme } from '../../types/monaco'
import {
  getHtmlTagFromContent,
  getMarkdown,
  hasCompleteHtmlTagContent,
  normalizeCustomHtmlTags,
  normalizeCustomHtmlTagName as normalizeTagName,
  parseMarkdownToStructure,
  stripCustomHtmlWrapper,
} from 'stream-markdown-parser'
import { hydrateCustomTagContent } from '../../hydrateCustomTagContent'

export {
  getHtmlTagFromContent,
  hasCompleteHtmlTagContent,
  normalizeCustomHtmlTags,
  normalizeTagName,
  stripCustomHtmlWrapper,
}

export type AngularRenderableNode = (ParsedNode | BaseNode) & Record<string, unknown>

export interface CodeBlockPreviewPayload {
  node: AngularRenderableNode
  artifactType: 'text/html' | 'image/svg+xml'
  artifactTitle: string
  id: string
}

export type NodeRendererCodeBlockProps = Partial<{
  stream: boolean
  darkTheme: CodeBlockMonacoTheme
  lightTheme: CodeBlockMonacoTheme
  themes: CodeBlockMonacoTheme[]
  monacoOptions: CodeBlockMonacoOptions
  minWidth: string | number
  maxWidth: string | number
  isShowPreview: boolean
  enableFontSizeControl: boolean
  showHeader: boolean
  showCopyButton: boolean
  showExpandButton: boolean
  showPreviewButton: boolean
  showCollapseButton: boolean
  showFontSizeButtons: boolean
  htmlPreviewAllowScripts: boolean
  htmlPreviewSandbox: string
}> & Record<string, unknown>

export type NodeRendererMermaidProps = Partial<{
  maxHeight: string | null
  estimatedPreviewHeightPx: number
  workerTimeoutMs: number
  parseTimeoutMs: number
  renderTimeoutMs: number
  fullRenderTimeoutMs: number
  renderDebounceMs: number
  showHeader: boolean
  showModeToggle: boolean
  showCopyButton: boolean
  showExportButton: boolean
  showFullscreenButton: boolean
  showCollapseButton: boolean
  showZoomControls: boolean
  isStrict: boolean
  enableMermaidInteractions: boolean
}> & Record<string, unknown>

export type NodeRendererD2Props = Partial<{
  maxHeight: string | null
  themeId: number | null
  darkThemeId: number | null
  showHeader: boolean
  showModeToggle: boolean
  showCopyButton: boolean
  showExportButton: boolean
  showCollapseButton: boolean
}> & Record<string, unknown>

export type NodeRendererInfographicProps = Partial<{
  maxHeight: string | null
  estimatedPreviewHeightPx: number
  showHeader: boolean
  showModeToggle: boolean
  showCopyButton: boolean
  showCollapseButton: boolean
  showExportButton: boolean
  showFullscreenButton: boolean
  showZoomControls: boolean
}> & Record<string, unknown>

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
  debugPerformance?: boolean
  customHtmlTags?: readonly string[]
  htmlPolicy?: HtmlPolicy
  viewportPriority?: boolean
  codeBlockStream?: boolean
  codeBlockDarkTheme?: CodeBlockMonacoTheme
  codeBlockLightTheme?: CodeBlockMonacoTheme
  codeBlockMonacoOptions?: CodeBlockMonacoOptions
  renderCodeBlocksAsPre?: boolean
  codeBlockMinWidth?: string | number
  codeBlockMaxWidth?: string | number
  codeBlockProps?: NodeRendererCodeBlockProps
  mermaidProps?: NodeRendererMermaidProps
  d2Props?: NodeRendererD2Props
  infographicProps?: NodeRendererInfographicProps
  customComponents?: CustomComponentMap
  showTooltips?: boolean
  themes?: CodeBlockMonacoTheme[]
  isDark?: boolean
  customId?: string
  indexKey?: number | string
  typewriter?: boolean
  /** Enable/disable non-code-node enter and streamed-text fade animations. Default: true */
  fade?: boolean
  batchRendering?: boolean
  initialRenderBatchSize?: number
  renderBatchSize?: number
  renderBatchDelay?: number
  renderBatchBudgetMs?: number
  renderBatchIdleTimeoutMs?: number
  deferNodesUntilVisible?: boolean
  maxLiveNodes?: number
  liveNodeBuffer?: number
  allowHtml?: boolean
  smoothStreaming?: boolean | 'auto'
  smoothStreamingOptions?: SmoothMarkdownStreamOptions
}

export interface AngularRenderContext {
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
  codeBlockProps?: NodeRendererCodeBlockProps
  mermaidProps?: NodeRendererMermaidProps
  d2Props?: NodeRendererD2Props
  infographicProps?: NodeRendererInfographicProps
  customComponents?: CustomComponentMap
  codeBlockThemes?: {
    themes?: CodeBlockMonacoTheme[]
    darkTheme?: CodeBlockMonacoTheme
    lightTheme?: CodeBlockMonacoTheme
    monacoOptions?: CodeBlockMonacoOptions
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
  'footnote_reference',
  'footnote_anchor',
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
): AngularRenderContext {
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
    codeBlockStream: props.codeBlockStream,
    renderCodeBlocksAsPre: props.renderCodeBlocksAsPre,
    allowHtml: props.allowHtml !== false,
    htmlPolicy: props.htmlPolicy ?? 'safe',
    customHtmlTags,
    parseOptions: props.parseOptions,
    customMarkdownIt: props.customMarkdownIt,
    codeBlockProps: props.codeBlockProps,
    mermaidProps: props.mermaidProps,
    d2Props: props.d2Props,
    infographicProps: props.infographicProps,
    customComponents: props.customComponents,
    codeBlockThemes: {
      themes: props.themes,
      darkTheme: props.codeBlockDarkTheme,
      lightTheme: props.codeBlockLightTheme,
      monacoOptions: props.codeBlockMonacoOptions,
      minWidth: props.codeBlockMinWidth,
      maxWidth: props.codeBlockMaxWidth,
    },
    events,
  }
}

export function resolveParsedNodes(props: NodeRendererProps): AngularRenderableNode[] {
  if (Array.isArray(props.nodes))
    return props.nodes as AngularRenderableNode[]

  const content = getString(props.content)
  if (!content)
    return []

  const normalizedTags = normalizeCustomHtmlTags([
    ...(props.customHtmlTags || []),
    ...(props.parseOptions?.customHtmlTags || []),
  ])
  const cacheKey = `${props.customId || 'markstream-angular'}::${normalizedTags.join(',')}`
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
    parseMarkdownToStructure(content, parser, options) as AngularRenderableNode[],
    content,
    normalizedTags,
  ) as AngularRenderableNode[]
}

export function getNodeList(value: unknown): AngularRenderableNode[] {
  return Array.isArray(value)
    ? value.filter((item): item is AngularRenderableNode => !!item && typeof item === 'object')
    : []
}

export function isWhitespaceTextNode(node: AngularRenderableNode | null | undefined) {
  return getString((node as any)?.type) === 'text' && getString((node as any)?.content).trim() === ''
}

export function getMeaningfulLinkChildren(node: AngularRenderableNode | null | undefined) {
  if (getString((node as any)?.type) !== 'link')
    return []

  return getNodeList((node as any)?.children).filter(child => !isWhitespaceTextNode(child))
}

export function isImageOnlyLinkNode(node: AngularRenderableNode | null | undefined) {
  const linkChildren = getMeaningfulLinkChildren(node)
  return linkChildren.length === 1 && getString((linkChildren[0] as any)?.type) === 'image'
}

export function isMediaOnlyParagraphNodes(children: readonly AngularRenderableNode[]) {
  const meaningfulChildren = getNodeList(children).filter(child => !isWhitespaceTextNode(child))
  return meaningfulChildren.length > 0
    && meaningfulChildren.every(child => getString((child as any)?.type) === 'image' || isImageOnlyLinkNode(child))
}

export function normalizeMediaOnlyParagraphNodes(children: readonly AngularRenderableNode[]) {
  const source = getNodeList(children)
  const meaningfulChildren = source.filter(child => !isWhitespaceTextNode(child))

  if (!isMediaOnlyParagraphNodes(source) || meaningfulChildren.length <= 1)
    return source

  const normalized: AngularRenderableNode[] = []
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
    } as AngularRenderableNode)
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

export function resolveCodeBlockLanguage(node: AngularRenderableNode) {
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

export function splitParagraphChildren(children: readonly AngularRenderableNode[]) {
  const parts: Array<
    | { kind: 'inline', nodes: AngularRenderableNode[] }
    | { kind: 'block', node: AngularRenderableNode }
  > = []

  const inlineBuffer: AngularRenderableNode[] = []
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
