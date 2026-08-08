<script setup lang="ts">
import type {
  MarkstreamThreadAnchor,
  MarkstreamThreadVirtualState,
  MarkstreamVirtualMarkdownProps,
  MarkstreamVirtualTimelineProps,
} from '../../composables/useMarkstreamVirtualAdapter'
import type {
  MarkstreamVirtualMetrics,
  MarkstreamVirtualScrollOptions,
  MarkstreamVirtualState,
  NodeRendererCodeRenderer,
  NodeRendererMode,
} from '../../types/node-renderer-props'
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, provide, reactive, ref, shallowRef, watch } from 'vue'
import {
  estimateMarkstreamTimelineItemHeight,
  getMarkstreamTimelineItemContent,
  getMarkstreamTimelineItemFinal,
  getMarkstreamTimelineItemKey,
  getMarkstreamTimelineItemKind,
  getMarkstreamTimelineItemRevision,
  isMarkstreamMarkdownTimelineItem,
} from '../../composables/useMarkstreamVirtualAdapter'
import {
  getMarkdownItemChromeHeight,
  readElementOuterHeight,
} from '../../utils/virtualItemMeasurement'
import MarkdownRender from '../NodeRenderer'

defineOptions({ name: 'MarkstreamVirtualTimeline' })

const props = withDefaults(defineProps<MarkstreamVirtualTimelineProps<any>>(), {
  overscan: 4,
  overscanPx: 1200,
  stickToBottom: 'auto',
  markdownFade: false,
  markdownMode: 'docs',
  restoreMaxLoadingMs: false,
})

const emit = defineEmits<{
  (e: 'height-change', payload: { itemKey: string, metrics: MarkstreamVirtualMetrics }): void
  (e: 'virtual-state-change', payload: { itemKey: string, state: MarkstreamVirtualState }): void
  (e: 'range-change', payload: { start: number, end: number }): void
  (e: 'thread-state-change', payload: MarkstreamThreadVirtualState): void
}>()

const TIMELINE_MARKDOWN_EMIT_INTERVAL_MS = 96
const TIMELINE_MARKDOWN_HEIGHT_DIFF_THRESHOLD_PX = 4
const TIMELINE_MARKDOWN_MAX_LIVE_NODES = 50
const TIMELINE_MARKDOWN_LIVE_NODE_BUFFER = 16

/* eslint-disable vue/custom-event-name-casing -- Public timeline events are kebab-case. */
function emitHeightChange(payload: { itemKey: string, metrics: MarkstreamVirtualMetrics }) {
  emit('height-change', payload)
}

function emitVirtualStateChange(payload: { itemKey: string, state: MarkstreamVirtualState }) {
  emit('virtual-state-change', payload)
}

function emitRangeChange(payload: { start: number, end: number }) {
  emit('range-change', payload)
}

function emitThreadStateChange(payload: MarkstreamThreadVirtualState) {
  emit('thread-state-change', payload)
}
/* eslint-enable vue/custom-event-name-casing */

function isMeasuredOrFinalConfidence(confidence: MarkstreamVirtualMetrics['confidence'] | undefined) {
  return confidence === 'measured' || confidence === 'final'
}

function isFinalVirtualMetricsReady(metrics: MarkstreamVirtualMetrics | undefined) {
  if (!metrics)
    return false

  const nodeCount = Number(metrics.nodeCount)
  const measuredCount = Number(metrics.measuredCount)
  const liveStart = Math.max(0, Number(metrics.liveRange?.start ?? 0))
  const liveEnd = Math.min(nodeCount, Math.max(liveStart, Number(metrics.liveRange?.end ?? 0)))
  const liveRangeCount = Math.max(0, liveEnd - liveStart)

  return metrics.final === true
    && metrics.confidence === 'mixed'
    && nodeCount > 0
    && measuredCount > 0
    && measuredCount < nodeCount
    && (liveRangeCount <= 0 || measuredCount >= liveRangeCount)
}

