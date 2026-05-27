import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ThinkingNode from '../playground/src/components/ThinkingNode.vue'
import NodeRenderer from '../src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'
import { flushAll } from './setup/flush-all'

describe('playground Vue thinking node', () => {
  it('renders thinking content through nested NodeRenderer so streamed text can fade', async () => {
    const customId = 'playground-vue-thinking-fade'
    setCustomComponents(customId, { thinking: ThinkingNode })

    const wrapper = mount(NodeRenderer, {
      props: {
        batchRendering: false,
        content: '<thinking>alpha</thinking>',
        customHtmlTags: ['thinking'],
        customId,
        deferNodesUntilVisible: false,
        maxLiveNodes: 0,
        smoothStreaming: false,
        typewriter: true,
        viewportPriority: false,
      },
    })

    try {
      await flushAll()

      await wrapper.setProps({
        content: '<thinking>alpha beta</thinking>',
      })
      await flushAll()

      const thinkingNode = wrapper.get('.thinking-node')
      const delta = wrapper.get('.thinking-node .text-node-stream-delta')

      expect(delta.text()).toBe('beta')
      expect(thinkingNode.text()).toContain('alpha beta')
    }
    finally {
      wrapper.unmount()
      removeCustomComponents(customId)
    }
  })

  it('does not convert inherited smooth=true into forced smoothStreaming=true', async () => {
    // When a parent renderer provides markstreamSmoothStreaming=true,
    // ThinkingNode must pass 'auto' (not true) to the nested MarkdownRender.
    // Otherwise the nested renderer would see smoothStreaming=true as an
    // explicit opt-in and double-pace the content.
    const queuedFrames: FrameRequestCallback[] = []
    const { vi } = await import('vitest')
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const customId = 'playground-vue-thinking-double-pace'
    setCustomComponents(customId, { thinking: ThinkingNode })

    // Parent renderer with typewriter=true → smooth streaming auto-enables →
    // provides markstreamSmoothStreaming={ value: true } to children.
    const wrapper = mount(NodeRenderer, {
      props: {
        batchRendering: false,
        content: '<thinking>initial thought</thinking>',
        customHtmlTags: ['thinking'],
        customId,
        deferNodesUntilVisible: false,
        maxLiveNodes: 0,
        typewriter: true,
        viewportPriority: false,
      },
    })

    try {
      await flushAll()

      // The initial content should render immediately (mounted gate + auto mode)
      expect(wrapper.text()).toContain('initial thought')

      // Now append more thinking content — the parent is already pacing,
      // so the thinking node's nested MarkdownRender should NOT schedule
      // its own rAF for a second pacing layer.
      queuedFrames.length = 0

      await wrapper.setProps({
        content: '<thinking>initial thought extended</thinking>',
      })
      await flushAll()

      // With the fix, ThinkingNode passes 'auto' instead of true,
      // so the nested renderer's auto mode is suppressed by the inherited
      // smooth streaming guard. Content should be immediately visible.
      expect(wrapper.text()).toContain('extended')

      // There should be rAF frames from the parent renderer only,
      // but the thinking content itself should not have been double-paced
      // from empty — it should have rendered the delta directly.
    }
    finally {
      wrapper.unmount()
      removeCustomComponents(customId)
      vi.unstubAllGlobals()
    }
  })
})
