import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

function flushReact() {
  return act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  })
}

async function waitForElement(host: HTMLElement, selector: string, timeout = 1000) {
  const start = Date.now()
  while (!host.querySelector(selector)) {
    if (Date.now() - start > timeout)
      throw new Error(`Timed out waiting for ${selector}`)
    await flushReact()
  }
}

const node = {
  type: 'code_block',
  language: 'd2',
  code: 'a -> b',
  raw: '```d2\na -> b\n```',
}

const render = () => '<svg viewBox="0 0 100 100"><text>a</text></svg>'

async function mountBlock() {
  const { D2BlockNode } = await import('../packages/markstream-react/src/components/D2BlockNode/D2BlockNode')
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(React.createElement(D2BlockNode as any, { node, loading: false, showHeader: false }))
  })
  return { host, root }
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.resetModules()
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('markstream-react d2 worker lifecycle', () => {
  it('terminates the worker of a rendered block on unmount', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('IntersectionObserver', undefined as any)
    const terminate = vi.fn()
    vi.doMock('../packages/markstream-react/src/components/D2BlockNode/d2', () => ({
      getD2: vi.fn(async () => class {
        worker = { terminate }
        compile = () => ({ diagram: {} })
        render = render
      }),
    }))

    const { host, root } = await mountBlock()
    await waitForElement(host, '.d2-svg svg')
    expect(terminate).not.toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })

    expect(terminate).toHaveBeenCalledOnce()
  })

  it.each(['resolves', 'rejects'])('terminates a late worker when initialization %s', async (result) => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('IntersectionObserver', undefined as any)
    const terminate = vi.fn()
    const compile = vi.fn()
    let finishInit: (() => void) | undefined

    vi.doMock('../packages/markstream-react/src/components/D2BlockNode/d2', () => ({
      getD2: vi.fn(async () => class {
        worker?: { terminate: typeof terminate }
        ready = new Promise<void>((resolve, reject) => {
          finishInit = () => {
            this.worker = { terminate }
            if (result === 'rejects')
              reject(new Error('D2 initialization failed'))
            else
              resolve()
          }
        })

        async compile() {
          compile()
          await this.ready
          return { diagram: {} }
        }

        render = render
      }),
    }))

    const { root } = await mountBlock()
    while (!compile.mock.calls.length)
      await flushReact()

    await act(async () => {
      root.unmount()
    })
    finishInit?.()
    await Promise.resolve()

    expect(terminate).toHaveBeenCalledOnce()
  })

  it('leaves a loader-provided instance running when a block unmounts', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('IntersectionObserver', undefined as any)
    const terminate = vi.fn()
    vi.doMock('../packages/markstream-react/src/components/D2BlockNode/d2', () => ({
      getD2: vi.fn(async () => ({ worker: { terminate }, compile: () => ({ diagram: {} }), render })),
    }))

    const { host, root } = await mountBlock()
    await waitForElement(host, '.d2-svg svg')

    await act(async () => {
      root.unmount()
    })

    expect(terminate).not.toHaveBeenCalled()
  })

  it('does not construct an instance when the loader resolves after unmount', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('IntersectionObserver', undefined as any)
    const terminate = vi.fn()
    const construct = vi.fn()
    const getD2 = vi.fn()
    let resolveLoader: ((constructor: any) => void) | undefined
    getD2.mockImplementation(() => new Promise((resolve) => {
      resolveLoader = resolve
    }))
    vi.doMock('../packages/markstream-react/src/components/D2BlockNode/d2', () => ({ getD2 }))

    const { root } = await mountBlock()
    while (!getD2.mock.calls.length)
      await flushReact()

    await act(async () => {
      root.unmount()
    })
    resolveLoader?.(class {
      worker = { terminate }

      constructor() {
        construct()
      }

      compile = () => ({ diagram: {} })
      render = render
    })
    await flushReact()

    expect(construct).not.toHaveBeenCalled()
    expect(terminate).not.toHaveBeenCalled()
  })
})
