import { cleanup, render, waitFor } from '@octanejs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { D2BlockNode, enableD2 } from '../../src/index'

const node = {
  type: 'code_block' as const,
  language: 'd2',
  code: 'a -> b',
  raw: '```d2\na -> b\n```',
}

const renderSvg = () => '<svg viewBox="0 0 100 100"><text>a</text></svg>'

async function flushOctane() {
  await Promise.resolve()
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

afterEach(() => {
  cleanup()
  enableD2()
  document.body.innerHTML = ''
})

describe('markstream-octane d2 worker lifecycle', () => {
  it('keeps the cached worker while mounted and terminates it on unmount', async () => {
    const terminate = vi.fn()
    enableD2(() => class {
      worker = { terminate }
      compile = () => ({ diagram: {} })
      render = renderSvg
    })

    const view = render(D2BlockNode, {
      props: { node, loading: false, showHeader: false },
    })
    await waitFor(() => expect(view.container.querySelector('.d2-svg svg')).not.toBeNull())

    expect(terminate).not.toHaveBeenCalled()

    view.unmount()

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

    const view = render(D2BlockNode, {
      props: { node, loading: false, showHeader: false },
    })
    const start = Date.now()
    while (!compile.mock.calls.length) {
      if (Date.now() - start > 1000)
        throw new Error('Timed out waiting for the D2 compile')
      await flushOctane()
    }

    view.unmount()
    finishInit?.()
    await Promise.resolve()

    expect(terminate).toHaveBeenCalledOnce()
    expect(view.container.querySelector('.d2-svg svg')).toBeNull()
  })

  it('leaves a loader-provided instance running after unmount', async () => {
    const terminate = vi.fn()
    enableD2(() => ({ worker: { terminate }, compile: () => ({ diagram: {} }), render: renderSvg }))

    const view = render(D2BlockNode, {
      props: { node, loading: false, showHeader: false },
    })
    await waitFor(() => expect(view.container.querySelector('.d2-svg svg')).not.toBeNull())

    view.unmount()

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

    const view = render(D2BlockNode, {
      props: { node, loading: false, showHeader: false },
    })
    const start = Date.now()
    while (!loader.mock.calls.length) {
      if (Date.now() - start > 1000)
        throw new Error('Timed out waiting for the D2 loader')
      await flushOctane()
    }

    view.unmount()
    resolveLoader?.(class {
      worker = { terminate }

      constructor() {
        construct()
      }

      compile = () => ({ diagram: {} })
      render = renderSvg
    })
    await flushOctane()

    expect(construct).not.toHaveBeenCalled()
  })
})
