import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

// NOTE: mounting the vue-demi based vue2 package under the root Vue 3 test runtime
// renders correctly, but a reactive write made from a native window listener does
// not schedule a re-render here, so the DOM is not a reliable observation point in
// jsdom (calling `$forceUpdate()` does render the latest state, which is what the
// last case below pins). These cases therefore assert the component state the pan
// writes, and the real DOM behaviour is measured in the browser harness.
const STUB_SVG
  = '<svg data-rendered="stub" viewBox="0 0 1440 220"><rect width="10" height="10" /></svg>'

function pointerEvent(
  type: string,
  init: { clientX: number, clientY: number, pointerId?: number, button?: number, buttons?: number, pointerType?: string },
) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, {
    clientX: init.clientX,
    clientY: init.clientY,
    pointerId: init.pointerId ?? 1,
    button: init.button ?? 0,
    buttons: init.buttons ?? 1,
    pointerType: init.pointerType ?? 'mouse',
  })
  return event
}

async function flushVueUpdates() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

async function settle(turns = 8) {
  for (let index = 0; index < turns; index++)
    await flushVueUpdates()
}

function mockMermaid() {
  const fakeMermaid = {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: STUB_SVG })),
  }
  vi.doMock('../packages/markstream-vue2/src/workers/mermaidWorkerClient', () => ({
    canParseOffthread: vi.fn(async () => true),
    findPrefixOffthread: vi.fn(async () => null),
    terminateWorker: vi.fn(),
  }))
  vi.doMock('../packages/markstream-vue2/src/components/MermaidBlockNode/mermaid', () => ({
    getMermaid: vi.fn(async () => fakeMermaid),
  }))
  return fakeMermaid
}

