import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushAll } from './setup/flush-all'

class CountingResizeObserver {
  static observeCalls = 0

  observe() {
    CountingResizeObserver.observeCalls += 1
  }

  unobserve() {}
  disconnect() {}
}

function createParagraph(index: number, loading?: boolean) {
  const node: any = {
    type: 'paragraph',
    raw: `Paragraph ${index}`,
    children: [
      {
        type: 'text',
        content: `Paragraph ${index}`,
        raw: `Paragraph ${index}`,
      },
    ],
  }

  if (loading != null)
    node.loading = loading

  return node
}

function createCodeBlock(index: number) {
  return {
    type: 'code_block',
    language: 'js',
    code: `console.log(${index})`,
    raw: `\`\`\`js\nconsole.log(${index})\n\`\`\``,
    loading: false,
  }
}

function installManualMeasurementPlatform() {
  const frames: FrameRequestCallback[] = []
  const heights = new WeakMap<HTMLElement, number>()
  const resizeCallbacks = new WeakMap<Element, ResizeObserverCallback>()

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('ResizeObserver', class {
    callback: ResizeObserverCallback

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }

    observe(element: Element) {
      resizeCallbacks.set(element, this.callback)
    }

    unobserve() {}
    disconnect() {}
  })

  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
    return heights.get(this) ?? 0
  })

  return {
    heights,
    resizeCallbacks,
    flushFrames() {
      const pending = frames.splice(0)
      for (const callback of pending)
        callback(performance.now())
    },
  }
}

function setupState(wrapper: any) {
  return (wrapper.vm as any).$?.setupState as any
}

async function flushVueOnly() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

