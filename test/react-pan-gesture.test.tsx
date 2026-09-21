import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const STUB_SVG
  = '<svg data-rendered="stub" viewBox="0 0 1440 220"><rect width="10" height="10" /></svg>'

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function settleReact(turns = 6) {
  for (let index = 0; index < turns; index++)
    await flushReact()
}

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

function createNode(language: string, code: string) {
  return {
    type: 'code_block',
    language,
    code,
    raw: `\`\`\`${language}\n${code}\`\`\``,
  }
}

function mockMermaid(options: { neverRender?: boolean } = {}) {
  const fakeMermaid = {
    initialize: vi.fn(),
    parse: vi.fn(async () => true),
    render: options.neverRender
      ? vi.fn(() => new Promise(() => {}))
      : vi.fn(async () => ({ svg: STUB_SVG, bindFunctions: vi.fn() })),
  }
  vi.doMock('../packages/markstream-react/src/components/MermaidBlockNode/mermaid', () => ({
    getMermaid: vi.fn(async () => fakeMermaid),
  }))
  vi.doMock('../packages/markstream-react/src/workers/mermaidWorkerClient', () => ({
    canParseOffthread: vi.fn(async () => true),
    findPrefixOffthread: vi.fn(async () => null),
    terminateWorker: vi.fn(),
  }))
  return fakeMermaid
}

async function mountMermaid(options: { neverRender?: boolean, loading?: boolean } = {}) {
  mockMermaid(options)
  const { MermaidBlockNode } = await import('../packages/markstream-react/src/components/MermaidBlockNode/MermaidBlockNode')
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)

  await act(async () => {
    root.render(React.createElement(MermaidBlockNode as any, {
      node: createNode('mermaid', 'graph LR\nA-->B\n'),
      loading: options.loading ?? false,
    }))
  })
  await settleReact()
  // The preview render is debounced, so the scheduled work needs the timers to run.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500)
  })
  await settleReact()

  const wrapper = host.querySelector('[data-mermaid-wrapper]') as HTMLElement
  const surface = wrapper.parentElement as HTMLElement
  const transform = () => wrapper.style.transform

  return { root, host, surface, wrapper, transform }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('markstream-react mermaid pan gesture', () => {
  it('keeps panning after the pointer leaves the preview box', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)
    const { root, host, surface, transform } = await mountMermaid()

    // The gesture is only claimed once there is a diagram to pan.
    expect(host.querySelector('svg[data-rendered]')).toBeTruthy()

    await act(async () => {
      surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 200, clientY: 200 }))
    })
    // The listener lives on window, so a move far outside the surface still counts.
    await act(async () => {
      window.dispatchEvent(pointerEvent('pointermove', { clientX: -600, clientY: 900 }))
    })

    expect(transform()).toContain('translate(-800px, 700px)')

    await act(async () => {
      root.unmount()
    })
  })

  it('stops following the pointer once the gesture ends', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)
    const { root, surface, transform } = await mountMermaid()

    await act(async () => {
      surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }))
    })
    await act(async () => {
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 140, clientY: 100 }))
    })
    expect(transform()).toContain('translate(40px, 0px)')

    await act(async () => {
      window.dispatchEvent(pointerEvent('pointerup', { clientX: 140, clientY: 100 }))
    })
    await act(async () => {
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 900, clientY: 900 }))
    })
    expect(transform()).toContain('translate(40px, 0px)')

    await act(async () => {
      root.unmount()
    })
  })

  it('leaves touch swipes to the page until the diagram is zoomed in', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)
    const { root, host, surface, transform } = await mountMermaid()

    // At fit zoom the page keeps the swipe, so the surface does not claim it.
    expect(surface.style.touchAction).toBe('')

    await act(async () => {
      surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' }))
    })
    await act(async () => {
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 100, pointerType: 'touch' }))
    })
    expect(transform()).toContain('translate(0px, 0px)')

    // A mouse still pans at fit zoom.
    await act(async () => {
      surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }))
    })
    await act(async () => {
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 100 }))
    })
    expect(transform()).toContain('translate(-60px, 0px)')
    await act(async () => {
      window.dispatchEvent(pointerEvent('pointerup', { clientX: 40, clientY: 100 }))
    })

    // Zoom in through the control the header renders.
    const zoomIn = Array.from(host.querySelectorAll('button'))
      .find(button => button.textContent?.trim() === '+') as HTMLButtonElement
    for (let index = 0; index < 20; index++) {
      await act(async () => {
        zoomIn.click()
      })
    }
    expect(surface.style.touchAction).toBe('none')

    // Zoomed in, the surface claims the gesture, so touch pans with it.
    await act(async () => {
      surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' }))
    })
    await act(async () => {
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 100, pointerType: 'touch' }))
    })
    expect(transform()).toContain('translate(-120px, 0px)')

    await act(async () => {
      root.unmount()
    })
  })

  it('does not claim the gesture while there is no diagram to pan', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)
    const { root, host, surface, wrapper } = await mountMermaid({ neverRender: true, loading: true })

    expect(host.querySelector('svg[data-rendered]')).toBeFalsy()

    await act(async () => {
      surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 200, clientY: 200 }))
    })
    await act(async () => {
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 200 }))
    })
    expect(wrapper.style.transform).toContain('translate(0px, 0px)')

    await act(async () => {
      root.unmount()
    })
  })
})
