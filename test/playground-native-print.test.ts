import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushAll } from './setup/flush-all'

vi.mock('@iconify/vue', () => ({
  Icon: {
    name: 'IconStub',
    props: {
      icon: {
        type: String,
        default: '',
      },
    },
    template: '<span data-testid="icon">{{ icon }}</span>',
  },
}))

function createManyParagraphs(count: number) {
  return Array.from({ length: count }, (_, index) => `Paragraph ${index + 1}`).join('\n\n')
}

describe('playground native print preview', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.history.replaceState({}, '', '/test')
  })

  afterEach(() => {
    window.localStorage.clear()
    window.history.replaceState({}, '', '/test')
  })

  it('expands a long shared preview before native browser print', async () => {
    const content = createManyParagraphs(260)
    const shareId = 'native-print-long-preview'
    window.localStorage.setItem(`vmr-test-share:${shareId}`, content)
    window.history.replaceState({}, '', `/test?benchmark=1&view=preview&share=${shareId}`)

    const TestPage = (await import('../playground/src/pages/test.vue')).default
    const wrapper = mount(TestPage, { attachTo: document.body })
    await flushAll()

    expect(wrapper.findAll('.markdown-renderer > .node-slot')).toHaveLength(220)

    window.dispatchEvent(new Event('beforeprint'))

    expect(wrapper.findAll('.markdown-renderer > .node-slot')).toHaveLength(260)
    expect(wrapper.find('.markdown-renderer > .node-slot .node-placeholder').exists()).toBe(false)

    window.dispatchEvent(new Event('afterprint'))

    expect(wrapper.findAll('.markdown-renderer > .node-slot')).toHaveLength(220)

    wrapper.unmount()
  }, 30000)
})