function isStableFinalVirtualMetrics(metrics: MarkstreamVirtualMetrics | undefined) {
  return metrics?.stable === true && isFinalVirtualMetricsReady(metrics)
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

function shouldReleaseRestoredMarkdownFloor(metrics: MarkstreamVirtualMetrics) {
  if (metrics.phase === 'final')
    return true

  if (!metrics.stable)
    return false

  return isMeasuredOrFinalConfidence(metrics.confidence)
    || isStableFinalVirtualMetrics(metrics)
}

const layoutReadCounts = new Map<string, number>()

function recordLayoutRead(label: string) {
  if (props.debug !== true)
    return

  layoutReadCounts.set(label, (layoutReadCounts.get(label) ?? 0) + 1)
}

function takeLayoutReadStats() {
  if (props.debug !== true || layoutReadCounts.size === 0)
    return null

  let total = 0
  for (const count of layoutReadCounts.values())
    total += count

  const snapshot = {
    total,
    byLabel: Object.fromEntries(
      Array.from(layoutReadCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    ),
  }

  layoutReadCounts.clear()
  return snapshot
}

function logLayoutReads(label: string, itemKey: string) {
  const layoutReads = takeLayoutReadStats()
  if (!layoutReads)
    return

  console.info('[markstream-vue][timeline][perf] layout-reads', {
    label,
    itemKey,
    layoutReads,
  })
}

interface TimelineRecord {
  item: any
  index: number
  key: string
  renderKey: string
  kind: string
  offset: number
  size: number
  markdown: boolean
  component?: unknown
}

interface ReconcileRecordSizeOptions {
  allowMarkdownShrink?: boolean
  allowRestoredFloorShrink?: boolean
  markdownLogicalHeight?: number
  rememberThreadKey?: string
  releaseRestoredFloor?: boolean
  source?: TimelineItemSizeSource
  updateLayout?: boolean
}

interface MarkdownLogicalHeightSource {
  sessionKey: string
  threadKey?: string
  measurementKey?: string
}

type TimelineItemSizeSource = NonNullable<MarkstreamThreadVirtualState['itemSizeSources']>[string]

interface PendingMarkdownReconcile {
  allowMarkdownShrink: boolean
  allowRestoredFloorShrink: boolean
  itemSizeSource: TimelineItemSizeSource
  logicalHeight: number
  threadKey?: string
}

interface PendingProgrammaticScroll {
  target: number
  preserveBottomPin: boolean
}

const scrollRoot = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(0)
const layoutWidthBucket = ref(0)
const bottomPinned = ref(true)
const exactBottomPinned = ref(true)
const itemSizes = reactive(new Map<string, number>()) as Map<string, number>
const itemSizeSources = new Map<string, TimelineItemSizeSource>()
const restoredItemHeightFloors = new Map<string, number>()
const restoredItemHeightFloorSources = new Map<string, TimelineItemSizeSource>()
const restoredMarkdownLogicalHeights = new Map<string, number>()
const pendingRestoredMarkdownFloorReleaseKeys = new Set<string>()
const markdownStates = reactive(new Map<string, MarkstreamVirtualState>()) as Map<string, MarkstreamVirtualState>
const markdownLogicalHeights = reactive(new Map<string, number>()) as Map<string, number>
const markdownLogicalHeightSources = new Map<string, MarkdownLogicalHeightSource>()
const measuredElements = new Map<string, HTMLElement>()
const resizeObservers = new Map<string, ResizeObserver>()
const threadStates = new Map<string, MarkstreamThreadVirtualState>()
const restoringThread = ref(false)
const restorePaintReady = ref(true)
const hostScrollManaged = ref(true)
provide('markstreamHostScrollManaged', hostScrollManaged)
const THREAD_RESTORE_SETTLE_DELAYS = [0, 80, 180, 360, 640]
const THREAD_RESTORE_READY_POLL_FRAMES = 40
const THREAD_RESTORE_MIN_READY_MS = 96
const THREAD_RESTORE_STABLE_FRAMES = 2
const THREAD_RESTORE_COLD_STABLE_FRAMES = 24
const THREAD_RESTORE_READY_RETRY_DELAY_MS = 120
const THREAD_STATE_REMEMBER_DELAY_MS = 80
const ITEM_SIZE_RECONCILE_DEADBAND_PX = 1
const SCROLL_RESTORE_DEADBAND_PX = 0.5
let rootResizeObserver: ResizeObserver | null = null
let pendingProgrammaticScroll: PendingProgrammaticScroll | null = null
let threadRestoreSeq = 0
let threadRestoreRaf: number | null = null
let threadRestoreTimers: number[] = []
let threadRestoreReadyRetryTimer: number | null = null
let threadStateRememberTimer: number | null = null
let pendingThreadStateRememberKey: string | undefined
let threadRestoreStartedAt = -1
let activeThreadRestoreSeq = 0
let activeThreadRestoreAnchor: MarkstreamThreadAnchor | undefined
let activeThreadRestoreScrollTop: number | null = null
let activeThreadRestoreRequiresMarkdownMetrics = false
let activeThreadRestoreRequiresColdMarkdownMetrics = false
let activeThreadStateSnapshot: MarkstreamThreadVirtualState | null = null
let threadRestoreReadyWaitSeq = 0
let threadRestoreReadyWarnedSeq = 0
let rootPaddingBlock = { top: 0, bottom: 0 }
let initialThreadRestoreCompleted = false

const normalizedThreadKey = computed(() => props.threadKey == null ? undefined : String(props.threadKey))
let activeThreadKeySnapshot = normalizedThreadKey.value

function normalizeTimelineMarkdownMode(value: unknown): NodeRendererMode {
  return value === 'chat' || value === 'minimal' || value === 'docs'
    ? value
    : 'docs'
}

function normalizeTimelineMarkdownCodeRenderer(
  value: unknown,
  mode = normalizeTimelineMarkdownMode(props.markdownMode),
): NodeRendererCodeRenderer {
  if (value === 'pre' || value === 'stream-diffs')
    return value

  return mode === 'docs' ? 'stream-diffs' : 'pre'
}

const normalizedTimelineMarkdownMode = computed(() => {
  return normalizeTimelineMarkdownMode(props.markdownMode)
})

const normalizedTimelineMarkdownCodeRenderer = computed(() => {
  return normalizeTimelineMarkdownCodeRenderer(
    props.markdownCodeRenderer,
    normalizedTimelineMarkdownMode.value,
  )
})

const timelineBaseMeasurementKey = computed(() => {
  return [
    props.measurementKey == null ? '' : String(props.measurementKey),
    layoutWidthBucket.value,
  ].join(':')
})

const timelineMarkdownMeasurementKey = computed(() => {
  return `${timelineBaseMeasurementKey.value}\u0001${normalizedTimelineMarkdownMode.value}\u0001${normalizedTimelineMarkdownCodeRenderer.value}`
})

class TimelineFenwickTree {
  private tree: number[]
  total: number

  constructor(values: number[]) {
    this.tree = Array.from({ length: values.length + 1 }, () => 0)
    this.total = 0
    values.forEach((value, index) => this.add(index, value))
  }

  add(index: number, delta: number) {
    if (!Number.isFinite(delta) || delta === 0)
      return

    this.total += delta
    for (let cursor = index + 1; cursor < this.tree.length; cursor += cursor & -cursor)
      this.tree[cursor]! += delta
  }

  prefixSum(count: number) {
    let cursor = Math.max(0, Math.min(count, this.tree.length - 1))
    let sum = 0
    while (cursor > 0) {
      sum += this.tree[cursor]!
      cursor -= cursor & -cursor
    }
    return sum
  }

  lowerBound(offset: number, mode: 'gte' | 'gt' = 'gte') {
    const count = this.tree.length - 1
    if (count <= 0)
      return 0
    if (offset <= 0)
      return 0
    if (offset >= this.total)
      return count - 1

    let index = 0
    let bit = 1
    while ((bit << 1) < this.tree.length)
      bit <<= 1

    let sum = 0
    for (; bit > 0; bit >>= 1) {
      const next = index + bit
      if (next < this.tree.length) {
        const nextSum = sum + this.tree[next]!
        const shouldAdvance = mode === 'gt'
          ? nextSum <= offset
          : nextSum < offset

        if (shouldAdvance) {
          index = next
          sum = nextSum
        }
      }
    }

    return Math.min(index, count - 1)
  }
}

const layoutRecords = shallowRef<TimelineRecord[]>([])
const layoutRecordByKey = new Map<string, TimelineRecord>()
const layoutSizeTree = shallowRef(new TimelineFenwickTree([]))
const layoutRevision = ref(0)
let layoutEstimateSnapshot: Array<number | undefined> = []

const layout = computed(() => {
  void layoutRevision.value
  return {
    records: layoutRecords.value,
    totalHeight: layoutSizeTree.value.total,
  }
})

function rebuildLayoutRecords() {
  const records: TimelineRecord[] = []
  const sizes: number[] = []
  const renderScopeKey = getTimelineRenderScopeKey()

  layoutRecordByKey.clear()

  for (let index = 0; index < props.items.length; index++) {
    const item = props.items[index]
    const key = getItemKey(item, index)
    const recordBase = {
      item,
      index,
      key,
      kind: getMarkstreamTimelineItemKind(item, index, props),
      markdown: isMarkstreamMarkdownTimelineItem(item, index, props),
    }
    let size = getCompatibleItemSize(recordBase)
    if (size == null) {
      size = layoutEstimateSnapshot[index]
        ?? estimateMarkstreamTimelineItemHeight(item, index, props)
    }
    const record = {
      ...recordBase,
      renderKey: `${renderScopeKey}:${key}`,
      offset: 0,
      size,
      component: item?.component,
    }

    records.push(record)
    sizes.push(size)
    if (!layoutRecordByKey.has(key)) {
      layoutRecordByKey.set(key, record)
    }
  }

  layoutRecords.value = records
  layoutSizeTree.value = new TimelineFenwickTree(sizes)
  layoutEstimateSnapshot = []
  layoutRevision.value += 1
}

function getRecordOffset(record: Pick<TimelineRecord, 'index'>) {
  void layoutRevision.value
  return layoutSizeTree.value.prefixSum(record.index)
}

function materializeVisibleRecord(record: TimelineRecord): TimelineRecord {
  return {
    ...record,
    offset: getRecordOffset(record),
  }
}

function updateLayoutRecordSize(key: string, size: number) {
  const record = layoutRecordByKey.get(key)
  if (!record)
    return

  const next = Math.ceil(size)
  const delta = next - record.size
  if (delta === 0)
    return

  record.size = next
  layoutSizeTree.value.add(record.index, delta)
  layoutRevision.value += 1
}

function lowerBoundRecordByOffset(offset: number, mode: 'gte' | 'gt' = 'gte') {
  void layoutRevision.value
  return layoutSizeTree.value.lowerBound(offset, mode)
}

const effectiveOverscanItems = computed(() => {
  const value = Math.max(0, props.overscan ?? 4)
  return value
})

const effectiveOverscanPx = computed(() => {
  const value = Math.max(0, props.overscanPx ?? 1200)
  return restorePaintReady.value ? value : Math.min(value, 160)
})

const visibleWindow = computed(() => {
  const records = layout.value.records
  if (records.length === 0) {
    return {
      start: 0,
      end: 0,
      records: [] as TimelineRecord[],
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    }
  }

  const overscanItems = effectiveOverscanItems.value
  const overscanPx = effectiveOverscanPx.value
  const viewportStart = getLayoutViewportStart()
  const viewportEnd = viewportStart + Math.max(1, viewportHeight.value)

  let start = lowerBoundRecordByOffset(Math.max(0, viewportStart - overscanPx), 'gt')
  let end = lowerBoundRecordByOffset(Math.min(layout.value.totalHeight, viewportEnd + overscanPx)) + 1

  start = Math.max(0, start - overscanItems)
  end = Math.min(records.length, Math.max(end + overscanItems, start + 1))

  const visibleRecords = records.slice(start, end).map(materializeVisibleRecord)
  const first = visibleRecords[0]
  const last = visibleRecords[visibleRecords.length - 1]
  const firstOffset = first?.offset ?? 0
  const lastOffset = last?.offset ?? 0

  return {
    start,
    end,
    records: visibleRecords,
    topSpacerHeight: firstOffset,
    bottomSpacerHeight: Math.max(
      0,
      layout.value.totalHeight - (lastOffset + (last?.size ?? 0)),
    ),
  }
})

function getItemKey(item: any, index: number) {
  return getMarkstreamTimelineItemKey(item, index, props)
}

function getTimelineRenderScopeKey() {
  return normalizedThreadKey.value ?? 'timeline'
}

function getComponentIdentityToken(component: unknown) {
  if (!component)
    return ''

  if (typeof component === 'string')
    return `s:${component}`

  return `o:${getIdentityToken(component)}`
}

const identityIds = new WeakMap<object, number>()
let nextIdentityId = 1

function getIdentityToken(value: unknown) {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null)
    return String(value ?? '')

  const object = value as object
  let id = identityIds.get(object)
  if (!id) {
    id = nextIdentityId++
    identityIds.set(object, id)
  }
  return String(id)
}

function hashTimelineString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function getCheapTimelineItemContentSignature(item: any, index: number, markdown: boolean) {
  if (markdown)
    return ''

  const text = typeof item?.text === 'string'
    ? item.text
    : typeof item?.message === 'string'
      ? item.message
      : typeof item?.label === 'string'
        ? item.label
        : String(getMarkstreamTimelineItemContent(item, index, props) ?? '')

  if (!text)
    return ''

  return `${text.length}:${hashTimelineString(text)}`
}

function getEstimatedItemHeightSignature(item: any, index: number) {
  if (typeof props.estimateItemHeight !== 'function')
    return ''

  const estimated = props.estimateItemHeight(item, index)
  if (!Number.isFinite(estimated) || estimated <= 0)
    return ''

  const value = Math.ceil(estimated)
  layoutEstimateSnapshot[index] = value
  return String(value)
}

function getLayoutItemsSignature() {
  return props.items.map((item, index) => {
    const key = getItemKey(item, index)
    const markdown = isMarkstreamMarkdownTimelineItem(item, index, props)

    return [
      key,
      getMarkstreamTimelineItemKind(item, index, props),
      markdown ? 1 : 0,
      getMarkstreamTimelineItemRevision(item, index, props) ?? '',
      getEstimatedItemHeightSignature(item, index),
      getCheapTimelineItemContentSignature(item, index, markdown),
      getComponentIdentityToken(item?.component),
    ].join('\u0001')
  }).join('\u0000')
}

function getLayoutRebuildSignature() {
  const explicit = props.layoutRevision
  if (explicit != null) {
    return [
      'explicit',
      String(explicit),
      props.items.length,
    ].join('\u0001')
  }

  return getLayoutItemsSignature()
}

function getRecordLiveItem(record: Pick<TimelineRecord, 'item' | 'index'>) {
  return props.items[record.index] ?? record.item
}

function getRecordIdentityItem(record: Pick<TimelineRecord, 'item'>) {
  return record.item
}

function getRecordComponent(record: TimelineRecord) {
  const item = getRecordLiveItem(record) as any
  return item?.component ?? record.component
}

watch(
  [
    () => getLayoutRebuildSignature(),
    timelineBaseMeasurementKey,
    timelineMarkdownMeasurementKey,
    normalizedThreadKey,
    () => getIdentityToken(props.estimateItemHeight),
    () => getIdentityToken(props.getKey),
    () => getIdentityToken(props.getKind),
    () => getIdentityToken(props.getContent),
    () => getIdentityToken(props.getFinal),
    () => getIdentityToken(props.getRevision),
  ],
  () => rebuildLayoutRecords(),
  { immediate: true, flush: 'sync' },
)

function getSessionKey(
  record: Pick<TimelineRecord, 'item' | 'index' | 'key'>,
  threadKey = normalizedThreadKey.value,
) {
  const item = getRecordIdentityItem(record)
  const revision = getMarkstreamTimelineItemRevision(item, record.index, props)
  return [
    threadKey ?? 'timeline',
    record.key,
    revision == null ? '' : String(revision),
  ].join(':')
}

function getItemSizeSourceKey(
  record: Pick<TimelineRecord, 'item' | 'index' | 'key' | 'markdown'>,
  threadKey = normalizedThreadKey.value,
) {
  if (record.markdown)
    return getSessionKey(record, threadKey)

  const item = getRecordIdentityItem(record)
  const revision = getMarkstreamTimelineItemRevision(item, record.index, props)
  return [
    threadKey ?? 'timeline',
    record.key,
    revision == null ? '' : String(revision),
  ].join(':')
}

function getItemSizeSource(record: Pick<TimelineRecord, 'item' | 'index' | 'key' | 'markdown'>): TimelineItemSizeSource {
  return {
    sourceKey: getItemSizeSourceKey(record),
    measurementKey: record.markdown ? timelineMarkdownMeasurementKey.value : timelineBaseMeasurementKey.value,
    widthBucket: layoutWidthBucket.value,
  }
}

function isSameItemSizeSource(
  a: TimelineItemSizeSource | null | undefined,
  b: TimelineItemSizeSource | null | undefined,
) {
  return (a?.sourceKey ?? '') === (b?.sourceKey ?? '')
    && (a?.measurementKey ?? '') === (b?.measurementKey ?? '')
    && (a?.widthBucket ?? 0) === (b?.widthBucket ?? 0)
}

function isCompatibleItemSizeSource(
  record: Pick<TimelineRecord, 'item' | 'index' | 'key' | 'markdown'> | undefined,
  source: TimelineItemSizeSource | null | undefined,
  threadKey = normalizedThreadKey.value,
) {
  if (!record || !source)
    return false

  if (source.sourceKey !== getItemSizeSourceKey(record, threadKey))
    return false

  if (source.measurementKey !== (record.markdown ? timelineMarkdownMeasurementKey.value : timelineBaseMeasurementKey.value))
    return false

  if ((source.widthBucket ?? 0) !== layoutWidthBucket.value)
    return false

  return true
}

function getCompatibleItemSize(
  record: Pick<TimelineRecord, 'item' | 'index' | 'key' | 'markdown'>,
  threadKey = normalizedThreadKey.value,
) {
  const size = itemSizes.get(record.key)

  if (!isCompatibleItemSizeSource(record, itemSizeSources.get(record.key), threadKey))
    return null

  return Number.isFinite(size) && size! > 0 ? size! : null
}

function findRecordByKey(key: string) {
  void layout.value
  return layoutRecordByKey.get(key)
}

function isCompatibleMarkdownSource(
  record: TimelineRecord | undefined,
  source: MarkdownLogicalHeightSource | null | undefined,
) {
  if (!record || !record.markdown || !source)
    return false

  if (source.sessionKey !== getSessionKey(record))
    return false

  if ((source.threadKey ?? '') !== (normalizedThreadKey.value ?? ''))
    return false

  if (!isCompatibleMarkdownMeasurementKey(source.measurementKey))
    return false

  return true
}

function isCompatibleMarkdownMeasurementKey(measurementKey: string | undefined) {
  const expected = timelineMarkdownMeasurementKey.value
  const actual = measurementKey ?? ''

  return actual === expected || actual.startsWith(`${expected}\u0000`)
}

function isCompatibleMarkdownState(
  record: TimelineRecord | undefined,
  state: MarkstreamVirtualState | null | undefined,
) {
  return isCompatibleMarkdownSource(record, state)
}

function getLogicalHeightFromMarkdownState(
  key: string,
  state = markdownStates.get(key),
) {
  const record = findRecordByKey(key)

  if (!isCompatibleMarkdownState(record, state))
    return 0

  const height = Number(state?.metrics?.totalHeight)
  return Number.isFinite(height) && height > 0
    ? Math.ceil(height)
    : 0
}

function setMarkdownLogicalHeight(
  key: string,
  height: number,
  source: MarkdownLogicalHeightSource,
) {
  if (!Number.isFinite(height) || height <= 0)
    return

  markdownLogicalHeights.set(key, Math.ceil(height))
  markdownLogicalHeightSources.set(key, source)
}

function seedMarkdownLogicalHeightFromState(
  key: string,
  state = markdownStates.get(key),
) {
  const height = getLogicalHeightFromMarkdownState(key, state)

  if (height > 0)
    setMarkdownLogicalHeight(key, height, state!)

  return height
}

function getKnownMarkdownLogicalHeight(key: string) {
  const record = findRecordByKey(key)
  const source = markdownLogicalHeightSources.get(key)

  if (isCompatibleMarkdownSource(record, source))
    return markdownLogicalHeights.get(key) ?? 0

  return seedMarkdownLogicalHeightFromState(key)
}

function isActiveThreadRestore(seq: number) {
  return seq === threadRestoreSeq
    && activeThreadRestoreSeq === seq
    && !restorePaintReady.value
}

function clearThreadRestoreSchedule() {
  if (threadRestoreRaf != null && typeof cancelAnimationFrame === 'function')
    cancelAnimationFrame(threadRestoreRaf)

  threadRestoreRaf = null

  if (threadRestoreReadyRetryTimer != null && typeof window !== 'undefined')
    window.clearTimeout(threadRestoreReadyRetryTimer)

  threadRestoreReadyRetryTimer = null

  if (typeof window !== 'undefined') {
    for (const timer of threadRestoreTimers)
      window.clearTimeout(timer)
  }

  threadRestoreTimers = []
}

function getViewportHeight() {
  return Math.max(0, viewportHeight.value || scrollRoot.value?.clientHeight || 0)
}

function updateRootPaddingBlock() {
  const root = scrollRoot.value
  if (!root || typeof getComputedStyle !== 'function') {
    rootPaddingBlock = { top: 0, bottom: 0 }
    return
  }

  const style = getComputedStyle(root)
  const top = Number.parseFloat(style.paddingTop) || 0
  const bottom = Number.parseFloat(style.paddingBottom) || 0
  rootPaddingBlock = { top, bottom }
}

function getScrollContentStart() {
  return rootPaddingBlock.top
}

function getLayoutScrollContentHeight() {
  const padding = rootPaddingBlock
  return Math.max(0, layout.value.totalHeight + padding.top + padding.bottom)
}

function getScrollContentHeight() {
  return Math.max(
    getLayoutScrollContentHeight(),
    scrollRoot.value?.scrollHeight ?? 0,
  )
}

function getLayoutViewportStart() {
  return Math.max(0, scrollTop.value - getScrollContentStart())
}

function getRestoreLoadingStyle() {
  return {
    height: `${Math.max(1, getViewportHeight())}px`,
    transform: `translateY(${scrollTop.value}px)`,
  }
}

function getMaxScrollOffset() {
  return Math.max(0, getScrollContentHeight() - getViewportHeight())
}

function clampScrollOffset(offset: number) {
  const numeric = Number(offset)

  if (!Number.isFinite(numeric))
    return 0

  return Math.max(0, Math.min(numeric, getMaxScrollOffset()))
}

function distanceFromBottom() {
  return Math.max(
    0,
    getMaxScrollOffset() - scrollTop.value,
  )
}

function updateBottomPinned() {
  const bottomDistance = distanceFromBottom()
  exactBottomPinned.value = bottomDistance <= 2

  if (props.stickToBottom === true) {
    bottomPinned.value = true
    return
  }
  if (props.stickToBottom === false) {
    bottomPinned.value = false
    return
  }
  bottomPinned.value = bottomDistance <= 48
}

function updateLayoutWidthBucket() {
  const width = scrollRoot.value?.clientWidth ?? 0
  layoutWidthBucket.value = Number.isFinite(width) && width > 0
    ? Math.round(width / 32) * 32
    : 0
}

function updateScrollMetrics(options: { remember?: boolean } = {}) {
  const root = scrollRoot.value

  if (root) {
    scrollTop.value = Math.max(0, root.scrollTop || 0)
    viewportHeight.value = root.clientHeight || 0
  }

  updateLayoutWidthBucket()
  updateBottomPinned()

  if (
    options.remember === true
    || (options.remember !== false && !restoringThread.value)
  ) {
    rememberThreadState()
  }
}

function applyScrollOffset(
  offset: number,
  options: {
    writeDom?: boolean
    remember?: boolean
    updatePinned?: boolean
  } = {},
) {
  const target = clampScrollOffset(offset)
  const root = scrollRoot.value

  scrollTop.value = target

  if (root) {
    viewportHeight.value = root.clientHeight || viewportHeight.value || 0

    if (options.writeDom !== false && Math.abs((root.scrollTop || 0) - target) > SCROLL_RESTORE_DEADBAND_PX) {
      const pending: PendingProgrammaticScroll = {
        target,
        preserveBottomPin: props.stickToBottom !== false
          && Math.abs(getMaxScrollOffset() - target) <= 2,
      }

      pendingProgrammaticScroll = restorePaintReady.value
        ? pending
        : null
      root.scrollTop = target
      pending.target = Math.max(0, root.scrollTop || 0)
    }
  }

  updateLayoutWidthBucket()

  if (options.updatePinned !== false)
    updateBottomPinned()

  if (
    options.remember === true
    || (options.remember !== false && !restoringThread.value)
  ) {
    rememberThreadState()
  }
}

function handleTimelineScroll() {
  if (!restorePaintReady.value) {
    pendingProgrammaticScroll = null
    const root = scrollRoot.value
    const target = activeThreadRestoreScrollTop

    if (root && target != null && Math.abs((root.scrollTop || 0) - target) > SCROLL_RESTORE_DEADBAND_PX)
      root.scrollTop = target

    applyThreadRestorePass(activeThreadRestoreSeq, activeThreadRestoreAnchor)
    return
  }

  const root = scrollRoot.value
  const pending = pendingProgrammaticScroll
  const rootScrollTop = Math.max(0, root?.scrollTop || 0)

  if (
    root
    && pending
    && Math.abs(rootScrollTop - pending.target) <= SCROLL_RESTORE_DEADBAND_PX
    && pending.preserveBottomPin
    && props.stickToBottom !== false
  ) {
    bottomPinned.value = true
    exactBottomPinned.value = true
    applyScrollOffset(getMaxScrollOffset(), {
      writeDom: true,
      remember: false,
    })
    return
  }

  const rootStayedAtBottomIntent = root
    && exactBottomPinned.value
    && props.stickToBottom === 'auto'
    && (
      Math.abs(getMaxScrollOffset() - rootScrollTop) <= 2
      || rootScrollTop >= scrollTop.value - SCROLL_RESTORE_DEADBAND_PX
    )

  if (rootStayedAtBottomIntent || props.stickToBottom === true) {
    bottomPinned.value = true
    exactBottomPinned.value = true
    applyScrollOffset(getMaxScrollOffset(), {
      writeDom: true,
      remember: false,
    })
    return
  }

  pendingProgrammaticScroll = null
  updateScrollMetrics()
}

function scrollToOffset(offset: number) {
  applyScrollOffset(offset, {
    writeDom: true,
    remember: true,
  })
}

function scrollToBottom() {
  scrollToOffset(getMaxScrollOffset())
}

function applyInitialScrollPosition() {
  if (activeThreadRestoreAnchor) {
    applyThreadRestorePass(activeThreadRestoreSeq, activeThreadRestoreAnchor)
    updateScrollMetrics({ remember: false })
    rememberThreadState()
    return
  }

  if (props.stickToBottom === false) {
    updateScrollMetrics({ remember: false })
    rememberThreadState()
    return
  }

  bottomPinned.value = true

  applyScrollOffset(getMaxScrollOffset(), {
    writeDom: true,
    remember: false,
    updatePinned: false,
  })

  updateScrollMetrics({ remember: false })
  rememberThreadState()
}

function scrollToIndex(index: number, align: 'start' | 'center' | 'end' = 'start') {
  const record = layout.value.records[index]
  if (!record)
    return

  let offset = getScrollContentStart() + getRecordOffset(record)
  if (align === 'center')
    offset -= (viewportHeight.value - record.size) / 2
  else if (align === 'end')
    offset -= viewportHeight.value - record.size

  scrollToOffset(offset)
}

function getRestoredItemHeightFloor(key: string, source?: TimelineItemSizeSource) {
  const floor = restoredItemHeightFloors.get(key)
  if (!Number.isFinite(floor) || floor == null || floor <= 0)
    return 0

  const floorSource = restoredItemHeightFloorSources.get(key)
  if (source && floorSource && !isSameRestoredItemHeightFloorSource(floorSource, source))
    return 0

  return Math.ceil(floor)
}

function isSameRestoredItemHeightFloorSource(
  floorSource: TimelineItemSizeSource,
  source: TimelineItemSizeSource,
) {
  return floorSource.sourceKey === source.sourceKey
    && (
      (source.widthBucket ?? 0) === 0
      || (floorSource.widthBucket ?? 0) === 0
      || (source.widthBucket ?? 0) === (floorSource.widthBucket ?? 0)
    )
    && (
      isZeroWidthTimelineMeasurementKey(source.measurementKey)
      || isZeroWidthTimelineMeasurementKey(floorSource.measurementKey)
      || source.measurementKey === floorSource.measurementKey
    )
}

function isZeroWidthTimelineMeasurementKey(measurementKey: string | undefined) {
  return measurementKey === ':0' || measurementKey?.startsWith(':0\u0001') === true
}

function clearRestoredItemHeightFloorIfSourceChanged(
  key: string,
  source?: TimelineItemSizeSource,
) {
  if (!source)
    return

  const floorSource = restoredItemHeightFloorSources.get(key)
  if (floorSource && !isSameRestoredItemHeightFloorSource(floorSource, source)) {
    restoredItemHeightFloors.delete(key)
    restoredItemHeightFloorSources.delete(key)
    restoredMarkdownLogicalHeights.delete(key)
    pendingRestoredMarkdownFloorReleaseKeys.delete(key)
  }
}

function clearRestoredItemHeightFloor(key: string) {
  restoredItemHeightFloors.delete(key)
  restoredItemHeightFloorSources.delete(key)
  restoredMarkdownLogicalHeights.delete(key)
  pendingRestoredMarkdownFloorReleaseKeys.delete(key)
}

function shouldReleaseRestoredMarkdownFloorForShrink(
  key: string,
  markdown: number,
  restoredFloor: number,
) {
  const restoredMarkdown = restoredMarkdownLogicalHeights.get(key)
  if (!Number.isFinite(restoredMarkdown) || restoredMarkdown == null || restoredMarkdown <= 0)
    return true

  const restoredChrome = Math.max(0, restoredFloor - restoredMarkdown)
  return markdown + restoredChrome < restoredFloor - ITEM_SIZE_RECONCILE_DEADBAND_PX
}

function setItemSize(
  key: string,
  size: number,
  source?: TimelineItemSizeSource,
  options: { rememberThreadKey?: string, releaseRestoredFloor?: boolean, updateLayout?: boolean } = {},
) {
  if (!Number.isFinite(size) || size <= 0)
    return

  const previous = itemSizes.get(key)
  const sourceChanged = source && !isSameItemSizeSource(itemSizeSources.get(key), source)
  const releaseRestoredFloor = options.releaseRestoredFloor === true

  clearRestoredItemHeightFloorIfSourceChanged(key, source)
  if (releaseRestoredFloor)
    clearRestoredItemHeightFloor(key)

  const restoredFloor = getRestoredItemHeightFloor(key, source)
  const next = restoredFloor > 0
    ? restoredFloor
    : Math.ceil(size)

  // stream-diffs / pre fallback / browser font rounding can differ by exactly 1px.
  // Treat that as measurement noise; otherwise an item above the current
  // anchor will restore scrollTop by 1px and visibly shimmer on refresh.
  if (
    previous != null
    && Math.abs(previous - next) <= ITEM_SIZE_RECONCILE_DEADBAND_PX
    && !sourceChanged
  ) {
    if (releaseRestoredFloor)
      layoutRevision.value += 1
    return
  }

  if (options.updateLayout === false) {
    if (source)
      itemSizeSources.set(key, source)
    itemSizes.set(key, next)
    scheduleThreadStateRemember(options.rememberThreadKey)
    return
  }

  if (restoringThread.value) {
    if (source)
      itemSizeSources.set(key, source)
    itemSizes.set(key, next)
    updateLayoutRecordSize(key, next)
    scheduleThreadRestorePass()
    return
  }

  const anchorBeforeChange = captureOuterAnchor()
  const bottomDistanceBeforeChange = distanceFromBottom()
  const restoreAnchor = resolveSizeChangeRestoreAnchor(
    anchorBeforeChange,
    bottomDistanceBeforeChange,
  )

  if (source)
    itemSizeSources.set(key, source)
  itemSizes.set(key, next)
  updateLayoutRecordSize(key, next)
  scheduleThreadStateRemember(options.rememberThreadKey)
  scheduleScrollReconcileAfterSizeChange(restoreAnchor)
}

function resolveSizeChangeRestoreAnchor(
  anchor: MarkstreamThreadAnchor | undefined,
  bottomDistanceBeforeChange: number,
): MarkstreamThreadAnchor | undefined {
  if (props.stickToBottom === true) {
    return {
      type: 'bottom',
      distanceFromBottomPx: 0,
    }
  }

  if (props.stickToBottom === 'auto' && bottomPinned.value) {
    return {
      type: 'bottom',
      // Important:
      // During streaming, multiple item-size changes can happen before the
      // previous nextTick/RAF scroll reconciliation has applied. In that window
      // layout.totalHeight has already grown but scrollTop has not caught up yet,
      // so bottomDistanceBeforeChange can be large even though the user was
      // exactly pinned to bottom before the batch started.
      //
      // Preserve exact bottom pinning from the last committed scroll metrics.
      // Only preserve a non-zero bottom distance when the user was intentionally
      // near-bottom, but not exactly pinned.
      distanceFromBottomPx: exactBottomPinned.value
        ? 0
        : Math.max(0, bottomDistanceBeforeChange),
    }
  }

  return anchor
}

const pendingScrollReconcile = {
  scheduled: false,
  raf: null as number | null,
  anchor: undefined as MarkstreamThreadAnchor | undefined,
}

const pendingMarkdownReconciles = new Map<string, PendingMarkdownReconcile>()
let markdownReconcileScheduled = false
let markdownReconcileRaf: number | null = null

function requestFrameOrNextTick(callback: () => void) {
  if (typeof requestAnimationFrame === 'function')
    return requestAnimationFrame(callback)

  void nextTick(callback)
  return null
}

function cancelTimelineRaf(id: number | null) {
  if (id != null && typeof cancelAnimationFrame === 'function')
    cancelAnimationFrame(id)
}

function scheduleScrollReconcileAfterSizeChange(anchor: MarkstreamThreadAnchor | undefined) {
  if (!pendingScrollReconcile.scheduled) {
    pendingScrollReconcile.anchor = anchor
    pendingScrollReconcile.scheduled = true
    pendingScrollReconcile.raf = requestFrameOrNextTick(flushScrollReconcile)
    return
  }

  if (!pendingScrollReconcile.anchor && anchor)
    pendingScrollReconcile.anchor = anchor
}

function flushScrollReconcile() {
  if (!pendingScrollReconcile.scheduled)
    return

  pendingScrollReconcile.scheduled = false
  pendingScrollReconcile.raf = null
  const pendingAnchor = pendingScrollReconcile.anchor
  pendingScrollReconcile.anchor = undefined
  const preserveExactBottomPin = pendingAnchor?.type === 'bottom'
    && pendingAnchor.distanceFromBottomPx <= 2
    && exactBottomPinned.value

  if (pendingAnchor)
    restoreOuterAnchor(pendingAnchor)

  const root = scrollRoot.value
  const scrollWriteCommitted = !root
    || Math.abs((root.scrollTop || 0) - scrollTop.value) <= SCROLL_RESTORE_DEADBAND_PX

  if (!preserveExactBottomPin || scrollWriteCommitted)
    updateScrollMetrics({ remember: false })
}

function clearPendingScrollReconcile() {
  cancelTimelineRaf(pendingScrollReconcile.raf)
  pendingScrollReconcile.scheduled = false
  pendingScrollReconcile.raf = null
  pendingScrollReconcile.anchor = undefined
}

function flushMarkdownReconciles() {
  if (!markdownReconcileScheduled)
    return

  markdownReconcileScheduled = false
  markdownReconcileRaf = null
  const entries = Array.from(pendingMarkdownReconciles.entries())
  pendingMarkdownReconciles.clear()

  for (const [key, pending] of entries) {
    if (markdownLogicalHeights.get(key) !== pending.logicalHeight)
      continue

    const record = layoutRecordByKey.get(key)
    if (!record)
      continue

    const updateLayout = (pending.threadKey ?? '') === (normalizedThreadKey.value ?? '')
    reconcileRecordSize(record, {
      allowMarkdownShrink: pending.allowMarkdownShrink,
      allowRestoredFloorShrink: pending.allowRestoredFloorShrink,
      markdownLogicalHeight: pending.logicalHeight,
      rememberThreadKey: pending.threadKey,
      source: pending.itemSizeSource,
      updateLayout,
    })
  }

  flushScrollReconcile()
}

function flushPendingLayoutReconciles() {
  flushMarkdownReconciles()
  flushScrollReconcile()
}

function scheduleMarkdownReconcile(record: TimelineRecord, pending: PendingMarkdownReconcile) {
  pendingMarkdownReconciles.set(record.key, pending)
  if (markdownReconcileScheduled)
    return

  markdownReconcileScheduled = true
  markdownReconcileRaf = requestFrameOrNextTick(flushMarkdownReconciles)
}

function clearPendingMarkdownReconciles() {
  cancelTimelineRaf(markdownReconcileRaf)
  markdownReconcileScheduled = false
  markdownReconcileRaf = null
  pendingMarkdownReconciles.clear()
}

function resolveElement(el: Element | { $el?: Element | null } | null | undefined) {
  const value = el && '$el' in el ? el.$el : el
  return value instanceof HTMLElement ? value : null
}

function cleanupMeasuredElement(key: string) {
  resizeObservers.get(key)?.disconnect()
  resizeObservers.delete(key)
  measuredElements.delete(key)
}

function getMeasuredItemHeight(key: string) {
  return readElementOuterHeight(measuredElements.get(key), recordLayoutRead)
}

function getMeasuredMarkdownChromeHeight(key: string, outerHeight?: number) {
  return getMarkdownItemChromeHeight(measuredElements.get(key), recordLayoutRead, outerHeight)
}

function reconcileRecordSize(
  record: TimelineRecord,
  options: ReconcileRecordSizeOptions = {},
) {
  const measured = getMeasuredItemHeight(record.key)
  const itemSizeSource = options.source ?? getItemSizeSource(record)
  let didLogLayoutReads = false
  const logRecordLayoutReads = () => {
    if (didLogLayoutReads)
      return
    didLogLayoutReads = true
    logLayoutReads('reconcileRecordSize', record.key)
  }

  if (!record.markdown) {
    if (measured > 0)
      setItemSize(record.key, measured, itemSizeSource, options)

    logRecordLayoutReads()
    return
  }

  const cachedSize = isSameItemSizeSource(itemSizeSources.get(record.key), itemSizeSource)
    ? itemSizes.get(record.key) ?? 0
    : 0
  const markdown = options.markdownLogicalHeight ?? getKnownMarkdownLogicalHeight(record.key)
  const chrome = getMeasuredMarkdownChromeHeight(record.key, measured)

  if (markdown > 0) {
    let next = Math.max(measured, markdown + chrome)

    if ((!options.allowMarkdownShrink || restoringThread.value) && cachedSize > 0)
      next = Math.max(next, cachedSize)

    const restoredFloor = getRestoredItemHeightFloor(record.key, itemSizeSource)
    const growsPastRestoredFloor = restoredFloor > 0
      && next > restoredFloor + ITEM_SIZE_RECONCILE_DEADBAND_PX
      && (
        !getMarkstreamTimelineItemFinal(getRecordLiveItem(record), record.index, props)
        || options.allowRestoredFloorShrink === true
      )
    const readyToReleaseRestoredFloor = record.markdown
      && restoredFloor > 0
      && (options.allowRestoredFloorShrink === true || growsPastRestoredFloor)

    if (readyToReleaseRestoredFloor) {
      if (restoringThread.value) {
        pendingRestoredMarkdownFloorReleaseKeys.add(record.key)
      }
      else {
        options = {
          ...options,
          releaseRestoredFloor: true,
        }
      }
    }
    else if (
      options.allowMarkdownShrink
      && !restoringThread.value
      && (
        restoredFloor <= 0
        || (
          options.allowRestoredFloorShrink
          && shouldReleaseRestoredMarkdownFloorForShrink(record.key, markdown, restoredFloor)
        )
      )
    ) {
      clearRestoredItemHeightFloor(record.key)
    }

    if (next > 0)
      setItemSize(record.key, next, itemSizeSource, options)

    logRecordLayoutReads()
    return
  }

  if (!String(getMarkstreamTimelineItemContent(getRecordLiveItem(record), record.index, props)).trim()) {
    if (measured > 0) {
      clearRestoredItemHeightFloor(record.key)
      setItemSize(record.key, measured, itemSizeSource, options)
    }

    logRecordLayoutReads()
    return
  }

  if (cachedSize > 0) {
    if (measured > cachedSize + 1)
      setItemSize(record.key, measured, itemSizeSource, options)

    logRecordLayoutReads()
    return
  }

  if (measured > 0)
    setItemSize(record.key, measured, itemSizeSource, options)

  logRecordLayoutReads()
}

function setMeasuredItemElement(record: TimelineRecord, el: Element | { $el?: Element | null } | null | undefined) {
  const element = resolveElement(el)
  const previous = measuredElements.get(record.key)

  if (!element) {
    cleanupMeasuredElement(record.key)
    return
  }

  if (previous === element) {
    reconcileRecordSize(record)
    return
  }

  cleanupMeasuredElement(record.key)
  measuredElements.set(record.key, element)
  reconcileRecordSize(record)

  if (typeof ResizeObserver === 'undefined')
    return

  const observer = new ResizeObserver(() => {
    reconcileRecordSize(record)
  })
  observer.observe(element)
  resizeObservers.set(record.key, observer)
}

function measureRecordElement(record: TimelineRecord) {
  return (el: Element | { $el?: Element | null } | null | undefined) => {
    setMeasuredItemElement(record, el)
  }
}

function getMarkdownProps(record: TimelineRecord): MarkstreamVirtualMarkdownProps {
  const item = getRecordLiveItem(record)
  const final = getMarkstreamTimelineItemFinal(item, record.index, props)
  const restoreState = markdownStates.get(record.key)
  const markdownMode = normalizedTimelineMarkdownMode.value
  const markdownCodeRenderer = normalizedTimelineMarkdownCodeRenderer.value
  const virtualScroll: MarkstreamVirtualScrollOptions = {
    enabled: true,
    sessionKey: getSessionKey(record),
    threadKey: normalizedThreadKey.value,
    scrollRoot: () => scrollRoot.value,
    restoreState: isCompatibleMarkdownState(record, restoreState) ? restoreState! : null,
    restoreAnchor: false,
    measurementKey: timelineMarkdownMeasurementKey.value,
    settleMode: 'manual',
    settledToken: final,
    emitIntervalMs: TIMELINE_MARKDOWN_EMIT_INTERVAL_MS,
    heightDiffThresholdPx: TIMELINE_MARKDOWN_HEIGHT_DIFF_THRESHOLD_PX,
  }

  return {
    content: getMarkstreamTimelineItemContent(item, record.index, props),
    final,
    mode: markdownMode,
    codeRenderer: markdownCodeRenderer,
    ...(final
      ? {
          nodeVirtual: 'auto' as const,
          maxLiveNodes: TIMELINE_MARKDOWN_MAX_LIVE_NODES,
          liveNodeBuffer: TIMELINE_MARKDOWN_LIVE_NODE_BUFFER,
        }
      : {}),
    fade: props.markdownFade === true,
    indexKey: getSessionKey(record),
    virtualScroll,
    onHeightChange(metrics: MarkstreamVirtualMetrics) {
      if (metrics.sessionKey !== getSessionKey(record))
        return

      setMarkdownLogicalHeight(record.key, metrics.totalHeight, {
        sessionKey: metrics.sessionKey,
        threadKey: normalizedThreadKey.value,
        measurementKey: timelineMarkdownMeasurementKey.value,
      })

      const allowMarkdownShrink = shouldAllowMarkdownShrink(metrics)
      const allowRestoredFloorShrink = shouldReleaseRestoredMarkdownFloor(metrics)
      const logicalHeight = Math.ceil(metrics.totalHeight)

      scheduleMarkdownReconcile(record, {
        allowMarkdownShrink,
        allowRestoredFloorShrink,
        itemSizeSource: getItemSizeSource(record),
        logicalHeight,
        threadKey: normalizedThreadKey.value,
      })

      emitHeightChange({ itemKey: record.key, metrics })
    },
    onVirtualStateChange(state: MarkstreamVirtualState) {
      if (state.sessionKey !== getSessionKey(record))
        return

      markdownStates.set(record.key, state)
      seedMarkdownLogicalHeightFromState(record.key, state)
      scheduleThreadStateRemember()
      emitVirtualStateChange({ itemKey: record.key, state })
    },
  }
}

function getSlotProps(record: TimelineRecord) {
  const item = getRecordLiveItem(record)
  return {
    item,
    index: record.index,
    itemKey: record.key,
    kind: record.kind,
    measureRef: measureRecordElement(record),
    markdownProps: getMarkdownProps(record),
  }
}

function getRecordText(record: TimelineRecord) {
  const item = getRecordLiveItem(record) ?? {}
  if (typeof item.text === 'string')
    return item.text
  if (typeof item.message === 'string')
    return item.message
  if (typeof item.label === 'string')
    return item.label
  return getMarkstreamTimelineItemContent(item, record.index, props)
}

function captureOuterAnchor(): MarkstreamThreadAnchor | undefined {
  const bottomDistance = distanceFromBottom()
  if (bottomDistance <= 2) {
    return {
      type: 'bottom',
      distanceFromBottomPx: Math.max(0, bottomDistance),
    }
  }

  const layoutScrollTop = getLayoutViewportStart()

  const index = lowerBoundRecordByOffset(layoutScrollTop, 'gt')
  const record = layout.value.records[index]
  if (record) {
    const recordOffset = getRecordOffset(record)
    if (layoutScrollTop >= recordOffset && layoutScrollTop < recordOffset + record.size) {
      return {
        type: 'item',
        itemKey: record.key,
        offsetWithinItemPx: layoutScrollTop - recordOffset,
      }
    }
  }

  const first = visibleWindow.value.records[0]
  if (!first)
    return undefined

  return {
    type: 'item',
    itemKey: first.key,
    offsetWithinItemPx: 0,
  }
}

function captureThreadStateForKey(threadKey = normalizedThreadKey.value): MarkstreamThreadVirtualState {
  flushPendingLayoutReconciles()

  const itemHeights: Record<string, number> = {}
  const itemSizeSourceSnapshot: NonNullable<MarkstreamThreadVirtualState['itemSizeSources']> = {}

  for (const record of layout.value.records) {
    const size = getCompatibleItemSize(record, threadKey)
    const source = itemSizeSources.get(record.key)
    if (size != null && isCompatibleItemSizeSource(record, source, threadKey)) {
      itemHeights[record.key] = size
      itemSizeSourceSnapshot[record.key] = source!
    }
  }

  return {
    threadKey,
    measurementKey: timelineBaseMeasurementKey.value,
    widthBucket: layoutWidthBucket.value,
    outerAnchor: captureOuterAnchor(),
    itemHeights,
    itemSizeSources: itemSizeSourceSnapshot,
    markdownStates: Object.fromEntries(markdownStates.entries()),
  }
}

function captureThreadState(): MarkstreamThreadVirtualState {
  return captureThreadStateForKey(normalizedThreadKey.value)
}

function rememberThreadState(threadKey = normalizedThreadKey.value) {
  if (!threadKey)
    return undefined

  const state = captureThreadStateForKey(threadKey)
  threadStates.set(threadKey, state)
  if (threadKey === normalizedThreadKey.value)
    activeThreadStateSnapshot = state
  emitThreadStateChange(state)
  return state
}

function clearThreadStateRememberSchedule() {
  if (threadStateRememberTimer != null && typeof window !== 'undefined')
    window.clearTimeout(threadStateRememberTimer)

  threadStateRememberTimer = null
  pendingThreadStateRememberKey = undefined
}

function flushThreadStateRemember() {
  const threadKey = pendingThreadStateRememberKey

  if (threadStateRememberTimer != null && typeof window !== 'undefined')
    window.clearTimeout(threadStateRememberTimer)

  threadStateRememberTimer = null
  pendingThreadStateRememberKey = undefined

  return threadKey ? rememberThreadState(threadKey) : undefined
}

function scheduleThreadStateRemember(threadKey = normalizedThreadKey.value) {
  if (!threadKey)
    return

  pendingThreadStateRememberKey = threadKey

  if (threadStateRememberTimer != null)
    return

  if (typeof window === 'undefined') {
    flushThreadStateRemember()
    return
  }

  threadStateRememberTimer = window.setTimeout(() => {
    threadStateRememberTimer = null
    flushThreadStateRemember()
  }, THREAD_STATE_REMEMBER_DELAY_MS)
}

function rememberPreviousThreadState(threadKey: string) {
  flushPendingLayoutReconciles()

  if (flushThreadStateRemember()?.threadKey === threadKey)
    return

  if (activeThreadStateSnapshot?.threadKey === threadKey) {
    threadStates.set(threadKey, activeThreadStateSnapshot)
    emitThreadStateChange(activeThreadStateSnapshot)
    return
  }

  if (!threadStates.has(threadKey))
    rememberThreadState(threadKey)
}

function resolveOuterAnchorOffset(anchor: MarkstreamThreadAnchor | undefined) {
  if (!anchor)
    return null

  if (anchor.type === 'bottom') {
    return (!restorePaintReady.value ? getLayoutScrollContentHeight() : getScrollContentHeight())
      - getViewportHeight()
      - Math.max(0, anchor.distanceFromBottomPx)
  }

  const record = findRecordByKey(anchor.itemKey)

  if (!record)
    return null

  return getScrollContentStart() + getRecordOffset(record) + Math.max(0, anchor.offsetWithinItemPx)
}

function restoreOuterAnchor(
  anchor: MarkstreamThreadAnchor | undefined,
  options: { remember?: boolean } = {},
) {
  const offset = resolveOuterAnchorOffset(anchor)

  if (offset == null)
    return false

  applyScrollOffset(offset, {
    writeDom: true,
    remember: options.remember === true,
  })

  return true
}

function applyThreadRestorePass(
  seq: number,
  anchor: MarkstreamThreadAnchor | undefined,
) {
  if (seq !== threadRestoreSeq)
    return

  if (anchor) {
    const restored = restoreOuterAnchor(anchor, { remember: false })
    activeThreadRestoreScrollTop = restored ? scrollTop.value : null
  }

  updateScrollMetrics({ remember: false })
}

function isVisibleInRootRect(el: HTMLElement, rootRect: DOMRect) {
  const rect = el.getBoundingClientRect()
  return rect.width > 0
    && rect.height > 0
    && rect.bottom > rootRect.top
    && rect.top < rootRect.bottom
}

function isElementVisibleInScrollRoot(el: HTMLElement, root: HTMLElement) {
  const rect = el.getBoundingClientRect()
  const rootRect = root.getBoundingClientRect()
  return rect.bottom > rootRect.top && rect.top < rootRect.bottom
}

function hasElementContent(content: HTMLElement) {
  if ((content.textContent ?? '').trim().length > 0)
    return true

  return Boolean(content.querySelector([
    'hr',
    'br',
    'table',
    'blockquote',
    'img',
    'svg',
    'canvas',
    'input',
    'button',
    'select',
    'textarea',
    '[role]',
    '[aria-label]',
    '[data-markstream-math]',
    '[data-markstream-mermaid]',
    '[data-markstream-infographic]',
    '[data-markstream-d2]',
    '[data-markstream-pre="1"]',
  ].join(',')))
}

function isElementVisiblyPainted(el: HTMLElement) {
  if (el.closest('.code-editor-container.is-hidden'))
    return false

  let current: HTMLElement | null = el
  while (current) {
    const style = window.getComputedStyle(current)
    if (
      style.display === 'none'
      || style.visibility === 'hidden'
      || Number.parseFloat(style.opacity || '1') <= 0.01
    ) {
      return false
    }

    current = current.parentElement
  }

  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function hasVisibleStreamDiffsDom(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>('diffs-container, .stream-diffs-shell, .stream-diffs-surface'))
    .some(isElementVisiblyPainted)
}

function hasUsableRestoreFallback(el: HTMLElement | null) {
  if (!el)
    return false

  if (el.classList.contains('is-fading-out'))
    return false

  const style = window.getComputedStyle(el)
  if (style.display === 'none' || Number.parseFloat(style.opacity || '1') <= 0.01)
    return false

  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function hasPendingVisualNode(content: HTMLElement) {
  return Array.from(content.querySelectorAll<HTMLElement>([
    '[data-markstream-pending="true"]',
    '[data-markstream-mermaid][data-markstream-mode="pending"]',
    '.mermaid-block-container[data-markstream-mode="pending"]',
    '[data-markstream-code-loading="1"]',
  ].join(','))).some((node) => {
    if (node.matches('[data-markstream-code-block="1"]'))
      return !hasUsableRestoreFallback(node.querySelector<HTMLElement>('pre.code-pre-fallback'))
    return true
  })
}

function hasReadyMathContent(content: HTMLElement) {
  const mathNodes = Array.from(
    content.querySelectorAll<HTMLElement>('[data-markstream-math]'),
  )

  if (!mathNodes.length)
    return true

  return mathNodes.every((node) => {
    const mode = node.dataset.markstreamMode
    const pending = node.dataset.markstreamPending === 'true'

    if (pending || mode === 'loading')
      return false

    return mode === 'katex' || mode === 'fallback'
  })
}

function hasReadyCodeBlockContent(content: HTMLElement) {
  // Async component loading fallback is intentionally visible enough to avoid a
  // blank node, but it is not layout-equivalent to the final CodeBlock shell.
  // Do not use it as an early-reveal signal during thread restore.
  if (content.querySelector('[data-markstream-code-loading="1"]'))
    return false

  const codeBlock = content.querySelector<HTMLElement>('[data-markstream-code-block="1"]')

  if (codeBlock) {
    const enhanced = codeBlock.dataset.markstreamEnhanced === 'true'
    const fallback = codeBlock.querySelector<HTMLElement>('pre.code-pre-fallback')
    const hasFallback = hasUsableRestoreFallback(fallback)

    // Hidden editor alone is not a visible surface. It is only safe when the
    // pre fallback is still usable, stream-diffs is visibly painted, or the block is enhanced.
    return enhanced || hasFallback || hasVisibleStreamDiffsDom(codeBlock)
  }

  return hasReadyRoutedDiagramContent(content)
}

function hasReadyRoutedDiagramContent(content: HTMLElement) {
  const mermaid = content.querySelector<HTMLElement>('[data-markstream-mermaid], .mermaid-block-container')
  if (mermaid) {
    if (mermaid.dataset.markstreamPending === 'true')
      return false

    const mode = mermaid.dataset.markstreamMode

    if (mode === 'preview') {
      return Boolean(
        mermaid.querySelector('svg')
        || mermaid.querySelector('[data-mermaid-svg-layer="1"] svg'),
      )
    }

    if (mode === 'fallback') {
      return Boolean(
        mermaid.querySelector<HTMLElement>('.mermaid-source-code')
          ?.textContent
          ?.trim(),
      )
    }

    return false
  }

  const infographic = content.querySelector<HTMLElement>('[data-markstream-infographic], .infographic-block-container')
  if (infographic)
    return infographic.dataset.markstreamPending !== 'true'

  const d2 = content.querySelector<HTMLElement>('[data-markstream-d2], .d2-block-container')
  if (d2)
    return d2.dataset.markstreamPending !== 'true'

  return Boolean(content.querySelector('pre[data-markstream-pre="1"]'))
}

function isVisibleNodeSlotReady(slot: HTMLElement) {
  // NodeRenderer is still deferring this node.
  if (slot.querySelector(':scope > .node-placeholder'))
    return false

  const content = slot.querySelector<HTMLElement>(':scope > .node-content')
  if (!content)
    return false

  if (hasPendingVisualNode(content))
    return false

  if (!hasReadyMathContent(content))
    return false

  const nodeType = slot.dataset.nodeType ?? ''

  if (nodeType === 'code_block')
    return hasReadyCodeBlockContent(content)

  // For non-code nodes, the requirement is "not blank": a mounted element is
  // enough, even when it has no text, because <hr>, <br>, <img>, etc. are valid.
  return hasElementContent(content)
}

function hasRenderableMarkdownRecordContent(record: TimelineRecord, el: HTMLElement) {
  if (!record.markdown)
    return true

  const source = getMarkstreamTimelineItemContent(getRecordLiveItem(record), record.index, props)
  if (!String(source ?? '').trim())
    return true

  if (el.querySelector('[data-node-index]'))
    return true

  const renderer = el.querySelector<HTMLElement>('.markdown-renderer')
  const contentRoot = renderer ?? el

  if (hasPendingVisualNode(contentRoot))
    return false

  if ((contentRoot.textContent ?? '').trim())
    return true

  return Boolean(contentRoot.querySelector([
    'hr',
    'br',
    'table',
    'blockquote',
    'img',
    'svg',
    'canvas',
    'input',
    'button',
    '[role]',
    '[aria-label]',
    '[data-markstream-math]',
    '[data-markstream-mermaid]',
    '[data-markstream-infographic]',
    '[data-markstream-d2]',
    '[data-markstream-pre="1"]',
    '[data-markstream-code-block="1"]',
  ].join(',')))
}

function isRestoredMarkdownFloorTailVisible(
  record: TimelineRecord,
  el: HTMLElement,
  contentRoot: HTMLElement,
  rootRect: DOMRect,
) {
  if (!hasTrustedRestoredItemHeightFloor(record))
    return false

  const contentRect = contentRoot.getBoundingClientRect()
  const itemRect = el.getBoundingClientRect()

  return contentRect.width > 0
    && contentRect.height > 0
    && contentRect.bottom <= rootRect.top + 1
    && itemRect.bottom > rootRect.top
}

function hasVisibleReadyMarkdownRecordContent(
  record: TimelineRecord,
  el: HTMLElement,
  root: HTMLElement,
) {
  if (!record.markdown)
    return true

  const source = getMarkstreamTimelineItemContent(getRecordLiveItem(record), record.index, props)
  if (!String(source ?? '').trim())
    return true

  const rootRect = root.getBoundingClientRect()
  const visibleNodeSlots = Array.from(el.querySelectorAll<HTMLElement>('[data-node-index]'))
    .filter(slot => isVisibleInRootRect(slot, rootRect))

  if (visibleNodeSlots.length > 0)
    return visibleNodeSlots.every(slot => isVisibleNodeSlotReady(slot))

  const renderer = el.querySelector<HTMLElement>('.markdown-renderer')
  const contentRoot = renderer ?? el

  if (contentRoot.querySelector('[data-node-index], .node-placeholder')) {
    if (isRestoredMarkdownFloorTailVisible(record, el, contentRoot, rootRect))
      return hasRenderableMarkdownRecordContent(record, el)

    return false
  }

  return hasRenderableMarkdownRecordContent(record, el)
}

function hasTrustedRestoredItemHeightFloor(record: TimelineRecord) {
  const source = itemSizeSources.get(record.key)
  const restoredFloor = getRestoredItemHeightFloor(record.key, source)

  return restoredFloor > 0
}

function hasReadyMarkdownRestoreMetrics(record: TimelineRecord, el: HTMLElement) {
  if (!record.markdown)
    return true

  if (
    !activeThreadRestoreRequiresMarkdownMetrics
    && !activeThreadRestoreRequiresColdMarkdownMetrics
  ) {
    return true
  }

  if (hasTrustedRestoredItemHeightFloor(record))
    return true

  const source = getMarkstreamTimelineItemContent(getRecordLiveItem(record), record.index, props)
  if (!String(source ?? '').trim())
    return true

  const renderer = el.querySelector<HTMLElement>('.markdown-renderer')
  if (!renderer)
    return false

  const state = markdownStates.get(record.key)
  if (!isCompatibleMarkdownState(record, state))
    return false

  const metrics = state?.metrics
  const totalHeight = Number(metrics?.totalHeight ?? 0)

  if (!Number.isFinite(totalHeight) || totalHeight <= 0)
    return false

  const measuredCount = Number(metrics?.measuredCount ?? 0)
  const estimatedCount = Number(metrics?.estimatedCount ?? 0)
  const nodeCount = Number(metrics?.nodeCount ?? 0)

  const hasCompleteMeasurement = nodeCount <= 0
    || (measuredCount >= nodeCount && estimatedCount <= 0)

  const hasMeasuredOrFinalConfidence = isMeasuredOrFinalConfidence(metrics?.confidence)
  const hasStableFinalVirtualMetrics = isStableFinalVirtualMetrics(metrics)

  const hasStableHeight = metrics?.stable === true
    || hasMeasuredOrFinalConfidence
    || hasStableFinalVirtualMetrics

  if (activeThreadRestoreRequiresColdMarkdownMetrics) {
    return metrics?.final === true
      && (
        (hasCompleteMeasurement && hasMeasuredOrFinalConfidence)
        || hasStableFinalVirtualMetrics
      )
  }

  return hasStableHeight || metrics?.final === true
}

function isRestoreViewportReady() {
  const root = scrollRoot.value
  if (!root)
    return false

  const anchorOffset = resolveOuterAnchorOffset(activeThreadRestoreAnchor)
  if (
    anchorOffset != null
    && Math.abs((root.scrollTop || 0) - clampScrollOffset(anchorOffset)) > SCROLL_RESTORE_DEADBAND_PX
  ) {
    return false
  }

  const records = visibleWindow.value.records
  if (!records.length)
    return layout.value.records.length === 0

  const itemByKey = new Map(
    Array.from(root.querySelectorAll<HTMLElement>('[data-markstream-item-key]'))
      .map(el => [el.dataset.markstreamItemKey ?? '', el] as const),
  )

  const visibleRecordEntries: Array<{ record: TimelineRecord, el: HTMLElement }> = []

  for (const record of records) {
    const el = itemByKey.get(record.key)
    if (!el)
      continue

    if (!isElementVisibleInScrollRoot(el, root))
      continue

    visibleRecordEntries.push({ record, el })
  }

  if (!visibleRecordEntries.length)
    return false

  for (const { record, el } of visibleRecordEntries) {
    if (el.offsetHeight + 1 < record.size)
      return false

    if (!hasVisibleReadyMarkdownRecordContent(record, el, root))
      return false

    if (!hasReadyMarkdownRestoreMetrics(record, el))
      return false
  }

  const rootRect = root.getBoundingClientRect()
  const visiblePendingVisualNode = Array
    .from(root.querySelectorAll<HTMLElement>([
      '[data-markstream-pending="true"]',
      '[data-markstream-mermaid][data-markstream-mode="pending"]',
      '.mermaid-block-container[data-markstream-mode="pending"]',
      '[data-markstream-code-loading="1"]',
    ].join(',')))
    .some((el) => {
      if (!isVisibleInRootRect(el, rootRect))
        return false
      if (el.matches('[data-markstream-code-block="1"]'))
        return !hasUsableRestoreFallback(el.querySelector<HTMLElement>('pre.code-pre-fallback'))
      return true
    })

  if (visiblePendingVisualNode)
    return false

  const visibleNodeSlots = Array.from(root.querySelectorAll<HTMLElement>('[data-node-index]'))
    .filter(slot => isVisibleInRootRect(slot, rootRect))

  for (const slot of visibleNodeSlots) {
    if (!isVisibleNodeSlotReady(slot))
      return false
  }

  return true
}

function readRestoreViewportSignature() {
  const root = scrollRoot.value
  if (!root)
    return ''

  const rootRect = root.getBoundingClientRect()
  const itemByKey = new Map(
    Array.from(root.querySelectorAll<HTMLElement>('[data-markstream-item-key]'))
      .map(el => [el.dataset.markstreamItemKey ?? '', el] as const),
  )

  const recordSignature = visibleWindow.value.records
    .map((record) => {
      const item = itemByKey.get(record.key)
      const renderer = item?.querySelector<HTMLElement>('.markdown-renderer')
      const metrics = markdownStates.get(record.key)?.metrics

      return [
        record.key,
        record.size,
        item?.offsetHeight ?? 0,
        item?.scrollHeight ?? 0,
        renderer?.offsetHeight ?? 0,
        renderer?.scrollHeight ?? 0,
        metrics ? Math.round(Number(metrics.totalHeight || 0)) : '',
        metrics?.measuredCount ?? '',
        metrics?.estimatedCount ?? '',
        metrics?.nodeCount ?? '',
        metrics?.final === true ? 1 : 0,
        metrics?.stable === true ? 1 : 0,
        metrics?.confidence ?? '',
      ].join(':')
    })
    .join('|')

  const nodeSignature = Array.from(root.querySelectorAll<HTMLElement>('[data-node-index]'))
    .filter(slot => isVisibleInRootRect(slot, rootRect))
    .map((slot) => {
      const rect = slot.getBoundingClientRect()
      const content = slot.querySelector<HTMLElement>(':scope > .node-content')
      const code = content?.querySelector<HTMLElement>('[data-markstream-code-block="1"]')
      const fallback = content?.querySelector<HTMLElement>('pre.code-pre-fallback')
      const editor = content?.querySelector<HTMLElement>('diffs-container, .stream-diffs-shell')

      return [
        slot.dataset.nodeIndex ?? '',
        slot.dataset.nodeType ?? '',
        Math.round(rect.height),
        content?.offsetHeight ?? 0,
        content?.scrollHeight ?? 0,
        code?.dataset.markstreamEnhanced ?? '',
        code ? Math.round(code.getBoundingClientRect().height) : 0,
        fallback ? Math.round(fallback.getBoundingClientRect().height) : 0,
        editor ? Math.round(editor.getBoundingClientRect().height) : 0,
      ].join(':')
    })
    .join('|')

  return [
    Math.round(root.scrollTop || 0),
    Math.round(root.scrollHeight || 0),
    Math.round(layout.value.totalHeight || 0),
    recordSignature,
    nodeSignature,
  ].join('\n')
}

function getNowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function getRestoreMaxLoadingMs() {
  if (props.restoreMaxLoadingMs === false)
    return Number.POSITIVE_INFINITY

  const value = Number(props.restoreMaxLoadingMs)
  return Number.isFinite(value) && value > 0
    ? value
    : Number.POSITIVE_INFINITY
}

function hasRestoreLoadingTimedOut() {
  if (threadRestoreStartedAt < 0)
    return false

  const maxLoadingMs = getRestoreMaxLoadingMs()
  return Number.isFinite(maxLoadingMs)
    && getNowMs() - threadRestoreStartedAt >= maxLoadingMs
}

function getRequiredRestoreStableFrames() {
  return activeThreadRestoreRequiresColdMarkdownMetrics
    ? THREAD_RESTORE_COLD_STABLE_FRAMES
    : THREAD_RESTORE_STABLE_FRAMES
}

async function waitRestoreViewportReady(seq: number) {
  const startedAt = getNowMs()
  let stableFrames = 0
  let previousSignature = ''

  for (let i = 0; i < THREAD_RESTORE_READY_POLL_FRAMES; i++) {
    await nextTick()
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve())
        return
      }

      resolve()
    })

    if (!isActiveThreadRestore(seq))
      return false

    applyThreadRestorePass(seq, activeThreadRestoreAnchor)

    const now = getNowMs()
    const ready = isRestoreViewportReady()
    const signature = ready ? readRestoreViewportSignature() : ''

    if (ready && signature === previousSignature && signature) {
      stableFrames += 1

      if (
        stableFrames >= getRequiredRestoreStableFrames()
        && now - startedAt >= THREAD_RESTORE_MIN_READY_MS
      ) {
        return true
      }
    }
    else {
      stableFrames = 0
      previousSignature = signature
    }
  }

  return false
}