describe('node renderer measurement performance', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('skips node height observers when virtualization is off', async () => {
    CountingResizeObserver.observeCalls = 0
    vi.stubGlobal('ResizeObserver', CountingResizeObserver as any)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createCodeBlock(1)],
        viewportPriority: false,
      },
    })

    await flushAll()

    expect(CountingResizeObserver.observeCalls).toBe(0)
    wrapper.unmount()
  })

  it('still measures node heights when virtualization is on', async () => {
    CountingResizeObserver.observeCalls = 0
    vi.stubGlobal('ResizeObserver', CountingResizeObserver as any)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const nodes = Array.from({ length: 4 }, (_, index) => createParagraph(index + 1))
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes,
        maxLiveNodes: 1,
        viewportPriority: false,
      },
    })

    await flushAll()

    expect(CountingResizeObserver.observeCalls).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('drops pending node height records when the content ref is cleared before rAF flush', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        maxLiveNodes: 1,
        fade: false,
        viewportPriority: false,
      },
    })

    await flushAll()
    platform.flushFrames()

    const state = setupState(wrapper)
    const element = wrapper.get('.node-slot[data-node-index="0"] .node-content').element as HTMLElement
    const baselineHeight = state.getFallbackNodeHeight(0)

    platform.heights.set(element, 100)
    state.setNodeContentRef(0, element)
    await Promise.resolve()
    state.setNodeContentRef(0, null)
    platform.flushFrames()

    expect(state.getFallbackNodeHeight(0)).toBe(baselineHeight)
    wrapper.unmount()
  })

  it('keeps the largest pending loading height across one rAF batch', async () => {
    const platform = installManualMeasurementPlatform()
    const firstNode = createParagraph(1, true)
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [firstNode, createParagraph(2)],
        maxLiveNodes: 1,
        fade: false,
        viewportPriority: false,
      },
    })

    await flushAll()
    platform.flushFrames()

    const state = setupState(wrapper)
    const element = wrapper.get('.node-slot[data-node-index="0"] .node-content').element as HTMLElement
    const resize = platform.resizeCallbacks.get(element)

    platform.heights.set(element, 120)
    resize?.([], {} as ResizeObserver)
    firstNode.loading = false
    platform.heights.set(element, 80)
    resize?.([], {} as ResizeObserver)
    platform.flushFrames()

    expect(state.getFallbackNodeHeight(0)).toBe(120)
    wrapper.unmount()
  })

  it('allows nodes mode without final=true to shrink tail heights', async () => {
    const platform = installManualMeasurementPlatform()
    const firstNode = createParagraph(1)
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [firstNode, createParagraph(2)],
        maxLiveNodes: 1,
        fade: false,
        viewportPriority: false,
      },
    })

    await flushAll()
    platform.flushFrames()

    const state = setupState(wrapper)
    const element = wrapper.get('.node-slot[data-node-index="0"] .node-content').element as HTMLElement
    const resize = platform.resizeCallbacks.get(element)

    platform.heights.set(element, 120)
    resize?.([], {} as ResizeObserver)
    platform.heights.set(element, 80)
    resize?.([], {} as ResizeObserver)
    platform.flushFrames()

    expect(state.getFallbackNodeHeight(0)).toBe(80)
    wrapper.unmount()
  })

  it('allows static content without final=true to shrink tail heights', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        content: 'Paragraph 1\n\nParagraph 2',
        maxLiveNodes: 1,
        fade: false,
        viewportPriority: false,
      },
    })

    await flushAll()
    platform.flushFrames()

    const state = setupState(wrapper)
    const element = wrapper.get('.node-slot[data-node-index="0"] .node-content').element as HTMLElement
    const resize = platform.resizeCallbacks.get(element)

    platform.heights.set(element, 120)
    resize?.([], {} as ResizeObserver)
    platform.heights.set(element, 80)
    resize?.([], {} as ResizeObserver)
    platform.flushFrames()

    expect(state.getFallbackNodeHeight(0)).toBe(80)
    wrapper.unmount()
  })

  it('keeps the largest pending appended content tail height without a loading flag', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        content: 'Paragraph 1\n\nParagraph 2',
        maxLiveNodes: 1,
        fade: false,
        viewportPriority: false,
      },
    })

    await flushAll()
    platform.flushFrames()

    await wrapper.setProps({ content: 'Paragraph 1\n\nParagraph 2 plus streamed tail' })
    await flushAll()
    platform.flushFrames()

    const state = setupState(wrapper)
    const element = wrapper.get('.node-slot[data-node-index="0"] .node-content').element as HTMLElement
    const resize = platform.resizeCallbacks.get(element)

    platform.heights.set(element, 120)
    resize?.([], {} as ResizeObserver)
    platform.heights.set(element, 80)
    resize?.([], {} as ResizeObserver)
    platform.flushFrames()

    expect(state.getFallbackNodeHeight(0)).toBe(120)
    wrapper.unmount()
  })

  it('releases appended content tail height shrink guard after idle', async () => {
    vi.useFakeTimers()
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        content: 'Paragraph 1\n\nParagraph 2',
        maxLiveNodes: 1,
        fade: false,
        viewportPriority: false,
      },
    })

    await flushVueOnly()
    platform.flushFrames()

    await wrapper.setProps({ content: 'Paragraph 1\n\nParagraph 2 plus streamed tail' })
    await flushVueOnly()
    platform.flushFrames()

    const state = setupState(wrapper)
    const element = wrapper.get('.node-slot[data-node-index="0"] .node-content').element as HTMLElement
    const resize = platform.resizeCallbacks.get(element)

    platform.heights.set(element, 120)
    resize?.([], {} as ResizeObserver)
    platform.heights.set(element, 80)
    resize?.([], {} as ResizeObserver)
    platform.flushFrames()
    expect(state.getFallbackNodeHeight(0)).toBe(120)

    platform.heights.set(element, 70)
    await vi.advanceTimersByTimeAsync(1200)
    platform.flushFrames()

    expect(state.getFallbackNodeHeight(0)).toBe(70)
    wrapper.unmount()
  })

  it('allows streaming tail heights to shrink during final convergence', async () => {
    vi.useFakeTimers()
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        content: 'Paragraph 1\n\nParagraph 2',
        maxLiveNodes: 1,
        fade: false,
        viewportPriority: false,
      },
    })

    await flushVueOnly()
    platform.flushFrames()

    await wrapper.setProps({ content: 'Paragraph 1\n\nParagraph 2 plus streamed tail' })
    await flushVueOnly()
    platform.flushFrames()

    const state = setupState(wrapper)
    const element = wrapper.get('.node-slot[data-node-index="0"] .node-content').element as HTMLElement
    const resize = platform.resizeCallbacks.get(element)

    platform.heights.set(element, 200)
    resize?.([], {} as ResizeObserver)
    platform.flushFrames()
    expect(state.getFallbackNodeHeight(0)).toBe(200)

    platform.heights.set(element, 400)
    resize?.([], {} as ResizeObserver)
    platform.flushFrames()
    expect(state.getFallbackNodeHeight(0)).toBe(400)

    platform.heights.set(element, 300)
    resize?.([], {} as ResizeObserver)
    platform.flushFrames()
    expect(state.getFallbackNodeHeight(0)).toBe(400)

    await wrapper.setProps({ final: true })
    await flushVueOnly()
    const finalElement = wrapper.get('.node-slot[data-node-index="0"] .node-content').element as HTMLElement
    platform.heights.set(finalElement, 300)
    await vi.advanceTimersByTimeAsync(80)
    platform.flushFrames()

    expect(state.getFallbackNodeHeight(0)).toBe(300)
    wrapper.unmount()
  })

  it('remeasures newly mounted final nodes after a short delay', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        maxLiveNodes: 1,
        fade: false,
        viewportPriority: false,
      },
    })

    await flushAll()
    platform.flushFrames()

    const state = setupState(wrapper)
    const element = wrapper.get('.node-slot[data-node-index="0"] .node-content').element as HTMLElement

    platform.heights.set(element, 40)
    state.setNodeContentRef(0, element)
    await Promise.resolve()
    platform.flushFrames()
    expect(state.getFallbackNodeHeight(0)).toBe(40)

    platform.heights.set(element, 90)
    await new Promise(resolve => setTimeout(resolve, 90))
    platform.flushFrames()

    expect(state.getFallbackNodeHeight(0)).toBe(90)
    wrapper.unmount()
  })
})
