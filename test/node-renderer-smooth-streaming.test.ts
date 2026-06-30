/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import NodeRenderer from '../src/components/NodeRenderer'

function readStreamRenderVersion(wrapper: any) {
  const version = wrapper.vm.$?.setupState?.streamRenderVersion
  return typeof version === 'number' ? version : version?.value
}

describe('node renderer smooth streaming', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses smooth pacing in typewriter mode for post-mount appends and allows opting out', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const content = 'Hello smooth streaming markdown renderer.'

    // Mount with initial content — should render immediately (mounted gate protects)
    const smoothWrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await nextTick()

    // Now append content (simulating a streaming update after mount)
    queuedFrames.length = 0
    await smoothWrapper.setProps({ content })

    // Content should not be fully revealed immediately — it's being paced
    expect(smoothWrapper.text()).not.toContain('Hello smooth')
    expect(queuedFrames.length).toBeGreaterThan(0)

    const baseline = performance.now()
    for (let step = 1; step <= 6 && !smoothWrapper.text().includes('Hello'); step++) {
      queuedFrames.shift()?.(baseline + (step * 40))
      await nextTick()
    }
    expect(smoothWrapper.text().length).toBeGreaterThan(0)

    // smoothStreaming: false should show content immediately
    const rawWrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: true,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await nextTick()
    await rawWrapper.setProps({ content })
    await nextTick()
    expect(rawWrapper.text()).toContain('Hello smooth streaming markdown renderer.')

    smoothWrapper.unmount()
    rawWrapper.unmount()
  })

  it('does not smooth initial static content before mounted appends', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: 'static markdown',
        maxLiveNodes: 0,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await nextTick()
    // Initial content should render immediately, not be paced from blank
    expect(wrapper.text()).toContain('static markdown')
    wrapper.unmount()
  })

  it('smoothStreaming=true force-enables without requiring typewriter', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    // Start with empty content, then append after mount
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        smoothStreaming: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await nextTick()
    queuedFrames.length = 0

    // Append content — smoothStreaming: true should pace without typewriter
    await wrapper.setProps({ content: 'Force enabled smooth' })
    await nextTick()

    // Content should be paced (not immediately visible) and rAF should be scheduled
    expect(queuedFrames.length).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('smoothStreaming="auto" treats simple typewriter mode as enabled', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: 'simple',
        smoothStreaming: 'auto',
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await nextTick()
    queuedFrames.length = 0

    await wrapper.setProps({ content: 'Simple smooth streaming markdown renderer.' })
    await nextTick()

    expect(wrapper.text()).not.toContain('Simple smooth')
    expect(queuedFrames.length).toBeGreaterThan(0)

    wrapper.unmount()
  })

  it('smoothStreaming="auto" does not enable without typewriter or maxLiveNodes<=0', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: 'Auto mode test',
        smoothStreaming: 'auto',
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await nextTick()
    // With default maxLiveNodes (220), 'auto' should not enable smooth streaming
    expect(wrapper.text()).toContain('Auto mode test')
    wrapper.unmount()
  })

  it('raw chunk updates do not bump streamRenderVersion when smooth streaming is active', async () => {
    // Capture rAF callbacks but never invoke them — visible stays at ''
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: true,
        smoothStreaming: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await nextTick()
    queuedFrames.length = 0
    const initialVersion = readStreamRenderVersion(wrapper)

    // Initial append — visible is still empty (rAF not ticked)
    await wrapper.setProps({ content: 'hello' })
    await nextTick()

    // More raw chunk appends without advancing rAF
    await wrapper.setProps({ content: 'hello world 1' })
    await nextTick()
    await wrapper.setProps({ content: 'hello world 12' })
    await nextTick()
    await wrapper.setProps({ content: 'hello world 123' })
    await nextTick()

    // DOM should still show nothing (visible hasn't advanced)
    // but crucially, the rendered text should not have changed due to
    // streamRenderVersion increments from raw content changes.
    // Before the fix, each props.content change bumped streamRenderVersion,
    // which could trigger TextNode watchers even though visible was unchanged.
    expect(wrapper.text()).not.toContain('hello world')
    expect(readStreamRenderVersion(wrapper)).toBe(initialVersion)
    wrapper.unmount()
  })

  it('does not bump streamRenderVersion when final-only parse output is identical', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: 'alpha\n\nbeta',
        final: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await nextTick()

    const initialVersion = readStreamRenderVersion(wrapper)
    const initialHtml = wrapper.html()

    await wrapper.setProps({ final: true })
    await nextTick()

    expect(readStreamRenderVersion(wrapper)).toBe(initialVersion)
    expect(wrapper.html()).toBe(initialHtml)

    wrapper.unmount()
  })

  it('nested renderer does not double-pace when parent has smooth streaming enabled', async () => {
    // When a parent renderer is already smoothing, a nested NodeRenderer
    // (e.g. inside a thinking block or custom HTML tag) should not apply
    // its own smooth pacing on top of the parent's already-paced output.
    // Use 'auto' mode so the mounted gate protects initial static content.
    const wrapper = mount(NodeRenderer, {
      props: {
        content: 'static thinking content',
        typewriter: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await nextTick()

    // With typewriter=true and smoothStreaming='auto' (default), the mounted
    // gate should protect the initial content from being paced.
    expect(wrapper.text()).toContain('static thinking content')

    // Verify that smoothStreamingEnabled is true for the parent (typewriter is on
    // and mounted gate is open), so the provide sends true to children.
    // After mount, with typewriter=true, smooth streaming should be enabled.
    // We can't easily read the provide from outside, but we can verify that
    // the parent provides the correct value by testing that a child renderer
    // would see it. Instead, directly verify the behavior:
    // mount a second NodeRenderer with inherited provide = true and
    // smoothStreaming='auto' — it should NOT smooth because the parent is pacing.
    const childWrapper = mount(NodeRenderer, {
      props: {
        content: 'nested content',
        smoothStreaming: 'auto',
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
      global: {
        provide: {
          markstreamSmoothStreaming: { value: true },
        },
      },
    })

    await nextTick()

    // With the parent smooth streaming injected as true, the child's auto mode
    // should be suppressed — content renders immediately, not paced.
    expect(childWrapper.text()).toContain('nested content')

    wrapper.unmount()
    childWrapper.unmount()
  })

  it('nested renderer with smoothStreaming=true does force-enable even under inherited parent smooth', async () => {
    // smoothStreaming === true is an explicit opt-in that intentionally
    // bypasses the auto-suppression. This is by design — the user explicitly
    // wants pacing regardless of the parent's state.
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const childWrapper = mount(NodeRenderer, {
      props: {
        content: '',
        smoothStreaming: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
      global: {
        provide: {
          markstreamSmoothStreaming: { value: true },
        },
      },
    })

    await nextTick()
    queuedFrames.length = 0

    await childWrapper.setProps({ content: 'forced smooth' })
    await nextTick()

    // smoothStreaming: true should schedule rAF even when parent is already smoothing
    expect(queuedFrames.length).toBeGreaterThan(0)

    childWrapper.unmount()
  })

  it('nodes mode never enables smooth streaming', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [
          { type: 'paragraph', raw: 'hello', children: [{ type: 'text', content: 'hello', raw: 'hello' }] },
        ],
        typewriter: true,
        smoothStreaming: 'auto',
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await nextTick()
    // When nodes are provided, smooth streaming must not activate
    // regardless of typewriter or smoothStreaming='auto'
    expect(wrapper.text()).toContain('hello')
    expect(wrapper.find('.typewriter-cursor').exists()).toBe(false)
    expect(queuedFrames.length).toBe(0)

    wrapper.unmount()
  })

  it('final is gated by caughtUp when smooth streaming is active', async () => {
    // When smooth streaming is pacing content, final=true should not
    // reach the parser until visible has caught up with source.
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      // Stash but don't invoke — visible stays behind source
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: true,
        smoothStreaming: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await nextTick()
    queuedFrames.length = 0

    // Feed content + final=true — but rAF is stalled so visible stays empty
    await wrapper.setProps({ content: 'Hello world', final: true })
    await nextTick()

    // Because visible hasn't caught up (rAF never ticked), the content
    // should not be visible in the DOM yet.
    expect(wrapper.text()).not.toContain('Hello world')

    // Now drain the rAF queue to let visible catch up with source
    const baseline = performance.now()
    for (let step = 1; step <= 40 && queuedFrames.length > 0; step++) {
      const cb = queuedFrames.shift()!
      cb(baseline + step * 50)
      await nextTick()
    }

    // After visible catches up, content should be rendered and final
    // should have been forwarded to the parser (closing any open constructs).
    expect(wrapper.text()).toContain('Hello world')

    wrapper.unmount()
  })
})
