import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NodeRenderer from '../src/components/NodeRenderer'
import { flushAll } from './setup/flush-all'

describe('linkNode attrs passthrough', () => {
  it('binds node.attrs onto the rendered anchor element', async () => {
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
                text: 'Example',
                raw: '[Example](https://example.com)',
                attrs: [
                  ['target', '_self'],
                  ['rel', 'nofollow'],
                  ['data-track', 'cta'],
                ],
                children: [
                  {
                    type: 'text',
                    content: 'Example',
                    raw: 'Example',
                  },
                ],
              },
            ],
          },
        ],
      },
    })

    await flushAll()
    const a = wrapper.get('a.link-node')
    expect(a.attributes('target')).toBe('_self')
    expect(a.attributes('rel')?.split(/\s+/).sort()).toEqual(['nofollow'])
    expect(a.attributes('data-track')).toBe('cta')
  })

  it('preserves noopener noreferrer whenever attrs keep target at _blank', async () => {
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
                text: 'Example',
                raw: '[Example](https://example.com)',
                attrs: [
                  ['target', '_blank'],
                  ['rel', 'opener nofollow'],
                ],
                children: [
                  {
                    type: 'text',
                    content: 'Example',
                    raw: 'Example',
                  },
                ],
              },
            ],
          },
        ],
      },
    })

    await flushAll()
    const relTokens = new Set((wrapper.get('a.link-node').attributes('rel') ?? '').split(/\s+/).filter(Boolean))
    expect(relTokens.has('nofollow')).toBe(true)
    expect(relTokens.has('opener')).toBe(false)
    expect(relTokens.has('noopener')).toBe(true)
    expect(relTokens.has('noreferrer')).toBe(true)
  })

  it('normalizes _blank target values before enforcing rel protection', async () => {
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
                text: 'Example',
                raw: '[Example](https://example.com)',
                attrs: [
                  ['target', ' _BLANK '],
                  ['rel', 'nofollow'],
                ],
                children: [
                  {
                    type: 'text',
                    content: 'Example',
                    raw: 'Example',
                  },
                ],
              },
            ],
          },
        ],
      },
    })

    await flushAll()
    const a = wrapper.get('a.link-node')
    expect(a.attributes('target')).toBe('_BLANK')
    const relTokens = new Set((a.attributes('rel') ?? '').split(/\s+/).filter(Boolean))
    expect(relTokens.has('nofollow')).toBe(true)
    expect(relTokens.has('opener')).toBe(false)
    expect(relTokens.has('noopener')).toBe(true)
    expect(relTokens.has('noreferrer')).toBe(true)
  })

  it('sanitizes dangerous node.attrs before binding', async () => {
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
                text: 'Example',
                raw: '[Example](https://example.com)',
                attrs: [
                  ['onclick', 'alert(1)'],
                  ['href', 'javascript:alert(1)'],
                  ['data-safe', '1'],
                ],
                children: [
                  {
                    type: 'text',
                    content: 'Example',
                    raw: 'Example',
                  },
                ],
              },
            ],
          },
        ],
      },
    })

    await flushAll()
    const a = wrapper.get('a.link-node')
    expect(a.attributes('onclick')).toBeUndefined()
    expect(a.attributes('href')).toBe('https://example.com')
    expect(a.attributes('data-safe')).toBe('1')
  })

  it('omits unsafe node.href values', async () => {
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
                href: 'javascript:alert(1)',
                title: null,
                text: 'Example',
                raw: '[Example](javascript:alert(1))',
                children: [
                  {
                    type: 'text',
                    content: 'Example',
                    raw: 'Example',
                  },
                ],
              },
            ],
          },
        ],
      },
    })

    await flushAll()
    const a = wrapper.get('a.link-node')
    expect(a.attributes('href')).toBeUndefined()
  })
})
