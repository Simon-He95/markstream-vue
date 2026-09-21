import { cleanup, render, waitFor } from '@octanejs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'

const STUB_SVG
  = '<svg data-rendered="stub" viewBox="0 0 1440 220"><rect width="10" height="10" /></svg>'

const mockState = vi.hoisted(() => ({ renderCalls: 0, neverResolve: false }))

vi.mock('../../src/components/MermaidBlockNode/mermaid', () => ({
  getMermaid: vi.fn(async () => ({
    initialize: vi.fn(),
    parse: vi.fn(async () => true),
    render: vi.fn(() => {
      mockState.renderCalls += 1
      if (mockState.neverResolve)
        return new Promise(() => {})
      return Promise.resolve({ svg: STUB_SVG, bindFunctions: vi.fn() })
    }),
  })),
}))

vi.mock('../../src/workers/mermaidWorkerClient', () => ({
  canParseOffthread: vi.fn(async () => true),
  findPrefixOffthread: vi.fn(async () => null),
  terminateWorker: vi.fn(),
}))

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

function node(code: string) {
  return {
    type: 'code_block' as const,
    language: 'mermaid',
    code,
    raw: `\`\`\`mermaid\n${code}\`\`\``,
  }
}

async function mountMermaid(options: { neverResolve?: boolean, loading?: boolean } = {}) {
  mockState.renderCalls = 0
  mockState.neverResolve = options.neverResolve ?? false

  const { MermaidBlockNode } = await import('../../src/components/MermaidBlockNode/MermaidBlockNode.tsrx')
  const view = render(MermaidBlockNode as any, {
    props: {
      node: node('graph LR\nA-->B\n'),
      loading: options.loading ?? false,
    },
  })

  if (!options.neverResolve) {
    // The preview render is debounced, so wait for the stubbed svg to land.
    await waitFor(() => {
      expect(view.container.querySelector('svg[data-rendered]')).toBeTruthy()
    }, { timeout: 5000 })
  }
  else {
    await new Promise(resolve => setTimeout(resolve, 600))
  }

  const wrapper = view.container.querySelector('[data-mermaid-wrapper]') as HTMLElement
  const surface = wrapper.parentElement as HTMLElement

  return { view, wrapper, surface, transform: () => wrapper.style.transform }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('markstream-octane mermaid pan gesture', () => {
  it('keeps panning after the pointer leaves the preview box', async () => {
    vi.stubGlobal('IntersectionObserver', undefined as any)
    const { wrapper, surface, transform } = await mountMermaid()

    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 200, clientY: 200 }))
    // The listener lives on window, so a move far outside the surface still counts.
    window.dispatchEvent(pointerEvent('pointermove', { clientX: -600, clientY: 900 }))

    await waitFor(() => {
      expect(transform()).toContain('translate(-800px, 700px)')
    })
    expect(wrapper).toBeTruthy()
  })

  it('stops following the pointer once the gesture ends', async () => {
    vi.stubGlobal('IntersectionObserver', undefined as any)
    const { surface, transform } = await mountMermaid()

    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 140, clientY: 100 }))
    await waitFor(() => {
      expect(transform()).toContain('translate(40px, 0px)')
    })

    window.dispatchEvent(pointerEvent('pointerup', { clientX: 140, clientY: 100 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 900, clientY: 900 }))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(transform()).toContain('translate(40px, 0px)')
  })

  it('leaves touch swipes to the page until the diagram is zoomed in', async () => {
    vi.stubGlobal('IntersectionObserver', undefined as any)
    const { view, surface, transform } = await mountMermaid()

    // At fit zoom the page keeps the swipe, so the surface does not claim it.
    expect(surface.classList.contains('mermaid-pan-touch')).toBe(false)

    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 100, pointerType: 'touch' }))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(transform()).toContain('translate(0px, 0px)')

    // A mouse still pans at fit zoom.
    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 100 }))
    await waitFor(() => {
      expect(transform()).toContain('translate(-60px, 0px)')
    })
    window.dispatchEvent(pointerEvent('pointerup', { clientX: 40, clientY: 100 }))

    // Zoom in through the control the header renders.
    const zoomIn = Array.from(view.container.querySelectorAll('button'))
      .find(button => button.textContent?.trim() === '+') as HTMLButtonElement
    for (let index = 0; index < 20; index++)
      zoomIn.click()

    await waitFor(() => {
      expect(surface.classList.contains('mermaid-pan-touch')).toBe(true)
    })

    // Zoomed in, the surface claims the gesture, so touch pans with it.
    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 100, pointerType: 'touch' }))
    await waitFor(() => {
      expect(transform()).toContain('translate(-120px, 0px)')
    })
  })

  it('does not claim the gesture while there is no diagram to pan', async () => {
    vi.stubGlobal('IntersectionObserver', undefined as any)
    const { view, surface, wrapper } = await mountMermaid({ neverResolve: true, loading: true })

    expect(view.container.querySelector('svg[data-rendered]')).toBeFalsy()

    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 200, clientY: 200 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 200 }))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(wrapper.style.transform).toContain('translate(0px, 0px)')
  })
})
