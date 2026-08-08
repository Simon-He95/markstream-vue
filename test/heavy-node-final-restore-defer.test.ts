import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h } from 'vue'
import { flushAll } from './setup/flush-all'

interface Entry { target: Element, isIntersecting: boolean, intersectionRatio: number }
interface ObserverInit {
  root?: Element | Document | null
  rootMargin?: string
  threshold?: number | number[]
}

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  callback: (entries: Entry[]) => void
  elements = new Set<Element>()
  options: ObserverInit

  constructor(callback: (entries: Entry[]) => void, options: ObserverInit = {}) {
    this.callback = callback
    this.options = options
    FakeIntersectionObserver.instances.push(this)
  }

  observe(element: Element) {
    this.elements.add(element)
  }

  unobserve(element: Element) {
    this.elements.delete(element)
  }

  disconnect() {
    this.elements.clear()
  }

  trigger(element: Element) {
    if (!this.elements.has(element))
      return
    this.callback([{ target: element, isIntersecting: true, intersectionRatio: 1 }])
  }
}

const idleCallbacks: Array<(deadline: { didTimeout: boolean, timeRemaining: () => number }) => void> = []
let idleId = 0

async function drainIdleCallbacks() {
  while (idleCallbacks.length) {
    const callback = idleCallbacks.shift()!
    callback({ didTimeout: true, timeRemaining: () => 0 })
    await flushAll()
  }
}

async function drainCurrentlyQueuedIdleCallbacks() {
  const queued = idleCallbacks.splice(0)
  for (const callback of queued) {
    callback({ didTimeout: true, timeRemaining: () => 0 })
    await flushAll()
  }
}

async function waitForSelector(wrapper: ReturnType<typeof mount>, selector: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const match = wrapper.find(selector)
    if (match.exists())
      return match
    await flushAll()
  }
  return wrapper.find(selector)
}

async function waitForRequiredSelector(wrapper: ReturnType<typeof mount>, selector: string) {
  await vi.waitFor(() => {
    expect(wrapper.find(selector).exists()).toBe(true)
  }, { timeout: 3000 })
  return wrapper.get(selector)
}

function findObserver(element: Element) {
  return FakeIntersectionObserver.instances.find(instance => instance.elements.has(element))
}

function createMixedHistoryContent() {
  return [
    'History semantic start',
    '![History integration image](https://example.com/history-integration.png)',
    '```ts\nconst restoredMeaning = "code-semantic"\n```',
    'Inline math keeps $x^2 + y^2$ semantic.',
    '```mermaid\ngraph TD\n  HistoryStart --> HistoryEnd\n```',
    '```infographic\ntitle: Integration history\ndata:\n  - label: One\n  - label: Two\n```',
    ...Array.from({ length: 60 }, (_, index) => `Restored filler paragraph ${index + 1}`),
    'History semantic end',
  ].join('\n\n')
}

async function mountWithHistoryDeferral(component: any, props: Record<string, unknown>) {
  const viewportPriority = await import('../src/composables/viewportPriority')
  const Host = defineComponent({
    setup() {
      viewportPriority.provideViewportPriorityOptions(computed(() => ({
        rootMargin: '120px',
        heavyBlockMargin: '240px',
      })))
      viewportPriority.provideOffscreenHeavyNodeDeferral(computed(() => true))
      viewportPriority.provideViewportPriority(() => null, true)
      return () => h(component, props)
    },
  })
  return mount(Host)
}

