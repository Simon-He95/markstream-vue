import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NodeRenderer from '../src/components/NodeRenderer'
import { flushAll } from './setup/flush-all'

// Tests render math through the plain-text fallback, so the formula shows up as `$x_1$`.
describe('link text with inline math', () => {
  it('renders the formula inside the link', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        typewriter: false,
        batchRendering: false,
        nodes: [
          {
            type: 'paragraph',
            raw: '',
            children: [
              {
                type: 'link',
                href: 'https://example.com',
                title: null,
                text: 'the $x_1$ term',
                raw: '[the $x_1$ term](https://example.com)',
                loading: false,
                children: [
                  { type: 'text', content: 'the ', raw: 'the ' },
                  { type: 'math_inline', content: 'x_1', raw: '$x_1$', markup: '$', loading: false },
                  { type: 'text', content: ' term', raw: ' term' },
                ],
              },
            ],
          },
        ] as any,
      },
    })
    await flushAll()

    expect(wrapper.get('a.link-node').text()).toBe('the $x_1$ term')
    wrapper.unmount()
  })
})
