import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, onMounted, ref } from 'vue'
import { provideViewportPriority, useViewportPriority } from '../src/composables/viewportPriority'
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

  constructor(cb: (entries: Entry[]) => void, options: ObserverInit = {}) {
    this.callback = cb
    this.options = options
    FakeIntersectionObserver.instances.push(this)
  }

  observe(el: Element) {
    this.elements.add(el)
  }

  unobserve(el: Element) {
    this.elements.delete(el)
  }

  disconnect() {
    this.elements.clear()
  }

  trigger(el: Element, isIntersecting = true) {
    if (!this.elements.has(el))
      return
    this.callback([{ target: el, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 }])
  }
}

class ThrowingRootMarginIntersectionObserver extends FakeIntersectionObserver {
  constructor(cb: (entries: Entry[]) => void, options: ObserverInit = {}) {
    if (options.rootMargin === 'invalid-root-margin')
      throw new TypeError('invalid rootMargin')
    super(cb, options)
  }
}

beforeEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
  FakeIntersectionObserver.instances = []
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
  FakeIntersectionObserver.instances = []
})

describe('markdownRender deferNodesUntilVisible', () => {
  it('resolves viewport roots after sibling DOM updates have finished', async () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)
    const resolvedSiblings: Array<string | null> = []
    const Probe = defineComponent({
      setup() {
        const register = provideViewportPriority((target) => {
          resolvedSiblings.push(target?.nextElementSibling?.getAttribute('data-sibling') ?? null)
          return null
        }, true)
        return () => h('div', [
          h('div', {
            ref: (el) => {
              if (el)
                register(el as HTMLElement, { allowIdle: false })
            },
          }),
          h('div', { 'data-sibling': 'mounted' }),
        ])
      },
    })
    const wrapper = mount(Probe)
    await nextTick()
    expect(resolvedSiblings.length).toBeGreaterThan(0)
    expect(resolvedSiblings.every(value => value === 'mounted')).toBe(true)
    expect(FakeIntersectionObserver.instances[0]?.elements.size).toBe(1)
    wrapper.unmount()
  })

  it('does not observe a target destroyed before the DOM flush finishes', async () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)
    const getRoot = vi.fn(() => null)
    const Probe = defineComponent({
      setup() {
        const register = provideViewportPriority(getRoot, true)
        onMounted(() => {
          const handle = register(document.createElement('div'), { allowIdle: false })
          handle.destroy()
        })
        return () => h('div')
      },
    })
    const wrapper = mount(Probe)
    await nextTick()
    expect(getRoot).not.toHaveBeenCalled()
    expect(FakeIntersectionObserver.instances).toHaveLength(0)
    wrapper.unmount()
  })

  it('settles registered viewport-priority targets when disabled after registration', async () => {
    const OriginalIO = globalThis.IntersectionObserver
    const benchmarkWindow = window as any
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)
    benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__ = true

    const Probe = defineComponent({
      setup() {
        const enabled = ref(true)
        const target = ref<HTMLElement | null>(null)
        const visible = ref(false)
        const resolved = ref(false)
        const register = provideViewportPriority(() => null, enabled)

        onMounted(() => {
          const handle = register(target.value!)
          visible.value = handle.isVisible.value
          handle.whenVisible.then(() => {
            visible.value = handle.isVisible.value
            resolved.value = true
          })
        })

        return { enabled, resolved, target, visible }
      },
      template: '<div><div ref="target" data-target="1" /></div>',
    })

    let wrapper: ReturnType<typeof mount> | null = null
    try {
      wrapper = mount(Probe)
      await flushAll()

      const target = wrapper.get('[data-target="1"]').element
      const observer = FakeIntersectionObserver.instances.find(instance => instance.elements.has(target))
      expect(observer).toBeTruthy()
      expect(wrapper.vm.visible).toBe(false)
      expect(wrapper.vm.resolved).toBe(false)

      wrapper.vm.enabled = false
      await flushAll()

      expect(observer?.elements.has(target)).toBe(false)
      expect(wrapper.vm.visible).toBe(true)
      expect(wrapper.vm.resolved).toBe(true)
    }
    finally {
      wrapper?.unmount()
      delete benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__
      vi.stubGlobal('IntersectionObserver', OriginalIO as any)
    }
  })

  it('keeps viewport-priority targets with different observer configs independent', async () => {
    const OriginalIO = globalThis.IntersectionObserver
    const benchmarkWindow = window as any
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)
    benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__ = true

    const Probe = defineComponent({
      setup() {
        const shell = ref<HTMLElement | null>(null)
        const heavy = ref<HTMLElement | null>(null)
        const shellVisible = ref(false)
        const heavyVisible = ref(false)
        const shellResolved = ref(false)
        const heavyResolved = ref(false)
        const register = provideViewportPriority(() => null, true)

        onMounted(() => {
          const shellHandle = register(shell.value!, { rootMargin: '800px' })
          const heavyHandle = register(heavy.value!, { rootMargin: '0px' })

          shellHandle.whenVisible.then(() => {
            shellVisible.value = shellHandle.isVisible.value
            shellResolved.value = true
          })
          heavyHandle.whenVisible.then(() => {
            heavyVisible.value = heavyHandle.isVisible.value
            heavyResolved.value = true
          })
        })

        return { heavy, heavyResolved, heavyVisible, shell, shellResolved, shellVisible }
      },
      template: '<div><div ref="shell" data-target="shell" /><div ref="heavy" data-target="heavy" /></div>',
    })

    let wrapper: ReturnType<typeof mount> | null = null
    try {
      wrapper = mount(Probe)
      await flushAll()

      const shell = wrapper.get('[data-target="shell"]').element
      const heavy = wrapper.get('[data-target="heavy"]').element
      const shellObserver = FakeIntersectionObserver.instances.find(instance => instance.options.rootMargin === '800px')
      const heavyObserver = FakeIntersectionObserver.instances.find(instance => instance.options.rootMargin === '0px')

      expect(shellObserver).toBeTruthy()
      expect(heavyObserver).toBeTruthy()
      expect(shellObserver).not.toBe(heavyObserver)
      expect(shellObserver?.elements.has(shell)).toBe(true)
      expect(shellObserver?.elements.has(heavy)).toBe(false)
      expect(heavyObserver?.elements.has(heavy)).toBe(true)
      expect(heavyObserver?.elements.has(shell)).toBe(false)

      shellObserver?.trigger(shell, true)
      await flushAll()

      expect(wrapper.vm.shellVisible).toBe(true)
      expect(wrapper.vm.shellResolved).toBe(true)
      expect(wrapper.vm.heavyVisible).toBe(false)
      expect(wrapper.vm.heavyResolved).toBe(false)
      expect(heavyObserver?.elements.has(heavy)).toBe(true)

      heavyObserver?.trigger(heavy, true)
      await flushAll()

      expect(wrapper.vm.heavyVisible).toBe(true)
      expect(wrapper.vm.heavyResolved).toBe(true)
    }
    finally {
      wrapper?.unmount()
      delete benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__
      vi.stubGlobal('IntersectionObserver', OriginalIO as any)
    }
  })

  it('honors rootMargin and threshold in viewport-priority fallback without a provider', async () => {
    const OriginalIO = globalThis.IntersectionObserver
    const benchmarkWindow = window as any
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)
    benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__ = true

    const Probe = defineComponent({
      setup() {
        const shell = ref<HTMLElement | null>(null)
        const heavy = ref<HTMLElement | null>(null)
        const shellVisible = ref(false)
        const heavyVisible = ref(false)
        const register = useViewportPriority()

        onMounted(() => {
          const shellHandle = register(shell.value!, { rootMargin: '900px', threshold: 0.25 })
          const heavyHandle = register(heavy.value!, { rootMargin: '0px', threshold: 0 })

          shellHandle.whenVisible.then(() => {
            shellVisible.value = shellHandle.isVisible.value
          })
          heavyHandle.whenVisible.then(() => {
            heavyVisible.value = heavyHandle.isVisible.value
          })
        })

        return { heavy, heavyVisible, shell, shellVisible }
      },
      template: '<div><div ref="shell" data-target="shell" /><div ref="heavy" data-target="heavy" /></div>',
    })

    let wrapper: ReturnType<typeof mount> | null = null
    try {
      wrapper = mount(Probe)
      await flushAll()

      const shell = wrapper.get('[data-target="shell"]').element
      const heavy = wrapper.get('[data-target="heavy"]').element
      const shellObserver = FakeIntersectionObserver.instances.find(instance =>
        instance.options.rootMargin === '900px' && instance.options.threshold === 0.25,
      )
      const heavyObserver = FakeIntersectionObserver.instances.find(instance =>
        instance.options.rootMargin === '0px' && instance.options.threshold === 0,
      )

      expect(shellObserver).toBeTruthy()
      expect(heavyObserver).toBeTruthy()
      expect(shellObserver).not.toBe(heavyObserver)
      expect(shellObserver?.elements.has(shell)).toBe(true)
      expect(shellObserver?.elements.has(heavy)).toBe(false)
      expect(heavyObserver?.elements.has(heavy)).toBe(true)
      expect(heavyObserver?.elements.has(shell)).toBe(false)

      shellObserver?.trigger(shell, true)
      await flushAll()

      expect(wrapper.vm.shellVisible).toBe(true)
      expect(wrapper.vm.heavyVisible).toBe(false)
      expect(heavyObserver?.elements.has(heavy)).toBe(true)
    }
    finally {
      wrapper?.unmount()
      delete benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__
      vi.stubGlobal('IntersectionObserver', OriginalIO as any)
    }
  })

  it('settles provider registrations immediately when rootMargin is invalid', async () => {
    const OriginalIO = globalThis.IntersectionObserver
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('IntersectionObserver', ThrowingRootMarginIntersectionObserver as any)

    const Probe = defineComponent({
      setup() {
        const target = ref<HTMLElement | null>(null)
        const visible = ref(false)
        const resolved = ref(false)
        const register = provideViewportPriority(() => null, true)

        onMounted(() => {
          const handle = register(target.value!, { rootMargin: 'invalid-root-margin' })
          visible.value = handle.isVisible.value
          handle.whenVisible.then(() => {
            visible.value = handle.isVisible.value
            resolved.value = true
          })
        })

        return { resolved, target, visible }
      },
      template: '<div><div ref="target" data-target="1" /></div>',
    })

    let wrapper: ReturnType<typeof mount> | null = null
    try {
      wrapper = mount(Probe)
      await flushAll()

      expect(wrapper.vm.visible).toBe(true)
      expect(wrapper.vm.resolved).toBe(true)
      expect(FakeIntersectionObserver.instances).toHaveLength(0)
    }
    finally {
      wrapper?.unmount()
      warn.mockRestore()
      vi.stubGlobal('IntersectionObserver', OriginalIO as any)
    }
  })

  it('refreshes provider registrations when the resolved root changes', async () => {
    const OriginalIO = globalThis.IntersectionObserver
    const benchmarkWindow = window as any
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)
    benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__ = true

    const Probe = defineComponent({
      setup() {
        const activeRoot = ref<HTMLElement | null>(null)
        const rootElement = ref<HTMLElement | null>(null)
        const target = ref<HTMLElement | null>(null)
        const register = provideViewportPriority(() => activeRoot.value, true)

        onMounted(() => {
          register(target.value!, { rootMargin: '0px' })
        })

        function activateRoot() {
          activeRoot.value = rootElement.value
          register.refresh?.()
        }

        return { activateRoot, rootElement, target }
      },
      template: '<div><div ref="rootElement" data-root="1"><div ref="target" data-target="1" /></div></div>',
    })

    let wrapper: ReturnType<typeof mount> | null = null
    try {
      wrapper = mount(Probe)
      await flushAll()

      const target = wrapper.get('[data-target="1"]').element
      const root = wrapper.get('[data-root="1"]').element
      const initialObserver = FakeIntersectionObserver.instances.find(instance => instance.elements.has(target))

      expect(initialObserver).toBeTruthy()
      expect(initialObserver?.options.root).toBe(null)

      wrapper.vm.activateRoot()
      await flushAll()

      const migratedObserver = FakeIntersectionObserver.instances.find(instance => instance.elements.has(target))
      expect(migratedObserver).toBeTruthy()
      expect(migratedObserver).not.toBe(initialObserver)
      expect(migratedObserver?.options.root).toBe(root)
      expect(initialObserver?.elements.has(target)).toBe(false)
    }
    finally {
      wrapper?.unmount()
      delete benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__
      vi.stubGlobal('IntersectionObserver', OriginalIO as any)
    }
  })

  it('settles fallback registrations immediately when rootMargin is invalid', async () => {
    const OriginalIO = globalThis.IntersectionObserver
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('IntersectionObserver', ThrowingRootMarginIntersectionObserver as any)

    const Probe = defineComponent({
      setup() {
        const target = ref<HTMLElement | null>(null)
        const visible = ref(false)
        const resolved = ref(false)
        const register = useViewportPriority()

        onMounted(() => {
          const handle = register(target.value!, { rootMargin: 'invalid-root-margin' })
          visible.value = handle.isVisible.value
          handle.whenVisible.then(() => {
            visible.value = handle.isVisible.value
            resolved.value = true
          })
        })

        return { resolved, target, visible }
      },
      template: '<div><div ref="target" data-target="1" /></div>',
    })

    let wrapper: ReturnType<typeof mount> | null = null
    try {
      wrapper = mount(Probe)
      await flushAll()

      expect(wrapper.vm.visible).toBe(true)
      expect(wrapper.vm.resolved).toBe(true)
      expect(FakeIntersectionObserver.instances).toHaveLength(0)
    }
    finally {
      wrapper?.unmount()
      warn.mockRestore()
      vi.stubGlobal('IntersectionObserver', OriginalIO as any)
    }
  })

  it('refreshes child viewport targets when virtual scroll root changes', async () => {
    const OriginalIO = globalThis.IntersectionObserver
    const benchmarkWindow = window as any
    const customId = 'viewport-priority-root-migration'
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)
    benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__ = true

    let wrapper: ReturnType<typeof mount> | null = null
    let removeCustomComponentsForTest: (() => void) | null = null
    try {
      const MarkdownRender = (await import('../src/components/NodeRenderer')).default
      const viewportPriority = await import('../src/composables/viewportPriority')
      const nodeComponents = await import('../src/utils/nodeComponents')
      const HeavyChild = defineComponent({
        setup() {
          const target = ref<HTMLElement | null>(null)
          const register = viewportPriority.useViewportPriority()

          onMounted(() => {
            register(target.value!, { rootMargin: '222px' })
          })

          return { target }
        },
        template: '<div ref="target" data-heavy-child="1" />',
      })
      nodeComponents.setCustomComponents(customId, { viewport_probe: HeavyChild })
      removeCustomComponentsForTest = () => nodeComponents.removeCustomComponents(customId)

      const Probe = defineComponent({
        components: { MarkdownRender },
        setup() {
          const scrollRoot = ref<HTMLElement | null>(null)
          const rootElement = ref<HTMLElement | null>(null)
          const virtualScroll = ref({
            enabled: true,
            sessionKey: 'viewport-priority-root-migration',
            scrollRoot: null as HTMLElement | null,
          })

          function activateRoot() {
            scrollRoot.value = rootElement.value
            virtualScroll.value = {
              ...virtualScroll.value,
              scrollRoot: scrollRoot.value,
            }
          }

          return {
            activateRoot,
            customId,
            rootElement,
            virtualScroll,
          }
        },
        template: `
          <div ref="rootElement" data-scroll-root="1">
            <MarkdownRender
              :nodes="[{ type: 'viewport_probe', raw: '<viewport_probe />' }]"
              :custom-id="customId"
              :virtual-scroll="virtualScroll"
              :viewport-priority="true"
            />
          </div>
        `,
      })

      wrapper = mount(Probe)
      await flushAll()

      const child = wrapper.get('[data-heavy-child="1"]')
      const root = wrapper.get('[data-scroll-root="1"]').element
      const initialObserver = FakeIntersectionObserver.instances.find(instance => instance.elements.has(child.element))

      expect(initialObserver).toBeTruthy()
      expect(initialObserver?.options.root).toBe(null)
      expect(initialObserver?.options.rootMargin).toBe('222px')

      wrapper.vm.activateRoot()
      await flushAll()

      const migratedObserver = FakeIntersectionObserver.instances.find(instance => instance.elements.has(child.element))
      expect(migratedObserver).toBeTruthy()
      expect(migratedObserver).not.toBe(initialObserver)
      expect(migratedObserver?.options.root).toBe(root)
      expect(migratedObserver?.options.rootMargin).toBe('222px')
      expect(initialObserver?.elements.has(child.element)).toBe(false)
    }
    finally {
      wrapper?.unmount()
      removeCustomComponentsForTest?.()
      delete benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__
      vi.stubGlobal('IntersectionObserver', OriginalIO as any)
    }
  })

  it('uses the heavy-block preload margin for CodeBlockNode', async () => {
    const OriginalIO = globalThis.IntersectionObserver
    const benchmarkWindow = window as any
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)
    benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__ = true

    let wrapper: ReturnType<typeof mount> | null = null
    try {
      const { default: CodeBlockNode } = await import('../src/components/CodeBlockNode/CodeBlockNode.vue')
      const viewportPriority = await import('../src/composables/viewportPriority')
      const Probe = defineComponent({
        components: { CodeBlockNode },
        setup() {
          const viewportPriorityOptions = ref({
            rootMargin: '111px',
            heavyBlockMargin: '222px',
          })
          viewportPriority.provideViewportPriorityOptions(computed(() => viewportPriorityOptions.value))
          viewportPriority.provideOffscreenHeavyNodeDeferral(computed(() => true))
          viewportPriority.provideViewportPriority(() => null, true)

          const node = {
            type: 'code_block',
            language: 'ts',
            code: 'console.log(1)',
            raw: '```ts\nconsole.log(1)\n```',
          }

          return { node }
        },
        template: '<CodeBlockNode :node="node" :loading="false" :stream="false" />',
      })

      wrapper = mount(Probe)

      await flushAll()

      const codeBlock = wrapper.get('[data-markstream-code-block="1"]')
      const codeBlockObserver = FakeIntersectionObserver.instances.find(instance => instance.elements.has(codeBlock.element))
      expect(codeBlockObserver).toBeTruthy()
      expect(codeBlockObserver?.options.rootMargin).toBe('222px')
    }
    finally {
      wrapper?.unmount()
      delete benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__
      vi.stubGlobal('IntersectionObserver', OriginalIO as any)
    }
  })

  it('keeps the shared pre contract while MarkdownRender code blocks are offscreen', async () => {
    const OriginalIO = globalThis.IntersectionObserver
    const benchmarkWindow = window as any
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640)
    benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__ = true

    let wrapper: ReturnType<typeof mount> | null = null
    try {
      const { default: MarkdownRender } = await import('../src/components/NodeRenderer')

      wrapper = mount(MarkdownRender, {
        props: {
          content: [
            '```ts',
            'console.log(1)',
            '```',
          ].join('\n'),
          batchRendering: false,
          deferNodesUntilVisible: false,
          final: true,
          viewportPriority: true,
          viewportPriorityOptions: {
            rootMargin: '111px',
            heavyBlockMargin: '222px',
          },
          codeBlockOptions: {
            disableLineNumbers: true,
            fontFamily: 'Fira Code',
            fontSize: 20,
            lineHeight: 30,
            maxHeight: 180,
            overflow: 'scroll',
            padding: 12,
            tabSize: 8,
          },
          codeBlockProps: {
            estimatedContentHeightPx: 54,
            theme: 'dracula',
          },
          virtualScroll: {
            enabled: true,
            sessionKey: 'offscreen-code-shell',
          },
        },
      })

      for (let attempt = 0; attempt < 10 && !wrapper.find('[data-markstream-code-block="1"]').exists(); attempt++)
        await flushAll()

      const codeBlock = wrapper.get('[data-markstream-code-block="1"]')
      const codeBlockObserver = FakeIntersectionObserver.instances.find(instance => instance.elements.has(codeBlock.element))
      expect(codeBlockObserver).toBeTruthy()
      expect(codeBlockObserver?.options.rootMargin).toBe('222px')
      expect(codeBlock.classes()).toContain('is-dark')
      expect(codeBlock.attributes('codeblockoptions')).toBeUndefined()
      expect(codeBlock.attributes('showlinenumbers')).toBeUndefined()
      expect(codeBlock.attributes('index-key')).toBeUndefined()
      expect(codeBlock.attributes('estimatedcontentheightpx')).toBeUndefined()
      expect(codeBlock.classes()).toContain('rounded-lg')
      expect(codeBlock.classes()).toContain('border')

      const header = codeBlock.get('.code-block-header')
      expect(header.text()).toContain('TypeScript')
      expect(header.get('.icon-slot svg').exists()).toBe(true)
      expect(header.findAll('button')).toHaveLength(3)

      const pre = codeBlock.get('pre.code-pre-fallback')
      expect(codeBlock.element.style.getPropertyValue('--code-bg')).toBe('var(--markstream-code-theme-bg, #121212)')
      expect(codeBlock.element.style.getPropertyValue('--code-fg')).toBe('var(--markstream-code-theme-fg, #dbd7caee)')
      expect(pre.attributes('data-markstream-line-numbers')).toBeUndefined()
      expect((pre.element as HTMLElement).style.fontFamily).toBe('Fira Code')
      expect((pre.element as HTMLElement).style.fontSize).toBe('20px')
      expect((pre.element as HTMLElement).style.lineHeight).toBe('30px')
      expect((pre.element as HTMLElement).style.getPropertyValue('--markstream-code-tab-size')).toBe('8')
      expect((pre.element as HTMLElement).style.getPropertyValue('--markstream-code-padding-y')).toBe('12px')
      expect(pre.classes()).not.toContain('is-wrap')
      expect((pre.element as HTMLElement).style.maxHeight).toBe('54px')
      expect((pre.element as HTMLElement).style.height).toBe('54px')
      expect((pre.element as HTMLElement).style.minHeight).toBe('54px')

      expect(codeBlock.element.outerHTML).not.toContain('codeblockoptions=')
      expect(codeBlock.element.outerHTML).not.toContain('showlinenumbers=')

      await wrapper.setProps({
        codeBlockOptions: {
          disableLineNumbers: true,
          overflow: 'wrap',
        },
      })
      await flushAll()
      const wrappedPre = wrapper.get('pre.code-pre-fallback')
      expect(wrappedPre.attributes('data-markstream-line-numbers')).toBeUndefined()
      expect(wrappedPre.classes()).toContain('is-wrap')
      expect(getComputedStyle(wrappedPre.element).whiteSpace).toBe('pre-wrap')
      expect(getComputedStyle(wrappedPre.element).overflowWrap).toBe('anywhere')
    }
    finally {
      wrapper?.unmount()
      delete benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__
      vi.stubGlobal('IntersectionObserver', OriginalIO as any)
    }
  })

  it('keeps default diff and line-number geometry while the async code block is offscreen', async () => {
    const benchmarkWindow = window as any
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)
    benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__ = true

    let wrapper: ReturnType<typeof mount> | null = null
    try {
      const { default: MarkdownRender } = await import('../src/components/NodeRenderer')
      const unchanged = Array.from({ length: 10 }, (_, index) => ` stable ${index}`)
      wrapper = mount(MarkdownRender, {
        props: {
          content: ['```diff', '-old', '+new', ...unchanged, '-tail', '+next', '```'].join('\n'),
          batchRendering: false,
          codeBlockOptions: {
            collapsedContextThreshold: 3,
            parseDiffOptions: { context: 1 },
          },
          deferNodesUntilVisible: false,
          final: true,
          viewportPriority: true,
        },
      })

      for (let attempt = 0; attempt < 10 && !wrapper.find('[data-markstream-code-block="1"]').exists(); attempt++)
        await flushAll()

      const codeBlock = wrapper.get('[data-markstream-code-block="1"]')
      expect(codeBlock.get('.code-diff-stat.removed').text()).toBe('-2')
      expect(codeBlock.get('.code-diff-stat.added').text()).toBe('+2')
      const pre = codeBlock.get('pre.code-pre-fallback')
      expect(pre.attributes('data-markstream-line-numbers')).toBe('1')
      expect(pre.classes()).toContain('markstream-pre--diff-preview')
      expect(pre.classes()).not.toContain('markstream-pre--diff-inline')
      expect(pre.findAll('.markstream-pre__diff-pane')).toHaveLength(2)
      expect(pre.findAll('.markstream-pre__diff-line--collapsed')).toHaveLength(2)
    }
    finally {
      wrapper?.unmount()
      delete benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__
    }
  })

  it('does not reuse heavy-node viewport readiness after the renderer session changes', async () => {
    const OriginalIO = globalThis.IntersectionObserver
    const benchmarkWindow = window as any
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)
    benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__ = true

    let wrapper: ReturnType<typeof mount> | null = null
    try {
      const { default: MarkdownRender } = await import('../src/components/NodeRenderer')
      wrapper = mount(MarkdownRender, {
        props: {
          indexKey: 'stable-message-key',
          content: '![Thread A](https://example.com/thread-a.png)\n\nStreaming t',
          final: false,
          mode: 'chat',
          smoothStreaming: false,
          batchRendering: false,
          deferNodesUntilVisible: false,
          viewportPriority: true,
          virtualScroll: {
            enabled: true,
            sessionKey: 'thread-a:message-1',
            threadKey: 'thread-a',
          },
        },
      })

      await flushAll()

      const firstTarget = wrapper.get('.image-node-container')
      const firstImage = wrapper.get('img')
      expect(firstImage.attributes('src')).toBeUndefined()

      const firstObserver = FakeIntersectionObserver.instances.find(instance => instance.elements.has(firstTarget.element))
      expect(firstObserver).toBeTruthy()
      firstObserver?.trigger(firstTarget.element)
      await flushAll()
      expect(wrapper.get('img').attributes('src')).toBe('https://example.com/thread-a.png')

      await wrapper.setProps({
        content: '![Thread A](https://example.com/thread-a.png)\n\nStreaming tail',
        virtualScroll: {
          enabled: true,
          sessionKey: 'thread-a:message-2',
          threadKey: 'thread-a',
        },
      })
      await flushAll()
      expect(wrapper.get('.image-node-container').element).toBe(firstTarget.element)

      await wrapper.setProps({
        content: '![Thread B](https://example.com/thread-b.png)\n\nThread B stream',
        virtualScroll: {
          enabled: true,
          sessionKey: 'thread-b:message-1',
          threadKey: 'thread-b',
        },
      })
      await flushAll()

      const secondTarget = wrapper.get('.image-node-container')
      const secondImage = wrapper.get('img')
      expect(secondTarget.element).not.toBe(firstTarget.element)
      expect(secondImage.attributes('src')).toBeUndefined()

      const secondObserver = FakeIntersectionObserver.instances.find(instance => instance.elements.has(secondTarget.element))
      expect(secondObserver).toBeTruthy()
      secondObserver?.trigger(secondTarget.element)
      await flushAll()
      expect(wrapper.get('img').attributes('src')).toBe('https://example.com/thread-b.png')
    }
    finally {
      wrapper?.unmount()
      delete benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__
      vi.stubGlobal('IntersectionObserver', OriginalIO as any)
    }
  })

  it('keeps CodeBlockNode ready after viewport priority options change', async () => {
    const OriginalIO = globalThis.IntersectionObserver
    const benchmarkWindow = window as any
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)
    benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__ = true

    let wrapper: ReturnType<typeof mount> | null = null
    try {
      const { default: CodeBlockNode } = await import('../src/components/CodeBlockNode/CodeBlockNode.vue')
      const viewportPriority = await import('../src/composables/viewportPriority')
      const Probe = defineComponent({
        components: { CodeBlockNode },
        setup() {
          const viewportPriorityOptions = ref({
            rootMargin: '111px',
            heavyBlockMargin: '222px',
          })
          viewportPriority.provideViewportPriorityOptions(computed(() => viewportPriorityOptions.value))
          viewportPriority.provideOffscreenHeavyNodeDeferral(computed(() => true))
          viewportPriority.provideViewportPriority(() => null, true)

          function updateMargin() {
            viewportPriorityOptions.value = {
              rootMargin: '111px',
              heavyBlockMargin: '333px',
            }
          }

          return {
            node: {
              type: 'code_block',
              language: 'ts',
              code: 'console.log(1)',
              raw: '```ts\nconsole.log(1)\n```',
            },
            updateMargin,
          }
        },
        template: '<CodeBlockNode :node="node" :loading="false" :stream="false" />',
      })

      wrapper = mount(Probe)
      await flushAll()

      const codeBlock = wrapper.get('[data-markstream-code-block="1"]')
      const component = wrapper.findComponent(CodeBlockNode as any)
      const initialObserver = FakeIntersectionObserver.instances.find(instance => instance.elements.has(codeBlock.element))
      expect(initialObserver).toBeTruthy()
      expect((component.vm as any).viewportReady).toBe(false)

      initialObserver?.trigger(codeBlock.element, true)
      await flushAll()
      expect((component.vm as any).viewportReady).toBe(true)

      ;(wrapper.vm as any).updateMargin()
      await flushAll()

      const updatedObserver = FakeIntersectionObserver.instances.find(instance =>
        instance.options.rootMargin === '333px' && instance.elements.has(codeBlock.element),
      )
      expect(updatedObserver).toBeUndefined()
      expect((component.vm as any).viewportReady).toBe(true)
    }
    finally {
      wrapper?.unmount()
      delete benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__
      vi.stubGlobal('IntersectionObserver', OriginalIO as any)
    }
  })

  it('keeps deferred HtmlBlockNode rendered after viewport priority options change', async () => {
    const OriginalIO = globalThis.IntersectionObserver
    const benchmarkWindow = window as any
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)
    benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__ = true

    let wrapper: ReturnType<typeof mount> | null = null
    try {
      const { default: HtmlBlockNode } = await import('../src/components/HtmlBlockNode/HtmlBlockNode.vue')
      const viewportPriority = await import('../src/composables/viewportPriority')
      const Probe = defineComponent({
        components: { HtmlBlockNode },
        setup() {
          const viewportPriorityOptions = ref({
            rootMargin: '111px',
            heavyBlockMargin: '222px',
          })
          viewportPriority.provideViewportPriorityOptions(computed(() => viewportPriorityOptions.value))
          viewportPriority.provideViewportPriority(() => null, true)

          function updateMargin() {
            viewportPriorityOptions.value = {
              rootMargin: '111px',
              heavyBlockMargin: '333px',
            }
          }

          return {
            node: {
              content: '<div>Deferred HTML</div>',
              loading: true,
            },
            updateMargin,
          }
        },
        template: '<HtmlBlockNode :node="node" />',
      })

      wrapper = mount(Probe)
      await flushAll()

      const htmlBlock = wrapper.get('.html-block-node')
      const component = wrapper.findComponent(HtmlBlockNode as any)
      const initialObserver = FakeIntersectionObserver.instances.find(instance => instance.elements.has(htmlBlock.element))
      expect(initialObserver).toBeTruthy()
      expect((component.vm as any).shouldRender).toBe(false)

      initialObserver?.trigger(htmlBlock.element, true)
      await flushAll()
      expect((component.vm as any).shouldRender).toBe(true)

      ;(wrapper.vm as any).updateMargin()
      await flushAll()

      const updatedObserver = FakeIntersectionObserver.instances.find(instance =>
        instance.options.rootMargin === '333px' && instance.elements.has(htmlBlock.element),
      )
      expect(updatedObserver).toBeTruthy()
      expect((component.vm as any).shouldRender).toBe(true)
    }
    finally {
      wrapper?.unmount()
      delete benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__
      vi.stubGlobal('IntersectionObserver', OriginalIO as any)
    }
  })

  it('keeps nodes as placeholders until IO marks them visible', async () => {
    const OriginalIO = globalThis.IntersectionObserver
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)

    let wrapper: ReturnType<typeof mount> | null = null
    try {
      const MarkdownRender = (await import('../src/components/NodeRenderer')).default
      const markdown = Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1}`).join('\n\n')

      wrapper = mount(MarkdownRender, {
        props: {
          content: markdown,
          // Ensure deferral is on and virtualization stays off (60 <= 220 default).
          deferNodesUntilVisible: true,
          viewportPriority: true,
          initialRenderBatchSize: 40,
        },
      })

      await flushAll()

      const deferredIndex = 45
      const slot = wrapper.find(`[data-node-index="${deferredIndex}"]`)
      expect(slot.exists()).toBe(true)
      expect(slot.find('.node-placeholder').exists()).toBe(true)
      expect(slot.find('.node-content').exists()).toBe(false)

      const observer = FakeIntersectionObserver.instances.find(instance => instance.elements.has(slot.element))
      expect(observer).toBeTruthy()
      expect(observer?.elements.has(slot.element)).toBe(true)
      observer?.trigger(slot.element, true)
      expect(observer?.elements.has(slot.element)).toBe(false)
      await flushAll()

      const visibleSlot = wrapper.find(`[data-node-index="${deferredIndex}"]`)
      expect(visibleSlot.find('.node-placeholder').exists()).toBe(false)
      expect(visibleSlot.find('.node-content').exists()).toBe(true)
      expect(wrapper.text()).toContain(`Paragraph ${deferredIndex + 1}`)

      await wrapper.setProps({ deferNodesUntilVisible: false })
      await flushAll()

      const updatedSlot = wrapper.find(`[data-node-index="${deferredIndex}"]`)
      expect(updatedSlot.find('.node-placeholder').exists()).toBe(false)
      expect(updatedSlot.find('.node-content').exists()).toBe(true)
      expect(wrapper.text()).toContain(`Paragraph ${deferredIndex + 1}`)
    }
    finally {
      wrapper?.unmount()
      vi.stubGlobal('IntersectionObserver', OriginalIO as any)
    }
  })

  it('renders the live buffer tail during non-final content appends before IO fires', async () => {
    const OriginalIO = globalThis.IntersectionObserver
    const benchmarkWindow = window as any
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)
    benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__ = true

    const createMarkdown = (count: number) =>
      Array.from({ length: count }, (_, index) => `Paragraph ${index + 1}`).join('\n\n')

    let wrapper: ReturnType<typeof mount> | null = null
    try {
      const MarkdownRender = (await import('../src/components/NodeRenderer')).default

      wrapper = mount(MarkdownRender, {
        props: {
          content: createMarkdown(60),
          deferNodesUntilVisible: true,
          final: false,
          initialRenderBatchSize: 40,
          liveNodeBuffer: 10,
          maxLiveNodes: 220,
          viewportPriority: true,
        },
      })

      await flushAll()
      expect(wrapper.find('[data-node-index="59"] .node-placeholder').exists()).toBe(true)

      await wrapper.setProps({ content: createMarkdown(65) })
      await flushAll()

      expect(wrapper.find('[data-node-index="54"] .node-placeholder').exists()).toBe(true)
      for (let index = 55; index < 65; index++) {
        const slot = wrapper.find(`[data-node-index="${index}"]`)
        expect(slot.find('.node-placeholder').exists()).toBe(false)
        expect(slot.find('.node-content').exists()).toBe(true)
      }
    }
    finally {
      wrapper?.unmount()
      delete benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__
      vi.stubGlobal('IntersectionObserver', OriginalIO as any)
    }
  })

  it('uses viewportPriorityOptions.rootMargin for deferred node shells', async () => {
    const OriginalIO = globalThis.IntersectionObserver
    const benchmarkWindow = window as any
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)
    benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__ = true

    let wrapper: ReturnType<typeof mount> | null = null
    try {
      const MarkdownRender = (await import('../src/components/NodeRenderer')).default
      const markdown = Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1}`).join('\n\n')

      wrapper = mount(MarkdownRender, {
        props: {
          content: markdown,
          deferNodesUntilVisible: true,
          viewportPriority: true,
          viewportPriorityOptions: {
            rootMargin: '123px',
          },
          initialRenderBatchSize: 40,
        },
      })

      await flushAll()

      const slot = wrapper.find('[data-node-index="45"]')
      expect(slot.exists()).toBe(true)
      expect(slot.find('.node-placeholder').exists()).toBe(true)

      const observer = FakeIntersectionObserver.instances.find(instance => instance.elements.has(slot.element))
      expect(observer).toBeTruthy()
      expect(observer?.options.rootMargin).toBe('123px')
    }
    finally {
      wrapper?.unmount()
      delete benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__
      vi.stubGlobal('IntersectionObserver', OriginalIO as any)
    }
  })

  it('re-registers deferred node shells when viewportPriorityOptions.rootMargin changes at runtime', async () => {
    const OriginalIO = globalThis.IntersectionObserver
    const benchmarkWindow = window as any
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)
    benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__ = true

    let wrapper: ReturnType<typeof mount> | null = null
    try {
      const MarkdownRender = (await import('../src/components/NodeRenderer')).default
      const markdown = Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1}`).join('\n\n')

      wrapper = mount(MarkdownRender, {
        props: {
          content: markdown,
          deferNodesUntilVisible: true,
          viewportPriority: true,
          viewportPriorityOptions: {
            rootMargin: '123px',
          },
          initialRenderBatchSize: 40,
        },
      })

      await flushAll()

      const slot = wrapper.find('[data-node-index="45"]')
      expect(slot.exists()).toBe(true)
      const firstObserver = FakeIntersectionObserver.instances.find(instance => instance.elements.has(slot.element))
      expect(firstObserver?.options.rootMargin).toBe('123px')

      // Changing rootMargin at runtime must re-register deferred shells under
      // the new margin instead of leaving them on the stale observer.
      await wrapper.setProps({ viewportPriorityOptions: { rootMargin: '456px' } })
      await flushAll()

      const slotAfter = wrapper.find('[data-node-index="45"]')
      const updatedObserver = FakeIntersectionObserver.instances.find(instance => instance.elements.has(slotAfter.element))
      expect(updatedObserver).toBeTruthy()
      expect(updatedObserver?.options.rootMargin).toBe('456px')
      expect(firstObserver?.elements.has(slotAfter.element)).toBe(false)
    }
    finally {
      wrapper?.unmount()
      delete benchmarkWindow.__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__
      vi.stubGlobal('IntersectionObserver', OriginalIO as any)
    }
  })

  it('uses viewportPriorityOptions.maxTargets when auto-disabling node deferral', async () => {
    const OriginalIO = globalThis.IntersectionObserver
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)

    let wrapper: ReturnType<typeof mount> | null = null
    try {
      const MarkdownRender = (await import('../src/components/NodeRenderer')).default

      wrapper = mount(MarkdownRender, {
        props: {
          content: 'First paragraph\n\nSecond paragraph',
          deferNodesUntilVisible: true,
          viewportPriority: true,
          viewportPriorityOptions: {
            maxTargets: 1,
          },
          initialRenderBatchSize: 0,
          maxLiveNodes: 20,
        },
      })

      await flushAll()

      expect(wrapper.findAll('.node-placeholder')).toHaveLength(0)
      expect(wrapper.find('[data-node-index="0"] .node-content').exists()).toBe(true)
      expect(wrapper.find('[data-node-index="1"] .node-content').exists()).toBe(true)
      expect(FakeIntersectionObserver.instances.every(instance => instance.elements.size === 0)).toBe(true)
    }
    finally {
      wrapper?.unmount()
      vi.stubGlobal('IntersectionObserver', OriginalIO as any)
    }
  })

  it('restores node deferral after viewportPriorityOptions.maxTargets increases', async () => {
    const OriginalIO = globalThis.IntersectionObserver
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)

    const createMarkdown = (count: number) =>
      Array.from({ length: count }, (_, index) => `Paragraph ${index + 1}`).join('\n\n')

    let wrapper: ReturnType<typeof mount> | null = null
    try {
      const MarkdownRender = (await import('../src/components/NodeRenderer')).default

      wrapper = mount(MarkdownRender, {
        props: {
          content: createMarkdown(220),
          batchRendering: false,
          deferNodesUntilVisible: true,
          final: true,
          viewportPriority: true,
          viewportPriorityOptions: {
            maxTargets: 1,
          },
          initialRenderBatchSize: 0,
          maxLiveNodes: 500,
        },
      })

      await flushAll()

      expect(wrapper.findAll('.node-placeholder')).toHaveLength(0)
      expect(FakeIntersectionObserver.instances.every(instance => instance.elements.size === 0)).toBe(true)

      await wrapper.setProps({
        viewportPriorityOptions: {
          maxTargets: 300,
        },
      })
      await flushAll()
      await wrapper.setProps({ content: createMarkdown(221) })
      await flushAll()

      const tailSlot = wrapper.find('[data-node-index="220"]')
      expect(tailSlot.exists()).toBe(true)
      expect(tailSlot.find('.node-placeholder').exists()).toBe(true)
      expect(tailSlot.find('.node-content').exists()).toBe(false)
      expect(FakeIntersectionObserver.instances.some(instance => instance.elements.has(tailSlot.element))).toBe(true)
    }
    finally {
      wrapper?.unmount()
      vi.stubGlobal('IntersectionObserver', OriginalIO as any)
    }
  })

  it('ignores overflow ancestors that are not actually scrollable when picking the IO root', async () => {
    const OriginalIO = globalThis.IntersectionObserver
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)

    let wrapper: ReturnType<typeof mount> | null = null
    const host = document.createElement('div')
    const fakeOverflow = document.createElement('div')
    host.appendChild(fakeOverflow)
    document.body.appendChild(host)
    fakeOverflow.style.overflow = 'auto'

    try {
      const MarkdownRender = (await import('../src/components/NodeRenderer')).default
      const markdown = Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1}`).join('\n\n')

      wrapper = mount(MarkdownRender, {
        attachTo: fakeOverflow,
        props: {
          content: markdown,
          deferNodesUntilVisible: true,
          viewportPriority: true,
          initialRenderBatchSize: 40,
        },
      })

      await flushAll()

      const observer = FakeIntersectionObserver.instances.at(-1)
      expect(observer).toBeTruthy()
      expect(observer?.options.root ?? null).toBe(null)
    }
    finally {
      wrapper?.unmount()
      host.remove()
      vi.stubGlobal('IntersectionObserver', OriginalIO as any)
    }
  })
})
