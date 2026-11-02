import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, provide, ref } from 'vue'
import InlineCodeNode from '../src/components/InlineCodeNode'
import NodeRenderer from '../src/components/NodeRenderer'
import TextNode from '../src/components/TextNode'

const deltaSelector = '.text-node-stream-delta, .inline-code-stream-delta'
const rendererProps = { fade: true, batchRendering: false, viewportPriority: false, deferNodesUntilVisible: false, maxLiveNodes: 0 }

afterEach(() => {
  vi.unstubAllGlobals()
  document.getSelection()?.removeAllRanges()
})

describe('vue stream completion', () => {
  it('flushes the last content and becomes final without waiting for an animation frame', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const wrapper = mount(NodeRenderer, { props: { ...rendererProps, content: 'base ', final: false, smoothStreaming: true } })
    try {
      await wrapper.setProps({ content: `base ${'word '.repeat(20)}` })
      expect(wrapper.text()).not.toContain('word '.repeat(20).trim())
      await wrapper.setProps({ content: `base ${'word '.repeat(20)}last`, final: true })
      expect(wrapper.text()).toBe(`base ${'word '.repeat(20)}last`)
      expect(wrapper.findAll(deltaSelector)).toHaveLength(0)
      expect(wrapper.vm.getVirtualMetrics().final).toBe(true)
    }
    finally { wrapper.unmount() }
  })

  it('stops fade immediately and drains a large final backlog across frames', async () => {
    const frames = new Map<number, FrameRequestCallback>()
    let id = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key))
    const wrapper = mount(NodeRenderer, { props: { ...rendererProps, content: 'base ', final: false, smoothStreaming: true } })
    try {
      const content = `base ${'word '.repeat(1000)}last`
      await wrapper.setProps({ content, final: true })
      expect(wrapper.text().length).toBeLessThan(content.length)
      expect(wrapper.findAll(deltaSelector)).toHaveLength(0)
      expect(wrapper.vm.getVirtualMetrics().final).toBe(false)
      let updates = 0
      for (; updates < 500 && !wrapper.vm.getVirtualMetrics().final; updates++) {
        const pending = [...frames.values()]
        frames.clear()
        for (const callback of pending)
          callback(performance.now())
        await new Promise(resolve => setTimeout(resolve, 0))
        await nextTick()
        expect(wrapper.findAll(deltaSelector)).toHaveLength(0)
      }
      expect(updates).toBeGreaterThan(1)
      expect(wrapper.vm.getVirtualMetrics().final).toBe(true)
      expect(wrapper.text()).toBe(content)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('cancels a pending final drain on replacement and unmount', async () => {
    const frames = new Map<number, FrameRequestCallback>()
    let id = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key))
    const wrapper = mount(NodeRenderer, { props: { ...rendererProps, content: 'base ', final: false, smoothStreaming: true } })
    await wrapper.setProps({ content: `base ${'word '.repeat(1000)}`, final: true })
    await wrapper.setProps({ content: 'replacement', final: false })
    for (const callback of [...frames.values()])
      callback(performance.now())
    await nextTick()
    expect(wrapper.text()).toBe('replacement')
    wrapper.unmount()
    expect(frames.size).toBe(0)
  })

  it('keeps initially completed content immediate for hydration', () => {
    const content = 'already complete '.repeat(300)
    const wrapper = mount(NodeRenderer, { props: { ...rendererProps, content, final: true, smoothStreaming: true } })
    try {
      expect(wrapper.text()).toBe(content.trim())
      expect(wrapper.vm.getVirtualMetrics().final).toBe(true)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('drains in a hidden tab and cancels its timers on unmount', async () => {
    vi.useFakeTimers()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const content = `base ${'word '.repeat(500)}`
    const wrapper = mount(NodeRenderer, { props: { ...rendererProps, content: 'base ', final: false, smoothStreaming: true } })
    try {
      await wrapper.setProps({ content, final: true })
      expect(wrapper.vm.getVirtualMetrics().final).toBe(false)
      await vi.advanceTimersByTimeAsync(4000)
      expect(wrapper.text()).toBe(content.trim())
      expect(wrapper.vm.getVirtualMetrics().final).toBe(true)
      expect(wrapper.findAll(deltaSelector)).toHaveLength(0)
    }
    finally {
      wrapper.unmount()
      visibility.mockRestore()
      vi.useRealTimers()
    }
  })

  it('settles active word fades on a final-only update', async () => {
    const wrapper = mount(NodeRenderer, { props: { ...rendererProps, content: 'base ', final: false, smoothStreaming: false } })
    try {
      await wrapper.setProps({ content: 'base one two `inline code` tail' })
      expect(wrapper.findAll(deltaSelector).length).toBeGreaterThan(0)
      await wrapper.setProps({ final: true })
      expect(wrapper.text()).toBe('base one two inline code tail')
      expect(wrapper.findAll(deltaSelector)).toHaveLength(0)
    }
    finally { wrapper.unmount() }
  })

  it('keeps an explicit flushOnFinish=false option paced until caught up', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const wrapper = mount(NodeRenderer, { props: { ...rendererProps, content: '', final: false, smoothStreaming: true, smoothStreamingOptions: { flushOnFinish: false } } })
    try {
      await wrapper.setProps({ content: 'still queued', final: true })
      expect(wrapper.text()).not.toContain('still queued')
      expect(wrapper.vm.getVirtualMetrics().final).toBe(false)
    }
    finally { wrapper.unmount() }
  })

  it('finishes only the completed block', async () => {
    const firstFinal = ref(false)
    const content = ref('base ')
    const wrapper = mount(defineComponent({
      setup: () => () => h('div', [
        h(NodeRenderer, { ...rendererProps, content: content.value, final: firstFinal.value, smoothStreaming: false }),
        h(NodeRenderer, { ...rendererProps, content: content.value, final: false, smoothStreaming: false }),
      ]),
    }))
    try {
      content.value += 'one two '
      await nextTick()
      firstFinal.value = true
      await nextTick()
      const blocks = wrapper.findAllComponents(NodeRenderer)
      expect(blocks[0].findAll(deltaSelector)).toHaveLength(0)
      expect(blocks[1].findAll(deltaSelector).length).toBeGreaterThan(0)
    }
    finally { wrapper.unmount() }
  })

  it('preserves a selected word while immediately displaying the final suffix', async () => {
    const wrapper = mount(NodeRenderer, { props: { ...rendererProps, content: 'base ', final: false, smoothStreaming: false }, attachTo: document.body })
    try {
      await wrapper.setProps({ content: 'base selected' })
      const word = wrapper.get('.text-node-stream-delta').element
      const text = word.firstChild!
      const range = document.createRange()
      range.setStart(text, 0)
      range.setEnd(text, 3)
      document.getSelection()!.addRange(range)
      await wrapper.setProps({ content: 'base selected last words', final: true })
      expect(wrapper.text()).toBe('base selected last words')
      expect(document.getSelection()!.toString()).toBe('sel')
      expect(text.isConnected).toBe(true)
      expect(word.classList.contains('text-node-stream-final')).toBe(true)
      document.getSelection()!.removeAllRanges()
      document.dispatchEvent(new Event('selectionchange'))
      await nextTick()
      expect(wrapper.text()).toBe('base selected last words')
      expect(wrapper.findAll(deltaSelector)).toHaveLength(0)
    }
    finally { wrapper.unmount() }
  })

  it('passes completion through nested fragment renderers', async () => {
    const final = ref(false)
    const content = ref('base ')
    const wrapper = mount(defineComponent({
      setup() {
        provide('markstreamTextFinal', computed(() => final.value))
        return () => h(NodeRenderer, { ...rendererProps, content: content.value, final: false, smoothStreaming: false, renderAsFragment: true })
      },
    }))
    try {
      content.value += 'one two'
      await nextTick()
      expect(wrapper.findAll(deltaSelector).length).toBeGreaterThan(0)
      final.value = true
      await nextTick()
      expect(wrapper.findAll(deltaSelector)).toHaveLength(0)
    }
    finally { wrapper.unmount() }
  })

  it.each([TextNode, InlineCodeNode])('settles a leaf when its containing text block finishes', async (component) => {
    const final = ref(false)
    const content = ref('base ')
    const wrapper = mount(defineComponent({
      setup() {
        provide('markstreamTextFinal', computed(() => final.value))
        return () => h(component, { node: { type: component === TextNode ? 'text' : 'inline_code', content: content.value, code: content.value, raw: content.value } } as any)
      },
    }))
    try {
      content.value += 'one two '
      await nextTick()
      expect(wrapper.findAll(deltaSelector).length).toBeGreaterThan(0)
      final.value = true
      await nextTick()
      expect(wrapper.findAll(deltaSelector)).toHaveLength(0)
    }
    finally { wrapper.unmount() }
  })
})
