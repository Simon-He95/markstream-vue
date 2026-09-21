import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PinnedImageNode from '../playground/src/components/PinnedImageNode.vue'
import NodeRenderer from '../src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'
import { flushAll } from './setup/flush-all'

const LOGO_SRC = 'https://vuejs.org/images/logo.png'

function imageNode(overrides: Record<string, unknown> = {}) {
  return {
    type: 'image' as const,
    src: LOGO_SRC,
    alt: 'Vue Logo',
    title: null,
    raw: `![Vue Logo](${LOGO_SRC})`,
    ...overrides,
  }
}

function pinnedImageNodeSource() {
  return readFileSync(resolve(process.cwd(), 'playground/src/components/PinnedImageNode.vue'), 'utf8')
}

describe('playground pinned image node (issue #766)', () => {
  it('renders streamed image nodes through the pinned node and keeps one box across load', async () => {
    const customId = 'playground-pinned-image'
    setCustomComponents(customId, { image: PinnedImageNode })

    const wrapper = mount(NodeRenderer, {
      props: {
        batchRendering: false,
        content: `![Vue Logo](${LOGO_SRC})`,
        customId,
        deferNodesUntilVisible: false,
        maxLiveNodes: 0,
        smoothStreaming: false,
        viewportPriority: false,
      },
    })

    try {
      await flushAll()

      const box = wrapper.get('.pinned-image-node')
      // The library node (which grows from the 8rem placeholder to the natural
      // size) must not be used on this page anymore.
      expect(wrapper.find('.image-node-container').exists()).toBe(false)
      // The built-in demo streams the image as an inline child of a paragraph,
      // so cover that route (ParagraphNode merges the custom mapping too).
      expect(box.element.closest('.paragraph-node')).not.toBeNull()
      expect(box.attributes('data-pinned-image-state')).toBe('loading')
      expect(box.find('.pinned-image-node__placeholder').exists()).toBe(true)

      const img = box.get('img')
      expect(img.attributes('src')).toBe(LOGO_SRC)
      expect(img.attributes('alt')).toBe('Vue Logo')

      const boxElement = box.element
      const boxStyle = box.attributes('style')

      await img.trigger('load')
      await flushAll()

      const loadedBox = wrapper.get('.pinned-image-node')
      // Same element, same inline size: the node is not rebuilt and the box does
      // not resize when the bytes arrive.
      expect(loadedBox.element).toBe(boxElement)
      expect(loadedBox.attributes('style')).toBe(boxStyle)
      expect(loadedBox.attributes('data-pinned-image-state')).toBe('loaded')
      expect(loadedBox.find('.pinned-image-node__placeholder').exists()).toBe(false)
      expect(loadedBox.get('.pinned-image-node__img').classes()).toContain('is-loaded')
    }
    finally {
      wrapper.unmount()
      removeCustomComponents(customId)
    }
  })

  it('pins an explicit box edge when boxSize is provided', () => {
    const wrapper = mount(PinnedImageNode, {
      props: { node: imageNode(), boxSize: 480 },
    })

    try {
      expect(wrapper.get('.pinned-image-node').attributes('style')).toContain('--pinned-image-size: 480px')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('derives the box height from the box itself, never from the image layer', () => {
    const source = pinnedImageNodeSource()
    const boxRule = source.match(/\.pinned-image-node \{[\s\S]*?\n\}/)?.[0] ?? ''
    const imageRule = source.match(/\.pinned-image-node__img \{[\s\S]*?\n\}/)?.[0] ?? ''
    const overlayRule = source.match(/\.pinned-image-node__placeholder,[\s\S]*?\n\}/)?.[0] ?? ''

    expect(boxRule).toContain('width: min(100%, var(--pinned-image-size))')
    expect(boxRule).toContain('aspect-ratio: 1 / 1')
    // Both layers are taken out of flow, so neither the placeholder nor the
    // loaded image can change the reserved height.
    expect(imageRule).toContain('position: absolute')
    expect(overlayRule).toContain('position: absolute')
  })

  it('keeps the placeholder when a partial streamed src fails', async () => {
    const wrapper = mount(PinnedImageNode, {
      props: { node: imageNode({ src: 'https://vuejs.o', loading: true }) },
    })

    try {
      await wrapper.get('img').trigger('error')
      expect(wrapper.get('.pinned-image-node').attributes('data-pinned-image-state')).toBe('loading')
      expect(wrapper.find('.pinned-image-node__error').exists()).toBe(false)

      // The closing paren arrives with the final URL: the node recovers instead
      // of staying stuck in the error state.
      await wrapper.setProps({ node: imageNode() })
      expect(wrapper.get('.pinned-image-node').attributes('data-pinned-image-state')).toBe('loading')

      await wrapper.get('img').trigger('load')
      expect(wrapper.get('.pinned-image-node').attributes('data-pinned-image-state')).toBe('loaded')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('reports a finished image that failed to load', async () => {
    const wrapper = mount(PinnedImageNode, {
      props: { node: imageNode() },
    })

    try {
      await wrapper.get('img').trigger('error')
      expect(wrapper.get('.pinned-image-node').attributes('data-pinned-image-state')).toBe('error')
      expect(wrapper.find('.pinned-image-node__error').exists()).toBe(true)
      expect(wrapper.find('img').exists()).toBe(false)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('does not render unsafe image sources', () => {
    const wrapper = mount(PinnedImageNode, {
      props: { node: imageNode({ src: 'javascript:alert(1)' }) },
    })

    try {
      expect(wrapper.find('img').exists()).toBe(false)
      expect(wrapper.get('.pinned-image-node').attributes('data-pinned-image-state')).toBe('error')
    }
    finally {
      wrapper.unmount()
    }
  })
})
