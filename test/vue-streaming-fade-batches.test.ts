import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import InlineCodeNode from '../src/components/InlineCodeNode'
import TextNode from '../src/components/TextNode'

describe.each([
  ['text', TextNode, 'content', '.text-node-stream-delta'],
  ['inline_code', InlineCodeNode, 'code', '.inline-code-stream-delta'],
] as const)('%s bounded streaming fade', (type, component, field, selector) => {
  afterEach(() => vi.restoreAllMocks())

  function mountNode(content = 'base', persisted?: string) {
    return mount(component, {
      props: { node: { type, [field]: content, raw: content } } as any,
      attrs: { 'index-key': 'tail' },
      global: { provide: { markstreamTextStreamState: new Map(persisted ? [['tail', persisted]] : []) } },
    })
  }

  it('preserves existing batches and coalesces dense appends without restarting them', async () => {
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
      await append('baseABC')
      expect(wrapper.findAll(selector).map(node => node.text())).toEqual(['AB', 'C'])
      expect(wrapper.findAll(selector)[0].element).toBe(first)
      await wrapper.findAll(selector)[0].trigger('animationend')
      expect(wrapper.findAll(selector).map(node => node.text())).toEqual(['C'])
      expect(wrapper.text()).toBe('baseABC')
      await wrapper.get(selector).trigger('animationend')
      expect(wrapper.find(selector).exists()).toBe(false)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('bounds outstanding batches even when animations do not finish, and settles in text order', async () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const wrapper = mountNode()
    try {
      for (let index = 1; index <= 100; index++) {
        now += 50
        const content = `base${'x'.repeat(index)}`
        await wrapper.setProps({ node: { type, [field]: content, raw: content } } as any)
        expect(wrapper.findAll(selector).length).toBeLessThanOrEqual(4)
        expect(wrapper.text()).toBe(content)
      }
      const batches = wrapper.findAll(selector)
      await batches[3].trigger('animationend')
      expect(wrapper.findAll(selector)).toHaveLength(4)
      for (const batch of batches.slice(0, 3))
        await batch.trigger('animationend')
      expect(wrapper.find(selector).exists()).toBe(false)
      expect(wrapper.text()).toBe(`base${'x'.repeat(100)}`)
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
