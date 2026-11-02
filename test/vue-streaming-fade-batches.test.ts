import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import InlineCodeNode from '../src/components/InlineCodeNode'
import TextNode from '../src/components/TextNode'

describe.each([
  ['text', TextNode, 'content', '.text-node-stream-delta'],
  ['inline_code', InlineCodeNode, 'code', '.inline-code-stream-delta'],
] as const)('%s streaming word fade', (type, component, field, selector) => {
  afterEach(() => vi.restoreAllMocks())

  function mountNode(content = 'base', persisted?: string) {
    return mount(component, {
      props: { node: { type, [field]: content, raw: content } } as any,
      attrs: { 'index-key': 'tail' },
      global: { provide: { markstreamTextStreamState: new Map(persisted ? [['tail', persisted]] : []) } },
    })
  }

  it('preserves a growing word and starts the next word without restarting it', async () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const wrapper = mountNode()
    const append = (content: string) => wrapper.setProps({ node: { type, [field]: content, raw: content } } as any)
    try {
      await append('baseA')
      const first = wrapper.get(selector).element
      now = 16
      await append('baseAB')
      expect(wrapper.findAll(selector)).toHaveLength(1)
      expect(wrapper.get(selector).element).toBe(first)
      now = 50
      await append('baseAB C')
      expect(wrapper.findAll(selector).map(node => node.text())).toEqual(['AB', 'C'])
      expect(wrapper.findAll(selector)[0].element).toBe(first)
      await wrapper.findAll(selector)[0].trigger('animationend')
      expect(wrapper.findAll(selector).map(node => node.text())).toEqual(['C'])
      expect(wrapper.text()).toBe('baseAB C')
      await wrapper.get(selector).trigger('animationend')
      expect(wrapper.find(selector).exists()).toBe(false)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('keeps new words independent beyond four active animations and settles in order', async () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const wrapper = mountNode()
    try {
      for (let index = 1; index <= 100; index++) {
        now += 50
        const content = `base ${'word '.repeat(index)}`
        await wrapper.setProps({ node: { type, [field]: content, raw: content } } as any)
        expect(wrapper.findAll(selector)).toHaveLength(index)
        expect(wrapper.element.textContent).toBe(content)
      }
      const batches = wrapper.findAll(selector)
      await batches[99].trigger('animationend')
      expect(wrapper.findAll(selector)).toHaveLength(100)
      for (const batch of batches.slice(0, 99))
        await batch.trigger('animationend')
      expect(wrapper.find(selector).exists()).toBe(false)
      expect(wrapper.element.textContent).toBe(`base ${'word '.repeat(100)}`)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('settles hidden-tab updates and resumes word fades when visible', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    visibility.mockReturnValue('visible')
    const wrapper = mountNode('base ')
    const append = (content: string) => wrapper.setProps({ node: { type, [field]: content, raw: content } } as any)
    try {
      await append('base first ')
      expect(wrapper.findAll(selector)).toHaveLength(1)
      visibility.mockReturnValue('hidden')
      await append(`base first ${'background '.repeat(1000)}`)
      expect(wrapper.findAll(selector)).toHaveLength(0)
      visibility.mockReturnValue('visible')
      await append(`base first ${'background '.repeat(1000)}visible`)
      expect(wrapper.findAll(selector).map(node => node.text())).toEqual(['visible'])
    }
    finally {
      wrapper.unmount()
    }
  })

  it('restores a persisted prefix on remount and discards batches on replacement', async () => {
    const wrapper = mountNode('base appended', 'base')
    try {
      expect(wrapper.get(selector).text()).toBe('appended')
      expect(wrapper.text()).toBe('base appended')
      await wrapper.setProps({ node: { type, [field]: 'replacement', raw: 'replacement' } } as any)
      expect(wrapper.find(selector).exists()).toBe(false)
      expect(wrapper.text()).toBe('replacement')
    }
    finally {
      wrapper.unmount()
    }
  })
})
