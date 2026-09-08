import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import ImageNode from '../src/components/ImageNode/ImageNode.vue'
import { MARKSTREAM_NODE_LIFECYCLE_KEY } from '../src/utils/nodeLifecycle'

describe('image node performance defaults', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not force lazy loading by default', () => {
    const wrapper = mount(ImageNode, {
      props: {
        node: {
          type: 'image',
          src: 'https://example.com/hero.png',
          alt: 'Hero',
          title: 'Hero',
          raw: '![Hero](https://example.com/hero.png)',
        },
      },
    })

    expect(wrapper.get('img').attributes('loading')).toBeUndefined()
    expect(wrapper.get('img').attributes('fetchpriority')).toBe('high')
    expect(wrapper.get('img').attributes('decoding')).toBe('sync')
    expect(wrapper.get('img').classes()).not.toContain('opacity-0')
    expect(wrapper.get('img').classes()).not.toContain('transition-opacity')
  })

  it('keeps the image size floor until the image actually loads', async () => {
    const wrapper = mount(ImageNode, {
      props: {
        node: {
          type: 'image',
          src: 'https://example.com/badge.svg',
          alt: 'Badge',
          title: 'Badge',
          raw: '![Badge](https://example.com/badge.svg)',
        },
      },
    })

    expect(wrapper.get('img').classes()).toContain('is-loaded')
    expect(wrapper.get('img').classes()).not.toContain('is-loading')
    expect(wrapper.get('img').classes()).not.toContain('has-natural-size')

    await wrapper.get('img').trigger('load')
    await nextTick()

    expect(wrapper.get('img').classes()).toContain('has-natural-size')
  })

  it('keeps the lower-priority async path for lazy images', () => {
    const wrapper = mount(ImageNode, {
      props: {
        lazy: true,
        node: {
          type: 'image',
          src: 'https://example.com/hero.png',
          alt: 'Hero',
          title: 'Hero',
          raw: '![Hero](https://example.com/hero.png)',
        },
      },
    })

    expect(wrapper.get('img').attributes('loading')).toBe('lazy')
    expect(wrapper.get('img').attributes('fetchpriority')).toBeUndefined()
    expect(wrapper.get('img').attributes('decoding')).toBe('async')
    expect(wrapper.get('img').classes()).toContain('is-loading')
    expect(wrapper.get('img').classes()).not.toContain('has-natural-size')
  })

  it.each([false, true])('keeps the streaming placeholder until the image loads (lazy=%s)', async (lazy) => {
    const node = {
      type: 'image' as const,
      src: 'https://example.com/hero.png',
      alt: 'Hero',
      raw: '![Hero](https://example.com/hero.png)',
      loading: true,
    }
    const wrapper = mount(ImageNode, { props: { node, lazy } })
    try {
      const placeholder = wrapper.get('.image-placeholder').element
      await wrapper.setProps({ node: { ...node, loading: false } })
      expect(wrapper.get('img').attributes('src')).toBe(node.src)
      expect(wrapper.find('.image-placeholder').element).toBe(placeholder)
      await wrapper.get('img').trigger('load')
      expect(wrapper.find('.image-placeholder').exists()).toBe(false)
      expect(wrapper.get('img').classes()).toContain('has-natural-size')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('reports image load lifecycle for virtual-scroll settling', async () => {
    const markPending = vi.fn()
    const reportHeight = vi.fn()
    const markSettled = vi.fn()
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(72)

    const wrapper = mount(ImageNode, {
      attrs: {
        'index-key': 'markdown-renderer-0',
      },
      global: {
        provide: {
          [MARKSTREAM_NODE_LIFECYCLE_KEY]: {
            markPending,
            reportHeight,
            markSettled,
          },
        },
      },
      props: {
        node: {
          type: 'image',
          src: 'https://example.com/hero.png',
          alt: 'Hero',
          title: 'Hero',
          raw: '![Hero](https://example.com/hero.png)',
        },
      },
    })

    await nextTick()
    expect(markPending).toHaveBeenCalledWith('markdown-renderer-0')

    await wrapper.get('img').trigger('load')
    await nextTick()

    expect(reportHeight).toHaveBeenCalledWith('markdown-renderer-0', 72)
    expect(markSettled).toHaveBeenCalledWith('markdown-renderer-0')
  })
})