function warnRestoreViewportNotReady(seq: number) {
  if (threadRestoreReadyWarnedSeq === seq)
    return

  threadRestoreReadyWarnedSeq = seq

  if (
    props.debug === true
    && typeof import.meta !== 'undefined'
    && import.meta.env?.DEV
    && typeof console !== 'undefined'
  ) {
    console.warn(
      '[markstream-vue] MarkstreamVirtualTimeline restore viewport did not become ready; keeping restore loading visible.',
    )
  }
}

function scheduleRestoreViewportReadyRetry(seq: number) {
  if (!isActiveThreadRestore(seq))
    return

  if (typeof window === 'undefined')
    return

  if (threadRestoreReadyRetryTimer != null)
    window.clearTimeout(threadRestoreReadyRetryTimer)

  threadRestoreReadyRetryTimer = window.setTimeout(() => {
    threadRestoreReadyRetryTimer = null

    if (!isActiveThreadRestore(seq))
      return

    watchRestoreViewportReady(seq)
  }, THREAD_RESTORE_READY_RETRY_DELAY_MS)
}

function watchRestoreViewportReady(seq: number) {
  if (!isActiveThreadRestore(seq) || threadRestoreReadyWaitSeq === seq)
    return

  threadRestoreReadyWaitSeq = seq

  void waitRestoreViewportReady(seq).then((ready) => {
    if (threadRestoreReadyWaitSeq === seq)
      threadRestoreReadyWaitSeq = 0

    if (!isActiveThreadRestore(seq))
      return

    if (!ready) {
      if (hasRestoreLoadingTimedOut()) {
        if (
          props.debug === true
          && typeof import.meta !== 'undefined'
          && import.meta.env?.DEV
          && typeof console !== 'undefined'
        ) {
          console.warn(
            '[markstream-vue] MarkstreamVirtualTimeline restore viewport did not become ready before timeout; revealing the latest restored viewport.',
          )
        }

        finishThreadRestore(seq)
        return
      }

      warnRestoreViewportNotReady(seq)
      scheduleRestoreViewportReadyRetry(seq)
      return
    }

    finishThreadRestore(seq)
  })
}

