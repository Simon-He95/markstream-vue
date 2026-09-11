import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const state = vi.hoisted(() => ({ available: true }))

vi.mock('../src/components/D2BlockNode/d2', () => ({
  getD2: vi.fn(async () => {
    if (!state.available)
      return null
    return class FakeD2 {
      async compile(code: string) {
        return { diagram: { code }, renderOptions: {} }
      }

      async render(diagram: { code: string }) {
        return { svg: `<svg viewBox="0 0 100 100"><text>${diagram.code}</text></svg>` }
      }
    }
  }),
}))

beforeEach(() => {
  state.available = true
})

async function settle() {
  for (let i = 0; i < 8; i++) {
    await nextTick()
    await Promise.resolve()
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
}

describe('d2 block runtime availability', () => {
  it('releases the preview reservation when the d2 runtime is unavailable', async () => {
    state.available = false
    // A fresh module registry keeps the component's module-scoped d2 instance
    // cache from leaking a previous test's instance into this case.
    vi.resetModules()
    const D2BlockNode = (await import('../src/components/D2BlockNode/D2BlockNode.vue')).default

    const wrapper = mount(D2BlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'd2',
          code: 'a -> b',
          raw: '```d2\na -> b\n```',
        },
        loading: false,
        estimatedPreviewHeightPx: 445,
      },
      attachTo: document.body,
    })

    await settle()

    const style = wrapper.get('.d2-block-body').attributes('style') || ''
    expect(style).not.toContain('445px')
    expect(wrapper.find('.d2-error').exists()).toBe(true)

    wrapper.unmount()
  })
})
