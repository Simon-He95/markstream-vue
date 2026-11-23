import { afterEach, describe, expect, it, vi } from 'vitest'
import Vue from 'vue'
import { enableD2 } from '../src/components/D2BlockNode/d2'
import D2BlockNode from '../src/components/D2BlockNode/D2BlockNode.vue'

// These cases mount the real component with the real `<script setup>` lifecycle
// hooks, so they have to run here instead of the root test/ directory: the root
// runtime resolves `vue` to Vue 3, where `onBeforeUnmount` in a Vue 2 SFC never
// binds to the instance and the unmount path cannot be observed.

const node = {
  type: 'code_block',
  language: 'd2',
  code: 'a -> b',
  raw: '```d2\na -> b\n```',
}

const render = () => '<svg viewBox="0 0 100 100"><text>a</text></svg>'

async function flushVue2() {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  await Vue.nextTick()
}

async function waitForElement(host: Element, selector: string, timeout = 1000) {
  const start = Date.now()
  while (!host.querySelector(selector)) {
    if (Date.now() - start > timeout)
      throw new Error(`Timed out waiting for ${selector}`)
    await flushVue2()
  }
}

function mountBlock() {
  const vm = new Vue({
    render: h => h(D2BlockNode as any, { props: { node, loading: false, showHeader: false } }),
  }).$mount()
  document.body.appendChild(vm.$el)
  return vm
}

afterEach(() => {
  enableD2()
  document.body.innerHTML = ''
})

describe('markstream-vue2 d2 worker lifecycle', () => {
  it('keeps the cached worker while mounted and terminates it on destroy', async () => {
    const terminate = vi.fn()
    enableD2(() => class {
      worker = { terminate }
      compile = () => ({ diagram: {} })
      render = render
    })

    const vm = mountBlock()
    await waitForElement(vm.$el, '.d2-svg svg')

    expect(terminate).not.toHaveBeenCalled()

    vm.$destroy()

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

      render = render
    })

    const vm = mountBlock()
    while (!compile.mock.calls.length)
      await flushVue2()

    vm.$destroy()
    finishInit?.()
    await Promise.resolve()

    expect(terminate).toHaveBeenCalledOnce()
    expect(vm.$el.querySelector('.d2-svg svg')).toBeNull()
  })

  it('leaves a loader-provided instance running after destroy', async () => {
    const terminate = vi.fn()
    enableD2(() => ({ worker: { terminate }, compile: () => ({ diagram: {} }), render }))

    const vm = mountBlock()
    await waitForElement(vm.$el, '.d2-svg svg')

    vm.$destroy()

    expect(terminate).not.toHaveBeenCalled()
  })

  it('does not construct an instance when the loader resolves after destroy', async () => {
    const construct = vi.fn()
    const terminate = vi.fn()
    let resolveLoader: ((constructor: any) => void) | undefined
    const loader = vi.fn(() => new Promise((resolve) => {
      resolveLoader = resolve
    }))
    enableD2(loader)

    const vm = mountBlock()
    const start = Date.now()
    while (!loader.mock.calls.length) {
      if (Date.now() - start > 1000)
        throw new Error('Timed out waiting for the D2 loader')
      await flushVue2()
    }

    vm.$destroy()
    resolveLoader?.(class {
      worker = { terminate }

      constructor() {
        construct()
      }

      compile = () => ({ diagram: {} })
      render = render
    })
    await flushVue2()

    expect(construct).not.toHaveBeenCalled()
  })
})
