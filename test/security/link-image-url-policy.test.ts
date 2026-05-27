/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { isUnsafeHtmlUrl, sanitizeImageSrc } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import ImageNode from '../../src/components/ImageNode/ImageNode.vue'
import NodeRenderer from '../../src/components/NodeRenderer'
import { flushAll } from '../setup/flush-all'

describe('link and image URL policy', () => {
  describe('sanitizeImageSrc', () => {
    it('allows https and raster data images', () => {
      expect(sanitizeImageSrc(' https://example.com/a.png ')).toBe('https://example.com/a.png')
      expect(sanitizeImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=')
      expect(sanitizeImageSrc('data:image/webp;base64,AAAA')).toBe('data:image/webp;base64,AAAA')
    })

    it('rejects executable and SVG image URLs', () => {
      expect(sanitizeImageSrc('javascript:alert(1)')).toBe('')
      expect(sanitizeImageSrc('vbscript:msgbox(1)')).toBe('')
      expect(sanitizeImageSrc('data:text/html,<script>alert(1)</script>')).toBe('')
      expect(sanitizeImageSrc('data:image/svg+xml,<svg onload=alert(1)>')).toBe('')
      expect(sanitizeImageSrc('blob:https://example.com/abc')).toBe('')
    })

    it('returns an empty string for nullish values', () => {
      expect(sanitizeImageSrc(null)).toBe('')
      expect(sanitizeImageSrc(undefined)).toBe('')
    })
  })

  it('rejects javascript URLs obfuscated with C1 controls', () => {
    expect(isUnsafeHtmlUrl('java\u0085script:alert(1)', { attrName: 'href', tagName: 'a' })).toBe(true)
    expect(isUnsafeHtmlUrl('jav\u009Fascript:alert(1)', { attrName: 'href', tagName: 'a' })).toBe(true)
  })

  it('omits unsafe href values from direct link nodes', async () => {
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
                text: 'bad',
                raw: '[bad](javascript:alert(1))',
                children: [{ type: 'text', content: 'bad', raw: 'bad' }],
              },
            ],
          },
        ],
      },
    })

    await flushAll()
    const attrs = wrapper.get('a.link-node').attributes()
    expect(attrs.href).toBeUndefined()
    expect(attrs.target).toBeUndefined()
    expect(attrs.rel).toBeUndefined()
  })

  it('does not forward ping from direct link node attrs', async () => {
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
                text: 'safe',
                raw: '[safe](https://example.com)',
                attrs: [['ping', 'https://attacker.example/collect']],
                children: [{ type: 'text', content: 'safe', raw: 'safe' }],
              },
            ],
          },
        ],
      },
    })

    await flushAll()
    expect(wrapper.get('a.link-node').attributes('ping')).toBeUndefined()
  })

  it('does not render unsafe direct image node URLs', async () => {
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
                type: 'image',
                src: 'javascript:alert(1)',
                alt: 'bad',
                title: null,
                raw: '![bad](javascript:alert(1))',
                loading: false,
              },
            ],
          },
        ],
      },
    })

    await flushAll()
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('keeps safe direct image node URLs', async () => {
    const src = 'data:image/png;base64,iVBORw0KGgo='
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
                type: 'image',
                src,
                alt: 'ok',
                title: null,
                raw: '![ok](data:image/png;base64,iVBORw0KGgo=)',
                loading: false,
              },
            ],
          },
        ],
      },
    })

    await flushAll()
    expect(wrapper.get('img').attributes('src')).toBe(src)
  })

  it('rejects SVG data URLs for direct image nodes', async () => {
    const src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'
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
                type: 'image',
                src,
                alt: 'bad',
                title: null,
                raw: `![bad](${src})`,
                loading: false,
              },
            ],
          },
        ],
      },
    })

    await flushAll()
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('shows error instead of blank when fallbackSrc is unsafe', async () => {
    const wrapper = mount(ImageNode, {
      props: {
        node: {
          type: 'image',
          src: 'https://example.com/missing.png',
          alt: 'x',
          title: null,
          raw: '![x](https://example.com/missing.png)',
          loading: false,
        },
        fallbackSrc: 'javascript:alert(1)',
      },
    })

    await wrapper.get('img').trigger('error')
    await nextTick()

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.image-error').exists()).toBe(true)
  })

  it('renders safe fallback when primary image fails', async () => {
    const wrapper = mount(ImageNode, {
      props: {
        node: {
          type: 'image',
          src: 'https://example.com/broken.png',
          alt: 'x',
          title: null,
          raw: '![x](https://example.com/broken.png)',
          loading: false,
        },
        fallbackSrc: 'https://example.com/fallback.png',
      },
    })

    await wrapper.get('img').trigger('error')
    await nextTick()

    expect(wrapper.get('img').attributes('src')).toBe('https://example.com/fallback.png')
    expect(wrapper.find('.image-error').exists()).toBe(false)
  })

  it('shows error when fallbackSrc equals failed primary src', async () => {
    const src = 'https://example.com/broken.png'
    const wrapper = mount(ImageNode, {
      props: {
        node: {
          type: 'image',
          src,
          alt: 'x',
          title: null,
          raw: `![x](${src})`,
          loading: false,
        },
        fallbackSrc: src,
      },
    })

    await wrapper.get('img').trigger('error')
    await nextTick()

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.image-error').exists()).toBe(true)
  })

  it('uses safe fallback when primary src is unsafe', async () => {
    const wrapper = mount(ImageNode, {
      props: {
        node: {
          type: 'image',
          src: 'javascript:alert(1)',
          alt: 'x',
          title: null,
          raw: '![x](javascript:alert(1))',
          loading: false,
        },
        fallbackSrc: 'https://example.com/fallback.png',
      },
    })

    await nextTick()

    expect(wrapper.get('img').attributes('src')).toBe('https://example.com/fallback.png')
    expect(wrapper.find('.image-error').exists()).toBe(false)
  })

  it('shows error instead of blank when primary and fallback src are both unsafe', async () => {
    const wrapper = mount(ImageNode, {
      props: {
        node: {
          type: 'image',
          src: 'javascript:alert(1)',
          alt: 'x',
          title: null,
          raw: '![x](javascript:alert(1))',
          loading: false,
        },
        fallbackSrc: 'data:image/svg+xml,<svg onload=alert(1)>',
      },
    })

    await nextTick()

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.image-error').exists()).toBe(true)
  })

  it('does not keep lazy shimmer visible when primary src is unsafe', async () => {
    const wrapper = mount(ImageNode, {
      props: {
        node: {
          type: 'image',
          src: 'javascript:alert(1)',
          alt: 'x',
          title: null,
          raw: '![x](javascript:alert(1))',
          loading: false,
        },
        lazy: true,
      },
    })

    await nextTick()

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.image-shimmer-overlay').exists()).toBe(false)
    expect(wrapper.find('.image-error').exists()).toBe(true)
  })

  it('shows error after fallback image also fails', async () => {
    const wrapper = mount(ImageNode, {
      props: {
        node: {
          type: 'image',
          src: 'https://example.com/broken.png',
          alt: 'x',
          title: null,
          raw: '![x](https://example.com/broken.png)',
          loading: false,
        },
        fallbackSrc: 'https://example.com/fallback.png',
      },
    })

    await wrapper.get('img').trigger('error')
    await nextTick()
    await wrapper.get('img').trigger('error')
    await nextTick()

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.image-error').exists()).toBe(true)
  })

  it('resets to primary image when node src changes', async () => {
    const wrapper = mount(ImageNode, {
      props: {
        node: {
          type: 'image',
          src: 'https://example.com/broken.png',
          alt: 'x',
          title: null,
          raw: '![x](https://example.com/broken.png)',
          loading: false,
        },
        fallbackSrc: 'https://example.com/fallback.png',
      },
    })

    await wrapper.get('img').trigger('error')
    await nextTick()
    await wrapper.setProps({
      node: {
        type: 'image',
        src: 'https://example.com/next.png',
        alt: 'x',
        title: null,
        raw: '![x](https://example.com/next.png)',
        loading: false,
      },
      fallbackSrc: 'https://example.com/fallback.png',
    })
    await nextTick()

    expect(wrapper.get('img').attributes('src')).toBe('https://example.com/next.png')
    expect(wrapper.find('.image-error').exists()).toBe(false)
  })
})
