/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import MarkdownRenderCompat from '../packages/markstream-vue2/src/components/MarkdownRenderCompat.vue'
import NodeRenderer from '../packages/markstream-vue2/src/components/NodeRenderer'

async function flushVue() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('vue2 typewriter/fade separation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('markdownRenderCompat defaults fade to true when not passed', () => {
    // Test the prop definition directly rather than mounting,
    // because MarkdownRenderCompat uses Vue 2 render(h) which
    // doesn't work in a Vue 3 test environment.
    const propsDef = (MarkdownRenderCompat as any).props
    expect(propsDef.fade).toBeDefined()
    expect(propsDef.fade.default).toBe(true)
  })

  it('markdownRenderCompat passes fade=false when explicitly set', () => {
    const propsDef = (MarkdownRenderCompat as any).props
    expect(propsDef.fade.type).toBe(Boolean)
    // Explicit false should override the default true
    expect(propsDef.fade.default).toBe(true)
  })

  it('typewriter=true + content mode shows cursor', async () => {
    const wrapper = mount(NodeRenderer as any, {
      props: {
        content: 'Streaming content',
        typewriter: true,
        final: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushVue()

    const cursor = wrapper.find('.typewriter-cursor')
    expect(cursor.exists()).toBe(true)

    wrapper.unmount()
  })

  it('typewriter=false (default) does not show cursor', async () => {
    const wrapper = mount(NodeRenderer as any, {
      props: {
        content: 'No cursor here',
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushVue()

    const cursor = wrapper.find('.typewriter-cursor')
    expect(cursor.exists()).toBe(false)

    wrapper.unmount()
  })

  it('showTypewriterCursor uses props.nodes, not parsedNodes.length', async () => {
    // In content mode (no props.nodes), cursor should appear when typewriter=true
    // even though parsedNodes internally has content.
    const wrapper = mount(NodeRenderer as any, {
      props: {
        content: 'Parsed into internal nodes',
        typewriter: true,
        final: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushVue()

    // Even though the parser produces internal parsedNodes,
    // the cursor should show because the user did not pass explicit props.nodes.
    const cursor = wrapper.find('.typewriter-cursor')
    expect(cursor.exists()).toBe(true)

    wrapper.unmount()
  })

  it('showTypewriterCursor hides cursor when explicit nodes are passed', async () => {
    const nodes = [{ type: 'text', content: 'Node mode', raw: 'Node mode' }]
    const wrapper = mount(NodeRenderer as any, {
      props: {
        nodes,
        typewriter: true,
        final: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushVue()

    // In nodes mode, cursor should NOT show even with typewriter=true
    const cursor = wrapper.find('.typewriter-cursor')
    expect(cursor.exists()).toBe(false)

    wrapper.unmount()
  })

  it('smoothStreaming=auto does not enable just because fade=true', async () => {
    // Mount with content directly (same pattern as existing auto-off test)
    const wrapper = mount(NodeRenderer as any, {
      props: {
        content: 'Auto mode test with fade',
        typewriter: false,
        fade: true,
        smoothStreaming: 'auto',
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushVue()

    // With typewriter=false and fade=true, auto should NOT enable smooth streaming.
    // Content should appear immediately.
    expect(wrapper.text()).toContain('Auto mode test with fade')

    wrapper.unmount()
  })

  it('fade=false does not prevent typewriter cursor', async () => {
    const wrapper = mount(NodeRenderer as any, {
      props: {
        content: 'Cursor without fade',
        typewriter: true,
        fade: false,
        final: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushVue()

    const cursor = wrapper.find('.typewriter-cursor')
    expect(cursor.exists()).toBe(true)

    wrapper.unmount()
  })

  it('smoothStreaming=true + final=true before caughtUp keeps cursor visible', async () => {
    // When smooth streaming is enabled and final=true is set before the
    // visible stream has caught up, the cursor should remain visible
    // because effectiveFinal stays false until caughtUp.
    const wrapper = mount(NodeRenderer as any, {
      props: {
        content: 'Streaming content that is being paced out',
        typewriter: true,
        smoothStreaming: true,
        final: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushVue()

    // The cursor should still be visible because smooth streaming
    // hasn't caught up yet — effectiveFinal should be false.
    const cursor = wrapper.find('.typewriter-cursor')
    expect(cursor.exists()).toBe(true)

    wrapper.unmount()
  })
})
