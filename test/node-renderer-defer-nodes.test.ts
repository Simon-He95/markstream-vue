import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushAll } from './setup/flush-all'

interface Entry { target: Element, isIntersecting: boolean, intersectionRatio: number }

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

afterEach(() => {
  FakeIntersectionObserver.instances = []
})

describe('markdownRender deferNodesUntilVisible', () => {
  it('keeps nodes as placeholders until IO marks them visible', async () => {
    const OriginalIO = globalThis.IntersectionObserver
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)

    let wrapper: ReturnType<typeof mount> | null = null
    try {
      const MarkdownRender = (await import('../src/components/NodeRenderer')).default
      const markdown = Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1}`).join('\n\n')

      wrapper = mount(MarkdownRender, {
        props: {
          content: markdown,
          // Ensure deferral is on and virtualization stays off (60 <= 320 default).
          deferNodesUntilVisible: true,
          viewportPriority: true,
          initialRenderBatchSize: 40,
        },
      })

      await flushAll()

      const deferredIndex = 45
      const slot = wrapper.find(`[data-node-index="${deferredIndex}"]`)
      expect(slot.exists()).toBe(true)
      expect(slot.find('.node-placeholder').exists()).toBe(true)
      expect(slot.find('.node-content').exists()).toBe(false)

      await wrapper.setProps({ deferNodesUntilVisible: false })
      await flushAll()

      const updatedSlot = wrapper.find(`[data-node-index="${deferredIndex}"]`)
      expect(updatedSlot.find('.node-placeholder').exists()).toBe(false)
      expect(updatedSlot.find('.node-content').exists()).toBe(true)
      expect(wrapper.text()).toContain(`Paragraph ${deferredIndex + 1}`)
    }
    finally {
      wrapper?.unmount()
      vi.stubGlobal('IntersectionObserver', OriginalIO as any)
    }
  })
})
