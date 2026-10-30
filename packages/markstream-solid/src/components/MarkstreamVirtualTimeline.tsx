import type { Component, JSX } from 'solid-js'
import type { MarkstreamVirtualMetrics, MarkstreamVirtualState } from '../types/node-renderer-props'
import type { MarkstreamThreadVirtualState, MarkstreamTimelineItem, MarkstreamVirtualTimelineProps } from '../virtual-adapter'
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { Dynamic, isServer } from 'solid-js/web'
import { estimateMarkstreamTimelineItemHeight, getMarkstreamTimelineItemKey, useMarkstreamVirtualAdapter } from '../virtual-adapter'
import { NodeRenderer } from './NodeRenderer'

export interface MarkstreamVirtualTimelineHandle {
  captureThreadState: () => MarkstreamThreadVirtualState
  restoreThreadState: (state: MarkstreamThreadVirtualState) => void
  scrollToBottom: () => void
  scrollToIndex: (index: number, align?: 'start' | 'center' | 'end') => void
  scrollToOffset: (offset: number) => void
  getItemSize: (key: string) => number | undefined
  getTotalHeight: () => number
  getVisibleRange: () => {
    start: number
    end: number
  }
}
class TimelineFenwickTree {
  private tree: number[]
  total: number
  constructor(values: number[]) {
    this.tree = Array.from({ length: values.length + 1 }, () => 0)
    this.total = 0
    values.forEach((value, index) => this.add(index, value))
  }