function markRestorePaintReady() {
  restorePaintReady.value = true
  threadRestoreStartedAt = -1
  threadRestoreReadyWaitSeq = 0
  threadRestoreReadyWarnedSeq = 0
  activeThreadRestoreRequiresMarkdownMetrics = false
  activeThreadRestoreRequiresColdMarkdownMetrics = false

  if (threadRestoreReadyRetryTimer != null && typeof window !== 'undefined')
    window.clearTimeout(threadRestoreReadyRetryTimer)

  threadRestoreReadyRetryTimer = null
}

function markInitialThreadRestoreCompleted() {
  initialThreadRestoreCompleted = true
}

function resolveColdThreadRestoreAnchor(): MarkstreamThreadAnchor | undefined {
  if (props.stickToBottom !== false) {
    return {
      type: 'bottom',
      distanceFromBottomPx: 0,
    }
  }

  const first = layout.value.records[0]
  if (!first)
    return undefined

  return {
    type: 'item',
    itemKey: first.key,
    offsetWithinItemPx: 0,
  }
}

function canImportThreadItemHeights(state: MarkstreamThreadVirtualState | null | undefined) {
  if (!state)
    return false

  return (state.measurementKey ?? '') === timelineBaseMeasurementKey.value
    && (state.widthBucket ?? 0) === layoutWidthBucket.value
}

