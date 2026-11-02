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
  afterEach(async () => {
    await vi.dynamicImportSettled()
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

  it('keeps smooth streaming appends continuous without node placeholders', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        final: false,
        smoothStreaming: true,
        batchRendering: true,
        initialRenderBatchSize: 1,
        renderBatchSize: 1,
        renderBatchDelay: 100000,
        maxLiveNodes: 0,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    try {
      await nextTick()
      queuedFrames.length = 0
      await wrapper.setProps({ content: 'Paragraph 1\n\nParagraph 2\n\nParagraph 3' })

      const baseline = performance.now()
      for (let step = 1; step <= 80 && queuedFrames.length > 0; step++) {
        queuedFrames.shift()?.(baseline + step * 80)
        await nextTick()
        expect(wrapper.findAll('.node-placeholder')).toHaveLength(0)
        if (wrapper.text().includes('Paragraph 3'))
          break
      }

      expect(wrapper.text()).toContain('Paragraph 3')
    }
    finally {
      wrapper.unmount()
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  it('does not batch an upstream one-character stream behind a second pacing queue', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        final: false,
        fade: false,
        smoothStreaming: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    try {
      let content = ''
      for (const character of '矩阵：\n\\[\n\\begin{bmatrix}') {
        content += character
        await wrapper.setProps({ content })
        await nextTick()

        if (content.length >= 2) {
          const renderContent = wrapper.vm.$?.setupState?.renderContent as string | undefined
          expect(renderContent).toBe(content)
        }
      }

      expect(queuedFrames.length).toBeLessThanOrEqual(1)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('keeps a split code fence info line atomic through the small-chunk reset path', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        final: false,
        fade: false,
        smoothStreaming: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    try {
      await nextTick()
      for (const content of ['```', '```type', '```typescript']) {
        await wrapper.setProps({ content })
        await nextTick()
        const renderContent = wrapper.vm.$?.setupState?.renderContent as string | undefined
        expect(renderContent).toBe('')
        expect(wrapper.text()).not.toContain('Plain Text')
      }

      expect(queuedFrames).toHaveLength(0)
      await wrapper.setProps({ content: '```typescript\n' })
      await nextTick()

      const renderContent = wrapper.vm.$?.setupState?.renderContent as string | undefined
      expect(renderContent).toBe('```typescript\n')
      expect(wrapper.text()).not.toContain('Plain Text')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('paces small animated appends instead of bypassing the reveal queue', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queuedFrames.push(callback)
      return queuedFrames.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const wrapper = mount(NodeRenderer, {
      props: { content: '', final: false, fade: true, smoothStreaming: true, batchRendering: false, viewportPriority: false, deferNodesUntilVisible: false },
    })
    try {
      for (const content of ['中', '中文', '中文测试'])
        await wrapper.setProps({ content })
      expect(wrapper.vm.$?.setupState?.renderContent).toBe('')
      expect(queuedFrames.length).toBeGreaterThan(0)
      const baseline = performance.now()
      for (let step = 1; step <= 100 && queuedFrames.length; step++) {
        queuedFrames.shift()?.(baseline + step * 50)
        await nextTick()
      }
      expect(wrapper.text()).toBe('中文测试')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('does not flush a large paced backlog when small chunks follow it', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        final: false,
        smoothStreaming: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    try {
      const largeChunk = 'a'.repeat(200)
      await wrapper.setProps({ content: largeChunk })
      await wrapper.setProps({ content: `${largeChunk}b` })
      await wrapper.setProps({ content: `${largeChunk}bc` })
      await nextTick()

      const renderContent = wrapper.vm.$?.setupState?.renderContent as string | undefined
      expect(renderContent).toBe('')
      expect(queuedFrames.length).toBeGreaterThan(0)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('keeps completed transport content continuous while smooth streaming catches up', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        final: false,
        smoothStreaming: true,
        batchRendering: true,
        initialRenderBatchSize: 1,
        renderBatchSize: 1,
        renderBatchDelay: 100000,
        maxLiveNodes: 0,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    try {
      await nextTick()
      queuedFrames.length = 0
      await wrapper.setProps({
        content: [
          '5. Create a native module example (C++):',
          '',
          '```cpp',
          '#include <bits/stdc++.h>',
          'int main() { return 0; }',
          '```',
          '',
          '6. Add the native module to the application:',
          '',
          '```ts',
          'console.log("ready")',
          '```',
        ].join('\n'),
        final: true,
      })

      const baseline = performance.now()
      for (let step = 1; step <= 160 && queuedFrames.length > 0; step++) {
        queuedFrames.shift()?.(baseline + step * 80)
        await nextTick()
        const visibleContent = wrapper.vm.$?.setupState?.renderContent as string | undefined
        if (visibleContent?.includes('6. Add the native module'))
          expect(wrapper.text()).toContain('Add')
        if (wrapper.text().includes('console.log'))
          break
      }

      expect(wrapper.text()).toContain('console.log')
    }
    finally {
      wrapper.unmount()
      process.env.NODE_ENV = originalNodeEnv
    }
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

  it('smoothStreaming="auto" enables with simple typewriter mode', async () => {
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
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await nextTick()
    queuedFrames.length = 0

    await wrapper.setProps({ content: 'Simple typewriter auto pacing' })
    await nextTick()

    expect(wrapper.text()).not.toContain('Simple typewriter auto pacing')
    expect(queuedFrames.length).toBeGreaterThan(0)

    wrapper.unmount()
  })

  it('smoothStreaming="auto" enables with static string true typewriter mode', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: 'true' as any,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await nextTick()
    queuedFrames.length = 0

    await wrapper.setProps({ content: 'Static true typewriter auto pacing' })
    await nextTick()

    expect(wrapper.text()).not.toContain('Static true typewriter auto pacing')
    expect(queuedFrames.length).toBeGreaterThan(0)

    wrapper.unmount()
  })

  it('smoothStreaming="auto" does not enable with static string false typewriter mode', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: 'false' as any,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await nextTick()
    queuedFrames.length = 0

    await wrapper.setProps({ content: 'Static false typewriter auto pacing' })
    await nextTick()

    expect(wrapper.text()).toContain('Static false typewriter auto pacing')
    expect(queuedFrames).toHaveLength(0)

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

  it('uses faster renderer defaults while preserving explicit smooth streaming options', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    async function renderedLengthAfterFrames(smoothStreamingOptions?: Record<string, number>) {
      const wrapper = mount(NodeRenderer, {
        props: {
          content: '',
          typewriter: true,
          smoothStreaming: true,
          smoothStreamingOptions,
          batchRendering: false,
          viewportPriority: false,
          deferNodesUntilVisible: false,
        },
      })

      await nextTick()
      queuedFrames.length = 0
      await wrapper.setProps({ content: 'x'.repeat(2200) })
      await nextTick()

      const baseline = performance.now()
      for (let step = 1; step <= 24 && queuedFrames.length > 0; step++) {
        queuedFrames.shift()?.(baseline + step * 50)
        await nextTick()
      }

      const length = wrapper.text().length
      wrapper.unmount()
      queuedFrames.length = 0
      return length
    }

    const defaultLength = await renderedLengthAfterFrames()
    const partialOverrideLength = await renderedLengthAfterFrames({
      maxCharsPerCommit: 80,
    })
    const explicitLength = await renderedLengthAfterFrames({
      maxCharsPerSecond: 1,
      maxCharsPerCommit: 80,
      catchUpLatencyMs: 350,
      catchUpThreshold: 600,
    })

    expect(defaultLength).toBeGreaterThan(explicitLength)
    expect(partialOverrideLength).toBeGreaterThan(explicitLength)
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
    await wrapper.setProps({ content: 'hello smooth streaming chunk one' })
    await nextTick()

    // More raw chunk appends without advancing rAF
    await wrapper.setProps({ content: 'hello smooth streaming chunk one and chunk two' })
    await nextTick()
    await wrapper.setProps({ content: 'hello smooth streaming chunk one and chunk two and chunk three' })
    await nextTick()
    await wrapper.setProps({ content: 'hello smooth streaming chunk one and chunk two and chunk three and chunk four' })
    await nextTick()

    // DOM should still show nothing (visible hasn't advanced)
    // but crucially, the rendered text should not have changed due to
    // streamRenderVersion increments from raw content changes.
    // Before the fix, each props.content change bumped streamRenderVersion,
    // which could trigger TextNode watchers even though visible was unchanged.
    expect(wrapper.text()).not.toContain('hello smooth')
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
    const initialText = wrapper.text()

    await wrapper.setProps({ final: true })
    await nextTick()

    expect(readStreamRenderVersion(wrapper)).toBe(initialVersion)
    expect(wrapper.text()).toBe(initialText)

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

  it('final is gated by caughtUp when flushOnFinish is explicitly disabled', async () => {
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
        smoothStreamingOptions: { flushOnFinish: false },
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
