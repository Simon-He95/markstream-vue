import type { Accessor } from 'solid-js'
import type { MarkstreamVirtualMetrics, MarkstreamVirtualState, NodeRendererMode, NodeRendererProps } from './types/node-renderer-props'
import { createEffect, createSignal, onCleanup } from 'solid-js'
import { getMarkdownItemChromeHeight, readElementOuterHeight } from './utils/virtualItemMeasurement'

type MaybeAccessor<T> = T | Accessor<T>
const read = <T>(value: MaybeAccessor<T>): T => typeof value === 'function' ? (value as Accessor<T>)() : value
function isMeasuredOrFinalConfidence(confidence: MarkstreamVirtualMetrics['confidence'] | undefined) {
  return confidence === 'measured' || confidence === 'final'
}
function isStableFinalVirtualMetrics(metrics: MarkstreamVirtualMetrics) {
  const nodeCount = Number(metrics.nodeCount)
  const measuredCount = Number(metrics.measuredCount)
  const liveStart = Math.max(0, Number(metrics.liveRange?.start ?? 0))
  const liveEnd = Math.min(nodeCount, Math.max(liveStart, Number(metrics.liveRange?.end ?? 0)))
  const liveRangeCount = Math.max(0, liveEnd - liveStart)
  return metrics.final === true
    && metrics.stable === true
    && metrics.confidence === 'mixed'
    && nodeCount > 0
    && measuredCount > 0
    && measuredCount < nodeCount
    && (liveRangeCount <= 0 || measuredCount >= liveRangeCount)
}
function shouldAllowMarkdownShrink(metrics: MarkstreamVirtualMetrics) {
  if (metrics.phase === 'final')
    return true
  if (metrics.final === true && isMeasuredOrFinalConfidence(metrics.confidence))
    return true
  if (!metrics.stable)
    return false
  return isMeasuredOrFinalConfidence(metrics.confidence)
    || isStableFinalVirtualMetrics(metrics)
}
export type MarkstreamTimelineItemKey = string | number
export interface MarkstreamTimelineItem {
  id: MarkstreamTimelineItemKey
  kind?: string
  content?: string
  final?: boolean
  revision?: MarkstreamTimelineItemKey
  text?: string
  label?: string
  status?: string
  message?: string
  component?: unknown
}
export interface MarkstreamVirtualTimelineProps<T = MarkstreamTimelineItem> {
  items: readonly T[]
  threadKey?: MarkstreamTimelineItemKey
  /**
   * Optional external layout invalidation token.
   *
   * When provided, MarkstreamVirtualTimeline skips per-item content/kind scanning
   * and rebuilds the Fenwick layout only when this token or item count changes.
   * Bump it whenever item key/kind/markdown-ness/component/estimated-height inputs change.
   * Pure markdown content/final updates can keep the same value.
   */
  layoutRevision?: MarkstreamTimelineItemKey
  getKey?: (item: T, index: number) => MarkstreamTimelineItemKey
  getKind?: (item: T, index: number) => string
  getContent?: (item: T, index: number) => string
  getFinal?: (item: T, index: number) => boolean
  getRevision?: (item: T, index: number) => MarkstreamTimelineItemKey | undefined
  estimateItemHeight?: (item: T, index: number) => number
  overscan?: number
  overscanPx?: number
  stickToBottom?: boolean | 'auto'
  measurementKey?: string | number
  markdownMode?: NodeRendererMode
  renderCodeBlocksAsPre?: boolean
  /**
   * Initial state for the active thread.
   *
   * Pass this before first render if the host persisted a previous state.
   * This prevents a first-frame jump from estimated scrollTop to restored scrollTop.
   */
  initialThreadState?: MarkstreamThreadVirtualState | null
  /**
   * Default: false.
   */
  markdownFade?: boolean
  /**
   * Default: false. Keep restore loading visible until the viewport is ready.
   */
  restoreMaxLoadingMs?: number | false
  debug?: boolean
}
export interface MarkstreamVisibleRange {
  start: number
  end: number
}
export interface MarkstreamOuterVirtualizerAdapter {
  getScrollElement: () => HTMLElement | null
  getScrollTop: () => number
  setScrollTop: (value: number) => void
  getViewportHeight: () => number
  getTotalHeight: () => number
  getItemOffset: (key: string) => number
  getItemSize: (key: string) => number
  setItemSize: (key: string, size: number) => void
  getVisibleRange: () => MarkstreamVisibleRange
  scrollToOffset: (offset: number) => void
  scrollToIndex: (index: number, align?: 'start' | 'center' | 'end') => void
  measureElement?: (key: string, el: HTMLElement) => void
}
export interface MarkstreamOuterAnchor {
  type: 'item'
  itemKey: string
  offsetWithinItemPx: number
}
export interface MarkstreamBottomAnchor {
  type: 'bottom'
  distanceFromBottomPx: number
}
export type MarkstreamThreadAnchor = MarkstreamOuterAnchor | MarkstreamBottomAnchor
export interface MarkstreamThreadVirtualState {
  threadKey?: string
  measurementKey?: string
  widthBucket?: number
  outerAnchor?: MarkstreamThreadAnchor
  itemHeights: Record<string, number>
  itemSizeSources?: Record<string, {
    sourceKey: string
    measurementKey?: string
    widthBucket?: number
  }>
  markdownStates: Record<string, MarkstreamVirtualState>
}
type MarkstreamItemSizeSource = NonNullable<MarkstreamThreadVirtualState['itemSizeSources']>[string]
export interface MarkstreamVirtualMarkdownProps extends Pick<NodeRendererProps, 'content' | 'final' | 'indexKey' | 'nodeVirtual' | 'maxLiveNodes' | 'liveNodeBuffer' | 'virtualScroll' | 'fade' | 'mode' | 'renderCodeBlocksAsPre'> {
  onHeightChange: (metrics: MarkstreamVirtualMetrics) => void
  onVirtualStateChange: (state: MarkstreamVirtualState) => void
}
export interface UseMarkstreamVirtualAdapterOptions<T = MarkstreamTimelineItem> {
  items: MaybeAccessor<readonly T[]>
  threadKey?: MaybeAccessor<MarkstreamTimelineItemKey | undefined>
  layoutRevision?: MaybeAccessor<MarkstreamTimelineItemKey | undefined>
  getKey?: (item: T, index: number) => MarkstreamTimelineItemKey
  getKind?: (item: T, index: number) => string
  getContent?: (item: T, index: number) => string
  getFinal?: (item: T, index: number) => boolean
  getRevision?: (item: T, index: number) => MarkstreamTimelineItemKey | undefined
  estimateItemHeight?: (item: T, index: number) => number
  measurementKey?: MaybeAccessor<string | number | undefined>
  markdownMode?: MaybeAccessor<NodeRendererMode | undefined>
  renderCodeBlocksAsPre?: MaybeAccessor<boolean | undefined>
  /**
   * Default: false.
   */
  markdownFade?: boolean
  /**
   * Preserve the outer scroll anchor when markdown logical height or measured
   * item height changes.
   *
   * Set false if the host virtualizer already performs equivalent scroll
   * anchoring.
   *
   * Default: 'auto'
   */
  preserveScrollAnchor?: boolean | 'auto'
  /**
   * Used when preserveScrollAnchor is enabled.
   * Default: 48
   */
  bottomThresholdPx?: number
  debug?: boolean
  virtualizer: MarkstreamOuterVirtualizerAdapter
}
export interface MarkstreamVirtualAdapterController<T = MarkstreamTimelineItem> {
  itemHeights: Map<string, number>
  markdownStates: Map<string, MarkstreamVirtualState>
  getItemKey: (item: T, index: number) => string
  isMarkdownItem: (item: T, index: number) => boolean
  isRestoringThread: () => boolean
  measureItem: (item: T, index: number, el: Element | {
    $el?: Element | null
  } | null | undefined) => void
  /** Release the measurement bookkeeping (DOM ref + ResizeObserver) of one item key. */
  unobserveItem: (key: string) => void
  /** Drop measurement bookkeeping for entries whose element left the DOM. Returns the released count. */
  releaseDetached: () => number
  markdownProps: (item: T, index: number) => MarkstreamVirtualMarkdownProps
  captureThreadState: () => MarkstreamThreadVirtualState
  preloadThreadState: (state: MarkstreamThreadVirtualState | null | undefined) => void
  restoreThreadState: (state: MarkstreamThreadVirtualState | null | undefined) => void
  dispose: () => void
}
export function getMarkstreamTimelineItemKey<T>(item: T, index: number, options: Pick<UseMarkstreamVirtualAdapterOptions<T>, 'getKey'>) {
  const rawKey = options.getKey?.(item, index) ?? (item as MarkstreamTimelineItem).id ?? index
  return String(rawKey)
}
export function getMarkstreamTimelineItemKind<T>(item: T, index: number, options: Pick<UseMarkstreamVirtualAdapterOptions<T>, 'getKind'>) {
  return options.getKind?.(item, index) ?? String((item as MarkstreamTimelineItem).kind ?? '')
}
export function getMarkstreamTimelineItemContent<T>(item: T, index: number, options: Pick<UseMarkstreamVirtualAdapterOptions<T>, 'getContent'>) {
  const value = options.getContent?.(item, index) ?? (item as MarkstreamTimelineItem).content
  return typeof value === 'string' ? value : ''
}
export function getMarkstreamTimelineItemFinal<T>(item: T, index: number, options: Pick<UseMarkstreamVirtualAdapterOptions<T>, 'getFinal'>) {
  const value = options.getFinal?.(item, index)
  if (typeof value === 'boolean')
    return value
  const itemFinal = (item as MarkstreamTimelineItem).final
  return typeof itemFinal === 'boolean' ? itemFinal : true
}
export function getMarkstreamTimelineItemRevision<T>(item: T, index: number, options: Pick<UseMarkstreamVirtualAdapterOptions<T>, 'getRevision'>) {
  return options.getRevision?.(item, index) ?? (item as MarkstreamTimelineItem).revision
}
export function isMarkstreamMarkdownTimelineItem<T>(item: T, index: number, options: Pick<UseMarkstreamVirtualAdapterOptions<T>, 'getKind' | 'getContent'>) {
  const kind = getMarkstreamTimelineItemKind(item, index, options)
  if (kind === 'assistant-markdown' || kind === 'markdown')
    return true
  if (kind)
    return false
  return getMarkstreamTimelineItemContent(item, index, options).length > 0
}
export function estimateMarkstreamTimelineItemHeight<T>(item: T, index: number, options: Pick<UseMarkstreamVirtualAdapterOptions<T>, 'estimateItemHeight' | 'getKind' | 'getContent'>) {
  const estimated = options.estimateItemHeight?.(item, index)
  if (Number.isFinite(estimated) && estimated! > 0)
    return estimated!
  const kind = getMarkstreamTimelineItemKind(item, index, options)
  if (kind === 'assistant-markdown' || kind === 'markdown')
    return 360
  if (kind === 'system-divider')
    return 44
  if (kind === 'tool-call')
    return 72
  if (kind === 'thinking')
    return 92
  if (kind === 'error')
    return 76
  if (kind === 'user-message')
    return 88
  return getMarkstreamTimelineItemContent(item, index, options).length > 0 ? 360 : 96
}
export function useMarkstreamVirtualAdapter<T = MarkstreamTimelineItem>(options: UseMarkstreamVirtualAdapterOptions<T>): MarkstreamVirtualAdapterController<T> {
  const heights = new Map<string, number>()
  const states = new Map<string, MarkstreamVirtualState>()
  const sources = new Map<string, MarkstreamItemSizeSource>()
  const measurements = new Map<string, {
    element: HTMLElement
    observer: ResizeObserver
  }>()
  const [revision, setRevision] = createSignal(0)
  const [restoring, setRestoring] = createSignal(false)
  const frames = new Set<number>()
  let pendingAnchor: { anchor: MarkstreamThreadAnchor, scrollTop: number } | undefined
  let disposed = false
  const getKey = (item: T, index: number) => getMarkstreamTimelineItemKey(item, index, options)
  const isMarkdown = (item: T, index: number) => isMarkstreamMarkdownTimelineItem(item, index, options)
  const threadKey = () => String(read(options.threadKey) ?? '')
  const measurementKey = () => `${read(options.measurementKey) ?? ''}:${read(options.markdownMode) ?? 'chat'}:${read(options.renderCodeBlocksAsPre) === true ? 'pre' : 'rich'}`
  const widthBucket = () => Math.round((options.virtualizer.getScrollElement()?.clientWidth ?? 0) / 32)
  const sourceKey = (item: T, index: number) => {
    const content = getMarkstreamTimelineItemContent(item, index, options)
    let hash = 2166136261
    for (let at = 0; at < content.length; at++)
      hash = Math.imul(hash ^ content.charCodeAt(at), 16777619)
    return `${getMarkstreamTimelineItemKind(item, index, options)}:${getMarkstreamTimelineItemRevision(item, index, options) ?? ''}:${content.length}:${hash >>> 0}`
  }
  const current = (key: string) => {
    const items = read(options.items)
    const index = items.findIndex((item, index) => getKey(item, index) === key)
    return index >= 0 ? { item: items[index], index } : undefined
  }
  function captureAnchor(): MarkstreamThreadAnchor | undefined {
    const outer = options.virtualizer
    const remaining = outer.getTotalHeight() - outer.getScrollTop() - outer.getViewportHeight()
    if (remaining <= (options.bottomThresholdPx ?? 48))
      return { type: 'bottom', distanceFromBottomPx: Math.max(0, remaining) }
    const index = outer.getVisibleRange().start
    const item = read(options.items)[index]
    return item == null ? undefined : { type: 'item', itemKey: getKey(item, index), offsetWithinItemPx: outer.getScrollTop() - outer.getItemOffset(getKey(item, index)) }
  }
  function restoreAnchor(anchor?: MarkstreamThreadAnchor) {
    if (!anchor)
      return
    const outer = options.virtualizer
    if (anchor.type === 'bottom')
      outer.setScrollTop(Math.max(0, outer.getTotalHeight() - outer.getViewportHeight() - anchor.distanceFromBottomPx))
    else if (current(anchor.itemKey))
      outer.setScrollTop(outer.getItemOffset(anchor.itemKey) + anchor.offsetWithinItemPx)
  }
  function frame(callback: () => void) {
    if (typeof requestAnimationFrame === 'undefined') {
      callback()
      return
    }
    const expectedThread = threadKey()
    const expectedMeasurement = measurementKey()
    const id = requestAnimationFrame(() => {
      frames.delete(id)
      if (!disposed && expectedThread === threadKey() && expectedMeasurement === measurementKey())
        callback()
    })
    frames.add(id)
  }
  function setHeight(key: string, size: number, source: string) {
    const item = current(key)
    if (disposed || !item || sourceKey(item.item, item.index) !== source || !Number.isFinite(size) || size <= 0)
      return
    const next = Math.ceil(size)
    if (heights.get(key) === next)
      return
    let request: typeof pendingAnchor
    if (!pendingAnchor && options.preserveScrollAnchor !== false) {
      const anchor = captureAnchor()
      if (anchor)
        pendingAnchor = request = { anchor, scrollTop: options.virtualizer.getScrollTop() }
    }
    heights.set(key, next)
    sources.set(key, { sourceKey: source, measurementKey: measurementKey(), widthBucket: widthBucket() })
    options.virtualizer.setItemSize(key, next)
    setRevision(value => value + 1)
    if (request) {
      const captured = request
      frame(() => {
        if (pendingAnchor !== captured)
          return
        pendingAnchor = undefined
        if (options.virtualizer.getScrollTop() === captured.scrollTop)
          restoreAnchor(captured.anchor)
      })
    }
  }
  function unobserveItem(key: string) {
    measurements.get(key)?.observer.disconnect()
    measurements.delete(key)
  }
  function releaseDetached() {
    let released = 0
    for (const [key, value] of measurements) {
      if (!value.element.isConnected) {
        unobserveItem(key)
        released++
      }
    }
    return released
  }
  function measureItem(item: T, index: number, element: Element | {
    $el?: Element | null
  } | null | undefined) {
    const key = getKey(item, index)
    unobserveItem(key)
    const node = element && '$el' in element ? element.$el : element
    if (!(node instanceof HTMLElement))
      return
    const source = sourceKey(item, index)
    const measure = () => {
      if (!node.isConnected) {
        unobserveItem(key)
        return
      }
      const height = readElementOuterHeight(node)
      const chrome = getMarkdownItemChromeHeight(node, undefined, height)
      const logical = states.get(key)?.metrics.totalHeight
      setHeight(key, logical != null && isMarkdown(item, index) ? logical + chrome : height, source)
    }
    const observer = new ResizeObserver(measure)
    measurements.set(key, { element: node, observer })
    observer.observe(node)
    options.virtualizer.measureElement?.(key, node)
    measure()
  }
  function markdownProps(item: T, index: number): MarkstreamVirtualMarkdownProps {
    revision()
    const key = getKey(item, index)
    const source = sourceKey(item, index)
    const session = `${threadKey()}::${key}`
    return {
      content: getMarkstreamTimelineItemContent(item, index, options),
      final: getMarkstreamTimelineItemFinal(item, index, options),
      indexKey: key,
      mode: read(options.markdownMode) ?? 'chat',
      fade: options.markdownFade ?? false,
      renderCodeBlocksAsPre: read(options.renderCodeBlocksAsPre),
      nodeVirtual: 'auto',
      maxLiveNodes: 50,
      liveNodeBuffer: 16,
      virtualScroll: { enabled: true, sessionKey: session, threadKey: threadKey(), scrollRoot: options.virtualizer.getScrollElement, restoreState: states.get(key), measurementKey: measurementKey(), emitIntervalMs: 96, heightDiffThresholdPx: 4 },
      onHeightChange(metrics) {
        if (metrics.sessionKey !== session || metrics.threadKey !== threadKey())
          return
        const element = measurements.get(key)?.element
        const next = metrics.totalHeight + getMarkdownItemChromeHeight(element)
        if (next < (heights.get(key) ?? 0) && !shouldAllowMarkdownShrink(metrics))
          return
        setHeight(key, next, source)
      },
      onVirtualStateChange(state) {
        if (state.sessionKey !== session || state.threadKey !== threadKey() || !current(key) || sourceKey(current(key)!.item, current(key)!.index) !== source)
          return
        states.set(key, state)
      },
    }
  }
  function captureThreadState(): MarkstreamThreadVirtualState {
    return { threadKey: threadKey(), measurementKey: measurementKey(), widthBucket: widthBucket(), outerAnchor: captureAnchor(), itemHeights: Object.fromEntries(heights), itemSizeSources: Object.fromEntries(sources), markdownStates: Object.fromEntries(states) }
  }
  function preloadThreadState(state: MarkstreamThreadVirtualState | null | undefined) {
    if (!state || state.threadKey !== threadKey() || state.measurementKey !== measurementKey() || state.widthBucket !== widthBucket())
      return
    for (const [key, height] of Object.entries(state.itemHeights)) {
      const entry = current(key)
      const source = state.itemSizeSources?.[key]
      if (entry && source?.sourceKey === sourceKey(entry.item, entry.index)) {
        setHeight(key, height, source.sourceKey)
        const markdown = state.markdownStates[key]
        if (markdown)
          states.set(key, markdown)
      }
    }
    setRevision(value => value + 1)
  }
  function restoreThreadState(state: MarkstreamThreadVirtualState | null | undefined) {
    if (!state || state.threadKey !== threadKey() || state.measurementKey !== measurementKey() || state.widthBucket !== widthBucket())
      return
    setRestoring(true)
    preloadThreadState(state)
    frame(() => {
      restoreAnchor(state.outerAnchor)
      setRestoring(false)
    })
  }
  let previousThread = threadKey()
  let previousMeasurement = measurementKey()
  createEffect(() => {
    const thread = threadKey()
    const items = read(options.items)
    read(options.layoutRevision)
    read(options.measurementKey)
    if (previousMeasurement !== measurementKey() || previousThread !== thread) {
      pendingAnchor = undefined
      setRestoring(false)
      previousMeasurement = measurementKey()
    }
    if (previousThread !== thread) {
      for (const key of measurements.keys())
        unobserveItem(key)
      heights.clear()
      states.clear()
      sources.clear()
      previousThread = thread
      setRevision(value => value + 1)
    }
    for (const key of heights.keys()) {
      const index = items.findIndex((item, index) => getKey(item, index) === key)
      const source = sources.get(key)
      if (index < 0 || source?.sourceKey !== sourceKey(items[index], index) || source.measurementKey !== measurementKey() || source.widthBucket !== widthBucket()) {
        heights.delete(key)
        states.delete(key)
        sources.delete(key)
        unobserveItem(key)
        setRevision(value => value + 1)
      }
    }
    releaseDetached()
  })
  function dispose() {
    disposed = true
    pendingAnchor = undefined
    for (const key of measurements.keys())
      unobserveItem(key)
    for (const id of frames)
      cancelAnimationFrame(id)
    frames.clear()
  }
  onCleanup(dispose)
  return { get itemHeights() {
    revision()
    return heights
  }, get markdownStates() {
    revision()
    return states
  }, getItemKey: getKey, isMarkdownItem: isMarkdown, isRestoringThread: restoring, measureItem, unobserveItem, releaseDetached, markdownProps, captureThreadState, preloadThreadState, restoreThreadState, dispose }
}
