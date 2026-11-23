import { mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import D2BlockNode from '../packages/markstream-svelte/src/components/D2BlockNode.svelte'
import { enableD2 } from '../packages/markstream-svelte/src/optional/d2'

const node = {
  type: 'code_block',
  language: 'd2',
  code: 'a -> b',
  raw: '```d2\na -> b\n```',
}

const render = () => '<svg viewBox="0 0 100 100"><text>a</text></svg>'

async function flushSvelte() {
  await tick()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

async function waitForElement(host: HTMLElement, selector: string, timeout = 1000) {
  const start = Date.now()
  while (!host.querySelector(selector)) {
    if (Date.now() - start > timeout)
      throw new Error(`Timed out waiting for ${selector}`)
    await flushSvelte()
  }
}

function mountBlock() {
  const target = document.createElement('div')
  document.body.append(target)
  const instance = mount(D2BlockNode as any, {
    target,
    props: { node, loading: false, showHeader: false },
  })
  return { instance, target }
}

afterEach(() => {
  enableD2()
  document.body.innerHTML = ''
})

describe('markstream-svelte d2 worker lifecycle', () => {
  it('terminates the owned worker after the block renders', async () => {
    const terminate = vi.fn()
    enableD2(() => class {
      worker = { terminate }
      compile = () => ({ diagram: {} })
      render = render
    })

    const { instance, target } = mountBlock()
    await waitForElement(target, '.d2-svg svg')

    expect(terminate).toHaveBeenCalledOnce()

    await unmount(instance)
  })

  it.each(['resolves', 'rejects'])('terminates a late worker when the block is destroyed while initialization %s', async (result) => {
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

      render = render
    })

    const { instance, target } = mountBlock()
    while (!compile.mock.calls.length)
      await flushSvelte()

    await unmount(instance)
    finishInit?.()
    await Promise.resolve()

    expect(terminate).toHaveBeenCalledOnce()
    expect(target.querySelector('.d2-svg svg')).toBeNull()
  })

  it('leaves a loader-provided instance running when the block is destroyed', async () => {
    const terminate = vi.fn()
    enableD2(() => ({ worker: { terminate }, compile: () => ({ diagram: {} }), render }))

    const { instance, target } = mountBlock()
    await waitForElement(target, '.d2-svg svg')

    await unmount(instance)

    expect(terminate).not.toHaveBeenCalled()
  })
})
