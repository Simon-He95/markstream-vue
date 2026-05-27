import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

interface Entry {
  target: Element
  isIntersecting: boolean
  intersectionRatio: number
}

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  callback: (entries: Entry[]) => void
  elements = new Set<Element>()

  constructor(cb: (entries: Entry[]) => void) {
    this.callback = cb
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
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function setupViewportPriority() {
  vi.useFakeTimers()
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)
  vi.stubGlobal('requestIdleCallback', ((cb: any) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 1)) as any)
  vi.stubGlobal('cancelIdleCallback', ((id: number) => clearTimeout(id)) as any)
  vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 0)) as any)
  vi.stubGlobal('cancelAnimationFrame', ((id: number) => clearTimeout(id)) as any)
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
  FakeIntersectionObserver.instances = []
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('markstream-react heavy-node viewport priority', () => {
  it('prerenders math blocks during idle before intersection', async () => {
    setupViewportPriority()

    const renderKaTeXWithBackpressure = vi.fn(async () => '<span class="katex">x^2</span>')
    vi.doMock('../packages/markstream-react/src/workers/katexWorkerClient', () => ({
      WORKER_BUSY_CODE: 'WORKER_BUSY',
      renderKaTeXWithBackpressure,
      setKaTeXCache: vi.fn(),
    }))
    vi.doMock('../packages/markstream-react/src/components/Math/katex', () => ({
      getKatex: vi.fn(async () => null),
    }))

    const { MathBlockNode } = await import('../packages/markstream-react/src/components/Math/MathBlockNode')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(MathBlockNode as any, {
        node: {
          type: 'math_block',
          content: 'x^2',
          raw: '$$x^2$$',
          loading: true,
        },
      }))
    })
    await flushReact()

    expect(renderKaTeXWithBackpressure).not.toHaveBeenCalled()
    expect(FakeIntersectionObserver.instances.at(-1)).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200)
    })
    await flushReact()

    expect(renderKaTeXWithBackpressure).toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
  })

  it('prerenders d2 blocks during idle before intersection', async () => {
    setupViewportPriority()

    const compile = vi.fn(async (code: string) => ({
      diagram: { code },
      renderOptions: {},
    }))
    const render = vi.fn(async () => ({
      svg: '<svg width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" /></svg>',
    }))
    vi.doMock('../packages/markstream-react/src/components/D2BlockNode/d2', () => ({
      getD2: vi.fn(async () => class FakeD2 {
        compile = compile
        render = render
      }),
    }))

    const { D2BlockNode } = await import('../packages/markstream-react/src/components/D2BlockNode/D2BlockNode')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(D2BlockNode as any, {
        node: {
          type: 'code_block',
          language: 'd2',
          code: 'a -> b',
          raw: '```d2\na -> b\n```',
        },
        loading: false,
        showHeader: false,
      }))
    })
    await flushReact()

    expect(compile).not.toHaveBeenCalled()
    expect(render).not.toHaveBeenCalled()
    expect(FakeIntersectionObserver.instances.at(-1)).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200)
    })
    await flushReact()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
    })
    await flushReact()

    expect(compile).toHaveBeenCalled()
    expect(render).toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
  })

  it('prerenders infographic blocks during idle before intersection', async () => {
    setupViewportPriority()

    const render = vi.fn()
    vi.doMock('../packages/markstream-react/src/components/InfographicBlockNode/infographic', () => ({
      getInfographic: vi.fn(async () => class FakeInfographic {
        constructor(_options: any) {}

        render = render
        destroy() {}
      }),
    }))

    const { InfographicBlockNode } = await import('../packages/markstream-react/src/components/InfographicBlockNode/InfographicBlockNode')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(InfographicBlockNode as any, {
        node: {
          type: 'code_block',
          language: 'infographic',
          code: 'infographic list-row-simple-horizontal-arrow',
          raw: '```infographic\ninfographic list-row-simple-horizontal-arrow\n```',
        },
        loading: false,
        showHeader: false,
      }))
    })
    await flushReact()

    expect(render).not.toHaveBeenCalled()
    expect(FakeIntersectionObserver.instances.at(-1)).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200)
    })
    await flushReact()

    expect(render).toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
  })
})
