import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { removeCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'
import { flushAll } from './setup/flush-all'

class CountingResizeObserver {
  static constructorCalls = 0
  static observeCalls = 0

  constructor() {
    CountingResizeObserver.constructorCalls += 1
  }

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

function createCodeFence(index: number, lineCount: number) {
  const lines = Array.from({ length: lineCount }, (_, index) => `console.log(${index + 1})`)
  return `\`\`\`js\n// block ${index}\n${lines.join('\n')}\n\`\`\``
}

function createMarkdownWithOpenCodeBlock(tailLineCount: number) {
  const lines = Array.from({ length: tailLineCount }, (_, index) => `console.log(${index + 1})`)
  return `${createCodeFence(1, 10)}\n\n\`\`\`js\n// tail\n${lines.join('\n')}`
}

function createTwoParagraphMarkdown(first: string, second: string) {
  return `${first}\n\n${second}`
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

  it('disables node virtualization when nodeVirtual is false', async () => {
    CountingResizeObserver.observeCalls = 0
    vi.stubGlobal('ResizeObserver', CountingResizeObserver as any)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: Array.from({ length: 6 }, (_, index) => createParagraph(index)),
        viewportPriority: false,
        maxLiveNodes: 2,
        nodeVirtual: false,
      },
    })

    await flushAll()

    expect(wrapper.classes()).not.toContain('virtualized')
    expect(wrapper.findAll('.node-slot')).toHaveLength(6)
    expect(CountingResizeObserver.observeCalls).toBe(0)
    wrapper.unmount()
  })

  it('still measures node heights when virtualization is on', async () => {
    CountingResizeObserver.constructorCalls = 0
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
    expect(CountingResizeObserver.constructorCalls).toBe(1)
    wrapper.unmount()
  })

  it('updates deferred fallback heights when the renderer container resizes', async () => {
    const platform = installManualMeasurementPlatform()
    let width = 320
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const content = Array.from({ length: 41 }, (_, index) => {
      return `Paragraph ${index} ${'x'.repeat(240)}`
    }).join('\n\n')
    const wrapper = mount(NodeRenderer, {
      props: {
        content,
        final: true,
        fade: false,
      },
    })

    await flushAll()

    const state = setupState(wrapper)
    const narrowHeight = state.getFallbackNodeHeight(40)
    const resize = platform.resizeCallbacks.get(wrapper.element)
    expect(resize).toBeTypeOf('function')

    width = 960
    resize?.([], {} as ResizeObserver)
    await nextTick()

    expect(state.getFallbackNodeHeight(40)).toBeLessThan(narrowHeight)
    wrapper.unmount()
  })

  it('does not cache the container width without ResizeObserver', async () => {
    vi.stubGlobal('ResizeObserver', undefined)
    let width = 320
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        content: Array.from({ length: 41 }, (_, index) => {
          return `Paragraph ${index} ${'x'.repeat(240)}`
        }).join('\n\n'),
        final: true,
        fade: false,
      },
    })

    await flushAll()

    const state = setupState(wrapper)
    const narrowHeight = state.getFallbackNodeHeight(40)
    width = 960

    expect(state.getFallbackNodeHeight(40)).toBeLessThan(narrowHeight)
    wrapper.unmount()
  })

  it('reuses stable estimated height entries after unrelated measurements', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 640)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const nodes = Array.from({ length: 4 }, (_, index) => createCodeBlock(index + 1))
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes,
        renderCodeBlocksAsPre: true,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'estimated-height-cache-reuse',
        },
      },
    })

    await flushAll()

    const state = setupState(wrapper)
    const readEstimates = () => {
      const estimates = state.estimatedNodeHeights
      return Array.isArray(estimates) ? estimates : estimates.value
    }
    const firstEstimate = readEstimates()[0]

    expect(firstEstimate?.kind).toBe('code-block')

    state.recordNodeHeight(3, 240)
    await flushVueOnly()

    expect(readEstimates()[0]).toBe(firstEstimate)
    wrapper.unmount()
  })

  it('recomputes pre estimates when runtime visual props change', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 640)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createCodeBlock(1)],
        renderCodeBlocksAsPre: true,
        viewportPriority: false,
        codeBlockOptions: {
          fontSize: 12,
          lineHeight: 18,
          fontFamily: 'monospace',
          padding: 8,
          maxHeight: 500,
          tabSize: 4,
          overflow: 'wrap',
          diffStyle: 'split',
        },
        virtualScroll: {
          enabled: true,
          sessionKey: 'estimated-height-visual-props',
        },
      },
    })

    await flushAll()
    const state = setupState(wrapper)
    const readEstimate = () => {
      const estimates = state.estimatedNodeHeights
      return (Array.isArray(estimates) ? estimates : estimates.value)[0]
    }
    const initial = readEstimate()

    await wrapper.setProps({
      codeBlockOptions: {
        fontSize: 20,
        lineHeight: 32,
        fontFamily: 'Courier New',
        padding: 16,
        maxHeight: 240,
        tabSize: 8,
        overflow: 'scroll',
        diffStyle: 'unified',
      },
    })
    await flushVueOnly()
    const visualUpdate = readEstimate()
    expect(visualUpdate).not.toBe(initial)
    expect(visualUpdate.height).not.toBe(initial.height)

    await wrapper.setProps({
      codeBlockProps: {
        showHeader: false,
        showCopyButton: false,
        showLineNumbers: false,
      },
    })
    await flushVueOnly()
    const headerUpdate = readEstimate()
    expect(headerUpdate).not.toBe(visualUpdate)
    expect(headerUpdate.height).toBeLessThan(visualUpdate.height)

    wrapper.unmount()
  })

  it('passes estimated content height to pre blocks without duplicating header height', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 320)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const nodes = [
      createCodeBlock(1),
      {
        ...createCodeBlock(2),
        code: Array.from({ length: 80 }, (_, index) => `console.log(${index})`).join('\n'),
      },
    ]
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes,
        renderCodeBlocksAsPre: true,
        viewportPriority: false,
        codeBlockProps: { showHeader: true },
        virtualScroll: {
          enabled: true,
          sessionKey: 'estimated-pre-content-height',
        },
      },
    })

    await flushAll()
    const state = setupState(wrapper)
    const readItems = () => Array.isArray(state.renderedItems)
      ? state.renderedItems
      : state.renderedItems.value
    const readEstimates = () => Array.isArray(state.estimatedNodeHeights)
      ? state.estimatedNodeHeights
      : state.estimatedNodeHeights.value

    for (const [index, item] of readItems().entries()) {
      const estimate = readEstimates()[index]
      expect(estimate.kind).toBe('code-block')
      expect(estimate.height - estimate.contentHeight).toBe(37)
      expect(item.bindings.reservedHeightPx).toBe(estimate.contentHeight)
    }

    await wrapper.setProps({ codeBlockProps: { showHeader: false } })
    await flushVueOnly()

    for (const [index, item] of readItems().entries()) {
      const estimate = readEstimates()[index]
      expect(estimate.height).toBe(estimate.contentHeight)
      expect(item.bindings.reservedHeightPx).toBe(estimate.contentHeight)
    }

    wrapper.unmount()
  })

  it('recomputes estimated heights when custom code block components change', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 640)

    const customId = 'estimated-height-custom-components'
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        nodes: [createCodeBlock(1)],
        renderCodeBlocksAsPre: true,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'estimated-height-custom-components',
        },
      },
    })

    try {
      await flushAll()

      const state = setupState(wrapper)
      const readEstimates = () => {
        const estimates = state.estimatedNodeHeights
        return Array.isArray(estimates) ? estimates : estimates.value
      }

      expect(readEstimates()[0]?.kind).toBe('code-block')

      setCustomComponents(customId, {
        code_block: defineComponent({
          template: '<div data-custom-code-block="1" />',
        }),
      })
      await flushVueOnly()

      expect(readEstimates()[0]).toBe(null)
    }
    finally {
      wrapper.unmount()
      removeCustomComponents(customId)
    }
  })

  it('recomputes estimated heights from dirtyStart when node count is unchanged', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 640)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        content: createMarkdownWithOpenCodeBlock(10),
        renderCodeBlocksAsPre: true,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'estimated-height-dirty-start-same-count',
        },
      },
    })

    await flushAll()

    const state = setupState(wrapper)
    const readEstimates = () => {
      const estimates = state.estimatedNodeHeights
      return Array.isArray(estimates) ? estimates : estimates.value
    }
    const readDirtyStart = () => {
      return state.getParsedNodesDirtyStartIndex()
    }
    const initialEstimates = readEstimates()
    const initialPrefixEstimate = initialEstimates[0]
    const initialTailEstimate = initialEstimates[1]
    const initialVirtualState = (wrapper.vm as any).captureVirtualState()

    expect(initialPrefixEstimate?.kind).toBe('code-block')
    expect(initialTailEstimate?.kind).toBe('code-block')
    expect(initialVirtualState?.contentHash).toBeTruthy()

    await wrapper.setProps({ content: createMarkdownWithOpenCodeBlock(40) })
    await flushAll()

    const updatedEstimates = readEstimates()
    const updatedVirtualState = (wrapper.vm as any).captureVirtualState()

    expect(updatedEstimates).toHaveLength(initialEstimates.length)
    expect(readDirtyStart()).toBe(1)
    expect(updatedEstimates[0]).toStrictEqual(initialPrefixEstimate)
    expect(updatedEstimates[1]).not.toBe(initialTailEstimate)
    expect(updatedVirtualState?.contentHash).not.toBe(initialVirtualState?.contentHash)

    wrapper.unmount()
  })

  it('does not reuse stale virtual content hash prefixes across skipped revisions', async () => {
    installManualMeasurementPlatform()

    const initialContent = createTwoParagraphMarkdown('Prefix A', 'Tail A')
    const skippedContent = createTwoParagraphMarkdown('Prefix B', 'Tail A')
    const finalContent = createTwoParagraphMarkdown('Prefix B', 'Tail B')
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        content: initialContent,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'virtual-content-hash-skipped-revisions',
        },
      },
    })

    await nextTick()
    const initialState = (wrapper.vm as any).captureVirtualState()
    expect(initialState?.contentHash).toBeTruthy()

    await wrapper.setProps({ content: skippedContent })
    await nextTick()
    await wrapper.setProps({ content: finalContent })
    await nextTick()

    const updatedHash = (wrapper.vm as any).captureVirtualState()?.contentHash
    wrapper.unmount()

    const freshWrapper = mount(NodeRenderer, {
      props: {
        content: finalContent,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'virtual-content-hash-skipped-revisions-fresh',
        },
      },
    })

    await nextTick()
    const freshHash = (freshWrapper.vm as any).captureVirtualState()?.contentHash

    expect(updatedHash).toBe(freshHash)
    freshWrapper.unmount()
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
    state.setNodeContentRef(0, state.renderedItems[0].vnodeKey, element)
    await Promise.resolve()
    state.setNodeContentRef(0, state.renderedItems[0].vnodeKey, null)
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

    // Re-registering the same element + same parsed node is a no-op (the
    // renderer guards identical registrations to avoid re-measuring every
    // rendered node on every streaming commit), so simulate a real remount
    // with a null pass to force the measurement/observer re-registration.
    platform.heights.set(element, 40)
    state.setNodeContentRef(0, state.renderedItems[0].vnodeKey, null)
    state.setNodeContentRef(0, state.renderedItems[0].vnodeKey, element)
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