function getCompatibleStateItemHeightEntries(state: MarkstreamThreadVirtualState | null | undefined) {
  const entries: Array<[string, number, TimelineItemSizeSource]> = []

  if (!canImportThreadItemHeights(state))
    return entries

  for (const [key, size] of Object.entries(state?.itemHeights ?? {})) {
    if (!Number.isFinite(size) || size <= 0)
      continue

    const record = findRecordByKey(key)
    const source = state?.itemSizeSources?.[key]
    if (!isCompatibleItemSizeSource(record, source))
      continue

    entries.push([key, Math.ceil(size), source!])
  }

  return entries
}

function hasCompatibleMarkdownState(state: MarkstreamThreadVirtualState | null | undefined) {
  for (const [key, markdownState] of Object.entries(state?.markdownStates ?? {})) {
    if (isCompatibleMarkdownState(findRecordByKey(key), markdownState))
      return true
  }

  return false
}

function hasRestorableThreadState(state: MarkstreamThreadVirtualState | null | undefined) {
  return Boolean(
    state?.outerAnchor
    || getCompatibleStateItemHeightEntries(state).length > 0
    || hasCompatibleMarkdownState(state),
  )
}

function scheduleThreadRestorePass(
  seq = activeThreadRestoreSeq,
  anchor = activeThreadRestoreAnchor,
) {
  if (!anchor)
    return

  void nextTick(() => {
    applyThreadRestorePass(seq, anchor)

    if (threadRestoreRaf != null)
      return

    if (typeof requestAnimationFrame === 'function') {
      threadRestoreRaf = requestAnimationFrame(() => {
        threadRestoreRaf = null
        applyThreadRestorePass(seq, anchor)
      })
    }
  })
}

