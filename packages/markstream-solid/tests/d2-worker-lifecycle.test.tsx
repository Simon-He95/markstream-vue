import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { D2BlockNode, enableD2 } from '../src'

const node = {
  type: 'code_block' as const,
  language: 'd2',
  code: 'a -> b',
  raw: '```d2\na -> b\n```',
  loading: false,
}

const renderSvg = () => '<svg viewBox="0 0 100 100"><text>a</text></svg>'

async function flushSolid() {
  await Promise.resolve()
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

async function waitForElement(host: HTMLElement, selector: string, timeout = 2000) {
  const start = Date.now()
  while (!host.querySelector(selector)) {
    if (Date.now() - start > timeout)
      throw new Error(`Timed out waiting for ${selector}`)
    await flushSolid()
  }
}

let dispose: (() => void) | undefined
let host: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() { }
    disconnect() { }
  })
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  enableD2()
  host.remove()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

function mountBlock() {
  dispose = render(() => (
    <D2BlockNode node={node} loading={false} showHeader={false} />
  ), host)
  return host
}

describe('markstream-solid d2 worker lifecycle', () => {
  it('releases the instance constructed for the enhanced preview', async () => {
    const terminate = vi.fn()
    enableD2(() => class {
      worker = { terminate }
      compile = () => ({ diagram: {} })
      render = renderSvg
    })

    const container = mountBlock()
    await waitForElement(container, 'svg')

    expect(terminate).toHaveBeenCalledOnce()

    dispose?.()
    dispose = undefined

    expect(terminate).toHaveBeenCalledOnce()
  })

  it.each(['resolves', 'rejects'])('terminates a worker assigned while initialization %s', async (result) => {
    const terminate = vi.fn()
    const compile = vi.fn()
    let finishInit: (() => void) | undefined

    enableD2(() => class {
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

      render = renderSvg
    })

    const container = mountBlock()
    const start = Date.now()
    while (!compile.mock.calls.length) {
      if (Date.now() - start > 2000)
        throw new Error('Timed out waiting for the D2 compile')
      await flushSolid()
    }

    dispose?.()
    dispose = undefined
    finishInit?.()
    await flushSolid()

    expect(terminate).toHaveBeenCalledOnce()
    expect(container.querySelector('svg')).toBeNull()
  })

  it('leaves a loader-provided instance running', async () => {
    const terminate = vi.fn()
    enableD2(() => ({ worker: { terminate }, compile: () => ({ diagram: {} }), render: renderSvg }))

    const container = mountBlock()
    await waitForElement(container, 'svg')

    dispose?.()
    dispose = undefined

    expect(terminate).not.toHaveBeenCalled()
  })

  it('does not construct an instance when the loader resolves after unmount', async () => {
    const construct = vi.fn()
    const terminate = vi.fn()
    let resolveLoader: ((constructor: any) => void) | undefined
    const loader = vi.fn(() => new Promise((resolve) => {
      resolveLoader = resolve
    }))
    enableD2(loader)

    mountBlock()
    const start = Date.now()
    while (!loader.mock.calls.length) {
      if (Date.now() - start > 2000)
        throw new Error('Timed out waiting for the D2 loader')
      await flushSolid()
    }

    dispose?.()
    dispose = undefined
    resolveLoader?.(class {
      worker = { terminate }

      constructor() {
        construct()
      }

      compile = () => ({ diagram: {} })
      render = renderSvg
    })
    await flushSolid()

    expect(construct).not.toHaveBeenCalled()
  })
})
