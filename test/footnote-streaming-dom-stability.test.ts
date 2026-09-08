import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { streamContent } from '../playground/src/const/markdown'
import NodeRenderer from '../src/components/NodeRenderer'

describe('streaming footnotes', () => {
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
    const lastEnd = streamContent.indexOf('## Image', firstEnd)
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
    }
    finally {
      wrapper.unmount()
    }
  })
})