function finishThreadRestore(seq: number) {
  if (seq !== threadRestoreSeq)
    return

  flushMarkdownReconciles()
  const pendingMarkdownFloorReleaseKeys = new Set(pendingRestoredMarkdownFloorReleaseKeys)
  clearThreadRestoreSchedule()
  applyThreadRestorePass(seq, activeThreadRestoreAnchor)
  restoringThread.value = false
  threadRestoreStartedAt = -1
  activeThreadRestoreAnchor = undefined
  activeThreadRestoreScrollTop = null
  activeThreadRestoreSeq = 0

  for (const record of layout.value.records) {
    if (!record.markdown || pendingMarkdownFloorReleaseKeys.has(record.key))
      clearRestoredItemHeightFloor(record.key)
  }

  for (const key of pendingMarkdownFloorReleaseKeys) {
    const record = layoutRecordByKey.get(key)
    if (!record) {
      clearRestoredItemHeightFloor(key)
      continue
    }

    reconcileRecordSize(record, {
      allowMarkdownShrink: true,
      allowRestoredFloorShrink: true,
      markdownLogicalHeight: getKnownMarkdownLogicalHeight(record.key),
      source: getItemSizeSource(record),
      updateLayout: true,
    })
  }
  pendingRestoredMarkdownFloorReleaseKeys.clear()

  flushScrollReconcile()
  updateScrollMetrics({ remember: false })
  markRestorePaintReady()
  markInitialThreadRestoreCompleted()
}

