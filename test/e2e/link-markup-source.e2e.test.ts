/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { beforeAll, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { removeCustomComponents, setCustomComponents } from '../../src/utils/nodeComponents'
import { flushAll } from '../setup/flush-all'

let MarkdownRender: any

// Mirrors the reporter's use case: a custom `link` component decides from the
// node itself whether the link was hand written or auto-detected.
const LinkProbe = defineComponent({
  name: 'LinkProbe',
  props: {
    node: { type: Object, required: true },
  },
  setup(props) {
    return () => {
      const node = props.node as any
      return h('span', {
        'class': 'link-probe',
        'data-markup': String(node.markup ?? ''),
        'data-href': String(node.href ?? ''),
      }, String(node.text ?? ''))
    }
  },
})

async function mountWithProbe(content: string) {
  const scopeId = 'link-markup-e2e'
  setCustomComponents(scopeId, { link: LinkProbe })
  const wrapper = mount(MarkdownRender, {
    props: {
      content,
      customId: scopeId,
      final: true,
      smoothStreaming: false,
    },
  })
  await flushAll()
  return {
    scopeId,
    wrapper,
    probes: wrapper.findAll('.link-probe'),
    cleanup: () => {
      wrapper.unmount()
      removeCustomComponents(scopeId)
    },
  }
}

describe('link markup source in custom components', () => {
  beforeAll(async () => {
    MarkdownRender = (await import('../../src/components/NodeRenderer')).default
  })

  it('exposes the link source on the node given to a custom link component', async () => {
    const { probes, cleanup } = await mountWithProbe('see summary.md\n\n[summary.md](http://summary.md)\n\n<https://example.com>\n\n<a href="https://example.com/y">html link</a>')
    try {
      const markups = probes.map(probe => probe.attributes('data-markup'))
      expect(markups).toEqual(['linkify', '', 'autolink', 'html'])
    }
    finally {
      cleanup()
    }
  })

  it('updates a custom link component when only the link source changes', async () => {
    const { wrapper, cleanup } = await mountWithProbe('see summary.md')
    try {
      expect(wrapper.find('.link-probe').attributes('data-markup')).toBe('linkify')
      expect(wrapper.find('.link-probe').attributes('data-href')).toBe('http://summary.md')

      await wrapper.setProps({ content: '[summary.md](http://summary.md)' })
      await flushAll()

      expect(wrapper.findAll('.link-probe')).toHaveLength(1)
      expect(wrapper.find('.link-probe').attributes('data-markup')).toBe('')
      expect(wrapper.find('.link-probe').attributes('data-href')).toBe('http://summary.md')
    }
    finally {
      cleanup()
    }
  })
})
