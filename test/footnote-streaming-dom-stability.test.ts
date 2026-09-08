import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { streamContent } from '../playground/src/const/markdown'
import NodeRenderer from '../src/components/NodeRenderer'

describe('streaming footnotes', () => {
  it.each([
    { name: 'a final heading', count: 1, tail: '## Image' },
    { name: 'a final image', count: 3, tail: '## Image\n\n![Main image](https://example.com/main.png)' },
    { name: 'nested blocks and images', count: 3, tail: '\n\n::: note\nNested **content**.\n\n> Quoted text.\n:::\n\n## Image\n\n![Main image](https://example.com/main.png)\n\n## Next\n\nMore text.'.repeat(3) },
  ].flatMap(testCase => [true, false].map(smoothStreaming => ({ ...testCase, smoothStreaming }))))('keeps $count footnotes mounted through $name (smooth=$smoothStreaming)', async ({ count, tail, smoothStreaming }) => {
    vi.useFakeTimers()
    const visibleCallbacks: Array<() => void> = []
    vi.stubGlobal('IntersectionObserver', class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        visibleCallbacks.push(() => this.callback([{ target, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], this as unknown as IntersectionObserver))
      }

      unobserve() {}
      disconnect() {}
    })
    const prefix = Array.from({ length: 45 }, (_, index) => `Paragraph ${index}.`).join('\n\n')
    const references = Array.from({ length: count }, (_, index) => `Reference[^${index}].`).join(' ')
    const definitions = Array.from({ length: count }, (_, index) => `[^${index}]: Note **${index}** with [a link](https://example.com) and **[![image](https://example.com/note.png)](https://example.com)**.\n\n    Second paragraph with *emphasis*.`).join('\n\n')
    const seed = `${prefix}\n\n${references}\n\n${definitions}\n\n`
    const wrapper = mount(NodeRenderer, {
      props: { content: seed, final: false, smoothStreaming, parseCoalesceMs: 0 },
    })
    try {
      for (let frame = 0; frame < 80; frame++) {
        visibleCallbacks.splice(0).forEach(notify => notify())
        await vi.advanceTimersByTimeAsync(16)
      }
      const footnotes = wrapper.findAll('.footnote-node').map(node => node.element)
      expect(footnotes).toHaveLength(count)
      const images = wrapper.findAll('.footnote-node img').map(node => node.element)
      expect(images).toHaveLength(count)
      await wrapper.setProps({ content: seed + tail, final: true })
      for (let frame = 0; frame < 100; frame++) {
        await vi.advanceTimersByTimeAsync(16)
        const current = wrapper.findAll('.footnote-node')
        expect(current, `frame ${frame}`).toHaveLength(count)
        current.forEach((node, index) => expect(node.element, `frame ${frame}, footnote ${index}`).toBe(footnotes[index]))
        const currentImages = wrapper.findAll('.footnote-node img')
        expect(currentImages).toHaveLength(count)
        currentImages.forEach((node, index) => expect(node.element).toBe(images[index]))
      }
      expect(wrapper.vm.$.setupState.effectiveFinal).toBe(true)
    }
    finally {
      wrapper.unmount()
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('preserves an existing footnote when an earlier reference gets its definition later', async () => {
    const content = 'Earlier[^late], existing[^known], repeated[^known].\n\n[^known]: Existing **note**.'
    const wrapper = mount(NodeRenderer, {
      props: { content, final: false, smoothStreaming: false, parseCoalesceMs: 0 },
    })
    try {
      const existing = wrapper.get('.footnote-node').element
      await wrapper.setProps({ content: `${content}\n\n[^late]: Arrived later.\n\n## Next`, final: true })
      const footnotes = wrapper.findAll('.footnote-node')
      expect(footnotes).toHaveLength(2)
      expect(footnotes[0].text()).toContain('Arrived later')
      expect(footnotes[1].element).toBe(existing)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('keeps inline footnotes with repeated parser ids distinct when blocks are inserted', async () => {
    const content = 'Text ^[First inline note] and ^[Second inline note]'
    const wrapper = mount(NodeRenderer, {
      props: {
        content,
        final: false,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
        parseCoalesceMs: 0,
      },
    })
    try {
      const footnotes = wrapper.findAll('.footnote-node').map(node => node.element)
      expect(footnotes).toHaveLength(2)
      await wrapper.setProps({ content: `${content} and ^[Third inline note]\n\n## Next\n\nMore content.` })
      expect(wrapper.findAll('.footnote-node')).toHaveLength(3)
      expect(wrapper.findAll('.footnote-node')[0].element).toBe(footnotes[0])
      expect(wrapper.findAll('.footnote-node')[1].element).toBe(footnotes[1])
    }
    finally {
      wrapper.unmount()
    }
  })

  it('keeps the footnote mounted as following blocks are inserted before it', async () => {
    const start = streamContent.indexOf('## Footnotes')
    const firstEnd = streamContent.indexOf('This is a note admonition', start) + 'This i'.length
    const lastEnd = streamContent.length
    const wrapper = mount(NodeRenderer, {
      props: {
        content: streamContent.slice(start, firstEnd),
        final: false,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
        parseCoalesceMs: 0,
      },
    })
    try {
      const footnote = wrapper.get('.footnote-node').element
      const paragraph = wrapper.get('.footnote-node p').element
      for (let end = firstEnd + 1; end <= lastEnd; end++) {
        await wrapper.setProps({ content: streamContent.slice(start, end) })
        expect(wrapper.get('.footnote-node').element, `prefix ${end}`).toBe(footnote)
        expect(footnote.textContent).toContain('complete token specification')
        expect(wrapper.get('.footnote-node p').element).toBe(paragraph)
      }
      await wrapper.setProps({ final: true })
      expect(wrapper.get('.footnote-node').element).toBe(footnote)
    }
    finally {
      wrapper.unmount()
    }
  })
})