function restoreThreadState(
  state: MarkstreamThreadVirtualState | null | undefined,
  options: { threadSwitch?: boolean } = {},
) {
  const restoreSeq = ++threadRestoreSeq
  pendingProgrammaticScroll = null

  if (state?.widthBucket && layoutWidthBucket.value === 0)
    layoutWidthBucket.value = state.widthBucket

  const anchor = state?.outerAnchor
  const hasRealRestoreState = hasRestorableThreadState(state)
  const shouldRequireMarkdownMetrics = hasCompatibleMarkdownState(state)

  const isInitialThreadRestore = !initialThreadRestoreCompleted && options.threadSwitch !== true
  const shouldGateColdThread = !isInitialThreadRestore && !hasRealRestoreState
  const shouldGateRestore = hasRealRestoreState || shouldGateColdThread

  const fallbackAnchor: MarkstreamThreadAnchor | undefined = anchor
    ?? (shouldGateRestore
      ? resolveColdThreadRestoreAnchor()
      : undefined)

  clearThreadRestoreSchedule()
  threadRestoreReadyWaitSeq = 0
  threadRestoreReadyWarnedSeq = 0

  restorePaintReady.value = !shouldGateRestore
  restoringThread.value = shouldGateRestore && Boolean(fallbackAnchor)
  activeThreadRestoreSeq = restoreSeq
  activeThreadRestoreAnchor = fallbackAnchor
  activeThreadRestoreRequiresMarkdownMetrics = shouldGateRestore && shouldRequireMarkdownMetrics
  activeThreadRestoreRequiresColdMarkdownMetrics = shouldGateRestore && shouldGateColdThread
  threadRestoreStartedAt = restoringThread.value
    ? getNowMs()
    : -1

  cleanupMeasuredElements()

  itemSizes.clear()
  itemSizeSources.clear()
  restoredItemHeightFloors.clear()
  restoredItemHeightFloorSources.clear()
  restoredMarkdownLogicalHeights.clear()
  pendingRestoredMarkdownFloorReleaseKeys.clear()
  markdownStates.clear()
  markdownLogicalHeights.clear()
  markdownLogicalHeightSources.clear()

  for (const [key, size, source] of getCompatibleStateItemHeightEntries(state)) {
    const next = Math.ceil(size)
    itemSizeSources.set(key, source)
    itemSizes.set(key, next)
    restoredItemHeightFloors.set(key, next)
    restoredItemHeightFloorSources.set(key, source)
  }

  for (const [key, markdownState] of Object.entries(state?.markdownStates ?? {})) {
    markdownStates.set(key, markdownState)
    const restoredMarkdown = seedMarkdownLogicalHeightFromState(key, markdownState)
    if (restoredMarkdown > 0)
      restoredMarkdownLogicalHeights.set(key, restoredMarkdown)
  }

  rebuildLayoutRecords()

  if (props.stickToBottom === true) {
    bottomPinned.value = true
    exactBottomPinned.value = true
  }
  else if (props.stickToBottom === false) {
    bottomPinned.value = false
    exactBottomPinned.value = false
  }
  else {
    bottomPinned.value = fallbackAnchor?.type === 'bottom'
    exactBottomPinned.value = fallbackAnchor?.type === 'bottom'
      && fallbackAnchor.distanceFromBottomPx <= 2
  }

  const targetOffset = resolveOuterAnchorOffset(fallbackAnchor)
  activeThreadRestoreScrollTop = targetOffset == null
    ? null
    : clampScrollOffset(targetOffset)

  if (targetOffset != null) {
    applyScrollOffset(targetOffset, {
      writeDom: true,
      remember: false,
      updatePinned: false,
    })
  }

  activeThreadStateSnapshot = state?.threadKey === normalizedThreadKey.value
    ? state
    : null

  if (!shouldGateRestore) {
    restoringThread.value = false
    activeThreadRestoreAnchor = undefined
    activeThreadRestoreScrollTop = null
    activeThreadRestoreSeq = 0
    updateScrollMetrics({ remember: false })
    markRestorePaintReady()
    markInitialThreadRestoreCompleted()

    if (props.stickToBottom !== false) {
      bottomPinned.value = true
      exactBottomPinned.value = true

      void nextTick(() => {
        if (!restoringThread.value)
          scrollToBottom()
      })
    }

    return
  }

  if (!fallbackAnchor) {
    restoringThread.value = false
    activeThreadRestoreAnchor = undefined
    activeThreadRestoreScrollTop = null
    activeThreadRestoreSeq = 0
    updateScrollMetrics({ remember: false })
    markRestorePaintReady()
    markInitialThreadRestoreCompleted()
    return
  }

  void nextTick(() => {
    applyThreadRestorePass(restoreSeq, fallbackAnchor)

    if (typeof window !== 'undefined') {
      THREAD_RESTORE_SETTLE_DELAYS.forEach((delay) => {
        const timer = window.setTimeout(() => {
          applyThreadRestorePass(restoreSeq, fallbackAnchor)
        }, delay)

        threadRestoreTimers.push(timer)
      })
    }
    else {
      finishThreadRestore(restoreSeq)
      return
    }

    watchRestoreViewportReady(restoreSeq)
  })
}