describe('final restore heavy-node deferral', () => {
  beforeEach(() => {
    vi.resetModules()
    FakeIntersectionObserver.instances = []
    idleCallbacks.length = 0
    idleId = 0
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)
    ;(window as any).requestIdleCallback = vi.fn((callback) => {
      idleCallbacks.push(callback)
      return ++idleId
    })
    ;(window as any).cancelIdleCallback = vi.fn()
  })

  afterEach(async () => {
    const infographic = await import('../src/components/InfographicBlockNode/infographic')
    infographic.disableInfographic()
    vi.doUnmock('../src/components/CodeBlockNode/streamDiffs')
    vi.doUnmock('../src/components/D2BlockNode/d2')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete (window as any).requestIdleCallback
    delete (window as any).cancelIdleCallback
    FakeIntersectionObserver.instances = []
    idleCallbacks.length = 0
  })

  it('does not start an image request until the history image enters the preload viewport', async () => {
    const setImageSrc = vi.spyOn(HTMLImageElement.prototype, 'src', 'set')
    const MarkdownRender = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(MarkdownRender, {
      props: {
        content: '![History image](https://example.com/history.png)',
        final: true,
        mode: 'chat',
        batchRendering: false,
        viewportPriority: true,
        viewportPriorityOptions: { heavyBlockMargin: '240px' },
      },
    })

    try {
      const target = await waitForSelector(wrapper, '.image-node-container')
      const image = wrapper.get('img')
      const countImageRequests = () => setImageSrc.mock.calls.filter(
        ([src]) => src === 'https://example.com/history.png',
      ).length

      expect(target.exists()).toBe(true)
      expect(countImageRequests()).toBe(0)
      expect(image.attributes('src')).toBeUndefined()
      expect(wrapper.find('.image-shimmer-overlay').exists()).toBe(true)
      expect(target.attributes('data-markstream-viewport-pending')).toBe('true')

      await drainIdleCallbacks()
      expect(countImageRequests()).toBe(0)

      const observer = findObserver(target.element)
      expect(observer?.options.rootMargin).toBe('240px')
      observer?.trigger(target.element)
      await flushAll()

      expect(countImageRequests()).toBe(1)
      expect(image.attributes('src')).toBe('https://example.com/history.png')
      expect(target.attributes('data-markstream-viewport-pending')).toBeUndefined()
    }
    finally {
      wrapper.unmount()
    }
  })

  it('renders heavy content immediately when viewportPriority is disabled', async () => {
    const setImageSrc = vi.spyOn(HTMLImageElement.prototype, 'src', 'set')
    const MarkdownRender = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(MarkdownRender, {
      props: {
        content: '![Immediate image](https://example.com/immediate.png)',
        final: true,
        mode: 'chat',
        batchRendering: false,
        viewportPriority: false,
      },
    })

    try {
      const target = await waitForSelector(wrapper, '.image-node-container')
      const image = wrapper.get('img')
      const requestCount = setImageSrc.mock.calls.filter(
        ([src]) => src === 'https://example.com/immediate.png',
      ).length

      expect(requestCount).toBe(1)
      expect(image.attributes('src')).toBe('https://example.com/immediate.png')
      expect(target.attributes('data-markstream-viewport-pending')).toBeUndefined()
      expect(findObserver(target.element)).toBeUndefined()
    }
    finally {
      wrapper.unmount()
    }
  })

  it('does not idle-load an offscreen image while chat content is still streaming', async () => {
    const setImageSrc = vi.spyOn(HTMLImageElement.prototype, 'src', 'set')
    const MarkdownRender = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(MarkdownRender, {
      props: {
        content: '![Streaming image](https://example.com/streaming.png)',
        final: false,
        mode: 'chat',
        batchRendering: false,
      },
    })

    try {
      const target = await waitForSelector(wrapper, '.image-node-container')
      const image = wrapper.get('img')
      const countImageRequests = () => setImageSrc.mock.calls.filter(
        ([src]) => src === 'https://example.com/streaming.png',
      ).length

      expect(target.exists()).toBe(true)
      expect(countImageRequests()).toBe(0)
      expect(image.attributes('src')).toBeUndefined()

      await drainIdleCallbacks()
      expect(countImageRequests()).toBe(0)

      const observer = findObserver(target.element)
      expect(observer).toBeTruthy()
      observer?.trigger(target.element)
      await flushAll()

      expect(countImageRequests()).toBe(1)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('does not load the stream-diffs runtime for an offscreen history block', async () => {
    const runtimeLoader = vi.fn(async () => null)
    vi.doMock('../src/components/CodeBlockNode/streamDiffs', () => ({
      getStreamDiffsRuntime: runtimeLoader,
    }))
    const component = (await import('../src/components/CodeBlockNode/CodeBlockNode.vue')).default
    const wrapper = await mountWithHistoryDeferral(component, {
      node: {
        type: 'code_block',
        language: 'ts',
        code: 'console.log(1)',
        raw: '```ts\nconsole.log(1)\n```',
        loading: false,
      },
      loading: false,
      stream: false,
    })

    try {
      const target = await waitForSelector(wrapper, '[data-markstream-code-block="1"]')
      expect(target.exists()).toBe(true)
      expect(target.find('[data-markstream-pre="1"]').exists()).toBe(true)
      expect(runtimeLoader).toHaveBeenCalledTimes(0)

      await drainIdleCallbacks()
      expect(runtimeLoader).toHaveBeenCalledTimes(0)

      const observer = findObserver(target.element)
      expect(observer?.options.rootMargin).toBe('240px')
      observer?.trigger(target.element)
      await flushAll()

      expect(runtimeLoader).toHaveBeenCalledTimes(1)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('does not load or render an offscreen history infographic', async () => {
    const render = vi.fn()
    const loader = vi.fn(async () => class FakeInfographic {
      container: HTMLElement

      constructor(options: { container: HTMLElement }) {
        this.container = options.container
      }

      render(source: string) {
        render(source)
        this.container.innerHTML = '<svg data-infographic-preview="1" />'
      }
    })
    const infographic = await import('../src/components/InfographicBlockNode/infographic')
    infographic.setInfographicLoader(loader)
    const InfographicBlockNode = (await import('../src/components/InfographicBlockNode/InfographicBlockNode.vue')).default
    const wrapper = await mountWithHistoryDeferral(InfographicBlockNode, {
      node: {
        type: 'code_block',
        language: 'infographic',
        code: 'title: History\ndata: [1, 2, 3]',
        raw: '```infographic\ntitle: History\ndata: [1, 2, 3]\n```',
        loading: false,
      },
      loading: false,
    })

    try {
      const target = await waitForSelector(wrapper, '[data-markstream-infographic="1"]')
      expect(target.exists()).toBe(true)
      expect(target.attributes('data-markstream-mode')).toBe('pending')
      expect(target.find('.infographic-pending-source').text()).toContain('title: History')
      expect(target.get('.infographic-preview').attributes('style')).toContain('height:')
      expect(loader).toHaveBeenCalledTimes(0)
      expect(render).toHaveBeenCalledTimes(0)

      await drainIdleCallbacks()
      expect(loader).toHaveBeenCalledTimes(0)
      expect(render).toHaveBeenCalledTimes(0)

      const observer = findObserver(target.element)
      expect(observer?.options.rootMargin).toBe('240px')
      observer?.trigger(target.element)
      await flushAll()
      await flushAll()

      expect(loader).toHaveBeenCalledTimes(1)
      expect(render).toHaveBeenCalledTimes(1)
      expect(target.attributes('data-markstream-mode')).toBe('preview')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('does not load D2 for an offscreen history block', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(performance.now())
      return 1
    })
    const getD2 = vi.fn(async () => class FakeD2 {
      async compile(code: string) {
        return { diagram: code }
      }

      async render(diagram: string) {
        return { svg: `<svg><text>${diagram}</text></svg>` }
      }
    })
    vi.doMock('../src/components/D2BlockNode/d2', () => ({ getD2 }))
    const D2BlockNode = (await import('../src/components/D2BlockNode/D2BlockNode.vue')).default
    const wrapper = await mountWithHistoryDeferral(D2BlockNode, {
      node: {
        type: 'code_block',
        language: 'd2',
        code: 'a -> b',
        raw: '```d2\na -> b\n```',
        loading: false,
      },
      loading: false,
    })

    try {
      await flushAll()
      const target = wrapper.get('[data-markstream-d2="1"]')
      expect(target.text()).toContain('a -> b')
      expect(getD2).toHaveBeenCalledTimes(0)

      await drainIdleCallbacks()
      expect(getD2).toHaveBeenCalledTimes(0)

      const observer = findObserver(target.element)
      expect(observer?.options.rootMargin).toBe('240px')
      observer?.trigger(target.element)
      await flushAll()
      await flushAll()

      expect(getD2).toHaveBeenCalledTimes(1)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('keeps deferred HTML lightweight until its history shell enters the preload viewport', async () => {
    const HtmlBlockNode = (await import('../src/components/HtmlBlockNode/HtmlBlockNode.vue')).default
    const wrapper = await mountWithHistoryDeferral(HtmlBlockNode, {
      node: {
        type: 'html_block',
        content: '<div data-heavy-html="1">Heavy HTML</div>',
        raw: '<div data-heavy-html="1">Heavy HTML</div>',
        loading: true,
      },
    })

    try {
      await flushAll()
      const target = wrapper.get('.html-block-node')
      expect(wrapper.find('[data-heavy-html="1"]').exists()).toBe(false)

      await drainIdleCallbacks()
      expect(wrapper.find('[data-heavy-html="1"]').exists()).toBe(false)

      const observer = findObserver(target.element)
      expect(observer?.options.rootMargin).toBe('240px')
      observer?.trigger(target.element)
      await flushAll()

      expect(wrapper.get('[data-heavy-html="1"]').text()).toBe('Heavy HTML')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('bounds a mixed final history restore and enhances heavy nodes only after their viewport signals', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    let wrapper: ReturnType<typeof mount> | null = null
    const originalGetBBox = (SVGElement.prototype as any).getBBox
    Object.defineProperty(SVGElement.prototype, 'getBBox', {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 100, height: 20 }),
    })
    const setImageSrc = vi.spyOn(HTMLImageElement.prototype, 'src', 'set')
    const katexRender = vi.fn((content: string) => `<span class="katex">${content}</span>`)
    const katexLoader = vi.fn(async () => ({ renderToString: katexRender }))
    const mermaidRender = vi.fn(async () => ({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>History mermaid enhanced</text></svg>',
    }))
    const mermaidLoader = vi.fn(async () => ({
      initialize: vi.fn(),
      parse: vi.fn(async () => true),
      render: mermaidRender,
    }))
    const infographicRender = vi.fn()
    const infographicLoader = vi.fn(async () => class FakeInfographic {
      container: HTMLElement

      constructor(options: { container: HTMLElement }) {
        this.container = options.container
      }

      render(source: string) {
        infographicRender(source)
        this.container.innerHTML = '<svg data-infographic-preview="1"><text>History infographic enhanced</text></svg>'
      }
    })

    let editorCode = ''
    const editorView = {
      getModel: () => ({
        getLineCount: () => 1,
        getValue: () => editorCode,
      }),
      getOption: () => 14,
      updateOptions: vi.fn(),
      layout: vi.fn(),
      getContentHeight: () => 20,
    }
    const monacoHelpers = {
      createEditor: vi.fn(async (container: HTMLElement, code: string) => {
        editorCode = code
        const surface = document.createElement('diffs-container')
        surface.textContent = code
        container.replaceChildren(surface)
      }),
      createDiffEditor: vi.fn(),
      updateCode: vi.fn(),
      updateDiff: vi.fn(),
      getEditor: vi.fn(() => null),
      getEditorView: vi.fn(() => editorView),
      getDiffEditorView: vi.fn(() => editorView),
      cleanupEditor: vi.fn(),
      safeClean: vi.fn(),
      refreshDiffPresentation: vi.fn(),
      setTheme: vi.fn(async () => {}),
    }
    const useMonaco = vi.fn(() => monacoHelpers)
    const streamDiffsLoader = vi.fn(async () => ({
      useMonaco,
      detectLanguage: () => 'typescript',
    }))
    vi.doMock('../src/components/CodeBlockNode/streamDiffs', () => ({
      getStreamDiffsRuntime: streamDiffsLoader,
    }))

    try {
      const katex = await import('../src/components/MathInlineNode/katex')
      const mermaid = await import('../src/components/MermaidBlockNode/mermaid')
      const infographic = await import('../src/components/InfographicBlockNode/infographic')
      katex.setKatexLoader(katexLoader)
      mermaid.setMermaidLoader(mermaidLoader)
      infographic.setInfographicLoader(infographicLoader)

      const MarkdownRender = (await import('../src/components/NodeRenderer')).default
      wrapper = mount(MarkdownRender, {
        attachTo: document.body,
        props: {
          content: createMixedHistoryContent(),
          final: true,
          mode: 'chat',
          codeRenderer: 'stream-diffs',
          smoothStreaming: false,
          batchRendering: false,
          fade: false,
          viewportPriority: true,
          viewportPriorityOptions: { heavyBlockMargin: '240px' },
        },
      })

      const imageTarget = await waitForRequiredSelector(wrapper, '.image-node-container')
      const codeTarget = await waitForRequiredSelector(wrapper, '[data-markstream-code-block="1"]')
      const mathTarget = await waitForRequiredSelector(wrapper, '[data-markstream-math="inline"]')
      await waitForRequiredSelector(wrapper, '.mermaid-source-code')
      await waitForRequiredSelector(wrapper, '.infographic-pending-source')
      const mermaidTarget = wrapper.get('[data-markstream-mermaid="1"]')
      const infographicTarget = wrapper.get('[data-markstream-infographic="1"]')
      const image = imageTarget.get('img')
      const metrics = (wrapper.vm as any).getVirtualMetrics()
      const liveSlots = wrapper.findAll(':scope > .node-slot')
      const countHistoryImageRequests = () => setImageSrc.mock.calls.filter(
        ([src]) => src === 'https://example.com/history-integration.png',
      ).length

      expect(wrapper.classes()).toContain('virtualized')
      expect(metrics.nodeCount).toBe(67)
      expect(metrics.liveRange.end - metrics.liveRange.start).toBeLessThanOrEqual(50)
      expect(metrics.bottomSpacerHeight).toBeGreaterThan(0)
      expect(liveSlots.length).toBeGreaterThan(0)
      expect(liveSlots.length).toBeLessThanOrEqual(50)
      expect(liveSlots.every(slot => findObserver(slot.element) == null)).toBe(true)

      await vi.waitFor(() => {
        expect(wrapper.text()).toContain('History semantic start')
        expect(image.attributes('alt')).toBe('History integration image')
        expect(codeTarget.text()).toContain('code-semantic')
        expect(mathTarget.attributes('data-markstream-mode')).toBe('katex')
        expect(mathTarget.text()).toContain('x^2 + y^2')
        expect(mermaidTarget.text()).toContain('HistoryStart --> HistoryEnd')
        expect(infographicTarget.text()).toContain('title: Integration history')
      }, { timeout: 3000 })

      expect(countHistoryImageRequests()).toBe(0)
      expect(streamDiffsLoader).toHaveBeenCalledTimes(0)
      expect(katexLoader).toHaveBeenCalledTimes(1)
      expect(katexRender).toHaveBeenCalledTimes(1)
      expect(mermaidLoader).toHaveBeenCalledTimes(0)
      expect(infographicLoader).toHaveBeenCalledTimes(0)

      await drainCurrentlyQueuedIdleCallbacks()

      expect(countHistoryImageRequests()).toBe(0)
      expect(streamDiffsLoader).toHaveBeenCalledTimes(0)
      expect(katexLoader).toHaveBeenCalledTimes(1)
      expect(mermaidLoader).toHaveBeenCalledTimes(0)
      expect(infographicLoader).toHaveBeenCalledTimes(0)
      expect(findObserver(mathTarget.element)).toBeUndefined()

      const viewportTargets = [
        imageTarget.element,
        codeTarget.element,
        mermaidTarget.element,
        infographicTarget.element,
      ]
      for (const target of viewportTargets) {
        const observer = findObserver(target)
        expect(observer).toBeTruthy()
        observer?.trigger(target)
      }

      const deferredComponentTargets = [
        ['[data-markstream-code-block="1"]', codeTarget.element],
        ['[data-markstream-mermaid="1"]', mermaidTarget.element],
        ['[data-markstream-infographic="1"]', infographicTarget.element],
      ] as const
      await vi.waitFor(() => {
        for (const [selector, initialElement] of deferredComponentTargets)
          expect(wrapper.get(selector).element).not.toBe(initialElement)
      }, { timeout: 3000 })
      for (const [selector] of deferredComponentTargets) {
        let observer: FakeIntersectionObserver | undefined
        await vi.waitFor(() => {
          observer = findObserver(wrapper.get(selector).element)
          expect(observer, selector).toBeTruthy()
        }, { timeout: 3000 })
        const target = wrapper.get(selector).element
        observer?.trigger(target)
      }

      await vi.waitFor(() => {
        const enhancedCodeTarget = wrapper.get('[data-markstream-code-block="1"]')
        const enhancedMathTarget = wrapper.get('[data-markstream-math="inline"]')
        const enhancedMermaidTarget = wrapper.get('[data-markstream-mermaid="1"]')
        const enhancedInfographicTarget = wrapper.get('[data-markstream-infographic="1"]')
        expect(countHistoryImageRequests()).toBe(1)
        expect(image.attributes('src')).toBe('https://example.com/history-integration.png')
        expect(streamDiffsLoader).toHaveBeenCalledTimes(1)
        expect(monacoHelpers.createEditor).toHaveBeenCalledTimes(1)
        expect(enhancedCodeTarget.attributes('data-markstream-enhanced')).toBe('true')
        expect(enhancedCodeTarget.text()).toContain('code-semantic')
        expect(katexLoader).toHaveBeenCalledTimes(1)
        expect(katexRender).toHaveBeenCalledTimes(1)
        expect(enhancedMathTarget.attributes('data-markstream-mode')).toBe('katex')
        expect(enhancedMathTarget.text()).toContain('x^2 + y^2')
        expect(mermaidLoader).toHaveBeenCalledTimes(1)
        expect(mermaidRender).toHaveBeenCalledTimes(1)
        expect(enhancedMermaidTarget.attributes('data-markstream-mode')).toBe('preview')
        expect(enhancedMermaidTarget.text()).toContain('History mermaid enhanced')
        expect(infographicLoader).toHaveBeenCalledTimes(1)
        expect(infographicRender).toHaveBeenCalledTimes(1)
        expect(enhancedInfographicTarget.attributes('data-markstream-mode')).toBe('preview')
        expect(enhancedInfographicTarget.text()).toContain('History infographic enhanced')
      }, { timeout: 4000 })
    }
    finally {
      wrapper?.unmount()
      const katex = await import('../src/components/MathInlineNode/katex')
      const mermaid = await import('../src/components/MermaidBlockNode/mermaid')
      const infographic = await import('../src/components/InfographicBlockNode/infographic')
      katex.disableKatex()
      mermaid.disableMermaid()
      infographic.disableInfographic()
      vi.doUnmock('../src/components/CodeBlockNode/streamDiffs')
      if (originalGetBBox) {
        Object.defineProperty(SVGElement.prototype, 'getBBox', {
          configurable: true,
          value: originalGetBBox,
        })
      }
      else {
        delete (SVGElement.prototype as any).getBBox
      }
      process.env.NODE_ENV = originalNodeEnv
    }
  })
})
