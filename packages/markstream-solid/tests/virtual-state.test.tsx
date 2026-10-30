import type { MarkstreamRendererHandle } from '../src'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MarkdownRender, { defineHtmlComponents, defineStreamingComponents, MarkstreamVirtualTimeline } from '../src'

let dispose: (() => void) | undefined
let host: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() { }
    disconnect() { }
  })
  host = document.createElement('div')
  document.body.append(host)
})
afterEach(() => {
  dispose?.()
  dispose = undefined
  host.remove()
  vi.unstubAllGlobals()
})
const content = Array.from({ length: 500 }, (_, index) => `Paragraph ${index}`).join('\n\n')
describe('vue 3 renderer options and virtual state parity', () => {
  it('supports mode defaults and minimal DOM with explicit opt-outs', () => {
    const [props, update] = createSignal<any>({ content: 'hello **world**', final: true, mode: 'minimal', smoothStreaming: false, batchRendering: false, maxLiveNodes: 0, domMode: 'minimal' })
    dispose = render(() => <MarkdownRender {...props()} />, host)
    expect(host.querySelectorAll('.node-slot')).toHaveLength(0)
    expect(host.querySelector('strong')?.textContent).toBe('world')
    update((previous: any) => ({ ...previous, nodeVirtual: true, maxLiveNodes: 20 }))
    expect(host.querySelector('.virtualized')).not.toBeNull()
    expect(host.querySelectorAll('.node-slot')).toHaveLength(1)
  })
  it('automatically windows finalized chat history but honors an explicit maxLiveNodes=0', () => {
    const [maxLiveNodes, update] = createSignal<number | undefined>()
    dispose = render(() => <MarkdownRender content={content} final mode="chat" maxLiveNodes={maxLiveNodes()} smoothStreaming={false} batchRendering={false} />, host)
    expect(host.querySelectorAll('.node-slot').length).toBeLessThanOrEqual(50)
    update(0)
    expect(host.querySelectorAll('.node-slot')).toHaveLength(500)
  })
  it('captures compatible measured heights, invalidates layout caches and exposes scroll/settle handles', async () => {
    let handle!: MarkstreamRendererHandle
    const [key, setKey] = createSignal('font-1')
    dispose = render(() => <MarkdownRender ref={value => handle = value} content={content} final smoothStreaming={false} batchRendering={false} viewportPriority={false} maxLiveNodes={20} virtualScroll={{ enabled: true, sessionKey: 'doc', measurementKey: key() }} />, host)
    const root = host.querySelector('.markdown-renderer') as HTMLElement
    Object.defineProperty(root, 'clientWidth', { value: 640, configurable: true })
    for (const slot of root.querySelectorAll<HTMLElement>('.node-slot'))
      vi.spyOn(slot, 'getBoundingClientRect').mockReturnValue({ width: 640, height: 40, top: 0, bottom: 40, left: 0, right: 640, x: 0, y: 0, toJSON() { } })
    await handle.forceMeasure()
    expect(handle.getVirtualMetrics().nodeCount).toBe(500)
    const state = handle.captureVirtualState({ allowFallbackAnchor: true })!
    expect(state.heightCache!.length).toBeGreaterThan(0)
    expect(state.heightCache![0].signature).toMatch(/paragraph:/)
    handle.scrollToNode(400)
    expect(host.textContent).toContain('Paragraph 400')
    setKey('font-2')
    const before = handle.getVirtualMetrics().measuredCount
    handle.restoreVirtualState(state, { restoreAnchor: true, allowUncapturedAnchor: true })
    expect(handle.getVirtualMetrics().measuredCount).toBe(before)
    const settled = await handle.settle({ frames: 1, timeoutMs: 100 })
    expect(settled.final).toBe(true)
  })
  it('defers a restore until width is known and rejects later structural changes', async () => {
    let handle!: MarkstreamRendererHandle
    const initial = { type: 'paragraph', raw: 'unchanged raw', children: [{ type: 'text', content: 'initial' }] }
    const [nodes, update] = createSignal<any[]>([initial])
    dispose = render(() => <MarkdownRender ref={value => handle = value} nodes={nodes()} final batchRendering={false} viewportPriority={false} maxLiveNodes={0} virtualScroll={{ enabled: true, sessionKey: 'width' }} />, host)
    const root = host.querySelector('.markdown-renderer') as HTMLElement
    Object.defineProperty(root, 'clientWidth', { value: 640, configurable: true })
    const slot = root.querySelector('.node-slot')!
    vi.spyOn(slot, 'getBoundingClientRect').mockReturnValue({ width: 640, height: 40, top: 0, bottom: 40, left: 0, right: 640, x: 0, y: 0, toJSON() { } })
    await handle.forceMeasure()
    const state = handle.captureVirtualState({ allowFallbackAnchor: true })!
    expect(state.heightCache).toHaveLength(1)
    Object.defineProperty(root, 'clientWidth', { value: 0, configurable: true })
    update([{ ...initial, children: [{ type: 'text', content: 'initial' }] }])
    handle.restoreVirtualState(state)
    expect(handle.getVirtualMetrics().measuredCount).toBe(0)
    Object.defineProperty(root, 'clientWidth', { value: 640, configurable: true })
    await handle.forceMeasure()
    expect(handle.getVirtualMetrics().measuredCount).toBeGreaterThan(0)
    update([{ ...initial, children: [{ type: 'text', content: 'changed child with identical raw' }] }])
    handle.restoreVirtualState(state)
    expect(handle.getVirtualMetrics().measuredCount).toBe(0)
  })
  it('keeps a restored bottom anchor through late height changes until the user scrolls away', async () => {
    let handle!: MarkstreamRendererHandle
    const scroller = document.createElement('div')
    host.append(scroller)
    Object.defineProperty(scroller, 'clientHeight', { value: 100 })
    dispose = render(() => <MarkdownRender ref={value => handle = value} content={'one\n\ntwo\n\nthree'} final smoothStreaming={false} batchRendering={false} viewportPriority={false} maxLiveNodes={0} virtualScroll={{ enabled: true, sessionKey: 'bottom', scrollRoot: scroller }} />, scroller)
    const root = scroller.querySelector('.markdown-renderer') as HTMLElement
    Object.defineProperty(root, 'clientWidth', { value: 640 })
    let height = 40
    for (const slot of root.querySelectorAll<HTMLElement>('.node-slot'))
      vi.spyOn(slot, 'getBoundingClientRect').mockImplementation(() => ({ width: 640, height, top: 0, bottom: height, left: 0, right: 640, x: 0, y: 0, toJSON() { } }))
    vi.spyOn(root, 'getBoundingClientRect').mockImplementation(() => ({ width: 640, height: handle.getVirtualMetrics().totalHeight, top: -scroller.scrollTop, bottom: handle.getVirtualMetrics().totalHeight - scroller.scrollTop, left: 0, right: 640, x: 0, y: -scroller.scrollTop, toJSON() { } }))
    await handle.forceMeasure()
    const state = handle.captureVirtualState()!
    expect(state.anchor?.type).toBe('bottom')
    handle.restoreVirtualState(state, { restoreAnchor: true })
    height = 80
    await handle.forceMeasure()
    expect(scroller.scrollTop).toBeCloseTo(120)
    scroller.scrollTop = 0
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }))
    height = 100
    await handle.forceMeasure()
    expect(scroller.scrollTop).toBe(0)
  })
  it('registers parser-aware streaming components separately from plain HTML components', () => {
    const streaming = defineStreamingComponents({ thinking: (props: any) => <aside data-thinking>{props.node.content}</aside> })
    const html = defineHtmlComponents({ p: (props: any) => <section data-html>{props.children}</section> })
    dispose = render(() => <MarkdownRender content={'<thinking>reasoning</thinking>\n\n**body**'} final smoothStreaming={false} batchRendering={false} streamingComponents={streaming} htmlComponents={html} />, host)
    expect(host.querySelector('[data-thinking]')?.textContent).toContain('reasoning')
    expect(host.querySelector('section[data-html] strong')?.textContent).toBe('body')
  })
  it('installs custom Markdown-it callbacks once per parser configuration while streaming', () => {
    const customize = vi.fn(md => md)
    const [source, setSource] = createSignal('one')
    dispose = render(() => <MarkdownRender content={source()} final={false} smoothStreaming={false} customMarkdownIt={customize} />, host)
    setSource('one two')
    setSource('one two three')
    expect(customize).toHaveBeenCalledTimes(1)
    expect(host.textContent).toBe('one two three')
  })
  it('caps timeline restoration loading and clears its scheduled work on unmount', async () => {
    vi.useFakeTimers()
    try {
      let timeline: any
      dispose = render(() => <MarkstreamVirtualTimeline ref={value => timeline = value} items={[{ id: 1, kind: 'user-message', text: 'history' }]} stickToBottom={false} restoreMaxLoadingMs={5} />, host)
      timeline.restoreThreadState(timeline.captureThreadState())
      expect(host.querySelector('[data-markstream-virtual-timeline]')?.getAttribute('aria-busy')).toBe('true')
      await vi.advanceTimersByTimeAsync(5)
      expect(host.querySelector('[data-markstream-virtual-timeline]')?.getAttribute('aria-busy')).toBe('false')
      dispose?.()
      dispose = undefined
      await vi.runAllTimersAsync()
      expect(vi.getTimerCount()).toBe(0)
    }
    finally {
      vi.useRealTimers()
    }
  })
  it('renders a bounded outer conversation window and exposes timeline navigation', () => {
    let timeline: any
    const items = Array.from({ length: 1000 }, (_, index) => ({ id: index, kind: 'user-message', text: `Message ${index}` }))
    dispose = render(() => <MarkstreamVirtualTimeline ref={value => timeline = value} items={items} estimateItemHeight={() => 50} overscanPx={0} overscan={1} stickToBottom={false} style={{ height: '400px' }} />, host)
    expect(host.querySelectorAll('.markstream-timeline-item').length).toBeLessThan(30)
    timeline.scrollToIndex(900)
    expect(host.textContent).toContain('Message 900')
    expect(timeline.getTotalHeight()).toBe(50000)
    const state = timeline.captureThreadState()
    expect(state.itemHeights).toBeDefined()
  })
})
