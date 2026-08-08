import type { PreparedText } from '@chenglou/pretext'
import type { ParsedNode } from 'stream-markdown-parser'
import { layout, prepare } from '@chenglou/pretext'
import { shallowRef } from 'vue'
import { resolveDiffInlineLayout } from '../components/CodeBlockNode/codeBlockHeader'

type WhiteSpaceMode = 'normal' | 'pre-wrap'
type EstimateKind = 'simple-text' | 'code-block'
type CodeRendererKind = 'stream-diffs' | 'pre'

export interface HeightEstimationExperimentConfig {
  enabled?: boolean
  textEstimation?: boolean
  codeBlockEstimation?: boolean
  restore?: boolean
  diagnostics?: boolean
}

export interface RestoreAnchor {
  nodeIndex: number
  offsetWithinNodePx: number
}

export interface RendererExperimentNodeRecord {
  index: number
  type: string
  estimateKind: EstimateKind | null
  rendererKind: CodeRendererKind | null
  estimatedHeight: number | null
  estimatedContentHeight: number | null
  measuredHeight: number | null
}

export interface RendererExperimentReport {
  totalNodes: number
  measuredCount: number
  estimatedCount: number
  averageNodeHeight: number
  topSpacerHeight: number
  bottomSpacerHeight: number
  estimatedTotalHeight: number
  width: number
  probe: {
    paragraphReady: boolean
    listItemReady: boolean
    listWrapperOverhead: number
    headingReadyLevels: number[]
  }
  nodes: RendererExperimentNodeRecord[]
}

export interface HeightEstimationRendererController {
  captureRestoreAnchor: () => RestoreAnchor | null
  restoreAnchor: (anchor: RestoreAnchor) => void
  getAnchorDrift: (anchor: RestoreAnchor) => number | null
  getReport: () => RendererExperimentReport
}

export interface BlockTextProfile {
  font: string
  lineHeight: number
  wrapperOverhead: number
  widthAdjustment: number
  whiteSpace?: WhiteSpaceMode
}

export interface SimpleTextProbeProfile {
  paragraph: BlockTextProfile | null
  listItem: BlockTextProfile | null
  listWrapperOverhead: number
  headings: Record<number, BlockTextProfile | null>
}

export interface EstimatedNodeHeight {
  kind: EstimateKind
  height: number
  contentHeight?: number
  rendererKind?: CodeRendererKind
  diffInline?: boolean
}

export interface CodeBlockEstimateOptions {
  rendererKind: CodeRendererKind
  showHeader?: boolean
  width?: number
}

const GLOBAL_STORE_KEY = '__MARKSTREAM_VUE_HEIGHT_ESTIMATION_EXPERIMENT__'
const PREPARED_CACHE_LIMIT = 240
const BLOCK_ESTIMATE_CACHE_LIMIT = 4000
const CODE_BLOCK_HEADER_HEIGHT = 40
const CODE_BLOCK_DEFAULT_CAP = 500
const PRE_CODE_LINE_HEIGHT = 28
const DIFF_METADATA_PREFIXES = ['diff ', 'index ', '--- ', '+++ ', '@@ ']

interface PreparedCacheEntry {
  prepared: PreparedText
}

interface BlockEstimateCacheEntry {
  height: number
  contentHeight: number
}

interface HeightEstimationExperimentStore {
  configs: Record<string, HeightEstimationExperimentConfig>
  controllers: Record<string, HeightEstimationRendererController | undefined>
  revision: ReturnType<typeof shallowRef<number>>
  preparedCache: Map<string, PreparedCacheEntry>
  blockEstimateCache: Map<string, BlockEstimateCacheEntry>
}

const store: HeightEstimationExperimentStore = (() => {
  const g = globalThis as any
  if (g[GLOBAL_STORE_KEY])
    return g[GLOBAL_STORE_KEY] as HeightEstimationExperimentStore

  const next: HeightEstimationExperimentStore = {
    configs: {},
    controllers: {},
    revision: shallowRef(0),
    preparedCache: new Map(),
    blockEstimateCache: new Map(),
  }
  g[GLOBAL_STORE_KEY] = next
  return next
})()