async function mountMermaidPreview() {
  vi.useFakeTimers()
  mockMermaid()
  const MermaidBlockNode = (await import('../packages/markstream-vue2/src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
  const wrapper = mount(MermaidBlockNode as any, {
    props: {
      node: {
        type: 'code_block',
        language: 'mermaid',
        code: 'graph LR\nA-->B\n',
        raw: '```mermaid\ngraph LR\nA-->B\n```',
      },
      loading: false,
    },
    attachTo: document.body,
  })

  ;(wrapper.vm as any).mermaidAvailable = true
  ;(wrapper.vm as any).viewportReady = true
  ;(wrapper.vm as any).showSource = false
  await settle(6)
  // The preview render is debounced, so the scheduled work needs the timers to run.
  await vi.advanceTimersByTimeAsync(1500)
  await settle(6)

  const wrapperEl = wrapper.get('[data-mermaid-wrapper]').element as HTMLElement
  const surface = wrapperEl.parentElement as HTMLElement

  return { wrapper, surface, wrapperEl }
}

function mockInfographic() {
  class FakeInfographic {
    private container: HTMLElement
    constructor(options: { container: HTMLElement }) {
      this.container = options.container
    }

    on() {}

    destroy() {}

    render() {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('data-preview', '1')
      this.container.replaceChildren(svg)
    }
  }

  vi.doMock('../packages/markstream-vue2/src/components/InfographicBlockNode/infographic', () => ({
    getInfographic: vi.fn(async () => FakeInfographic),
  }))
}

async function mountInfographicPreview() {
  vi.useFakeTimers()
  mockInfographic()
  const InfographicBlockNode = (await import('../packages/markstream-vue2/src/components/InfographicBlockNode/InfographicBlockNode.vue')).default
  const wrapper = mount(InfographicBlockNode as any, {
    props: {
      node: {
        type: 'code_block',
        language: 'infographic',
        code: 'infographic list-row-simple\n- one\n- two\n',
        raw: '```infographic\ninfographic list-row-simple\n- one\n- two\n```',
      },
      loading: false,
    },
    attachTo: document.body,
  })

  ;(wrapper.vm as any).showSource = false
  await settle(6)
  // The block skips scheduling while the source panel is active, so kick the
  // render once the preview is the visible panel.
  ;(wrapper.vm as any).$?.setupState?.renderInfographic?.(true)
  await settle(4)
  await vi.advanceTimersByTimeAsync(1500)
  await settle(6)

  const surface = wrapper.get('.infographic-preview').element as HTMLElement

  return { wrapper, surface }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
  document.body.innerHTML = ''
})

describe('markstream-vue2 pan gesture', () => {
  it('keeps mermaid panning after the pointer leaves the preview box', async () => {
    const { wrapper, surface } = await mountMermaidPreview()
    expect(wrapper.find('div._mermaid svg').exists()).toBe(true)

    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 200, clientY: 200 }))
    // The listener lives on window, so a move far outside the surface still counts.
    window.dispatchEvent(pointerEvent('pointermove', { clientX: -600, clientY: 900 }))
    await settle(2)

    expect((wrapper.vm as any).translateX).toBe(-800)
    expect((wrapper.vm as any).translateY).toBe(700)

    window.dispatchEvent(pointerEvent('pointerup', { clientX: -600, clientY: 900 }))
    wrapper.unmount()
  })

  it('stops following the pointer once the gesture ends', async () => {
    const { wrapper, surface } = await mountMermaidPreview()

    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 140, clientY: 100 }))
    await settle(2)
    expect((wrapper.vm as any).translateX).toBe(40)

    window.dispatchEvent(pointerEvent('pointerup', { clientX: 140, clientY: 100 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 900, clientY: 900 }))
    await settle(2)
    expect((wrapper.vm as any).translateX).toBe(40)

    wrapper.unmount()
  })

  it('ends the gesture when a move reports no button down', async () => {
    const { wrapper, surface } = await mountMermaidPreview()

    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 140, clientY: 100 }))
    await settle(2)
    expect((wrapper.vm as any).translateX).toBe(40)

    // A release outside the window delivers no pointerup.
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 500, clientY: 100, buttons: 0 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 900, clientY: 100, buttons: 0 }))
    await settle(2)
    expect((wrapper.vm as any).translateX).toBe(40)

    wrapper.unmount()
  })

  it('leaves mermaid touch swipes to the page until the diagram is zoomed in', async () => {
    const { wrapper, surface } = await mountMermaidPreview()

    // At fit zoom the page keeps the swipe, so the surface does not claim it.
    expect((wrapper.vm as any).panSurfaceClaimsTouch).toBe(false)

    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 100, pointerType: 'touch' }))
    await settle(2)
    expect((wrapper.vm as any).translateX).toBe(0)

    // A mouse still pans at fit zoom.
    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 100 }))
    await settle(2)
    expect((wrapper.vm as any).translateX).toBe(-60)
    window.dispatchEvent(pointerEvent('pointerup', { clientX: 40, clientY: 100 }))

    // Zoomed in, the surface claims the gesture.
    ;(wrapper.vm as any).zoom = 2
    await settle(2)
    expect((wrapper.vm as any).panSurfaceClaimsTouch).toBe(true)

    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 100, pointerType: 'touch' }))
    await settle(2)
    expect((wrapper.vm as any).translateX).toBe(-120)

    window.dispatchEvent(pointerEvent('pointerup', { clientX: 40, clientY: 100, pointerType: 'touch' }))
    wrapper.unmount()
  })

  it('renders the pan offset through the template binding', async () => {
    const { wrapper, surface } = await mountMermaidPreview()

    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 100 }))
    await settle(2)

    // The render function reads the state the gesture wrote, so a forced render
    // produces the panned transform.
    ;(wrapper.vm as any).$forceUpdate()
    await settle(2)
    const live = wrapper.element.querySelector('[data-mermaid-wrapper]') as HTMLElement
    expect(live.style.transform).toContain('translate(-60px, 0px)')

    window.dispatchEvent(pointerEvent('pointerup', { clientX: 40, clientY: 100 }))
    wrapper.unmount()
  })

  it('keeps infographic panning after the pointer leaves the preview box', async () => {
    const { wrapper, surface } = await mountInfographicPreview()

    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 200, clientY: 200 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: -600, clientY: 900 }))
    await settle(2)

    expect((wrapper.vm as any).translateX).toBe(-800)
    expect((wrapper.vm as any).translateY).toBe(700)

    window.dispatchEvent(pointerEvent('pointerup', { clientX: -600, clientY: 900 }))
    wrapper.unmount()
  })

  it('leaves infographic touch swipes to the page until the chart is zoomed in', async () => {
    const { wrapper, surface } = await mountInfographicPreview()

    expect((wrapper.vm as any).panSurfaceClaimsTouch).toBe(false)

    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 100, pointerType: 'touch' }))
    await settle(2)
    expect((wrapper.vm as any).translateX).toBe(0)

    ;(wrapper.vm as any).zoom = 2
    await settle(2)
    expect((wrapper.vm as any).panSurfaceClaimsTouch).toBe(true)

    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 100, pointerType: 'touch' }))
    await settle(2)
    expect((wrapper.vm as any).translateX).toBe(-60)

    window.dispatchEvent(pointerEvent('pointerup', { clientX: 40, clientY: 100, pointerType: 'touch' }))
    wrapper.unmount()
  })
})
