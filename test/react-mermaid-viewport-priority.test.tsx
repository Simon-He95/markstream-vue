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

  trigger(el: Element, isIntersecting = true) {
    if (!this.elements.has(el))
      return
    this.callback([{ target: el, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 }])
  }
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
  FakeIntersectionObserver.instances = []
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('markstream-react mermaid viewport priority', () => {
  it('prerenders during idle before the block becomes visible', async () => {
    vi.useFakeTimers()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('requestIdleCallback', ((cb: any) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 1)) as any)
    vi.stubGlobal('cancelIdleCallback', ((id: number) => clearTimeout(id)) as any)

    const canParseOffthread = vi.fn(async () => true)
    const findPrefixOffthread = vi.fn(async () => null)
    const fakeMermaid = {
      initialize: vi.fn(),
      parse: vi.fn(async () => true),
      render: vi.fn(async () => ({
        svg: '<svg viewBox="0 0 10 10"><rect width="1" height="1" /></svg>',
        bindFunctions: vi.fn(),
      })),
    }
    vi.doMock('../packages/markstream-react/src/workers/mermaidWorkerClient', () => ({
      canParseOffthread,
      findPrefixOffthread,
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../packages/markstream-react/src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
    }))
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)

    const { MermaidBlockNode } = await import('../packages/markstream-react/src/components/MermaidBlockNode/MermaidBlockNode')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const node = {
      type: 'code_block',
      language: 'mermaid',
      code: 'graph LR\nA-->B\nB-->C\n',
      raw: '```mermaid\ngraph LR\nA-->B\nB-->C\n```',
    }

    await act(async () => {
      root.render(React.createElement(MermaidBlockNode as any, {
        node,
        loading: true,
      }))
    })
    await flushReact()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    await flushReact()

    expect(canParseOffthread).not.toHaveBeenCalled()
    expect(findPrefixOffthread).not.toHaveBeenCalled()

    const observer = FakeIntersectionObserver.instances.at(-1)
    expect(observer).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200)
    })
    await flushReact()

    expect(canParseOffthread).toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
  })
})