let canPrepareTextSupport: boolean | null = null

export const heightEstimationExperimentRevision = store.revision

export function setHeightEstimationExperiment(customId: string, config: HeightEstimationExperimentConfig) {
  if (!customId)
    return
  store.configs[customId] = { ...config }
  store.revision.value++
}

export function clearHeightEstimationExperiment(customId: string) {
  if (!customId)
    return
  delete store.configs[customId]
  delete store.controllers[customId]
  store.revision.value++
}

export function resetHeightEstimationExperimentCaches() {
  store.preparedCache.clear()
  store.blockEstimateCache.clear()
  canPrepareTextSupport = null
}

export function getHeightEstimationExperiment(customId?: string | null) {
  if (!customId)
    return null
  return store.configs[customId] ?? null
}

export function registerHeightEstimationRendererController(customId: string, controller: HeightEstimationRendererController) {
  if (!customId)
    return () => {}
  store.controllers[customId] = controller
  return () => {
    if (store.controllers[customId] === controller)
      delete store.controllers[customId]
  }
}

export function getHeightEstimationRendererController(customId?: string | null) {
  if (!customId)
    return null
  return store.controllers[customId] ?? null
}

function canPrepareText() {
  if (canPrepareTextSupport != null)
    return canPrepareTextSupport
  if (typeof document === 'undefined')
    return false
  try {
    const canvas = document.createElement('canvas')
    canPrepareTextSupport = !!canvas.getContext?.('2d')
    return canPrepareTextSupport
  }
  catch {
    canPrepareTextSupport = false
    return false
  }
}

