import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NodeRenderer from '../src/components/NodeRenderer'
import { flushAll } from './setup/flush-all'

describe.each([false, true])('currency streaming DOM stability (smooth=%s)', (smoothStreaming) => {
  beforeEach(() => {
    // Exercise the real math renderer rather than its NODE_ENV=test text fallback.
    vi.stubEnv('NODE_ENV', 'development')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it.each([
    'United - **$312** nonstop, Alaska - **$289** with a stop.',
    'The October range is **$130–$375**, so you are above the market.',
    'The Alaska round trip is roughly $210 + $98 = $308. Cheaper than $460.',
    'A $10,000 deposit at 4%: $A = P(1 + r)^t$ grows to about $12,209.',
  ])('keeps streamed prices and settled elements stable: %s', async (content) => {
    const frames = new Map<number, FrameRequestCallback>()
    let frameId = 0
    let now = performance.now()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback)
      return frameId
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        final: false,
        smoothStreaming,
        smoothStreamingOptions: { startDelayMs: 0, minCharsPerSecond: 1200, maxCharsPerSecond: 1200 },
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
        maxLiveNodes: 0,
        parseCoalesceMs: 0,
      },
    })
    let paragraph: Element | undefined
    let firstPrice: Element | undefined
    let formula: Element | undefined
    try {
      for (let end = 1; end <= content.length; end++) {
        const prefix = content.slice(0, end)
        await wrapper.setProps({ content: prefix })
        const pending = [...frames.values()]
        frames.clear()
        now += 100
        pending.forEach(callback => callback(now))
        await flushAll()
        if (prefix.includes('$A')) {
          await vi.dynamicImportSettled()
          await flushAll()
        }

        const currentParagraph = wrapper.find('p')
        if (currentParagraph.exists()) {
          paragraph ??= currentParagraph.element
          expect(currentParagraph.element, prefix).toBe(paragraph)
        }
        const math = wrapper.findAll('[data-markstream-math="inline"]')
        if (!prefix.includes('$A'))
          expect(math, prefix).toHaveLength(0)
        if (prefix.includes('**$312**')) {
          const price = wrapper.get('strong')
          firstPrice ??= price.element
          expect(price.element, prefix).toBe(firstPrice)
          expect(price.text(), prefix).toBe('$312')
        }
        if (prefix.includes('$A = P(1 + r)^t$')) {
          expect(math, prefix).toHaveLength(1)
          formula ??= math[0].element
          expect(math[0].element, prefix).toBe(formula)
        }
      }
      await wrapper.setProps({ final: true })
      await flushAll()
      expect(wrapper.get('p').element).toBe(paragraph)
      expect(wrapper.findAll('strong').map(node => node.text())).toEqual(
        content.startsWith('United') ? ['$312', '$289'] : content.startsWith('The October') ? ['$130–$375'] : [],
      )
      expect(wrapper.text()).toContain(content.includes('$12,209') ? '$12,209.' : content.replace(/\*\*/g, ''))
      if (formula) {
        expect(wrapper.get('[data-markstream-math="inline"]').element).toBe(formula)
        expect(wrapper.find('.katex').exists()).toBe(true)
      }
    }
    finally {
      wrapper.unmount()
      await vi.dynamicImportSettled()
    }
  })
})