  resize(count: number) {
    const needed = count + 1
    if (needed <= this.tree.length)
      return
    const oldLength = this.tree.length
    const oldCount = oldLength - 1
    const oldTotal = this.total
    this.tree.length = needed
    for (let cursor = oldLength; cursor < needed; cursor++) {
      const rangeStart = cursor - (cursor & -cursor)
      this.tree[cursor] = rangeStart < oldCount
        ? oldTotal - this.prefixSum(rangeStart)
        : 0
    }
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
export function MarkstreamVirtualTimeline<T = MarkstreamTimelineItem>(props: MarkstreamVirtualTimelineProps<T> & {
  class?: string
  style?: JSX.CSSProperties
  ref?: (handle: MarkstreamVirtualTimelineHandle) => void
  renderItem?: (item: T, index: number) => JSX.Element
  onHeightChange?: (payload: {
    itemKey: string
    metrics: MarkstreamVirtualMetrics
  }) => void
  onVirtualStateChange?: (payload: {
    itemKey: string
    state: MarkstreamVirtualState
  }) => void
  onThreadStateChange?: (state: MarkstreamThreadVirtualState) => void
  onRangeChange?: (range: {
    start: number
    end: number
  }) => void
}): JSX.Element {
  let root!: HTMLDivElement
  const [restorePaint, setRestorePaint] = createSignal(false)
  let restoreFrame: number | undefined
  let restoreTimer: ReturnType<typeof setTimeout> | undefined
  let destroyed = false
  const [scrollTop, setScrollTop] = createSignal(0)
  const [viewportHeight, setViewportHeight] = createSignal(800)
  const [sizeRevision, setSizeRevision] = createSignal(0)
  const measured = new Map<string, number>()
  const threads = new Map<string, MarkstreamThreadVirtualState>()
  interface Record {
    key: string
    index: number
    size: number
  }
  let cached: {
    records: Record[]
    byKey: Map<string, Record>
    tree: TimelineFenwickTree
  } | undefined
  let structuralKey = ''
  const layout = createMemo(() => {
    const items = props.items
    const token = `${props.threadKey ?? ''}:${props.layoutRevision ?? ''}:${items.length}:${props.measurementKey ?? ''}`
    if (props.layoutRevision != null && token === structuralKey && cached)
      return cached
    const records = items.map((item, index) => {
      const key = getMarkstreamTimelineItemKey(item, index, props)
      const previous = cached?.byKey.get(key)
      const size = measured.get(key) ?? estimateMarkstreamTimelineItemHeight(item, index, props)
      return previous?.index === index && previous.size === size ? previous : { key, index, size }
    })
    structuralKey = token
    cached = { records, byKey: new Map(records.map(record => [record.key, record])), tree: new TimelineFenwickTree(records.map(record => record.size)) }
    return cached
  })
  const window = createMemo(() => {
    sizeRevision()
    const value = layout()
    if (isServer)
      return { start: 0, end: value.records.length }
    const overscan = props.overscanPx ?? 1200
    return { start: Math.max(0, value.tree.lowerBound(Math.max(0, scrollTop() - overscan), 'gt') - (props.overscan ?? 1)), end: Math.min(value.records.length, value.tree.lowerBound(scrollTop() + viewportHeight() + overscan, 'gt') + (props.overscan ?? 1) + 1) }
  })
  const visible = createMemo(() => layout().records.slice(window().start, window().end))
  const adapter = useMarkstreamVirtualAdapter<T>({
    items: () => props.items,
    threadKey: () => props.threadKey,
    layoutRevision: () => props.layoutRevision,
    getKey: props.getKey,
    getKind: props.getKind,
    getContent: props.getContent,
    getFinal: props.getFinal,
    getRevision: props.getRevision,
    estimateItemHeight: props.estimateItemHeight,
    markdownMode: () => props.markdownMode ?? 'docs',
    markdownFade: props.markdownFade,
    renderCodeBlocksAsPre: () => props.renderCodeBlocksAsPre,
    measurementKey: () => props.measurementKey,
    preserveScrollAnchor: true,
    debug: props.debug,
    virtualizer: {
      getScrollElement: () => root,
      getScrollTop: () => root?.scrollTop ?? 0,
      setScrollTop(value) {
        if (root) {
          root.scrollTop = value
          setScrollTop(root.scrollTop)
        }
      },
      getViewportHeight: viewportHeight,
      getTotalHeight: () => layout().tree.total,
      getItemOffset: key => layout().tree.prefixSum(layout().byKey.get(key)?.index ?? 0),
      getItemSize: key => layout().byKey.get(key)?.size ?? 0,
      setItemSize(key, size) {
        const value = layout()
        const record = value.byKey.get(key)
        if (!record || record.size === size)
          return
        measured.set(key, size)
        value.tree.add(record.index, size - record.size)
        record.size = size
        setSizeRevision(value => value + 1)
      },
      getVisibleRange: window,
      scrollToOffset: (value) => {
        if (root) {
          root.scrollTop = value
          setScrollTop(root.scrollTop)
        }
      },
      scrollToIndex: (index, align = 'start') => {
        const target = Math.max(0, Math.min(props.items.length - 1, index))
        const record = layout().records[target]
        const offset = layout().tree.prefixSum(target)
        if (root)
          root.scrollTop = offset - (align === 'center' ? (viewportHeight() - (record?.size ?? 0)) / 2 : align === 'end' ? viewportHeight() - (record?.size ?? 0) : 0)
      },
    },
  })
  function saveState() {
    const state = adapter.captureThreadState()
    threads.set(state.threadKey ?? '', state)
    props.onThreadStateChange?.(state)
  }
  const handle: MarkstreamVirtualTimelineHandle = {
    captureThreadState: adapter.captureThreadState,
    restoreThreadState: restoreWithPaint,
    scrollToBottom() {
      if (root) {
        root.scrollTop = layout().tree.total
        setScrollTop(root.scrollTop)
      }
    },
    scrollToOffset(offset) {
      if (root) {
        root.scrollTop = offset
        setScrollTop(root.scrollTop)
      }
    },
    scrollToIndex(index, align = 'start') {
      const target = Math.max(0, Math.min(props.items.length - 1, index))
      const record = layout().records[target]
      const offset = layout().tree.prefixSum(target)
      handle.scrollToOffset(offset - (align === 'center' ? (viewportHeight() - (record?.size ?? 0)) / 2 : align === 'end' ? viewportHeight() - (record?.size ?? 0) : 0))
    },
    getItemSize: key => layout().byKey.get(key)?.size,
    getTotalHeight: () => layout().tree.total,
    getVisibleRange: window,
  }
  function restoreWithPaint(state: MarkstreamThreadVirtualState) {
    if (restoreFrame != null)
      cancelAnimationFrame(restoreFrame)
    clearTimeout(restoreTimer)
    setRestorePaint(true)
    adapter.restoreThreadState(state)
    let stableFrames = 0
    const finish = () => {
      if (restoreFrame != null)
        cancelAnimationFrame(restoreFrame)
      clearTimeout(restoreTimer)
      setRestorePaint(false)
    }
    const check = () => {
      if (destroyed)
        return
      const viewport = root.getBoundingClientRect()
      const pending = [...root.querySelectorAll<HTMLElement>('[data-markstream-pending="true"]')].some((element) => {
        const box = element.getBoundingClientRect()
        return box.bottom >= viewport.top && box.top <= viewport.bottom
      })
      stableFrames = !pending && !adapter.isRestoringThread() ? stableFrames + 1 : 0
      if (stableFrames >= 2)
        finish()
      else
        restoreFrame = requestAnimationFrame(check)
    }
    restoreFrame = requestAnimationFrame(check)
    if (typeof props.restoreMaxLoadingMs === 'number' && props.restoreMaxLoadingMs > 0)
      restoreTimer = setTimeout(finish, props.restoreMaxLoadingMs)
  }
  onCleanup(() => {
    destroyed = true
    if (restoreFrame != null)
      cancelAnimationFrame(restoreFrame)
    clearTimeout(restoreTimer)
  })
  let wasNearBottom = true
  onMount(() => {
    props.ref?.(handle)
    const observer = new ResizeObserver(() => {
      setViewportHeight(root.clientHeight)
      if (props.stickToBottom !== false && (props.stickToBottom === true || wasNearBottom))
        handle.scrollToBottom()
    })
    observer.observe(root)
    setViewportHeight(root.clientHeight)
    createEffect(() => {
      const count = props.items.length
      sizeRevision()
      if (count && props.stickToBottom !== false && (props.stickToBottom === true || wasNearBottom))
        queueMicrotask(() => handle.scrollToBottom())
    })
    let previousThread = String(props.threadKey ?? '')
    createEffect(() => {
      const thread = String(props.threadKey ?? '')
      const initial = props.initialThreadState
      if (thread !== previousThread) {
        measured.clear()
        previousThread = thread
        handle.scrollToOffset(0)
      }
      const state = initial?.threadKey === thread ? initial : threads.get(thread)
      if (state)
        restoreWithPaint(state)
    })
    onCleanup(() => observer.disconnect())
  })
  createEffect(() => {
    const range = window()
    props.onRangeChange?.(range)
    if (props.debug)
      console.info('[markstream-solid][timeline] range', range)
  })
  const Row = (rowProps: {
    record: Record
  }) => {
    let element!: HTMLDivElement
    const item = () => props.items[rowProps.record.index]
    onMount(() => {
      createEffect(() => {
        const current = item()
        adapter.measureItem(current, rowProps.record.index, element)
        onCleanup(() => adapter.unobserveItem(rowProps.record.key))
      })
    })
    const markdown = createMemo(() => adapter.markdownProps(item(), rowProps.record.index))
    return (
      <div ref={element} class="markstream-timeline-item" data-item-key={rowProps.record.key}>
        <Show when={adapter.isMarkdownItem(item(), rowProps.record.index)} fallback={props.renderItem ? props.renderItem(item(), rowProps.record.index) : (item() as MarkstreamTimelineItem).component ? <Dynamic component={(item() as MarkstreamTimelineItem).component as Component<any>} item={item()} index={rowProps.record.index} /> : <div class="markstream-timeline-default">{String((item() as MarkstreamTimelineItem).text ?? (item() as MarkstreamTimelineItem).label ?? (item() as MarkstreamTimelineItem).content ?? '')}</div>}>
          <NodeRenderer
            {...markdown()}
            onHeightChange={(metrics) => {
              markdown().onHeightChange(metrics)
              props.onHeightChange?.({ itemKey: rowProps.record.key, metrics })
            }}
            onVirtualStateChange={(state) => {
              markdown().onVirtualStateChange(state)
              props.onVirtualStateChange?.({ itemKey: rowProps.record.key, state })
            }}
          />
        </Show>
      </div>
    )
  }
  return (
    <div
      ref={root}
      class={`markstream-virtual-timeline ${props.class ?? ''}`}
      data-markstream-virtual-timeline="1"
      classList={{ 'is-restoring-thread': restorePaint() }}
      aria-busy={restorePaint()}
      style={{ 'overflow': 'auto', 'overflow-anchor': 'none', 'position': 'relative', 'height': '100%', ...props.style }}
      onScroll={() => {
        setScrollTop(root.scrollTop)
        wasNearBottom = layout().tree.total - root.scrollTop - root.clientHeight <= 48
        saveState()
      }}
    >
      <div aria-hidden="true" style={{ height: `${(sizeRevision(), layout().tree.prefixSum(window().start))}px` }} />
      <For each={visible()}>{record => <Row record={record} />}</For>
      <div aria-hidden="true" style={{ height: `${(sizeRevision(), layout().tree.total - layout().tree.prefixSum(window().end))}px` }} />
    </div>
  )
}
