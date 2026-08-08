import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject, nextTick, onMounted, ref, watch } from 'vue'
import { removeCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'
import { MARKSTREAM_NODE_LIFECYCLE_KEY } from '../src/utils/nodeLifecycle'
import { flushAll } from './setup/flush-all'

function createParagraph(index: number) {
  return {
    type: 'paragraph',
    raw: `Paragraph ${index}`,
    children: [
      {
        type: 'text',
        content: `Paragraph ${index}`,
        raw: `Paragraph ${index}`,
      },
    ],
  } as any
}

function createLongListNode(mutated = false) {
  const items = Array.from({ length: 220 }, (_, index) => {
    const content = mutated && index === 190
      ? `Changed late item ${index}. ${'This should invalidate cached height. '.repeat(20)}`
      : `Item ${index}`

    return {
      type: 'list_item',
      raw: `- ${content}`,
      children: [
        {
          type: 'paragraph',
          raw: content,
          children: [
            {
              type: 'text',
              content,
              raw: content,
            },
          ],
        },
      ],
    }
  })

  return {
    type: 'list',
    ordered: false,
    raw: items.map(item => item.raw).join('\n'),
    items,
  } as any
}

function createCodeBlock(lineCount = 120) {
  const code = Array.from({ length: lineCount }, (_, index) => {
    return `console.log("line ${index + 1}")`
  }).join('\n')

  return {
    type: 'code_block',
    language: 'ts',
    code,
    raw: `\`\`\`ts\n${code}\n\`\`\``,
    loading: false,
  } as any
}

function makeSameShapeContent(seed: string) {
  return Array.from({ length: 120 }, (_, index) => {
    return [
      `## ${seed} heading ${index}`,
      `${seed} paragraph ${index} `.repeat(8),
    ].join('\n\n')
  }).join('\n\n')
}

function makeDefaultVirtualMeasurementKey(host = '') {
  return [
    host,
    [
      'light',
      'code-rich',
      'code-stream',
      ...Array.from({ length: 8 }, () => ''),
    ].join('\u0000'),
  ].join('\u0000')
}

async function flushQueuedAnimationFrames(
  frames: FrameRequestCallback[],
  count = 4,
) {
  for (let i = 0; i < count; i++) {
    await nextTick()
    const pending = frames.splice(0)
    for (const callback of pending)
      callback(performance.now())
  }
  await nextTick()
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

async function captureSeedHeightCache(
  NodeRenderer: any,
  heights: number[] = [400, 400],
) {
  const platform = installManualMeasurementPlatform()
  const wrapper = mount(NodeRenderer, {
    props: {
      nodes: heights.map((_, index) => createParagraph(index + 1)),
      final: true,
      fade: false,
      viewportPriority: false,
      virtualScroll: {
        enabled: true,
        sessionKey: 'seed-cache',
        settleMode: 'manual',
        emitIntervalMs: 0,
      },
    },
  })

  await flushAll()

  const contentEls = getRootNodeContentElements(wrapper.element)
  for (const [index, height] of heights.entries()) {
    const el = contentEls[index]
    if (!el)
      continue

    platform.heights.set(el, height)
    platform.resizeCallbacks.get(el)?.([], {} as ResizeObserver)
  }
  platform.flushFrames()
  await nextTick()
  await (wrapper.vm as any).forceMeasure('manual')

  const heightCache = (wrapper.vm as any).captureVirtualState()?.heightCache ?? []
  wrapper.unmount()
  return heightCache
}

function getRootNodeContentElements(root: Element) {
  return Array.from(root.children)
    .filter((el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains('node-slot'))
    .map(el => el.querySelector(':scope > .node-content') as HTMLElement | null)
    .filter((el): el is HTMLElement => Boolean(el))
}

function makeDomRect(top: number, height: number, width = 400) {
  return {
    x: 0,
    y: top,
    top,
    bottom: top + height,
    left: 0,
    right: width,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect
}

function installRendererBottomGeometry(
  wrapper: ReturnType<typeof mount>,
  scrollRoot: HTMLElement,
  getRendererHeight: () => number,
) {
  Object.defineProperty(wrapper.element, 'scrollHeight', {
    configurable: true,
    get: getRendererHeight,
  })

  vi.spyOn(scrollRoot, 'getBoundingClientRect').mockImplementation(() => {
    return makeDomRect(0, scrollRoot.clientHeight)
  })

  vi.spyOn(wrapper.element, 'getBoundingClientRect').mockImplementation(() => {
    const height = getRendererHeight()
    return makeDomRect(-scrollRoot.scrollTop, height)
  })
}

describe('node renderer virtual-scroll coordination', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  afterEach(() => {
    try {
      removeCustomComponents('virtual-lifecycle-test')
      removeCustomComponents('virtual-prefix-test')
    }
    catch {}
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uses actual sub-320px container width for virtual-scroll height probes', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default

    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function () {
      const el = this as HTMLElement
      if (el.classList?.contains('markdown-renderer'))
        return 280
      return 280
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'sub-320-probe-width',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()
    await nextTick()

    const probe = wrapper.element.querySelector('.height-estimation-probes') as HTMLElement | null
    expect(probe).toBeTruthy()
    expect(probe?.style.width).toBe('280px')
    expect(probe?.querySelector('[data-probe="paragraph"]')?.classList.contains('node-content-flow-root')).toBe(true)

    wrapper.unmount()
  })

  it('does not count height-estimation probe scrollHeight as empty virtual content height', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default

    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(0)
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function () {
      const el = this as HTMLElement
      return el.classList.contains('markdown-renderer') || el.classList.contains('height-estimation-probes')
        ? 548
        : 0
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const el = this as HTMLElement
      const height = el.classList.contains('height-estimation-probes') ? 548 : 0
      return makeDomRect(0, height, 800)
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'empty-probe-scroll-height',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()
    await nextTick()

    const metrics = (wrapper.vm as any).getVirtualMetrics()
    expect(metrics.nodeCount).toBe(0)
    expect(metrics.totalHeight).toBe(0)

    wrapper.unmount()
  })

  it('exposes logical height metrics and settled events for outer virtualizers', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          threadKey: 'thread-a',
          sessionKey: 'thread-a:message-1:1',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const contentEls = getRootNodeContentElements(wrapper.element)
    platform.heights.set(contentEls[0]!, 40)
    platform.heights.set(contentEls[1]!, 80)

    for (const el of contentEls)
      platform.resizeCallbacks.get(el)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()

    const handle = wrapper.vm as any
    const metrics = await handle.forceMeasure('manual')

    expect(metrics.sessionKey).toBe('thread-a:message-1:1')
    expect(metrics.threadKey).toBe('thread-a')
    expect(metrics.totalHeight).toBe(120)
    expect(metrics.measuredCount).toBe(2)
    expect(wrapper.emitted('height-change')?.at(-1)?.[0]).toMatchObject({
      sessionKey: 'thread-a:message-1:1',
      threadKey: 'thread-a',
      totalHeight: 120,
    })
    expect(wrapper.emitted('heightChange')).toBeUndefined()
    expect(wrapper.emitted('virtualStateChange')).toBeUndefined()
    expect(wrapper.emitted('anchorChange')).toBeUndefined()

    const state = handle.captureVirtualState()
    expect(state).toMatchObject({
      sessionKey: 'thread-a:message-1:1',
      threadKey: 'thread-a',
      heightCache: [
        { index: 0, height: 40 },
        { index: 1, height: 80 },
      ],
    })

    await new Promise(resolve => setTimeout(resolve, 90))
    platform.flushFrames()
    await nextTick()

    const settled = await handle.settle({ frames: 0, timeoutMs: 0, reason: 'manual' })
    expect(settled.phase).toBe('final')
    expect(settled.stable).toBe(true)
    expect(wrapper.emitted('render-settled')?.at(-1)?.[0]).toMatchObject({
      totalHeight: 120,
      stable: true,
    })
    expect(wrapper.emitted('renderSettled')).toBeUndefined()
    expect(wrapper.emitted('render-final')?.at(-1)?.[0]).toMatchObject({
      phase: 'final',
      totalHeight: 120,
    })
    expect(wrapper.emitted('renderFinal')).toBeUndefined()
    expect(wrapper.emitted('render-final')?.length ?? 0).toBe(1)

    await handle.forceMeasure('manual')
    platform.flushFrames()
    await nextTick()

    expect(wrapper.emitted('render-final')?.length ?? 0).toBe(1)

    await handle.settle({ frames: 0, timeoutMs: 0, reason: 'manual' })
    expect(wrapper.emitted('render-final')?.length ?? 0).toBe(1)

    wrapper.unmount()
  })

  it('emits light state when cache signature changes without total height change', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'balanced-cache-update',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const contentEls = getRootNodeContentElements(wrapper.element)
    expect(contentEls.length).toBe(2)

    platform.heights.set(contentEls[0]!, 40)
    platform.heights.set(contentEls[1]!, 80)

    for (const el of contentEls)
      platform.resizeCallbacks.get(el)?.([], {} as ResizeObserver)

    platform.flushFrames()
    await nextTick()

    await (wrapper.vm as any).forceMeasure('manual')

    const beforeEvents = wrapper.emitted('virtual-state-change') ?? []
    const beforeState = beforeEvents.at(-1)?.[0] as any

    expect(beforeState.heightCache).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ index: 0, height: 40 }),
        expect.objectContaining({ index: 1, height: 80 }),
      ]),
    )

    const beforeEventCount = beforeEvents.length

    platform.heights.set(contentEls[0]!, 60)
    platform.heights.set(contentEls[1]!, 60)

    for (const el of contentEls)
      platform.resizeCallbacks.get(el)?.([], {} as ResizeObserver)

    platform.flushFrames()
    await nextTick()
    platform.flushFrames()
    await nextTick()

    const afterEvents = wrapper.emitted('virtual-state-change') ?? []
    expect(afterEvents.length).toBeGreaterThan(beforeEventCount)

    const afterState = afterEvents.at(-1)?.[0] as any
    expect(afterState.metrics.totalHeight).toBe(120)
    expect(afterState.heightCache).toBeUndefined()

    const capturedState = (wrapper.vm as any).captureVirtualState()
    expect(capturedState.heightCache).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ index: 0, height: 60 }),
        expect.objectContaining({ index: 1, height: 60 }),
      ]),
    )

    wrapper.unmount()
  })

  it('flushes latest virtual state before unmount', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'thread-a:unmount-flush',
          threadKey: 'thread-a',
          settleMode: 'manual',
          emitIntervalMs: 1000,
        },
      },
    })

    await flushAll()

    const contentEls = getRootNodeContentElements(wrapper.element)
    expect(contentEls.length).toBe(2)

    platform.heights.set(contentEls[0]!, 48)
    platform.heights.set(contentEls[1]!, 96)

    for (const el of contentEls)
      platform.resizeCallbacks.get(el)?.([], {} as ResizeObserver)

    wrapper.unmount()

    const heightEvents = wrapper.emitted('height-change') ?? []
    expect(heightEvents.at(-1)?.[0]).toMatchObject({
      sessionKey: 'thread-a:unmount-flush',
      threadKey: 'thread-a',
      totalHeight: 144,
    })

    const stateEvents = wrapper.emitted('virtual-state-change') ?? []
    const lastState = stateEvents.at(-1)?.[0] as any

    expect(lastState).toMatchObject({
      sessionKey: 'thread-a:unmount-flush',
      threadKey: 'thread-a',
      metrics: {
        totalHeight: 144,
      },
    })

    expect(lastState.heightCache).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ index: 0, height: 48 }),
        expect.objectContaining({ index: 1, height: 96 }),
      ]),
    )
  })

  it('does not under-report non-virtualized coordinated height against mounted DOM', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [
          createParagraph(1),
          createParagraph(2),
          createParagraph(3),
        ],
        final: true,
        fade: false,
        viewportPriority: false,
        maxLiveNodes: 0,
        virtualScroll: {
          enabled: true,
          sessionKey: 'non-virtualized-dom-floor',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    Object.defineProperty(wrapper.element, 'scrollHeight', {
      configurable: true,
      get: () => 600,
    })
    Object.defineProperty(wrapper.element, 'offsetHeight', {
      configurable: true,
      get: () => 600,
    })

    await flushAll()

    const contentEls = getRootNodeContentElements(wrapper.element)
    expect(contentEls.length).toBe(3)

    platform.heights.set(contentEls[0]!, 40)
    platform.resizeCallbacks.get(contentEls[0]!)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()

    expect((wrapper.vm as any).getVirtualMetrics().totalHeight).toBe(600)

    for (const el of contentEls)
      platform.heights.set(el, 80)

    for (const el of contentEls)
      platform.resizeCallbacks.get(el)?.([], {} as ResizeObserver)

    platform.flushFrames()
    await nextTick()

    const metrics = await (wrapper.vm as any).forceMeasure('manual')
    expect(metrics.totalHeight).toBe(600)

    wrapper.unmount()
  })

  it('does not pin virtualized logical height to stale container scrollHeight', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default

    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 640)

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: Array.from({ length: 8 }, (_, index) => createParagraph(index + 1)),
        final: true,
        fade: false,
        viewportPriority: false,
        maxLiveNodes: 4,
        liveNodeBuffer: 0,
        virtualScroll: {
          enabled: true,
          sessionKey: 'virtualized-shrink',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    Object.defineProperty(wrapper.element, 'scrollHeight', {
      configurable: true,
      get: () => 1000,
    })
    Object.defineProperty(wrapper.element, 'offsetHeight', {
      configurable: true,
      get: () => 1000,
    })

    await flushAll()
    await nextTick()

    const contentEls = getRootNodeContentElements(wrapper.element)
    expect(contentEls.length).toBeGreaterThan(0)
    expect(contentEls.length).toBeLessThanOrEqual(4)

    for (const el of contentEls) {
      platform.heights.set(el, 40)
      platform.resizeCallbacks.get(el)?.([], {} as ResizeObserver)
    }

    platform.flushFrames()
    await nextTick()

    const metrics = await (wrapper.vm as any).forceMeasure('manual')

    expect(metrics.nodeCount).toBe(8)
    expect(metrics.totalHeight).toBe(272)
    expect(metrics.totalHeight).toBeLessThan(1000)

    wrapper.unmount()
  })

  it('estimates pre-rendered code block height for virtual-scroll coordination', async () => {
    installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default

    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 640)

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createCodeBlock(120)],
        final: true,
        fade: false,
        viewportPriority: false,
        renderCodeBlocksAsPre: true,
        virtualScroll: {
          enabled: true,
          sessionKey: 'pre-code-estimation',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()
    await nextTick()

    const metrics = await (wrapper.vm as any).forceMeasure('manual')

    expect(metrics.estimatedCount).toBe(1)
    expect(metrics.totalHeight).toBeGreaterThan(1000)

    wrapper.unmount()
  })

  it('allows logical totalHeight to shrink after measured heights shrink', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2), createParagraph(3)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'shrink-height-session',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    let staleDomHeight = 600
    Object.defineProperty(wrapper.element, 'scrollHeight', {
      configurable: true,
      get: () => staleDomHeight,
    })
    Object.defineProperty(wrapper.element, 'offsetHeight', {
      configurable: true,
      get: () => staleDomHeight,
    })

    await flushAll()

    const contentEls = getRootNodeContentElements(wrapper.element)
    expect(contentEls.length).toBe(3)

    for (const el of contentEls)
      platform.heights.set(el, 200)

    for (const el of contentEls)
      platform.resizeCallbacks.get(el)?.([], {} as ResizeObserver)

    platform.flushFrames()
    await nextTick()

    const first = await (wrapper.vm as any).forceMeasure('manual')
    expect(first.totalHeight).toBe(600)

    staleDomHeight = 240
    for (const el of contentEls)
      platform.heights.set(el, 80)

    for (const el of contentEls)
      platform.resizeCallbacks.get(el)?.([], {} as ResizeObserver)

    platform.flushFrames()
    await nextTick()

    const second = await (wrapper.vm as any).forceMeasure('manual')
    expect(second.totalHeight).toBe(240)
    expect(second.totalHeight).toBeLessThan(first.totalHeight)

    wrapper.unmount()
  })

  it('resets metrics state when virtualScroll.enabled toggles', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'toggle-session',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const contentEl = getRootNodeContentElements(wrapper.element)[0]!
    platform.heights.set(contentEl, 40)
    platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()
    await (wrapper.vm as any).forceMeasure('manual')

    const emittedBeforeToggle = wrapper.emitted('height-change')?.length ?? 0

    await wrapper.setProps({
      virtualScroll: {
        enabled: false,
        sessionKey: 'toggle-session',
        settleMode: 'manual',
        emitIntervalMs: 0,
      },
    })
    await flushAll()

    await wrapper.setProps({
      virtualScroll: {
        enabled: true,
        sessionKey: 'toggle-session',
        settleMode: 'manual',
        emitIntervalMs: 0,
      },
    })
    await flushAll()
    platform.flushFrames()
    await nextTick()

    expect(wrapper.emitted('height-change')?.length ?? 0).toBeGreaterThan(emittedBeforeToggle)

    wrapper.unmount()
  })

  it('does not use virtualScroll.scrollRoot while virtualScroll is disabled', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const scrollRoot = document.createElement('div')
    document.body.appendChild(scrollRoot)

    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      value: 120,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      value: 2000,
    })

    scrollRoot.scrollTop = 33

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: Array.from({ length: 8 }, (_, index) => createParagraph(index + 1)),
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: false,
          sessionKey: 'disabled-root',
          scrollRoot: () => scrollRoot,
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    handle.scrollToNode(4)
    await nextTick()

    expect(scrollRoot.scrollTop).toBe(33)

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('waits for lazy images to load before final settle', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const ImageNode = (await import('../src/components/ImageNode')).default
    const LazyImageNode = defineComponent({
      props: {
        node: { type: Object, required: true },
        indexKey: { type: [String, Number], required: true },
      },
      setup(props) {
        return () => h(ImageNode, {
          'node': props.node as any,
          'lazy': true,
          'index-key': props.indexKey,
        })
      },
    })

    setCustomComponents('virtual-lifecycle-test', {
      image: LazyImageNode as any,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        customId: 'virtual-lifecycle-test',
        nodes: [
          {
            type: 'image',
            src: 'https://example.com/lazy.png',
            alt: 'Lazy',
            title: null,
            raw: '![Lazy](https://example.com/lazy.png)',
          },
        ],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'lazy-image-settled',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const contentEl = getRootNodeContentElements(wrapper.element)[0]!
    platform.heights.set(contentEl, 64)
    platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()

    const pending = await (wrapper.vm as any).settle({ frames: 0, timeoutMs: 0, reason: 'manual' })

    expect(pending).toMatchObject({
      phase: 'settling',
      stable: false,
      totalHeight: 64,
    })

    const imageEl = contentEl.querySelector('img')
    expect(imageEl).toBeTruthy()
    imageEl?.dispatchEvent(new Event('load'))
    await new Promise(resolve => setTimeout(resolve, 90))
    await flushAll()

    const settled = await (wrapper.vm as any).settle({ frames: 0, timeoutMs: 0, reason: 'manual' })

    expect(settled).toMatchObject({
      phase: 'final',
      stable: true,
      totalHeight: 64,
    })
    expect(wrapper.emitted('render-settled')?.at(-1)?.[0]).toMatchObject({
      sessionKey: 'lazy-image-settled',
      stable: true,
    })

    wrapper.unmount()
  })

  it('does not emit stale final metrics after virtual session changes during settle', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | null = null

    try {
      const NodeRenderer = (await import('../src/components/NodeRenderer')).default

      wrapper = mount(NodeRenderer, {
        props: {
          nodes: [createParagraph(1)],
          final: true,
          fade: false,
          viewportPriority: false,
          virtualScroll: {
            enabled: true,
            sessionKey: 'session-a',
            settleMode: 'manual',
            emitIntervalMs: 0,
          },
        },
      })

      await nextTick()
      await Promise.resolve()
      await Promise.resolve()

      const settlePromise = (wrapper.vm as any).settle({ frames: 0, timeoutMs: 120, reason: 'manual' })

      await wrapper.setProps({
        virtualScroll: {
          enabled: true,
          sessionKey: 'session-b',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      })

      await vi.advanceTimersByTimeAsync(120)
      const metrics = await settlePromise

      expect(metrics).toMatchObject({
        sessionKey: 'session-a',
        stable: false,
      })
      expect(metrics.phase).not.toBe('final')
      expect(wrapper.emitted('render-final')).toBeUndefined()
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('does not emit stale final metrics after measurementKey changes during settle', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | null = null

    try {
      const NodeRenderer = (await import('../src/components/NodeRenderer')).default

      wrapper = mount(NodeRenderer, {
        props: {
          nodes: [createParagraph(1)],
          final: true,
          fade: false,
          viewportPriority: false,
          virtualScroll: {
            enabled: true,
            sessionKey: 'same-session-layout-a',
            measurementKey: 'theme-a',
            settleMode: 'manual',
            emitIntervalMs: 0,
          },
        },
      })

      await nextTick()
      await Promise.resolve()
      await Promise.resolve()

      const settlePromise = (wrapper.vm as any).settle({
        frames: 0,
        timeoutMs: 120,
        reason: 'manual',
      })

      await wrapper.setProps({
        virtualScroll: {
          enabled: true,
          sessionKey: 'same-session-layout-a',
          measurementKey: 'theme-b',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      })

      await vi.advanceTimersByTimeAsync(120)
      const metrics = await settlePromise

      expect(metrics).toMatchObject({
        sessionKey: 'same-session-layout-a',
        stable: false,
      })
      expect(metrics.phase).not.toBe('final')
      expect(wrapper.emitted('render-final')).toBeUndefined()
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('resets measured heights when virtual session changes', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'thread-a:message-1:1',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const contentEl = getRootNodeContentElements(wrapper.element)[0]!
    platform.heights.set(contentEl, 500)
    platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()

    const handle = wrapper.vm as any
    expect((await handle.forceMeasure('manual')).totalHeight).toBe(500)

    await wrapper.setProps({
      virtualScroll: {
        enabled: true,
        sessionKey: 'thread-b:message-2:1',
        settleMode: 'manual',
        emitIntervalMs: 0,
      },
    })

    await flushAll()

    expect(handle.getVirtualMetrics().totalHeight).not.toBe(500)

    const switchedContentEl = getRootNodeContentElements(wrapper.element)[0]!
    platform.heights.set(switchedContentEl, 120)
    platform.resizeCallbacks.get(switchedContentEl)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()

    expect((await handle.forceMeasure('manual')).totalHeight).toBe(120)

    wrapper.unmount()
  })

  it('resets incremental batch state when virtualScroll.sessionKey changes with stable indexKey and same node count', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    const frames: FrameRequestCallback[] = []
    let wrapper: ReturnType<typeof mount> | null = null

    process.env.NODE_ENV = 'development'
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    try {
      const NodeRenderer = (await import('../src/components/NodeRenderer')).default

      wrapper = mount(NodeRenderer, {
        attachTo: document.body,
        props: {
          indexKey: 'stable-message-key',
          customId: 'same-length-session-test',
          content: makeSameShapeContent('a'),
          final: true,
          batchRendering: true,
          maxLiveNodes: 0,
          initialRenderBatchSize: 8,
          renderBatchSize: 8,
          renderBatchDelay: 0,
          fade: false,
          viewportPriority: false,
          virtualScroll: {
            enabled: true,
            sessionKey: 'thread-a:message-1:rev-1',
            threadKey: 'thread-a',
            settleMode: 'manual',
            settledToken: true,
          },
        },
      })

      await flushAll()
      await flushQueuedAnimationFrames(frames, 12)

      const renderedBeforeSwitch = getRootNodeContentElements(wrapper.element).length
      expect(renderedBeforeSwitch).toBeGreaterThan(8)

      await wrapper.setProps({
        content: makeSameShapeContent('b'),
        virtualScroll: {
          enabled: true,
          sessionKey: 'thread-b:message-1:rev-1',
          threadKey: 'thread-b',
          settleMode: 'manual',
          settledToken: true,
        },
      })

      await nextTick()

      const renderedImmediatelyAfterSwitch = getRootNodeContentElements(wrapper.element).length
      expect(renderedImmediatelyAfterSwitch).toBeLessThanOrEqual(8)
    }
    finally {
      wrapper?.unmount()
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  it('auto-virtualizes standalone final chat content restore', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      attachTo: document.body,
      props: {
        content: makeSameShapeContent('restore'),
        final: true,
        mode: 'chat',
        smoothStreaming: false,
        fade: false,
        viewportPriority: false,
      },
    })

    await flushAll()

    expect(wrapper.classes()).toContain('virtualized')
    expect(getRootNodeContentElements(wrapper.element).length).toBe(50)

    wrapper.unmount()
  })

  it('auto-virtualizes async standalone final chat restore with default smooth streaming', async () => {
    const frames: FrameRequestCallback[] = []
    let nextFrameId = 1
    vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
      frames.push(callback)
      return nextFrameId++
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      attachTo: document.body,
      props: {
        content: '',
        final: true,
        mode: 'chat',
        fade: false,
        viewportPriority: false,
      },
    })

    await flushAll()
    await wrapper.setProps({ content: makeSameShapeContent('async-restore') })

    const baseline = performance.now()
    for (let step = 1; step <= 520 && frames.length > 0; step++) {
      const callback = frames.shift()!
      callback(baseline + step * 80)
      await nextTick()
    }

    await flushAll()

    expect(wrapper.classes()).toContain('virtualized')
    expect(getRootNodeContentElements(wrapper.element).length).toBe(50)

    wrapper.unmount()
  })

  it('keeps explicit maxLiveNodes=0 as standalone final chat virtualization opt-out', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      attachTo: document.body,
      props: {
        content: makeSameShapeContent('restore'),
        final: true,
        mode: 'chat',
        smoothStreaming: false,
        fade: false,
        viewportPriority: false,
        maxLiveNodes: 0,
      },
    })

    await flushAll()

    expect(wrapper.classes()).not.toContain('virtualized')
    expect(getRootNodeContentElements(wrapper.element).length).toBeGreaterThan(50)

    wrapper.unmount()
  })

  it('does not auto-virtualize a standalone chat stream after final flips true', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      attachTo: document.body,
      props: {
        content: makeSameShapeContent('stream'),
        final: false,
        mode: 'chat',
        smoothStreaming: false,
        fade: false,
        viewportPriority: false,
      },
    })

    await flushAll()
    await wrapper.setProps({ final: true })
    await flushAll()

    expect(wrapper.classes()).not.toContain('virtualized')
    expect(getRootNodeContentElements(wrapper.element).length).toBeGreaterThan(50)

    wrapper.unmount()
  })

  it('auto-virtualizes standalone final chat restore after renderer identity changes', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      attachTo: document.body,
      props: {
        content: makeSameShapeContent('stream'),
        final: false,
        indexKey: 'stream-message',
        mode: 'chat',
        smoothStreaming: false,
        fade: false,
        viewportPriority: false,
      },
    })

    await flushAll()
    await wrapper.setProps({ final: true })
    await flushAll()

    expect(wrapper.classes()).not.toContain('virtualized')
    expect(getRootNodeContentElements(wrapper.element).length).toBeGreaterThan(50)

    await wrapper.setProps({
      content: makeSameShapeContent('restore'),
      indexKey: 'restore-message',
    })
    await flushAll()

    expect(wrapper.classes()).toContain('virtualized')
    expect(getRootNodeContentElements(wrapper.element).length).toBe(50)

    wrapper.unmount()
  })

  it('does not auto-virtualize a standalone chat stream when identity changes before final', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      attachTo: document.body,
      props: {
        content: makeSameShapeContent('stream'),
        final: false,
        indexKey: 'stream-message-temp',
        mode: 'chat',
        smoothStreaming: false,
        fade: false,
        viewportPriority: false,
      },
    })

    await flushAll()
    await wrapper.setProps({ indexKey: 'stream-message-final' })
    await flushAll()
    await wrapper.setProps({ final: true })
    await flushAll()

    expect(wrapper.classes()).not.toContain('virtualized')
    expect(getRootNodeContentElements(wrapper.element).length).toBeGreaterThan(50)

    wrapper.unmount()
  })

  it('does not auto-virtualize a default smooth chat stream when final flips before visible catches up', async () => {
    const frames: FrameRequestCallback[] = []
    let nextFrameId = 1
    vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
      frames.push(callback)
      return nextFrameId++
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      attachTo: document.body,
      props: {
        content: '',
        final: false,
        indexKey: 'stream-message-temp',
        mode: 'chat',
        fade: false,
        viewportPriority: false,
      },
    })

    await flushAll()
    await wrapper.setProps({ indexKey: 'stream-message-final' })
    await wrapper.setProps({ content: makeSameShapeContent('stream') })
    await wrapper.setProps({ final: true })

    const baseline = performance.now()
    for (let step = 1; step <= 520 && frames.length > 0; step++) {
      const callback = frames.shift()!
      callback(baseline + step * 80)
      await nextTick()
    }

    await flushAll()

    expect(wrapper.classes()).not.toContain('virtualized')
    expect(getRootNodeContentElements(wrapper.element).length).toBeGreaterThan(50)

    wrapper.unmount()
  })

  it('keeps full-render batches cancellable before all nodes mount', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    const frames = new Map<number, FrameRequestCallback>()
    let nextFrameId = 1
    let wrapper: ReturnType<typeof mount> | null = null
    const nodes = Array.from({ length: 200 }, (_, index) => createParagraph(index + 1))

    process.env.NODE_ENV = 'development'
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const frameId = nextFrameId++
      frames.set(frameId, callback)
      return frameId
    })
    vi.stubGlobal('cancelAnimationFrame', (frameId: number) => {
      frames.delete(frameId)
    })

    const flushFrames = async () => {
      await nextTick()
      const pending = Array.from(frames.values())
      frames.clear()
      for (const callback of pending)
        callback(performance.now())
      await nextTick()
    }

    try {
      const NodeRenderer = (await import('../src/components/NodeRenderer')).default

      wrapper = mount(NodeRenderer, {
        attachTo: document.body,
        props: {
          nodes,
          final: true,
          batchRendering: true,
          maxLiveNodes: 0,
          initialRenderBatchSize: 8,
          renderBatchSize: 8,
          renderBatchDelay: 1000,
          fade: false,
          viewportPriority: false,
          virtualScroll: {
            enabled: true,
            sessionKey: 'pdf-full-render-cancel',
            settleMode: 'manual',
            settledToken: true,
          },
        },
      })

      await flushAll()

      const renderedBeforeCancel = getRootNodeContentElements(wrapper.element).length
      expect(renderedBeforeCancel).toBeGreaterThan(0)
      expect(renderedBeforeCancel).toBeLessThan(nodes.length)

      await wrapper.setProps({ maxLiveNodes: 12 })
      await flushFrames()

      const renderedAfterCancel = getRootNodeContentElements(wrapper.element).length
      expect(renderedAfterCancel).toBeGreaterThanOrEqual(renderedBeforeCancel)
      expect(renderedAfterCancel).toBeLessThan(nodes.length)
    }
    finally {
      wrapper?.unmount()
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  it('invalidates measured heights when node content changes in the same session', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'same-session-content-cache',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const contentEl = getRootNodeContentElements(wrapper.element)[0]!
    platform.heights.set(contentEl, 500)
    platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()

    const handle = wrapper.vm as any
    expect((await handle.forceMeasure('manual')).totalHeight).toBe(500)

    const changedNode = createParagraph(1)
    changedNode.raw = 'Paragraph 1 updated with more content'
    changedNode.children[0].raw = changedNode.raw
    changedNode.children[0].content = changedNode.raw

    await wrapper.setProps({
      nodes: [changedNode],
    })
    await flushAll()

    expect(handle.getVirtualMetrics().totalHeight).not.toBe(500)

    wrapper.unmount()
  })

  it('resets measured heights when measurementKey changes', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'same-session-layout-cache',
          measurementKey: 'theme-a',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const contentEl = getRootNodeContentElements(wrapper.element)[0]!
    platform.heights.set(contentEl, 500)
    platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()

    const handle = wrapper.vm as any
    expect(handle.getVirtualMetrics().totalHeight).toBe(500)

    platform.heights.set(contentEl, 120)
    await wrapper.setProps({
      virtualScroll: {
        enabled: true,
        sessionKey: 'same-session-layout-cache',
        measurementKey: 'theme-b',
        settleMode: 'manual',
        emitIntervalMs: 0,
      },
    })
    await flushAll()
    platform.flushFrames()
    await nextTick()

    expect(handle.getVirtualMetrics().totalHeight).toBe(120)

    wrapper.unmount()
  })

  it('keeps virtual metrics unsettled until an async custom node reports settled', async () => {
    let finishAsyncNode: ((height: number) => void) | null = null
    const AsyncNode = defineComponent({
      props: {
        node: { type: Object, required: true },
        indexKey: { type: [String, Number], required: true },
      },
      setup(props) {
        const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY)
        onMounted(() => {
          lifecycle?.markPending(props.indexKey)
        })
        finishAsyncNode = (height: number) => {
          lifecycle?.reportHeight(props.indexKey, height)
          lifecycle?.markSettled(props.indexKey)
        }
        return () => h('div', { class: 'async-custom-node' }, 'async custom node')
      },
    })

    setCustomComponents('virtual-lifecycle-test', {
      async_node: AsyncNode as any,
    })

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        customId: 'virtual-lifecycle-test',
        nodes: [
          {
            type: 'async_node',
            raw: '<async-node />',
            content: '',
          },
        ],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'thread-a:custom-node:1',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    expect(handle.getVirtualMetrics().stable).toBe(false)

    expect(finishAsyncNode).toBeTypeOf('function')
    finishAsyncNode?.(96)
    await new Promise(resolve => setTimeout(resolve, 90))
    await nextTick()

    const metrics = await handle.settle({ frames: 0, timeoutMs: 0, reason: 'manual' })
    expect(metrics.totalHeight).toBe(96)
    expect(metrics.stable).toBe(true)
    expect(wrapper.emitted('render-settled')?.at(-1)?.[0]).toMatchObject({
      totalHeight: 96,
      stable: true,
    })

    wrapper.unmount()
  })

  it('keeps layout unsettled until duplicate async lifecycle pending records settle', async () => {
    const platform = installManualMeasurementPlatform()
    let settleOnce: (() => void) | null = null
    let settleAgain: (() => void) | null = null
    const AsyncNode = defineComponent({
      props: {
        node: { type: Object, required: true },
        indexKey: { type: [String, Number], required: true },
      },
      setup(props) {
        const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY)
        onMounted(() => {
          lifecycle?.markPending(props.indexKey)
          lifecycle?.markPending(props.indexKey)
        })
        settleOnce = () => {
          lifecycle?.markSettled(props.indexKey)
        }
        settleAgain = () => {
          lifecycle?.markSettled(props.indexKey)
        }
        return () => h('p', { class: 'multi-pending-node' }, 'overlapping async')
      },
    })

    setCustomComponents('virtual-lifecycle-test', {
      paragraph: AsyncNode as any,
    })

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        customId: 'virtual-lifecycle-test',
        nodes: [createParagraph(1)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'thread-a:overlapping-async-node:1',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    const contentEl = getRootNodeContentElements(wrapper.element)[0]!
    platform.heights.set(contentEl, 72)
    platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()

    expect(await handle.settle({
      frames: 0,
      timeoutMs: 0,
      reason: 'manual',
      flushPendingTimers: true,
    })).toMatchObject({
      phase: 'settling',
      stable: false,
      totalHeight: 72,
    })

    settleOnce?.()
    await flushAll()

    expect(await handle.settle({
      frames: 0,
      timeoutMs: 0,
      reason: 'manual',
      flushPendingTimers: true,
    })).toMatchObject({
      phase: 'settling',
      stable: false,
      totalHeight: 72,
    })

    settleAgain?.()
    await flushAll()

    expect(await handle.settle({
      frames: 0,
      timeoutMs: 0,
      reason: 'manual',
      flushPendingTimers: true,
    })).toMatchObject({
      phase: 'final',
      stable: true,
      totalHeight: 72,
    })

    expect(wrapper.emitted('render-final')?.at(-1)?.[0]).toMatchObject({
      sessionKey: 'thread-a:overlapping-async-node:1',
      stable: true,
      totalHeight: 72,
    })

    wrapper.unmount()
  })

  it('clears stale async pending keys when the virtual layout epoch changes', async () => {
    const AsyncNode = defineComponent({
      props: {
        node: { type: Object, required: true },
        indexKey: { type: [String, Number], required: true },
      },
      setup(props) {
        const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY)
        onMounted(() => {
          lifecycle?.markPending(props.indexKey)
        })
        return () => h('div', 'stale pending async')
      },
    })

    setCustomComponents('virtual-lifecycle-test', {
      async_node: AsyncNode as any,
    })

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        customId: 'virtual-lifecycle-test',
        nodes: [{ type: 'async_node', raw: '<async-node />', content: '' }],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'thread-a:stale-layout-pending:1',
          measurementKey: 'theme-a',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    expect(handle.getVirtualMetrics().stable).toBe(false)

    await wrapper.setProps({
      virtualScroll: {
        enabled: true,
        sessionKey: 'thread-a:stale-layout-pending:1',
        measurementKey: 'theme-b',
        settleMode: 'manual',
        emitIntervalMs: 0,
      },
    })
    await new Promise(resolve => setTimeout(resolve, 90))
    await flushAll()

    expect((await handle.settle({ frames: 0, timeoutMs: 0, reason: 'manual' })).stable).toBe(true)

    wrapper.unmount()
  })

  it('does not keep render unsettled when an async node settles with a stale indexKey', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | null = null
    let settleCapturedKey: (() => void) | null = null

    try {
      const AsyncNode = defineComponent({
        props: {
          node: { type: Object, required: true },
          indexKey: { type: [String, Number], required: true },
        },
        setup(props) {
          const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY)
          onMounted(() => {
            const capturedKey = props.indexKey
            lifecycle?.markPending(capturedKey)
            settleCapturedKey = () => {
              lifecycle?.markSettled(capturedKey)
            }
          })
          return () => h('div', 'async stale lifecycle')
        },
      })

      setCustomComponents('virtual-lifecycle-test', {
        async_node: AsyncNode as any,
      })

      const NodeRenderer = (await import('../src/components/NodeRenderer')).default
      wrapper = mount(NodeRenderer, {
        props: {
          customId: 'virtual-lifecycle-test',
          indexKey: 'message-a',
          nodes: [{ type: 'async_node', raw: '<async-node />', content: '' }],
          final: true,
          fade: false,
          viewportPriority: false,
          virtualScroll: {
            enabled: true,
            sessionKey: 'stable-session',
            threadKey: 'thread-a',
            settleMode: 'manual',
            emitIntervalMs: 0,
          },
        },
      })

      await nextTick()
      await Promise.resolve()
      await Promise.resolve()

      const handle = wrapper.vm as any
      expect(handle.getVirtualMetrics().stable).toBe(false)

      await wrapper.setProps({ indexKey: 'message-a-rerendered' })
      await nextTick()

      expect(settleCapturedKey).toBeTypeOf('function')
      settleCapturedKey?.()

      await vi.advanceTimersByTimeAsync(700)
      await nextTick()
      await Promise.resolve()

      const metrics = await handle.settle({ frames: 0, timeoutMs: 0, reason: 'manual' })
      expect(metrics.stable).toBe(true)
      expect(metrics.phase === 'settled' || metrics.phase === 'final').toBe(true)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('forwards nested fragment async lifecycle to the parent virtual renderer', async () => {
    let finish: (() => void) | null = null

    const NestedAsyncNode = defineComponent({
      props: {
        node: { type: Object, required: true },
        indexKey: { type: [String, Number], required: true },
      },
      setup(props) {
        const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY)
        onMounted(() => {
          lifecycle?.markPending(props.indexKey)
        })
        finish = () => {
          lifecycle?.markSettled(props.indexKey)
        }
        return () => h('div', 'nested async')
      },
    })

    setCustomComponents('virtual-lifecycle-test', {
      nested_async: NestedAsyncNode as any,
    })

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        customId: 'virtual-lifecycle-test',
        nodes: [
          {
            type: 'html_block',
            tag: 'x-host',
            content: '<nested_async></nested_async>',
            children: [
              {
                type: 'nested_async',
                raw: '<nested_async />',
                content: '',
              },
            ],
            raw: '<x-host><nested_async /></x-host>',
          },
        ],
        customHtmlTags: ['x-host', 'nested_async'],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'nested-fragment-lifecycle',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    expect(handle.getVirtualMetrics().stable).toBe(false)

    finish?.()
    await new Promise(resolve => setTimeout(resolve, 90))
    await flushAll()

    expect((await handle.settle({ frames: 0, timeoutMs: 0 })).stable).toBe(true)

    wrapper.unmount()
  })

  it('forwards nested fragment reportHeight to the parent virtual renderer', async () => {
    let report: ((height: number) => void) | null = null

    const NestedReporter = defineComponent({
      props: {
        node: { type: Object, required: true },
        indexKey: { type: [String, Number], required: true },
      },
      setup(props) {
        const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY)
        report = (height: number) => {
          lifecycle?.reportHeight(props.indexKey, height)
        }
        return () => h('div', 'nested reporter')
      },
    })
    const HostNode = defineComponent({
      setup(_, { slots }) {
        return () => h('div', slots.default?.())
      },
    })

    setCustomComponents('virtual-lifecycle-test', {
      'x-host': HostNode as any,
      'nested_reporter': NestedReporter as any,
    })

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        customId: 'virtual-lifecycle-test',
        nodes: [
          {
            type: 'html_block',
            tag: 'x-host',
            content: '<nested_reporter></nested_reporter>',
            children: [
              {
                type: 'nested_reporter',
                raw: '<nested_reporter />',
                content: '',
              },
            ],
            raw: '<x-host><nested_reporter /></x-host>',
          },
        ],
        customHtmlTags: ['x-host', 'nested_reporter'],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'nested-fragment-report-height',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    expect(report).toBeTypeOf('function')
    report?.(144)
    await flushAll()

    expect((await (wrapper.vm as any).forceMeasure('manual')).totalHeight).toBe(144)

    wrapper.unmount()
  })

  it('emits auto final after pending async nodes settle', async () => {
    let finishAsyncNode: ((height: number) => void) | null = null
    const AsyncNode = defineComponent({
      props: {
        node: { type: Object, required: true },
        indexKey: { type: [String, Number], required: true },
      },
      setup(props) {
        const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY)
        onMounted(() => {
          lifecycle?.markPending(props.indexKey)
        })
        finishAsyncNode = (height: number) => {
          lifecycle?.reportHeight(props.indexKey, height)
          lifecycle?.markSettled(props.indexKey)
        }
        return () => h('div', { class: 'async-custom-node' }, 'async custom node')
      },
    })

    setCustomComponents('virtual-lifecycle-test', {
      async_node: AsyncNode as any,
    })

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        customId: 'virtual-lifecycle-test',
        nodes: [
          {
            type: 'async_node',
            raw: '<async-node />',
            content: '',
          },
        ],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'thread-a:auto-custom-node:1',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()
    expect(wrapper.emitted('render-final')).toBeUndefined()

    expect(finishAsyncNode).toBeTypeOf('function')
    finishAsyncNode?.(88)
    await new Promise(resolve => setTimeout(resolve, 160))
    await flushAll()

    expect(wrapper.emitted('render-final')?.at(-1)?.[0]).toMatchObject({
      phase: 'final',
      totalHeight: 88,
      stable: true,
    })

    wrapper.unmount()
  })

  it('emits auto final again when settled heights change', async () => {
    let finishAsyncNode: ((height: number) => void) | null = null
    let reportAsyncHeight: ((height: number) => void) | null = null
    const AsyncNode = defineComponent({
      props: {
        node: { type: Object, required: true },
        indexKey: { type: [String, Number], required: true },
      },
      setup(props) {
        const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY)
        onMounted(() => {
          lifecycle?.markPending(props.indexKey)
        })
        reportAsyncHeight = (height: number) => {
          lifecycle?.reportHeight(props.indexKey, height)
        }
        finishAsyncNode = (height: number) => {
          lifecycle?.reportHeight(props.indexKey, height)
          lifecycle?.markSettled(props.indexKey)
        }
        return () => h('div', { class: 'async-custom-node' }, 'async custom node')
      },
    })

    setCustomComponents('virtual-lifecycle-test', {
      async_node: AsyncNode as any,
    })

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        customId: 'virtual-lifecycle-test',
        nodes: [
          {
            type: 'async_node',
            raw: '<async-node />',
            content: '',
          },
        ],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'thread-a:auto-height-change:1',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    finishAsyncNode?.(88)
    await new Promise(resolve => setTimeout(resolve, 160))
    await flushAll()

    const firstFinalCount = wrapper.emitted('render-final')?.length ?? 0
    expect(wrapper.emitted('render-final')?.at(-1)?.[0]).toMatchObject({
      phase: 'final',
      totalHeight: 88,
      stable: true,
    })

    reportAsyncHeight?.(120)
    await new Promise(resolve => setTimeout(resolve, 160))
    await flushAll()

    expect(wrapper.emitted('render-final')?.length).toBeGreaterThan(firstFinalCount)
    expect(wrapper.emitted('render-final')?.at(-1)?.[0]).toMatchObject({
      phase: 'final',
      totalHeight: 120,
      stable: true,
    })

    wrapper.unmount()
  })

  it('manual settledToken retries final after async nodes settle', async () => {
    let finishAsyncNode: ((height: number) => void) | null = null

    const AsyncNode = defineComponent({
      props: {
        node: { type: Object, required: true },
        indexKey: { type: [String, Number], required: true },
      },
      setup(props) {
        const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY)
        onMounted(() => {
          lifecycle?.markPending(props.indexKey)
        })
        finishAsyncNode = (height: number) => {
          lifecycle?.reportHeight(props.indexKey, height)
          lifecycle?.markSettled(props.indexKey)
        }
        return () => h('div', { class: 'async-custom-node' }, 'async custom node')
      },
    })

    setCustomComponents('virtual-lifecycle-test', {
      async_node: AsyncNode as any,
    })

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        customId: 'virtual-lifecycle-test',
        nodes: [{ type: 'async_node', raw: '<async-node />', content: '' }],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'thread-a:manual-custom-node:1',
          settleMode: 'manual',
          settledToken: true,
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()
    expect(wrapper.emitted('render-final')).toBeUndefined()

    finishAsyncNode?.(123)
    await new Promise(resolve => setTimeout(resolve, 160))
    await flushAll()

    expect(wrapper.emitted('render-final')?.at(-1)?.[0]).toMatchObject({
      phase: 'final',
      totalHeight: 123,
      stable: true,
    })

    wrapper.unmount()
  })

  it('does not confirm prop-driven manual settledToken before settle finishes', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | null = null

    try {
      const platform = installManualMeasurementPlatform()
      const NodeRenderer = (await import('../src/components/NodeRenderer')).default

      wrapper = mount(NodeRenderer, {
        props: {
          nodes: [createParagraph(1)],
          final: true,
          fade: false,
          viewportPriority: false,
          virtualScroll: {
            enabled: true,
            sessionKey: 'manual-token-settle-window',
            settleMode: 'manual',
            settledToken: true,
            emitIntervalMs: 0,
          },
        },
      })

      await nextTick()
      await Promise.resolve()
      await Promise.resolve()

      const contentEl = getRootNodeContentElements(wrapper.element)[0]!
      platform.heights.set(contentEl, 40)
      platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
      platform.flushFrames()
      await nextTick()
      await Promise.resolve()
      platform.flushFrames()
      await nextTick()

      expect((wrapper.vm as any).getVirtualMetrics()).toMatchObject({
        stable: false,
        totalHeight: 40,
      })
      expect(wrapper.emitted('render-settled')).toBeUndefined()
      expect(wrapper.emitted('render-final')).toBeUndefined()

      await vi.advanceTimersByTimeAsync(120)
      await nextTick()
      await Promise.resolve()
      platform.flushFrames()
      await nextTick()

      expect(wrapper.emitted('render-final')?.at(-1)?.[0]).toMatchObject({
        phase: 'final',
        stable: true,
        totalHeight: 40,
      })
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('does not emit stale final metrics after manual settledToken changes during settle', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | null = null

    try {
      const platform = installManualMeasurementPlatform()
      const NodeRenderer = (await import('../src/components/NodeRenderer')).default

      wrapper = mount(NodeRenderer, {
        props: {
          nodes: [createParagraph(1)],
          final: true,
          fade: false,
          viewportPriority: false,
          virtualScroll: {
            enabled: true,
            sessionKey: 'manual-token-race',
            settleMode: 'manual',
            settledToken: 'token-a',
            emitIntervalMs: 0,
          },
        },
      })

      await nextTick()
      await Promise.resolve()
      await Promise.resolve()

      const contentEl = getRootNodeContentElements(wrapper.element)[0]!
      platform.heights.set(contentEl, 40)
      platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
      platform.flushFrames()
      await nextTick()

      const settlePromise = (wrapper.vm as any).settle({
        frames: 0,
        timeoutMs: 120,
        reason: 'manual',
        expectedSettledTokenKey: 'token-a',
      })

      await wrapper.setProps({
        virtualScroll: {
          enabled: true,
          sessionKey: 'manual-token-race',
          settleMode: 'manual',
          settledToken: 'token-b',
          emitIntervalMs: 0,
        },
      })

      await vi.advanceTimersByTimeAsync(120)
      const metrics = await settlePromise

      expect(metrics).toMatchObject({
        sessionKey: 'manual-token-race',
        stable: false,
      })
      expect(metrics.phase).not.toBe('final')
      expect(wrapper.emitted('render-final')).toBeUndefined()
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it.each([false, ''])('does not emit renderSettled in manual mode before settledToken is provided: %j', async (settledToken) => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: `manual-gated-settled:${String(settledToken)}`,
          settleMode: 'manual',
          settledToken,
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const contentEl = getRootNodeContentElements(wrapper.element)[0]!
    platform.heights.set(contentEl, 40)
    platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()

    await new Promise(resolve => setTimeout(resolve, 700))
    platform.flushFrames()
    await flushAll()

    expect(wrapper.emitted('render-settled')).toBeUndefined()
    expect(wrapper.emitted('render-final')).toBeUndefined()
    expect((wrapper.vm as any).getVirtualMetrics()).toMatchObject({
      stable: false,
      totalHeight: 40,
    })

    wrapper.unmount()
  })

  it('invalidates imperative manual settle confirmation when height changes in the same session', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'manual-settle-height-change',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const contentEl = getRootNodeContentElements(wrapper.element)[0]!
    platform.heights.set(contentEl, 40)
    platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()

    const handle = wrapper.vm as any
    expect(await handle.forceMeasure('manual')).toMatchObject({
      totalHeight: 40,
    })

    await new Promise(resolve => setTimeout(resolve, 90))
    platform.flushFrames()
    await nextTick()

    expect(await handle.settle({ frames: 0, timeoutMs: 0, reason: 'manual' })).toMatchObject({
      stable: true,
      totalHeight: 40,
    })

    platform.heights.set(contentEl, 80)
    platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()

    expect(handle.getVirtualMetrics()).toMatchObject({
      stable: false,
      totalHeight: 80,
    })

    wrapper.unmount()
  })

  it('omits height cache from non-final virtualStateChange cache updates', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1)],
        final: false,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'streaming-light-state',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const contentEl = getRootNodeContentElements(wrapper.element)[0]!
    platform.heights.set(contentEl, 40)
    platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()
    platform.flushFrames()
    await flushAll()

    const state = wrapper.emitted('virtual-state-change')?.at(-1)?.[0] as any
    expect(state).toMatchObject({
      sessionKey: 'streaming-light-state',
      metrics: {
        totalHeight: 40,
      },
    })
    expect(state.heightCache).toBeUndefined()

    await (wrapper.vm as any).forceMeasure('manual')
    const forcedState = wrapper.emitted('virtual-state-change')?.at(-1)?.[0] as any
    expect(forcedState.heightCache).toMatchObject([
      {
        index: 0,
        height: 40,
        nodeType: 'paragraph',
      },
    ])
    expect(forcedState.heightCache[0]?.signature).toBeTruthy()
    expect(forcedState.heightCache[0]?.signature).not.toContain('Paragraph')

    const heightCache = (wrapper.vm as any).captureVirtualState()?.heightCache ?? []
    expect(heightCache).toMatchObject([
      {
        index: 0,
        height: 40,
        nodeType: 'paragraph',
      },
    ])
    expect(heightCache[0]?.signature).toBeTruthy()
    expect(heightCache[0]?.signature).not.toContain('Paragraph')

    wrapper.unmount()
  })

  it('caps exported virtual height cache payloads', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: Array.from({ length: 6 }, (_, index) => createParagraph(index + 1)),
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'height-cache-limit',
          settleMode: 'manual',
          emitIntervalMs: 0,
          heightCacheLimit: 3,
        },
      },
    })

    await flushAll()

    const contentEls = getRootNodeContentElements(wrapper.element)
    for (const [index, el] of contentEls.entries()) {
      platform.heights.set(el, 40 + index)
      platform.resizeCallbacks.get(el)?.([], {} as ResizeObserver)
    }

    platform.flushFrames()
    await nextTick()
    await (wrapper.vm as any).forceMeasure('manual')

    const heightCache = (wrapper.vm as any).captureVirtualState()?.heightCache ?? []
    expect(heightCache).toHaveLength(3)
    expect(heightCache.every((entry: any) => entry.signature)).toBe(true)

    wrapper.unmount()
  })

  it('emits cache-only virtual state for offscreen renderers without anchor-change', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const scrollRoot = document.createElement('div')
    document.body.appendChild(scrollRoot)

    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => 1800,
    })

    scrollRoot.scrollTop = 800

    vi.spyOn(scrollRoot, 'getBoundingClientRect').mockReturnValue(makeDomRect(0, 200))

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'offscreen-cache-only-state',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue(makeDomRect(1200, 160))

    await flushAll()

    const anchorChangeCount = wrapper.emitted('anchor-change')?.length ?? 0
    const contentEls = getRootNodeContentElements(wrapper.element)
    platform.heights.set(contentEls[0]!, 70)
    platform.heights.set(contentEls[1]!, 90)

    for (const el of contentEls)
      platform.resizeCallbacks.get(el)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()

    await (wrapper.vm as any).forceMeasure('manual')
    platform.flushFrames()
    await nextTick()

    const state = wrapper.emitted('virtual-state-change')?.at(-1)?.[0] as any
    expect(state).toMatchObject({
      sessionKey: 'offscreen-cache-only-state',
      anchorCaptured: false,
      heightCache: [
        { index: 0, height: 70 },
        { index: 1, height: 90 },
      ],
    })
    expect(state.anchor).toBeUndefined()
    expect(wrapper.emitted('anchor-change')?.length ?? 0).toBe(anchorChangeCount)
    expect((wrapper.vm as any).captureVirtualState({ requireViewport: true })).toMatchObject({
      anchorCaptured: false,
      heightCache: [
        { index: 0, height: 70 },
        { index: 1, height: 90 },
      ],
    })

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('does not emit final before deferred height settling timers finish', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | null = null

    try {
      const platform = installManualMeasurementPlatform()
      const NodeRenderer = (await import('../src/components/NodeRenderer')).default

      wrapper = mount(NodeRenderer, {
        props: {
          nodes: [createParagraph(1)],
          final: true,
          fade: false,
          viewportPriority: false,
          virtualScroll: {
            enabled: true,
            sessionKey: 'thread-a:deferred-final:1',
            emitIntervalMs: 0,
          },
        },
      })

      await nextTick()
      await Promise.resolve()
      await Promise.resolve()

      const contentEl = getRootNodeContentElements(wrapper.element)[0]!
      platform.heights.set(contentEl, 40)
      platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
      platform.flushFrames()
      await nextTick()

      expect(wrapper.emitted('render-final')).toBeUndefined()

      await vi.advanceTimersByTimeAsync(90)
      platform.flushFrames()
      await nextTick()

      const settled = await (wrapper.vm as any).settle({ frames: 0, timeoutMs: 0, reason: 'final' })
      expect(settled).toMatchObject({
        phase: 'final',
        stable: true,
        totalHeight: 40,
      })
      expect(wrapper.emitted('render-final')?.at(-1)?.[0]).toMatchObject({
        phase: 'final',
        stable: true,
        totalHeight: 40,
      })
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('does not import restore height cache for stale sessions or mismatched widths', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const metrics = {
      sessionKey: 'stale-session',
      phase: 'final',
      nodeCount: 2,
      liveRange: { start: 0, end: 2 },
      renderedCount: 2,
      measuredCount: 2,
      estimatedCount: 0,
      averageNodeHeight: 400,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      visibleDomHeight: 800,
      totalHeight: 800,
      width: 400,
      final: true,
      stable: true,
      confidence: 'final',
      reason: 'manual',
    } as const

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'current-session',
          settleMode: 'manual',
          restoreState: {
            sessionKey: 'stale-session',
            anchor: { type: 'node', nodeIndex: 0, offsetWithinNodePx: 0 },
            metrics,
            width: 400,
            heightCache: [
              { index: 0, height: 400 },
              { index: 1, height: 400 },
            ],
          },
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    expect((await handle.forceMeasure('manual')).totalHeight).not.toBe(800)

    await wrapper.setProps({
      virtualScroll: {
        enabled: true,
        sessionKey: 'current-session',
        settleMode: 'manual',
        restoreState: {
          sessionKey: 'current-session',
          anchor: { type: 'node', nodeIndex: 0, offsetWithinNodePx: 0 },
          metrics: { ...metrics, sessionKey: 'current-session', width: 800 },
          width: 800,
          heightCache: [
            { index: 0, height: 400 },
            { index: 1, height: 400 },
          ],
        },
      },
    })
    await flushAll()

    expect((await handle.forceMeasure('manual')).totalHeight).not.toBe(800)

    wrapper.unmount()
  })

  it('reuses restore height cache across 1px width jitter in the same bucket', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(319)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const seedCache = await captureSeedHeightCache(NodeRenderer)
    const metrics = {
      sessionKey: 'width-jitter-session',
      phase: 'final',
      nodeCount: 2,
      liveRange: { start: 0, end: 2 },
      renderedCount: 2,
      measuredCount: 2,
      estimatedCount: 0,
      averageNodeHeight: 400,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      visibleDomHeight: 800,
      totalHeight: 800,
      width: 320,
      final: true,
      stable: true,
      confidence: 'final',
      reason: 'manual',
    } as const

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'width-jitter-session',
          settleMode: 'manual',
          restoreState: {
            sessionKey: 'width-jitter-session',
            anchor: { type: 'node', nodeIndex: 0, offsetWithinNodePx: 0 },
            metrics,
            width: 320,
            measurementKey: makeDefaultVirtualMeasurementKey(),
            heightCache: seedCache,
          },
        },
      },
    })

    await flushAll()

    expect((await (wrapper.vm as any).forceMeasure('manual')).totalHeight).toBe(800)

    wrapper.unmount()
  })

  it('does not import unscoped restore height cache into a scoped thread', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const metrics = {
      sessionKey: 'shared-session',
      phase: 'final',
      nodeCount: 2,
      liveRange: { start: 0, end: 2 },
      renderedCount: 2,
      measuredCount: 2,
      estimatedCount: 0,
      averageNodeHeight: 400,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      visibleDomHeight: 800,
      totalHeight: 800,
      width: 400,
      final: true,
      stable: true,
      confidence: 'final',
      reason: 'manual',
    } as const

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          threadKey: 'thread-a',
          sessionKey: 'shared-session',
          settleMode: 'manual',
          restoreState: {
            sessionKey: 'shared-session',
            anchor: { type: 'node', nodeIndex: 0, offsetWithinNodePx: 0 },
            metrics,
            width: 400,
            heightCache: [
              { index: 0, height: 400 },
              { index: 1, height: 400 },
            ],
          },
        },
      },
    })

    await flushAll()

    expect((await (wrapper.vm as any).forceMeasure('manual')).totalHeight).not.toBe(800)

    wrapper.unmount()
  })

  it('does not reuse restore height cache when measurementKey changes', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const seedCache = await captureSeedHeightCache(NodeRenderer)
    const metrics = {
      sessionKey: 'current-session',
      phase: 'final',
      nodeCount: 2,
      liveRange: { start: 0, end: 2 },
      renderedCount: 2,
      measuredCount: 2,
      estimatedCount: 0,
      averageNodeHeight: 400,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      visibleDomHeight: 800,
      totalHeight: 800,
      width: 400,
      final: true,
      stable: true,
      confidence: 'final',
      reason: 'manual',
    } as const
    const restoreState = {
      sessionKey: 'current-session',
      anchor: { type: 'node', nodeIndex: 0, offsetWithinNodePx: 0 },
      metrics,
      width: 400,
      measurementKey: makeDefaultVirtualMeasurementKey('light:16'),
      heightCache: seedCache,
    } as any

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'current-session',
          settleMode: 'manual',
          restoreState,
          measurementKey: 'dark:16',
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    expect((await handle.forceMeasure('manual')).totalHeight).not.toBe(800)

    await wrapper.setProps({
      virtualScroll: {
        enabled: true,
        sessionKey: 'current-session',
        settleMode: 'manual',
        restoreState,
        measurementKey: 'light:16',
      },
    })

    await flushAll()

    expect((await handle.forceMeasure('manual')).totalHeight).toBe(800)
    expect(handle.captureVirtualState()?.measurementKey).toBe(makeDefaultVirtualMeasurementKey('light:16'))

    wrapper.unmount()
  })

  it('does not change pre renderer virtual layout key when monaco options change', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createCodeBlock(3)],
        final: true,
        fade: false,
        viewportPriority: false,
        codeRenderer: 'pre',
        virtualScroll: {
          enabled: true,
          sessionKey: 'pre-layout-key',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const initialKey = (wrapper.vm as any).captureVirtualState()?.measurementKey
    expect(initialKey).toContain('code-pre')

    await wrapper.setProps({
      codeBlockMonacoOptions: {
        fontSize: 18,
        lineHeight: 28,
      },
    })
    await flushAll()

    expect((wrapper.vm as any).captureVirtualState()?.measurementKey).toBe(initialKey)

    wrapper.unmount()
  })

  it('ignores code language options in the virtual layout key for unrelated custom components', async () => {
    const ParagraphProbe = defineComponent({
      props: {
        node: { type: Object, required: true },
      },
      setup(props) {
        return () => h('p', { class: 'virtual-paragraph-probe' }, String((props.node as any)?.raw ?? ''))
      },
    })

    setCustomComponents('virtual-prefix-test', {
      paragraph: ParagraphProbe as any,
    })

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        customId: 'virtual-prefix-test',
        nodes: [
          createParagraph(1),
          createCodeBlock(3),
        ],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'unrelated-custom-layout-key',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    expect(wrapper.get('.virtual-paragraph-probe').exists()).toBe(true)
    const initialKey = (wrapper.vm as any).captureVirtualState()?.measurementKey

    await flushAll()

    expect((wrapper.vm as any).captureVirtualState()?.measurementKey).toBe(initialKey)

    wrapper.unmount()
  })

  it('does not include theme options in the virtual layout key for language custom code blocks', async () => {
    const LanguageCodeBlockProbe = defineComponent({
      inheritAttrs: false,
      props: {
        node: { type: Object, required: true },
      },
      setup(_, { attrs }) {
        return () => h('div', {
          'class': 'virtual-language-code-block-probe',
          'data-has-themes': String(Object.prototype.hasOwnProperty.call(attrs, 'themes')),
        })
      },
    })

    setCustomComponents('virtual-prefix-test', {
      ts: LanguageCodeBlockProbe as any,
    })

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        customId: 'virtual-prefix-test',
        nodes: [createCodeBlock(3)],
        final: true,
        fade: false,
        viewportPriority: false,
        themes: ['vitesse-light'],
        virtualScroll: {
          enabled: true,
          sessionKey: 'language-code-block-layout-key',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    expect(wrapper.get('.virtual-language-code-block-probe').attributes('data-has-themes')).toBe('true')
    const initialKey = (wrapper.vm as any).captureVirtualState()?.measurementKey

    await flushAll()

    expect((wrapper.vm as any).captureVirtualState()?.measurementKey).toBe(initialKey)

    wrapper.unmount()
  })

  it('treats prop restoreState as cache-only unless restoreAnchor is provided', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const seedCache = await captureSeedHeightCache(NodeRenderer)
    const scrollRoot = document.createElement('div')
    document.body.appendChild(scrollRoot)

    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => 1000,
    })

    scrollRoot.scrollTop = 120

    const metrics = {
      sessionKey: 'cache-only-session',
      phase: 'final',
      nodeCount: 2,
      liveRange: { start: 0, end: 2 },
      renderedCount: 2,
      measuredCount: 2,
      estimatedCount: 0,
      averageNodeHeight: 400,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      visibleDomHeight: 800,
      totalHeight: 800,
      width: 400,
      final: true,
      stable: true,
      confidence: 'final',
      reason: 'manual',
    } as const

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'cache-only-session',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          restoreState: {
            sessionKey: 'cache-only-session',
            anchor: { type: 'bottom', distanceFromBottomPx: 0 },
            metrics,
            width: 400,
            measurementKey: makeDefaultVirtualMeasurementKey(),
            heightCache: seedCache,
          },
        },
      },
    })

    await flushAll()

    expect(scrollRoot.scrollTop).toBe(120)
    expect((await (wrapper.vm as any).forceMeasure('manual')).totalHeight).toBe(800)

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('imports cache-only restoreState even when restoreAnchor is requested', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const seedCache = await captureSeedHeightCache(NodeRenderer)
    const scrollRoot = document.createElement('div')
    document.body.appendChild(scrollRoot)

    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => 1000,
    })

    scrollRoot.scrollTop = 120

    const metrics = {
      sessionKey: 'cache-only-anchor-request',
      phase: 'final',
      nodeCount: 2,
      liveRange: { start: 0, end: 2 },
      renderedCount: 2,
      measuredCount: 2,
      estimatedCount: 0,
      averageNodeHeight: 400,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      visibleDomHeight: 800,
      totalHeight: 800,
      width: 400,
      final: true,
      stable: true,
      confidence: 'final',
      reason: 'manual',
    } as const

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'cache-only-anchor-request',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          restoreAnchor: true,
          restoreState: {
            sessionKey: 'cache-only-anchor-request',
            metrics,
            width: 400,
            measurementKey: makeDefaultVirtualMeasurementKey(),
            heightCache: seedCache,
          },
        },
      },
    })

    await flushAll()

    expect(scrollRoot.scrollTop).toBe(120)
    expect((await (wrapper.vm as any).forceMeasure('manual')).totalHeight).toBe(800)

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('applies prop restoreState anchor only when restoreAnchor token is provided', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
    const scrollRoot = document.createElement('div')
    document.body.appendChild(scrollRoot)

    let scrollHeight = 1000

    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })

    scrollRoot.scrollTop = 120

    const restoreState = {
      sessionKey: 'explicit-anchor-session',
      anchor: { type: 'bottom', distanceFromBottomPx: 0 },
      metrics: {
        sessionKey: 'explicit-anchor-session',
        phase: 'final',
        nodeCount: 2,
        liveRange: { start: 0, end: 2 },
        renderedCount: 2,
        measuredCount: 2,
        estimatedCount: 0,
        averageNodeHeight: 100,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
        visibleDomHeight: 200,
        totalHeight: 200,
        width: 400,
        final: true,
        stable: true,
        confidence: 'final',
        reason: 'manual',
      },
      width: 400,
    } as any

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'explicit-anchor-session',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          restoreState,
        },
      },
    })

    await flushAll()

    expect(scrollRoot.scrollTop).toBe(120)
    installRendererBottomGeometry(wrapper, scrollRoot, () => scrollHeight)

    await wrapper.setProps({
      virtualScroll: {
        enabled: true,
        sessionKey: 'explicit-anchor-session',
        scrollRoot: () => scrollRoot,
        settleMode: 'manual',
        restoreAnchor: 'thread-restore-1',
        restoreState,
      },
    })

    await flushAll()
    expect(scrollRoot.scrollTop).toBe(800)

    scrollRoot.scrollTop = 300
    scrollHeight = 1000

    await wrapper.setProps({
      virtualScroll: {
        enabled: true,
        sessionKey: 'explicit-anchor-session',
        scrollRoot: () => scrollRoot,
        settleMode: 'manual',
        restoreAnchor: 'thread-restore-1',
        restoreState,
      },
    })

    await flushAll()
    expect(scrollRoot.scrollTop).toBe(300)

    await wrapper.setProps({
      virtualScroll: {
        enabled: true,
        sessionKey: 'explicit-anchor-session',
        scrollRoot: () => scrollRoot,
        settleMode: 'manual',
        restoreAnchor: 'thread-restore-2',
        restoreState,
      },
    })

    await flushAll()
    expect(scrollRoot.scrollTop).toBe(800)

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('does not imperatively restore anchor unless restoreAnchor is true', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
    const scrollRoot = document.createElement('div')
    document.body.appendChild(scrollRoot)

    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => 1000,
    })

    const wrapper = mount(NodeRenderer, {
      attachTo: document.body,
      props: {
        nodes: [createParagraph(1), createParagraph(2), createParagraph(3)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'imperative-restore-default',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()
    installRendererBottomGeometry(wrapper, scrollRoot, () => 1000)

    const state = {
      sessionKey: 'imperative-restore-default',
      anchor: {
        type: 'bottom',
        distanceFromBottomPx: 0,
      },
      metrics: (wrapper.vm as any).getVirtualMetrics(),
      width: 400,
    }

    scrollRoot.scrollTop = 0
    ;(wrapper.vm as any).restoreVirtualState(state)
    await nextTick()

    expect(scrollRoot.scrollTop).toBe(0)

    ;(wrapper.vm as any).restoreVirtualState(state, {
      restoreAnchor: true,
      restoreToken: 'target-renderer',
    })
    await flushAll()

    expect(scrollRoot.scrollTop).toBe(800)

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('skips uncaptured restore anchors unless explicitly allowed', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
    const scrollRoot = document.createElement('div')
    document.body.appendChild(scrollRoot)

    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => 1000,
    })

    const wrapper = mount(NodeRenderer, {
      attachTo: document.body,
      props: {
        nodes: [createParagraph(1), createParagraph(2), createParagraph(3)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'uncaptured-anchor-restore',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()
    installRendererBottomGeometry(wrapper, scrollRoot, () => 1000)

    const state = {
      sessionKey: 'uncaptured-anchor-restore',
      anchor: {
        type: 'bottom',
        distanceFromBottomPx: 0,
      },
      anchorCaptured: false,
      metrics: {
        ...(wrapper.vm as any).getVirtualMetrics(),
        width: 400,
      },
      width: 400,
    }

    scrollRoot.scrollTop = 120

    await wrapper.setProps({
      virtualScroll: {
        enabled: true,
        sessionKey: 'uncaptured-anchor-restore',
        scrollRoot: () => scrollRoot,
        settleMode: 'manual',
        emitIntervalMs: 0,
        restoreAnchor: 'thread-restore',
        restoreState: state,
      },
    })
    await flushAll()

    expect(scrollRoot.scrollTop).toBe(120)

    ;(wrapper.vm as any).restoreVirtualState(state, {
      restoreAnchor: true,
      restoreToken: 'uncaptured-default',
    })
    await flushAll()

    expect(scrollRoot.scrollTop).toBe(120)

    ;(wrapper.vm as any).restoreVirtualState(state, {
      restoreAnchor: true,
      restoreToken: 'uncaptured-opt-in',
      allowUncapturedAnchor: true,
    })
    await flushAll()

    expect(scrollRoot.scrollTop).toBe(800)

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('does not imperatively restore anchor before current width is known', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const platform = installManualMeasurementPlatform()
    const scrollRoot = document.createElement('div')
    let width = 0

    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width)
    document.body.appendChild(scrollRoot)

    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => 1000,
    })

    const wrapper = mount(NodeRenderer, {
      attachTo: document.body,
      props: {
        nodes: [createParagraph(1), createParagraph(2), createParagraph(3)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'imperative-restore-width-pending',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()
    installRendererBottomGeometry(wrapper, scrollRoot, () => 1000)

    const handle = wrapper.vm as any
    handle.restoreVirtualState({
      sessionKey: 'imperative-restore-width-pending',
      anchor: {
        type: 'bottom',
        distanceFromBottomPx: 0,
      },
      metrics: {
        ...handle.getVirtualMetrics(),
        width: 400,
      },
      width: 400,
    }, {
      restoreAnchor: true,
      restoreToken: 'target-renderer',
    })
    await nextTick()

    expect(scrollRoot.scrollTop).toBe(0)

    width = 400
    platform.resizeCallbacks.get(wrapper.element)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await flushAll()

    expect(scrollRoot.scrollTop).toBe(800)

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('does not import restore height cache before current width is known', async () => {
    let width = 0
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const metrics = {
      sessionKey: 'current-session',
      phase: 'final',
      nodeCount: 2,
      liveRange: { start: 0, end: 2 },
      renderedCount: 2,
      measuredCount: 2,
      estimatedCount: 0,
      averageNodeHeight: 400,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      visibleDomHeight: 800,
      totalHeight: 800,
      width: 800,
      final: true,
      stable: true,
      confidence: 'final',
      reason: 'manual',
    } as const

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'current-session',
          settleMode: 'manual',
          restoreState: {
            sessionKey: 'current-session',
            anchor: { type: 'node', nodeIndex: 0, offsetWithinNodePx: 0 },
            metrics,
            width: 800,
            heightCache: [
              { index: 0, height: 400 },
              { index: 1, height: 400 },
            ],
          },
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    expect((await handle.forceMeasure('manual')).totalHeight).not.toBe(800)

    width = 400
    window.dispatchEvent(new Event('resize'))
    await flushAll()

    expect((await handle.forceMeasure('manual')).totalHeight).not.toBe(800)

    wrapper.unmount()
  })

  it('does not apply cached restore anchor before current width is known', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const seedCache = await captureSeedHeightCache(NodeRenderer)
    const platform = installManualMeasurementPlatform()
    const scrollRoot = document.createElement('div')
    let width = 0
    const scrollHeight = 1000

    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width)
    document.body.appendChild(scrollRoot)

    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })

    scrollRoot.scrollTop = 120

    const restoreState = {
      sessionKey: 'pending-prop-width-restore',
      anchor: { type: 'bottom', distanceFromBottomPx: 0 },
      metrics: {
        sessionKey: 'pending-prop-width-restore',
        phase: 'final',
        nodeCount: 2,
        liveRange: { start: 0, end: 2 },
        renderedCount: 2,
        measuredCount: 2,
        estimatedCount: 0,
        averageNodeHeight: 400,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
        visibleDomHeight: 800,
        totalHeight: 800,
        width: 400,
        final: true,
        stable: true,
        confidence: 'final',
        reason: 'manual',
      },
      width: 400,
      heightCache: seedCache,
    } as any

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'pending-prop-width-restore',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          restoreAnchor: 'thread-restore',
          restoreState,
        },
      },
    })

    installRendererBottomGeometry(wrapper, scrollRoot, () => scrollHeight)
    await flushAll()

    expect(scrollRoot.scrollTop).toBe(120)

    width = 400
    platform.resizeCallbacks.get(wrapper.element)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await flushAll()

    expect(scrollRoot.scrollTop).toBe(800)

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('does not import restore height cache when saved width is missing', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'missing-saved-width',
          settleMode: 'manual',
          restoreState: {
            sessionKey: 'missing-saved-width',
            anchor: { type: 'node', nodeIndex: 0, offsetWithinNodePx: 0 },
            metrics: {
              sessionKey: 'missing-saved-width',
              phase: 'final',
              nodeCount: 2,
              liveRange: { start: 0, end: 2 },
              renderedCount: 2,
              measuredCount: 2,
              estimatedCount: 0,
              averageNodeHeight: 400,
              topSpacerHeight: 0,
              bottomSpacerHeight: 0,
              visibleDomHeight: 800,
              totalHeight: 800,
              width: 0,
              final: true,
              stable: true,
              confidence: 'final',
              reason: 'manual',
            },
            width: 0,
            heightCache: [
              { index: 0, height: 400 },
              { index: 1, height: 400 },
            ],
          },
        },
      },
    })

    await flushAll()

    expect((await (wrapper.vm as any).forceMeasure('manual')).totalHeight).not.toBe(800)

    wrapper.unmount()
  })

  it('does not import standalone height cache without restore state', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'current-session',
          settleMode: 'manual',
          heightCache: [
            { index: 0, height: 400 },
            { index: 1, height: 400 },
          ],
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    expect((await handle.forceMeasure('manual')).totalHeight).not.toBe(800)

    wrapper.unmount()
  })

  it('rejects standalone height cache entries without signatures', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const metrics = {
      sessionKey: 'current-session',
      phase: 'final',
      nodeCount: 2,
      liveRange: { start: 0, end: 2 },
      renderedCount: 2,
      measuredCount: 2,
      estimatedCount: 0,
      averageNodeHeight: 400,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      visibleDomHeight: 800,
      totalHeight: 800,
      width: 400,
      final: true,
      stable: true,
      confidence: 'final',
      reason: 'manual',
    } as const

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'current-session',
          settleMode: 'manual',
          heightCacheWidth: 400,
          heightCache: [
            { index: 0, height: 400, nodeType: 'paragraph' },
            { index: 1, height: 400, nodeType: 'paragraph' },
          ],
          restoreState: {
            sessionKey: 'current-session',
            anchor: { type: 'node', nodeIndex: 0, offsetWithinNodePx: 0 },
            metrics,
            width: 400,
          },
        },
      },
    })

    await flushAll()

    expect((await (wrapper.vm as any).forceMeasure('manual')).totalHeight).not.toBe(800)

    wrapper.unmount()
  })

  it('imports standalone height cache when entries carry signatures', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const seedCache = await captureSeedHeightCache(NodeRenderer)
    expect(seedCache.every((entry: any) => entry.signature && !entry.signature.includes('Paragraph'))).toBe(true)

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'current-session',
          settleMode: 'manual',
          heightCacheWidth: 400,
          heightCache: seedCache,
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    expect((await handle.forceMeasure('manual')).totalHeight).toBe(800)

    wrapper.unmount()
  })

  it('rejects standalone height cache when container width crosses cache bucket', async () => {
    let width = 400

    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const heightCache = await captureSeedHeightCache(NodeRenderer, [400, 400])

    width = 432

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'seed-cache',
          heightCache,
          heightCacheWidth: 400,
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()
    await nextTick()

    const metrics = (wrapper.vm as any).getVirtualMetrics()

    expect(metrics.measuredCount).toBe(0)
    expect(metrics.totalHeight).not.toBe(800)

    wrapper.unmount()
  })

  it('imports compatible standalone height cache when restore state is for another thread', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const seedCache = await captureSeedHeightCache(NodeRenderer)
    const metrics = {
      sessionKey: 'shared-session',
      threadKey: 'thread-b',
      phase: 'final',
      nodeCount: 2,
      liveRange: { start: 0, end: 2 },
      renderedCount: 2,
      measuredCount: 2,
      estimatedCount: 0,
      averageNodeHeight: 400,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      visibleDomHeight: 800,
      totalHeight: 800,
      width: 400,
      final: true,
      stable: true,
      confidence: 'final',
      reason: 'manual',
    } as const

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          threadKey: 'thread-a',
          sessionKey: 'shared-session',
          settleMode: 'manual',
          heightCacheWidth: 400,
          heightCache: seedCache,
          restoreState: {
            sessionKey: 'shared-session',
            threadKey: 'thread-b',
            anchor: { type: 'node', nodeIndex: 0, offsetWithinNodePx: 0 },
            metrics,
            width: 400,
          },
        },
      },
    })

    await flushAll()

    expect((await (wrapper.vm as any).forceMeasure('manual')).totalHeight).toBe(800)

    wrapper.unmount()
  })

  it('rejects standalone height cache when measured width is missing', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const seedCache = await captureSeedHeightCache(NodeRenderer)
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'standalone-cache-no-width',
          settleMode: 'manual',
          heightCache: seedCache,
        } as any,
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    expect((await handle.forceMeasure('manual')).totalHeight).not.toBe(800)

    wrapper.unmount()
  })

  it('rejects height cache entries whose node signature no longer matches', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'same-session',
          settleMode: 'manual',
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    const state = {
      sessionKey: 'same-session',
      anchor: { type: 'node', nodeIndex: 0, offsetWithinNodePx: 0 },
      metrics: {
        ...handle.getVirtualMetrics(),
        sessionKey: 'same-session',
        width: 400,
        totalHeight: 800,
      },
      width: 400,
      contentHash: 'stale-content',
      heightCache: [
        {
          index: 0,
          height: 400,
          nodeType: 'paragraph',
          signature: 'stale-signature',
        },
        {
          index: 1,
          height: 400,
          nodeType: 'paragraph',
          signature: 'stale-signature',
        },
      ],
    }

    await wrapper.setProps({
      nodes: [
        {
          type: 'paragraph',
          raw: 'Different paragraph',
          children: [{ type: 'text', content: 'Different paragraph', raw: 'Different paragraph' }],
        },
        createParagraph(2),
      ],
      virtualScroll: {
        enabled: true,
        sessionKey: 'same-session',
        settleMode: 'manual',
        restoreState: state,
      },
    })

    await flushAll()

    expect((await handle.forceMeasure('manual')).totalHeight).not.toBe(800)

    wrapper.unmount()
  })

  it('invalidates height cache when late entries in long structural arrays change', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640)

    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default

    const seed = mount(NodeRenderer, {
      props: {
        nodes: [createLongListNode(false)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'long-array-cache',
          measurementKey: 'same-layout',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const seedContent = getRootNodeContentElements(seed.element)[0]!
    platform.heights.set(seedContent, 500)
    platform.resizeCallbacks.get(seedContent)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()
    await (seed.vm as any).forceMeasure('manual')

    const restoreState = (seed.vm as any).captureVirtualState()
    expect(restoreState?.heightCache?.length).toBeGreaterThan(0)

    seed.unmount()

    const restored = mount(NodeRenderer, {
      props: {
        nodes: [createLongListNode(true)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'long-array-cache',
          measurementKey: 'same-layout',
          restoreState,
          restoreAnchor: false,
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()
    platform.flushFrames()
    await nextTick()

    const metrics = (restored.vm as any).getVirtualMetrics()

    expect(metrics.measuredCount).toBe(0)

    restored.unmount()
  })

  it('reuses compatible per-node height cache entries when contentHash changes', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const seedCache = await captureSeedHeightCache(NodeRenderer, [100, 400, 100])

    const changedNode = createParagraph(2)
    changedNode.raw = 'Paragraph 2 changed after thread was inactive'
    changedNode.children[0].raw = changedNode.raw
    changedNode.children[0].content = changedNode.raw

    const metrics = {
      sessionKey: 'partial-cache-session',
      phase: 'final',
      nodeCount: 3,
      liveRange: { start: 0, end: 3 },
      renderedCount: 3,
      measuredCount: 3,
      estimatedCount: 0,
      averageNodeHeight: 200,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      visibleDomHeight: 600,
      totalHeight: 600,
      width: 400,
      final: true,
      stable: true,
      confidence: 'final',
      reason: 'manual',
    } as const

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), changedNode, createParagraph(3)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'partial-cache-session',
          settleMode: 'manual',
          restoreState: {
            sessionKey: 'partial-cache-session',
            anchor: { type: 'node', nodeIndex: 0, offsetWithinNodePx: 0 },
            metrics,
            width: 400,
            contentHash: 'stale-content-hash',
            measurementKey: makeDefaultVirtualMeasurementKey(),
            heightCache: seedCache,
          },
        },
      },
    })

    await flushAll()

    expect((await (wrapper.vm as any).forceMeasure('manual')).totalHeight).toBe(228)

    wrapper.unmount()
  })

  it('retries imperative restoreVirtualState after parsed nodes become available', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const seedCache = await captureSeedHeightCache(NodeRenderer, [50, 50])
    const state = {
      sessionKey: 'thread-a:late-restore:1',
      anchor: { type: 'node', nodeIndex: 1, offsetWithinNodePx: 10 },
      metrics: {
        sessionKey: 'thread-a:late-restore:1',
        phase: 'final',
        nodeCount: 2,
        liveRange: { start: 0, end: 2 },
        renderedCount: 2,
        measuredCount: 2,
        estimatedCount: 0,
        averageNodeHeight: 50,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
        visibleDomHeight: 100,
        totalHeight: 100,
        width: 400,
        final: true,
        stable: true,
        confidence: 'final',
        reason: 'manual',
      },
      width: 400,
      measurementKey: makeDefaultVirtualMeasurementKey(),
      heightCache: seedCache,
    } as any

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'thread-a:late-restore:1',
          settleMode: 'manual',
        },
      },
    })

    const handle = wrapper.vm as any
    handle.restoreVirtualState(state)

    await wrapper.setProps({
      nodes: [createParagraph(1), createParagraph(2)],
    })

    await flushAll()

    expect(handle.getVirtualMetrics().totalHeight).toBe(100)

    wrapper.unmount()
  })

  it('keeps imperative restoreState pending until width is known', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const seedCache = await captureSeedHeightCache(NodeRenderer, [320, 360])
    const platform = installManualMeasurementPlatform()
    let width = 0

    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width)

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'pending-width-restore',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    const state = {
      sessionKey: 'pending-width-restore',
      anchor: { type: 'node', nodeIndex: 0, offsetWithinNodePx: 0 },
      metrics: handle.getVirtualMetrics(),
      width: 960,
      measurementKey: makeDefaultVirtualMeasurementKey(),
      heightCache: seedCache,
    } as any

    handle.restoreVirtualState(state, { restoreAnchor: false })
    await flushAll()

    expect((await handle.forceMeasure('manual')).totalHeight).not.toBe(680)

    width = 960
    platform.resizeCallbacks.get(wrapper.element)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await flushAll()

    expect((await handle.forceMeasure('manual')).totalHeight).toBe(680)

    wrapper.unmount()
  })

  it('accepts a Vue ref as virtualScroll.scrollRoot', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const scrollRoot = ref<HTMLElement | null>(null)

    const Host = defineComponent({
      setup() {
        return () => h('div', { ref: scrollRoot }, [
          h(NodeRenderer, {
            nodes: [createParagraph(1), createParagraph(2)],
            final: true,
            fade: false,
            viewportPriority: false,
            maxLiveNodes: 1,
            virtualScroll: {
              enabled: true,
              sessionKey: 'thread-a:ref-root:1',
              scrollRoot,
              settleMode: 'manual',
              emitIntervalMs: 0,
            },
          }),
        ])
      },
    })

    const wrapper = mount(Host)
    await flushAll()

    expect(scrollRoot.value).toBeInstanceOf(HTMLElement)
    expect(wrapper.find('.markstream-vue').exists()).toBe(true)

    wrapper.unmount()
  })

  it('uses virtual sessionKey as the default node index prefix when indexKey is omitted', async () => {
    const seenIndexKeys: string[] = []

    const ProbeNode = defineComponent({
      props: {
        node: { type: Object, required: true },
        indexKey: { type: [String, Number], required: true },
      },
      setup(props) {
        watch(
          () => props.indexKey,
          value => seenIndexKeys.push(String(value)),
          { immediate: true },
        )

        return () => h('div', 'probe')
      },
    })

    setCustomComponents('virtual-prefix-test', {
      probe: ProbeNode as any,
    })

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        customId: 'virtual-prefix-test',
        nodes: [{ type: 'probe', raw: '<probe />', content: '' }],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'session-a',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    await wrapper.setProps({
      virtualScroll: {
        enabled: true,
        sessionKey: 'session-b',
        settleMode: 'manual',
        emitIntervalMs: 0,
      },
    })

    await flushAll()

    expect(seenIndexKeys).toContain('virtual-session-a-0')
    expect(seenIndexKeys).toContain('virtual-session-b-0')

    wrapper.unmount()
  })

  it('primes the virtual window before scrollToNode to avoid spacer-only blank frames', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default

    const nodes = Array.from({ length: 20 }, (_, index) => createParagraph(index + 1))
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes,
        final: true,
        fade: false,
        viewportPriority: false,
        maxLiveNodes: 4,
        liveNodeBuffer: 1,
        virtualScroll: {
          enabled: true,
          sessionKey: 'scroll-to-node-prime',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    handle.scrollToNode(18)
    await nextTick()

    const metrics = handle.getVirtualMetrics()
    expect(metrics.liveRange.start).toBeLessThanOrEqual(18)
    expect(metrics.liveRange.end).toBeGreaterThan(18)

    wrapper.unmount()
  })

  it('primes the virtual window before restoring a node anchor', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: Array.from({ length: 20 }, (_, index) => createParagraph(index + 1)),
        final: true,
        fade: false,
        viewportPriority: false,
        maxLiveNodes: 4,
        liveNodeBuffer: 1,
        virtualScroll: {
          enabled: true,
          sessionKey: 'restore-anchor-prime',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    handle.restoreVirtualState({
      sessionKey: 'restore-anchor-prime',
      anchor: { type: 'node', nodeIndex: 17, offsetWithinNodePx: 0 },
      metrics: handle.getVirtualMetrics(),
      width: 400,
    }, { restoreAnchor: true })

    await nextTick()

    const metrics = handle.getVirtualMetrics()
    expect(metrics.liveRange.start).toBeLessThanOrEqual(17)
    expect(metrics.liveRange.end).toBeGreaterThan(17)

    wrapper.unmount()
  })

  it('captures renderer-bottom anchor even when message chrome exists below the renderer', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const scrollRoot = document.createElement('div')
    document.body.appendChild(scrollRoot)

    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => 1000,
    })

    scrollRoot.scrollTop = 800

    vi.spyOn(scrollRoot, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      bottom: 200,
      left: 0,
      right: 400,
      width: 400,
      height: 200,
      toJSON: () => ({}),
    } as DOMRect)

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'renderer-bottom-with-chrome',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 80,
      top: 80,
      bottom: 160,
      left: 0,
      right: 400,
      width: 400,
      height: 80,
      toJSON: () => ({}),
    } as DOMRect)

    const state = (wrapper.vm as any).captureVirtualState()

    expect(state?.anchor).toMatchObject({
      type: 'bottom',
      distanceFromBottomPx: 40,
    })

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('does not capture a bottom anchor for a renderer far above the viewport bottom', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const scrollRoot = document.createElement('div')
    document.body.appendChild(scrollRoot)

    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => 1000,
    })

    scrollRoot.scrollTop = 800

    vi.spyOn(scrollRoot, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      bottom: 200,
      left: 0,
      right: 400,
      width: 400,
      height: 200,
      toJSON: () => ({}),
    } as DOMRect)

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'renderer-bottom-overscan',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: -420,
      top: -420,
      bottom: -260,
      left: 0,
      right: 400,
      width: 400,
      height: 160,
      toJSON: () => ({}),
    } as DOMRect)

    expect((wrapper.vm as any).captureVirtualState()?.anchor?.type).not.toBe('bottom')

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('restores a non-zero bottom anchor without overshooting', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const scrollRoot = document.createElement('div')
    document.body.appendChild(scrollRoot)

    let rendererHeight = 1000

    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => rendererHeight,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'bottom-anchor-distance',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()
    installRendererBottomGeometry(wrapper, scrollRoot, () => rendererHeight)

    const handle = wrapper.vm as any

    handle.restoreVirtualState({
      sessionKey: 'bottom-anchor-distance',
      anchor: { type: 'bottom', distanceFromBottomPx: 40 },
      metrics: handle.getVirtualMetrics(),
      width: 0,
    }, { restoreAnchor: true })

    await nextTick()

    expect(scrollRoot.scrollTop).toBe(760)

    rendererHeight = 1300
    for (const el of getRootNodeContentElements(wrapper.element))
      platform.heights.set(el, 650)
    for (const el of getRootNodeContentElements(wrapper.element))
      platform.resizeCallbacks.get(el)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()

    expect(scrollRoot.scrollTop).toBe(1060)

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('keeps a restored bottom anchor active after late height changes', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const scrollRoot = document.createElement('div')
    let scrollHeight = 1000

    document.body.appendChild(scrollRoot)
    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2), createParagraph(3)],
        final: true,
        fade: false,
        viewportPriority: false,
        maxLiveNodes: 1,
        virtualScroll: {
          enabled: true,
          sessionKey: 'bottom-anchor-active',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()
    installRendererBottomGeometry(wrapper, scrollRoot, () => scrollHeight)

    const handle = wrapper.vm as any
    const contentEls = getRootNodeContentElements(wrapper.element)
    const initialHeights = [333, 333, 334]

    for (const [index, el] of contentEls.entries())
      platform.heights.set(el, initialHeights[index] ?? 333)
    for (const el of contentEls)
      platform.resizeCallbacks.get(el)?.([], {} as ResizeObserver)
    platform.flushFrames()
    const initialMetrics = await handle.forceMeasure('manual')

    handle.restoreVirtualState({
      sessionKey: 'bottom-anchor-active',
      anchor: { type: 'bottom', distanceFromBottomPx: 0 },
      metrics: handle.getVirtualMetrics(),
      width: 0,
    }, { restoreAnchor: true })

    await nextTick()

    expect(scrollRoot.scrollTop).toBe(
      Math.max(0, Math.max(scrollHeight, initialMetrics.totalHeight) - scrollRoot.clientHeight),
    )

    const nextHeights = [433, 433, 434]
    for (const [index, el] of contentEls.entries())
      platform.heights.set(el, nextHeights[index] ?? 433)
    scrollHeight = 1300

    const nextMetrics = await handle.forceMeasure('manual')
    platform.flushFrames()
    await nextTick()

    expect(scrollRoot.scrollTop).toBe(
      Math.max(0, Math.max(scrollHeight, nextMetrics.totalHeight) - scrollRoot.clientHeight),
    )

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('reconciles a restored bottom anchor when container width changes', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const scrollRoot = document.createElement('div')
    let scrollHeight = 1000

    document.body.appendChild(scrollRoot)
    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2), createParagraph(3)],
        final: true,
        fade: false,
        viewportPriority: false,
        maxLiveNodes: 1,
        virtualScroll: {
          enabled: true,
          sessionKey: 'bottom-anchor-resize',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()
    installRendererBottomGeometry(wrapper, scrollRoot, () => scrollHeight)

    const handle = wrapper.vm as any
    const contentEls = getRootNodeContentElements(wrapper.element)
    const initialHeights = [333, 333, 334]

    for (const [index, el] of contentEls.entries())
      platform.heights.set(el, initialHeights[index] ?? 333)
    for (const el of contentEls)
      platform.resizeCallbacks.get(el)?.([], {} as ResizeObserver)
    platform.flushFrames()
    const initialMetrics = await handle.forceMeasure('manual')

    handle.restoreVirtualState({
      sessionKey: 'bottom-anchor-resize',
      anchor: { type: 'bottom', distanceFromBottomPx: 0 },
      metrics: handle.getVirtualMetrics(),
      width: 0,
    }, { restoreAnchor: true })

    await nextTick()

    expect(scrollRoot.scrollTop).toBe(
      Math.max(0, Math.max(scrollHeight, initialMetrics.totalHeight) - scrollRoot.clientHeight),
    )

    scrollHeight = 1400
    const nextHeights = [466, 467, 467]
    for (const [index, el] of contentEls.entries())
      platform.heights.set(el, nextHeights[index] ?? 467)
    for (const el of contentEls)
      platform.resizeCallbacks.get(el)?.([], {} as ResizeObserver)
    platform.resizeCallbacks.get(wrapper.element)?.([], {} as ResizeObserver)
    platform.flushFrames()
    const nextMetrics = await handle.forceMeasure('manual')
    await nextTick()

    expect(scrollRoot.scrollTop).toBe(
      Math.max(0, Math.max(scrollHeight, nextMetrics.totalHeight) - scrollRoot.clientHeight),
    )

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('stops restoring a bottom anchor after the user scrolls away', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const scrollRoot = document.createElement('div')
    let scrollHeight = 1000

    document.body.appendChild(scrollRoot)
    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2), createParagraph(3)],
        final: true,
        fade: false,
        viewportPriority: false,
        maxLiveNodes: 1,
        virtualScroll: {
          enabled: true,
          sessionKey: 'bottom-anchor-user-scroll',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()
    installRendererBottomGeometry(wrapper, scrollRoot, () => scrollHeight)

    const handle = wrapper.vm as any
    const contentEls = getRootNodeContentElements(wrapper.element)
    const initialHeights = [333, 333, 334]

    for (const [index, el] of contentEls.entries())
      platform.heights.set(el, initialHeights[index] ?? 333)
    for (const el of contentEls)
      platform.resizeCallbacks.get(el)?.([], {} as ResizeObserver)
    platform.flushFrames()
    const initialMetrics = await handle.forceMeasure('manual')

    handle.restoreVirtualState({
      sessionKey: 'bottom-anchor-user-scroll',
      anchor: { type: 'bottom', distanceFromBottomPx: 0 },
      metrics: handle.getVirtualMetrics(),
      width: 0,
    }, { restoreAnchor: true })

    await nextTick()

    expect(scrollRoot.scrollTop).toBe(
      Math.max(0, Math.max(scrollHeight, initialMetrics.totalHeight) - scrollRoot.clientHeight),
    )

    scrollRoot.scrollTop = 700
    scrollRoot.dispatchEvent(new Event('scroll'))
    platform.flushFrames()
    await nextTick()

    const nextHeights = [433, 433, 434]
    for (const [index, el] of contentEls.entries())
      platform.heights.set(el, nextHeights[index] ?? 433)
    scrollHeight = 1300

    await handle.forceMeasure('manual')
    platform.flushFrames()
    await nextTick()

    expect(scrollRoot.scrollTop).toBe(700)

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('stops restoring a bottom anchor after the user scrolls away when node virtualization is disabled', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const scrollRoot = document.createElement('div')
    let scrollHeight = 1000

    document.body.appendChild(scrollRoot)
    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2), createParagraph(3)],
        final: true,
        fade: false,
        viewportPriority: false,
        maxLiveNodes: 0,
        virtualScroll: {
          enabled: true,
          sessionKey: 'bottom-anchor-user-scroll-no-node-virtualization',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()
    installRendererBottomGeometry(wrapper, scrollRoot, () => scrollHeight)

    const handle = wrapper.vm as any
    handle.restoreVirtualState({
      sessionKey: 'bottom-anchor-user-scroll-no-node-virtualization',
      anchor: { type: 'bottom', distanceFromBottomPx: 0 },
      metrics: handle.getVirtualMetrics(),
      width: 0,
    }, { restoreAnchor: true })

    expect(scrollRoot.scrollTop).toBe(800)

    scrollRoot.scrollTop = 700
    scrollRoot.dispatchEvent(new Event('scroll'))

    for (const el of getRootNodeContentElements(wrapper.element))
      platform.heights.set(el, 100)
    scrollHeight = 1300

    await handle.forceMeasure('manual')
    platform.flushFrames()
    await nextTick()

    expect(scrollRoot.scrollTop).toBe(700)

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('computes scrollRoot-relative offsets from bounding rects', async () => {
    const { useViewportRoot } = await import('../src/components/NodeRenderer/composables/useViewportRoot')
    const containerRef = ref<HTMLElement>()
    const root = document.createElement('div')
    const node = document.createElement('div')
    const rect = (top: number, height = 20) => ({
      x: 0,
      y: top,
      top,
      bottom: top + height,
      left: 0,
      right: 100,
      width: 100,
      height,
      toJSON: () => ({}),
    }) as DOMRect

    root.scrollTop = 300
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(rect(100))
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(rect(450))

    const viewport = useViewportRoot(containerRef, { isClient: true })

    expect(viewport.getOffsetTopWithinRoot(node, root)).toBe(650)
  })

  it('reads body scrollTop for viewport roots when documentElement scrollTop is zero', async () => {
    const { useViewportRoot } = await import('../src/components/NodeRenderer/composables/useViewportRoot')
    const containerRef = ref<HTMLElement>()
    const viewport = useViewportRoot(containerRef, { isClient: true })

    document.documentElement.scrollTop = 0
    document.body.scrollTop = 320

    expect(viewport.getNormalizedScrollTop(document.documentElement, document, true)).toBe(320)

    document.body.scrollTop = 0
  })

  it('settles the original lifecycle key when indexKey changes while image is pending', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(72)

    const markPending = vi.fn()
    const reportHeight = vi.fn()
    const markSettled = vi.fn()
    const indexKey = ref('markdown-renderer-0')
    const ImageNode = (await import('../src/components/ImageNode')).default
    const node = {
      type: 'image',
      src: 'https://example.com/hero.png',
      alt: 'Hero',
      title: 'Hero',
      raw: '![Hero](https://example.com/hero.png)',
    } as any

    const Host = defineComponent({
      setup() {
        return () => h(ImageNode, {
          node,
          'index-key': indexKey.value,
        })
      },
    })

    const wrapper = mount(Host, {
      global: {
        provide: {
          [MARKSTREAM_NODE_LIFECYCLE_KEY]: {
            markPending,
            reportHeight,
            markSettled,
          },
        },
      },
    })

    await flushAll()

    expect(markPending).toHaveBeenCalledWith('markdown-renderer-0')

    indexKey.value = 'markdown-renderer-1'
    await nextTick()

    await wrapper.get('img').trigger('load')
    await flushAll()

    expect(markSettled).toHaveBeenCalledWith('markdown-renderer-0')

    wrapper.unmount()
  })
})