function parsePositiveNumber(raw: string | null | undefined, fallback: number) {
  const value = Number.parseFloat(String(raw ?? ''))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function getPreparedText(text: string, font: string, whiteSpace: WhiteSpaceMode) {
  const key = `${whiteSpace}\u0000${font}\u0000${text}`
  const cached = store.preparedCache.get(key)
  if (cached) {
    store.preparedCache.delete(key)
    store.preparedCache.set(key, cached)
    return cached.prepared
  }
  const prepared = prepare(text, font, { whiteSpace })
  store.preparedCache.set(key, { prepared })
  while (store.preparedCache.size > PREPARED_CACHE_LIMIT) {
    const oldestKey = store.preparedCache.keys().next().value
    if (!oldestKey)
      break
    store.preparedCache.delete(oldestKey)
  }
  return prepared
}

function isTextLikeInlineNode(node: any) {
  return node?.type === 'text' || node?.type === 'emoji' || node?.type === 'hardbreak'
}

function flattenSimpleInlineChildren(children: any[] | undefined): string | null {
  if (!Array.isArray(children) || children.length === 0)
    return null
  let text = ''
  for (const child of children) {
    if (!isTextLikeInlineNode(child))
      return null
    if (child.type === 'text')
      text += String(child.content ?? '')
    else if (child.type === 'emoji')
      text += String(child.name ?? child.raw ?? '')
    else if (child.type === 'hardbreak')
      text += '\n'
  }
  return text.length > 0 ? text : null
}

function estimateBlockTextHeight(text: string, width: number, profile: BlockTextProfile) {
  if (!text || !Number.isFinite(width) || width <= 0 || !canPrepareText())
    return null
  try {
    const roundedWidth = Math.round(width * 100) / 100
    const cacheKey = [
      profile.whiteSpace ?? 'pre-wrap',
      profile.font,
      profile.lineHeight,
      profile.wrapperOverhead,
      profile.widthAdjustment,
      roundedWidth,
      text,
    ].join('\u0000')
    const cached = store.blockEstimateCache.get(cacheKey)
    if (cached) {
      store.blockEstimateCache.delete(cacheKey)
      store.blockEstimateCache.set(cacheKey, cached)
      return {
        kind: 'simple-text' as const,
        height: cached.height,
        contentHeight: cached.contentHeight,
      }
    }
    const whiteSpace = profile.whiteSpace ?? 'pre-wrap'
    const prepared = getPreparedText(text, profile.font, whiteSpace)
    const layoutWidth = Math.max(24, roundedWidth - profile.widthAdjustment)
    const result = layout(prepared, layoutWidth, profile.lineHeight)
    const contentHeight = Math.max(profile.lineHeight, result.height)
    const height = Math.max(profile.lineHeight, Math.round(contentHeight + profile.wrapperOverhead))
    store.blockEstimateCache.set(cacheKey, {
      height,
      contentHeight: Math.round(contentHeight),
    })
    while (store.blockEstimateCache.size > BLOCK_ESTIMATE_CACHE_LIMIT) {
      const oldestKey = store.blockEstimateCache.keys().next().value
      if (!oldestKey)
        break
      store.blockEstimateCache.delete(oldestKey)
    }
    return {
      kind: 'simple-text' as const,
      height,
      contentHeight: Math.round(contentHeight),
    }
  }
  catch {
    return null
  }
}

export function estimateSimpleTextBlockHeight(
  node: ParsedNode,
  width: number,
  profile: SimpleTextProbeProfile | null | undefined,
): EstimatedNodeHeight | null {
  if (!profile || !node || !Number.isFinite(width) || width <= 0)
    return null

  if (node.type === 'paragraph') {
    const text = flattenSimpleInlineChildren((node as any).children)
    if (!text || !profile.paragraph)
      return null
    return estimateBlockTextHeight(text, width, profile.paragraph)
  }

  if (node.type === 'heading') {
    const level = Number((node as any).level || 0)
    const text = flattenSimpleInlineChildren((node as any).children)
    const headingProfile = profile.headings[level]
    if (!text || !headingProfile)
      return null
    return estimateBlockTextHeight(text, width, headingProfile)
  }

  if (node.type === 'list_item') {
    const children = Array.isArray((node as any).children) ? (node as any).children : []
    if (children.length !== 1 || children[0]?.type !== 'paragraph' || !profile.listItem)
      return null
    const text = flattenSimpleInlineChildren(children[0]?.children)
    if (!text)
      return null
    return estimateBlockTextHeight(text, width, profile.listItem)
  }

  if (node.type === 'list') {
    const items = Array.isArray((node as any).items) ? (node as any).items : []
    if (!items.length)
      return null
    let total = Math.max(0, profile.listWrapperOverhead)
    for (const item of items) {
      const estimatedItem = estimateSimpleTextBlockHeight(item as ParsedNode, width, profile)
      if (!estimatedItem)
        return null
      total += estimatedItem.height
    }
    return {
      kind: 'simple-text',
      height: Math.max(1, Math.round(total)),
      contentHeight: Math.max(1, Math.round(total)),
    }
  }

  return null
}

function countCodeLines(source: string) {
  if (!source)
    return 1
  const lines = String(source).split(/\r?\n/)
  return Math.max(1, lines.length)
}

function getDisplayCode(source: unknown, loading?: boolean) {
  const value = String(source ?? '')
  return loading ? value : value.replace(/\r\n$|\n$|\r$/, '')
}

function getSplitDiffLineCount(node: ParsedNode) {
  const originalCode = (node as any).originalCode
  const updatedCode = (node as any).updatedCode
  if (originalCode != null || updatedCode != null) {
    return Math.max(
      countCodeLines(getDisplayCode(originalCode)),
      countCodeLines(getDisplayCode(updatedCode)),
    )
  }

  const lines = getDisplayCode((node as any).code).split(/\r?\n/)
  let originalLines = 0
  let updatedLines = 0
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      updatedLines++
    }
    else if (line.startsWith('-') && !line.startsWith('---')) {
      originalLines++
    }
    else {
      originalLines++
      updatedLines++
    }
  }
  return Math.max(1, originalLines, updatedLines)
}

function getInlineDiffLineCount(node: ParsedNode) {
  const raw = getDisplayCode((node as any).raw)
  if (raw) {
    const lines = raw.split(/\r?\n/)
    if ((node as any).originalCode != null || (node as any).updatedCode != null) {
      return Math.max(1, lines.filter(line =>
        !DIFF_METADATA_PREFIXES.some(prefix => line.startsWith(prefix)),
      ).length)
    }
    return Math.max(1, lines.length)
  }
  return countCodeLines(getDisplayCode((node as any).originalCode))
    + countCodeLines(getDisplayCode((node as any).updatedCode))
}

