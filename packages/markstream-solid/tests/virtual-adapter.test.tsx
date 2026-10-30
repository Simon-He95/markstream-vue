import { createRoot, createSignal } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMarkstreamVirtualAdapter } from '../src'

let dispose: (() => void) | undefined
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('ResizeObserver', class {
    observe() { }
    disconnect() { }
  })
})
afterEach(() => {
  dispose?.()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
function setup() {
  const initial = [{ id: 'a', kind: 'markdown', content: 'alpha', final: true }, { id: 'b', kind: 'markdown', content: 'beta', final: true }, { id: 'c', kind: 'markdown', content: 'gamma', final: true }]
  const [items, setItems] = createSignal(initial)
  const [thread, setThread] = createSignal('one')
  const [measurement, setMeasurement] = createSignal('font-1')
  const sizes = new Map([['a', 100], ['b', 100], ['c', 100]])
  let top = 150
  let adapter: any
  createRoot((cleanup) => {
    dispose = cleanup
    adapter = useMarkstreamVirtualAdapter({ items, threadKey: thread, measurementKey: measurement, virtualizer: {
      getScrollElement: () => null,
      getScrollTop: () => top,
      setScrollTop: value => top = value,
      getViewportHeight: () => 100,
      getTotalHeight: () => [...sizes.values()].reduce((sum, size) => sum + size, 0),
      getItemOffset: key => key === 'a' ? 0 : key === 'b' ? sizes.get('a')! : sizes.get('a')! + sizes.get('b')!,
      getItemSize: key => sizes.get(key)!,
      setItemSize: (key, size) => sizes.set(key, size),
      getVisibleRange: () => ({ start: top < sizes.get('a')! ? 0 : 1, end: 3 }),
      scrollToOffset: value => top = value,
      scrollToIndex: () => { },
    } })
  })
  const report = (callback: any, height: number) => callback({ sessionKey: 'one::a', threadKey: 'one', totalHeight: height, final: true, stable: true, phase: 'final', confidence: 'final' })
  return { adapter, items, setItems, setThread, setMeasurement, sizes, report, get top() {
    return top
  }, navigate(value: number) {
    top = value
  } }
}
describe('outer virtualizer state compatibility', () => {
  it('preserves the visible item anchor when a preceding Markdown item changes height', async () => {
    const value = setup()
    const props = value.adapter.markdownProps(value.items()[0], 0)
    value.report(props.onHeightChange, 200)
    await vi.advanceTimersByTimeAsync(20)
    expect(value.top).toBe(250)
    expect(value.adapter.itemHeights.get('a')).toBe(200)
  })
  it('does not shrink a streamed logical height from unsettled estimates', () => {
    const value = setup()
    const props = value.adapter.markdownProps(value.items()[0], 0)
    value.report(props.onHeightChange, 200)
    props.onHeightChange({ sessionKey: 'one::a', threadKey: 'one', totalHeight: 50, final: false, stable: false, phase: 'streaming', confidence: 'estimate' })
    expect(value.adapter.itemHeights.get('a')).toBe(200)
  })
  it('does not overwrite navigation with a previously queued measurement anchor', async () => {
    const value = setup()
    value.report(value.adapter.markdownProps(value.items()[0], 0).onHeightChange, 200)
    value.navigate(0)
    await vi.advanceTimersByTimeAsync(20)
    expect(value.top).toBe(0)
  })
  it('preserves the original anchor across multiple measurements in one frame', async () => {
    const value = setup()
    value.report(value.adapter.markdownProps(value.items()[0], 0).onHeightChange, 200)
    value.adapter.markdownProps(value.items()[1], 1).onHeightChange({ sessionKey: 'one::b', threadKey: 'one', totalHeight: 200, final: true, stable: true, phase: 'final', confidence: 'final' })
    await vi.advanceTimersByTimeAsync(20)
    expect(value.top).toBe(250)
  })
  it('rejects stale callbacks and persisted heights after an item is replaced', () => {
    const value = setup()
    const previous = value.adapter.markdownProps(value.items()[0], 0)
    value.report(previous.onHeightChange, 200)
    const state = value.adapter.captureThreadState()
    value.setItems(items => [{ ...items[0], content: 'replacement' }, ...items.slice(1)])
    expect(value.adapter.itemHeights.has('a')).toBe(false)
    value.report(previous.onHeightChange, 900)
    value.adapter.preloadThreadState(state)
    expect(value.adapter.itemHeights.has('a')).toBe(false)
  })
  it('isolates threads and drops scheduled anchor work on disposal', async () => {
    const value = setup()
    const previous = value.adapter.markdownProps(value.items()[0], 0)
    value.report(previous.onHeightChange, 200)
    value.setThread('two')
    await vi.advanceTimersByTimeAsync(20)
    expect(value.top).toBe(150)
    expect(value.adapter.itemHeights.size).toBe(0)
    value.report(previous.onHeightChange, 900)
    expect(value.adapter.itemHeights.size).toBe(0)
    value.adapter.dispose()
    await vi.runAllTimersAsync()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not restore anchors from an incompatible measurement configuration', async () => {
    const value = setup()
    const state = value.adapter.captureThreadState()
    state.outerAnchor = { type: 'item', itemKey: 'a', offsetWithinItemPx: 20 }
    value.setMeasurement('font-2')
    value.adapter.restoreThreadState(state)
    await vi.advanceTimersByTimeAsync(20)
    expect(value.top).toBe(150)
  })
})
