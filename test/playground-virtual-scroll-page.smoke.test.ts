import { mount } from '@vue/test-utils'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import MarkdownRender from '../src/exports'
import { flushAll } from './setup/flush-all'

vi.mock('../src/exports', async () => {
  const { defineComponent, h, onMounted } = await import('vue')

  return {
    default: defineComponent({
      props: {
        content: { type: String, default: '' },
        virtualScroll: { type: Object, default: null },
      },
      emits: ['height-change', 'virtual-state-change', 'render-settled'],
      setup(props, { emit, expose }) {
        const readSessionKey = () => String((props.virtualScroll as any)?.sessionKey ?? '')
        const metrics = (reason = 'manual') => ({
          reason,
          sessionKey: readSessionKey(),
          phase: 'final',
          stable: true,
          totalHeight: 240,
        })
        const captureVirtualState = () => ({
          sessionKey: readSessionKey(),
          width: 960,
          metrics: metrics('manual'),
          heightCache: [{ key: '0', top: 0, height: 240 }],
        })

        expose({
          forceMeasure: async () => metrics('manual'),
          captureVirtualState,
          settle: async () => {
            emit('render-settled', metrics('manual'))
            return metrics('manual')
          },
        })

        onMounted(() => {
          const nextMetrics = metrics('mount')
          emit('height-change', nextMetrics)
          emit('virtual-state-change', captureVirtualState())
          emit('render-settled', nextMetrics)
        })

        return () => h('div', { class: 'markstream-vue markdown-renderer' }, [
          h('div', { class: 'node-slot' }, [
            h('div', { class: 'node-content' }, props.content.slice(0, 80) || 'content'),
          ]),
        ])
      },
    }),
  }
})

describe('playground /virtual-scroll shell smoke', () => {
  let VirtualScrollPage: typeof import('../playground/src/pages/virtual-scroll.vue').default
  let originalElementFromPoint: typeof document.elementFromPoint | undefined
  let originalLocationHref = ''

  beforeAll(async () => {
    originalLocationHref = window.location.href
    window.history.replaceState(null, '', '/virtual-scroll?profile=smoke')
    VirtualScrollPage = (await import('../playground/src/pages/virtual-scroll.vue')).default
  })

  beforeEach(() => {
    originalElementFromPoint = document.elementFromPoint

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(720)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(960)
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => document.querySelector('.node-content') ?? document.querySelector('.node-placeholder')),
    })

    vi.stubGlobal('ResizeObserver', class {
      callback: ResizeObserverCallback

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
      }

      observe() {}
      unobserve() {}
      disconnect() {}
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()

    if (originalElementFromPoint) {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      })
    }
    else {
      delete (document as any).elementFromPoint
    }
  })

  afterAll(() => {
    window.history.replaceState(null, '', originalLocationHref)
  })

  it('renders lab shell', async () => {
    const wrapper = mount(VirtualScrollPage, {
      attachTo: document.body,
    })

    await flushAll()
    await nextTick()

    expect(wrapper.text()).toContain('markstream-vue virtual-scroll coordination lab')
    expect(wrapper.text()).toContain('outer rendered:')
    expect(wrapper.text()).toContain('markdown slots:')
    expect(wrapper.text()).toContain('blank probes:')
    expect(wrapper.text()).toContain('status:')
    expect(wrapper.text()).toContain('visible range:')
    expect(wrapper.findAll('button').map(button => button.text())).toEqual(expect.arrayContaining([
      'Thread A',
      'Thread B',
      'Bottom',
      'Stress scroll',
      'Reset caches',
    ]))

    wrapper.unmount()
  })

  it('keeps the lab status visible after core actions', async () => {
    const wrapper = mount(VirtualScrollPage, {
      attachTo: document.body,
    })

    await flushAll()
    await nextTick()

    const buttons = wrapper.findAll('button')
    await buttons.find(button => button.text() === 'Bottom')?.trigger('click')
    await flushAll()

    await buttons.find(button => button.text().startsWith('Density:'))?.trigger('click')
    await flushAll()

    await buttons.find(button => button.text().startsWith('Font:'))?.trigger('click')
    await flushAll()

    expect(wrapper.get('[data-testid="lab-status"]').text()).toMatch(/^status:/)
    expect(wrapper.get('[data-testid="blank-probes"]').text()).toMatch(/^blank probes:/)
    expect(wrapper.get('[data-testid="markdown-slots"]').text()).toContain('markdown slots:')
    expect(wrapper.get('[data-testid="max-drift"]').text()).toContain('max drift:')
    expect(wrapper.get('[data-testid="item-overflow"]').text()).toContain('item overflow:')

    wrapper.unmount()
  }, 10000)

  it('releases the previous restore anchor when explicitly scrolling', async () => {
    const wrapper = mount(VirtualScrollPage, {
      attachTo: document.body,
    })

    try {
      await flushAll()
      const api = window.__markstreamVirtualScrollLab!
      await api.replaceVisibleHugeMessageSameShape()

      expect(wrapper.findAllComponents(MarkdownRender).some(renderer =>
        renderer.props('virtualScroll')?.restoreAnchor,
      )).toBe(true)

      await api.scrollToRatio(0)

      expect(wrapper.findAllComponents(MarkdownRender).some(renderer =>
        renderer.props('virtualScroll')?.restoreAnchor,
      )).toBe(false)
    }
    finally {
      wrapper.unmount()
    }
  })
})
