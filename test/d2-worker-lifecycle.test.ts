import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableD2, setD2Loader } from '../src/components/D2BlockNode/d2'
import D2BlockNode from '../src/components/D2BlockNode/D2BlockNode.vue'

function mountBlock() {
  return mount(D2BlockNode, {
    props: {
      node: {
        type: 'code_block',
        language: 'd2',
        code: 'a -> b',
        raw: '```d2\na -> b\n```',
      },
      loading: false,
    },
    attachTo: document.body,
  })
}

const render = () => '<svg viewBox="0 0 100 100"><text>a</text></svg>'

afterEach(() => {
  enableD2()
})

describe('d2 worker lifecycle', () => {
  it('terminates the worker of a rendered block on unmount', async () => {
    const terminate = vi.fn()
    setD2Loader(() => class {
      worker = { terminate }
      compile = () => ({ diagram: {} })
      render = render
    })

    const wrapper = mountBlock()
    await vi.waitFor(() => expect(wrapper.find('.d2-svg svg').exists()).toBe(true))
    expect(terminate).not.toHaveBeenCalled()
    wrapper.unmount()

    expect(terminate).toHaveBeenCalledOnce()
  })

  it.each(['resolves', 'rejects'])('terminates a late worker when initialization %s', async (result) => {
    const terminate = vi.fn()
    const compile = vi.fn()
    let finishInit: (() => void) | undefined

    setD2Loader(() => class {
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

    const wrapper = mountBlock()
    await vi.waitFor(() => expect(compile).toHaveBeenCalledOnce())
    wrapper.unmount()
    finishInit?.()
    await Promise.resolve()

    expect(terminate).toHaveBeenCalledOnce()
  })

  it('leaves a loader-provided instance running when a block unmounts', async () => {
    const terminate = vi.fn()
    setD2Loader(() => ({ worker: { terminate }, compile: () => ({ diagram: {} }), render }))

    const wrapper = mountBlock()
    await vi.waitFor(() => expect(wrapper.find('.d2-svg svg').exists()).toBe(true))
    wrapper.unmount()

    expect(terminate).not.toHaveBeenCalled()
  })
})