function cleanupMeasuredElements() {
  for (const observer of resizeObservers.values())
    observer.disconnect()

  resizeObservers.clear()
  measuredElements.clear()
}

function cleanupObservers() {
  pendingProgrammaticScroll = null
  clearThreadStateRememberSchedule()
  clearPendingScrollReconcile()
  clearPendingMarkdownReconciles()
  cleanupMeasuredElements()
  itemSizeSources.clear()
  restoredItemHeightFloors.clear()
  restoredItemHeightFloorSources.clear()
  restoredMarkdownLogicalHeights.clear()
  pendingRestoredMarkdownFloorReleaseKeys.clear()
  markdownLogicalHeights.clear()
  markdownLogicalHeightSources.clear()
  rootResizeObserver?.disconnect()
  rootResizeObserver = null
}

function getExternalInitialThreadState(threadKey: string | undefined) {
  const initial = props.initialThreadState

  if (!initial)
    return null

  if ((initial.threadKey ?? '') !== (threadKey ?? ''))
    return null

  return initial
}

function resolveThreadStateForRestore(threadKey: string | undefined) {
  const memoryState = threadKey
    ? threadStates.get(threadKey)
    : null

  if (memoryState)
    return memoryState

  return getExternalInitialThreadState(threadKey)
}

watch(
  normalizedThreadKey,
  (threadKey, previousThreadKey) => {
    const oldKey = activeThreadKeySnapshot ?? previousThreadKey
    const threadSwitch = Boolean(oldKey && oldKey !== threadKey)

    if (threadSwitch)
      rememberPreviousThreadState(oldKey)

    activeThreadKeySnapshot = threadKey

    restoreThreadState(resolveThreadStateForRestore(threadKey), { threadSwitch })
  },
  {
    immediate: true,
    flush: 'sync',
  },
)

watch(
  () => visibleWindow.value.records.map(record => record.key).join('\u0000'),
  () => {
    emitRangeChange({
      start: visibleWindow.value.start,
      end: visibleWindow.value.end,
    })
  },
  { immediate: true },
)

watch(
  () => [props.items.length, layout.value.totalHeight],
  () => {
    if (restoringThread.value)
      return

    if (props.stickToBottom === false)
      return

    if (props.stickToBottom === 'auto' && !exactBottomPinned.value)
      return

    void nextTick(() => {
      if (restoringThread.value)
        return

      if (props.stickToBottom === false)
        return

      // The user (or host API) may have scrolled away after this post-flush
      // watcher queued. Re-check before applying the delayed bottom snap so a
      // stale auto-stick pass cannot override an explicit non-bottom position.
      if (props.stickToBottom === 'auto' && !exactBottomPinned.value)
        return

      scrollToBottom()
    })
  },
  { flush: 'post' },
)

onMounted(() => {
  updateRootPaddingBlock()
  updateLayoutWidthBucket()
  applyInitialScrollPosition()

  if (scrollRoot.value && typeof ResizeObserver !== 'undefined') {
    rootResizeObserver = new ResizeObserver(() => {
      updateRootPaddingBlock()
      updateScrollMetrics()
    })
    rootResizeObserver.observe(scrollRoot.value)
  }
})

onUpdated(() => {
  if (restorePaintReady.value)
    return

  watchRestoreViewportReady(activeThreadRestoreSeq)
})

onBeforeUnmount(() => {
  if (!flushThreadStateRemember())
    rememberThreadState()
  clearThreadRestoreSchedule()
  cleanupObservers()
})

defineExpose({
  captureThreadState,
  restoreThreadState,
  scrollToBottom,
  scrollToIndex,
  scrollToOffset,
  getItemSize: (key: string) => {
    const record = findRecordByKey(key)
    return record ? getCompatibleItemSize(record) ?? undefined : undefined
  },
  getTotalHeight: () => layout.value.totalHeight,
  getVisibleRange: () => ({ start: visibleWindow.value.start, end: visibleWindow.value.end }),
})
</script>

<template>
  <div
    ref="scrollRoot"
    class="markstream-virtual-timeline"
    :class="{ 'is-restoring-thread': !restorePaintReady }"
    data-markstream-virtual-timeline="1"
    data-testid="markstream-virtual-timeline"
    @scroll="handleTimelineScroll"
  >
    <div
      class="markstream-virtual-timeline__spacer"
      :style="{ height: `${visibleWindow.topSpacerHeight}px` }"
      aria-hidden="true"
    />
    <div
      v-for="record in visibleWindow.records"
      :key="record.renderKey"
      class="markstream-virtual-timeline__item"
      :class="{ 'is-restored-height-floor': hasTrustedRestoredItemHeightFloor(record) }"
      :data-markstream-item-key="record.key"
      :data-markstream-item-kind="record.kind"
      :style="{
        'minHeight': `${record.size}px`,
        '--markstream-virtual-item-size': `${record.size}px`,
      }"
    >
      <slot
        v-bind="getSlotProps(record)"
      >
        <MarkdownRender
          v-if="record.markdown"
          v-bind="getMarkdownProps(record)"
        />
        <component
          :is="getRecordComponent(record)"
          v-else-if="getRecordComponent(record)"
          :ref="measureRecordElement(record)"
          :item="getRecordLiveItem(record)"
        />
        <div
          v-else
          :ref="measureRecordElement(record)"
          class="markstream-virtual-timeline__default-item"
          :class="`markstream-virtual-timeline__default-item--${record.kind || 'item'}`"
        >
          <span
            v-if="record.kind === 'tool-call' && getRecordLiveItem(record)?.status"
            class="markstream-virtual-timeline__status"
          >
            {{ getRecordLiveItem(record)?.status }}
          </span>
          {{ getRecordText(record) }}
        </div>
      </slot>
    </div>
    <div
      class="markstream-virtual-timeline__spacer"
      :style="{ height: `${visibleWindow.bottomSpacerHeight}px` }"
      aria-hidden="true"
    />
    <div
      v-if="!restorePaintReady"
      class="markstream-virtual-timeline__restore-loading"
      :style="getRestoreLoadingStyle()"
      aria-live="polite"
      aria-busy="true"
    >
      <slot
        name="restore-loading"
        :thread-key="normalizedThreadKey"
        :visible-records="visibleWindow.records"
      >
        <div class="markstream-virtual-timeline__restore-loading-card">
          <span class="markstream-virtual-timeline__restore-spinner" aria-hidden="true" />
          <span>Loading thread…</span>
        </div>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.markstream-virtual-timeline {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: auto;
  overflow-anchor: none;
}

.markstream-virtual-timeline.is-restoring-thread > .markstream-virtual-timeline__spacer,
.markstream-virtual-timeline.is-restoring-thread > .markstream-virtual-timeline__item {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.markstream-virtual-timeline.is-restoring-thread > .markstream-virtual-timeline__item,
.markstream-virtual-timeline__item.is-restored-height-floor {
  height: var(--markstream-virtual-item-size);
  overflow: hidden;
}

.markstream-virtual-timeline__restore-loading {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  pointer-events: none;
  overflow: hidden;
  background: Canvas;
  contain: strict;
}

.markstream-virtual-timeline__restore-loading-card {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid rgb(148 163 184 / 32%);
  border-radius: 999px;
  background: rgb(255 255 255 / 92%);
  color: rgb(51 65 85);
  font-size: 13px;
  box-shadow: 0 8px 24px rgb(15 23 42 / 8%);
}

.markstream-virtual-timeline__restore-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgb(148 163 184 / 35%);
  border-top-color: rgb(51 65 85);
  border-radius: 999px;
  animation: markstream-timeline-restore-spin 0.8s linear infinite;
}

@keyframes markstream-timeline-restore-spin {
  to {
    transform: rotate(360deg);
  }
}

.markstream-virtual-timeline__spacer {
  flex: 0 0 auto;
  overflow-anchor: none;
}

.markstream-virtual-timeline__item {
  display: flow-root;
  flex: 0 0 auto;
  overflow-anchor: none;
}

.markstream-virtual-timeline__default-item {
  margin: 8px 0;
  padding: 10px 12px;
  border: 1px solid rgb(148 163 184 / 32%);
  border-radius: 8px;
  background: rgb(248 250 252);
  color: rgb(15 23 42);
  line-height: 1.5;
  white-space: pre-wrap;
}

.markstream-virtual-timeline__default-item--system-divider {
  border: 0;
  background: transparent;
  color: rgb(100 116 139);
  font-size: 12px;
  text-align: center;
}

.markstream-virtual-timeline__default-item--error {
  border-color: rgb(248 113 113 / 45%);
  background: rgb(254 242 242);
  color: rgb(153 27 27);
}

.markstream-virtual-timeline__status {
  display: inline-flex;
  margin-right: 8px;
  color: rgb(71 85 105);
  font-size: 12px;
  text-transform: uppercase;
}
</style>