function getCodeBlockVisibleLineCount(
  node: ParsedNode,
  width = 0,
) {
  if ((node as any).diff) {
    if (!resolveDiffInlineLayout({}, width))
      return getSplitDiffLineCount(node)
    return getInlineDiffLineCount(node)
  }
  return countCodeLines(getDisplayCode((node as any).code, (node as any).loading === true))
}

function resolveStreamDiffsLineHeight() {
  return 18
}

function resolveStreamDiffsVerticalPadding(isDiff: boolean) {
  return isDiff ? 0 : 16
}

export function estimateCodeBlockHeight(
  node: ParsedNode,
  options: CodeBlockEstimateOptions,
): EstimatedNodeHeight | null {
  if (!node || node.type !== 'code_block')
    return null

  const rendererKind = options.rendererKind
  const showHeader = rendererKind !== 'pre' && options.showHeader !== false
  const isDiff = Boolean((node as any).diff)
  let contentHeight = 0
  let cap = CODE_BLOCK_DEFAULT_CAP

  if (rendererKind === 'stream-diffs') {
    const lineCount = getCodeBlockVisibleLineCount(node, options.width)
    const lineHeight = resolveStreamDiffsLineHeight()
    const verticalPadding = resolveStreamDiffsVerticalPadding(isDiff)
    cap = CODE_BLOCK_DEFAULT_CAP
    contentHeight = Math.round(lineCount * lineHeight + verticalPadding)
  }
  else {
    const lineCount = getCodeBlockVisibleLineCount(node)
    contentHeight = Math.round(lineCount * PRE_CODE_LINE_HEIGHT)
    cap = Number.POSITIVE_INFINITY
  }

  const visibleContentHeight = Math.max(1, Math.min(contentHeight, cap))
  return {
    kind: 'code-block',
    height: Math.round(visibleContentHeight + (showHeader ? CODE_BLOCK_HEADER_HEIGHT : 0)),
    contentHeight: visibleContentHeight,
    rendererKind,
    ...(isDiff && rendererKind === 'stream-diffs'
      ? { diffInline: resolveDiffInlineLayout({}, options.width ?? 0) }
      : {}),
  }
}

export function buildPretextFontFromComputedStyle(style: CSSStyleDeclaration | null | undefined) {
  if (!style)
    return ''
  const fontStyle = style.fontStyle || 'normal'
  const fontWeight = style.fontWeight || '400'
  const fontSize = style.fontSize || '16px'
  const fontFamily = style.fontFamily || 'sans-serif'
  return `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`
}

export function buildBlockTextProfile(
  wrapper: HTMLElement | null | undefined,
  textEl: HTMLElement | null | undefined,
  whiteSpace: WhiteSpaceMode = 'pre-wrap',
): BlockTextProfile | null {
  if (!wrapper || !textEl || typeof window === 'undefined')
    return null
  const style = window.getComputedStyle(textEl)
  const wrapperHeight = wrapper.offsetHeight
  const lineHeight = parsePositiveNumber(style.lineHeight, parsePositiveNumber(style.fontSize, 16) * 1.5)
  const wrapperWidth = wrapper.getBoundingClientRect().width
  const textWidth = textEl.getBoundingClientRect().width
  return {
    font: buildPretextFontFromComputedStyle(style),
    lineHeight,
    wrapperOverhead: Math.max(0, wrapperHeight - lineHeight),
    widthAdjustment: Math.max(0, wrapperWidth - textWidth),
    whiteSpace,
  }
}

export function createEmptySimpleTextProbeProfile(): SimpleTextProbeProfile {
  return {
    paragraph: null,
    listItem: null,
    listWrapperOverhead: 0,
    headings: {
      1: null,
      2: null,
      3: null,
      4: null,
      5: null,
      6: null,
    },
  }
}
