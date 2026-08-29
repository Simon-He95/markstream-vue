/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { customRef, defineComponent, h, provide, ref } from 'vue'
import InlineCodeNode from '../src/components/InlineCodeNode'
import NodeRenderer from '../src/components/NodeRenderer'
import TextNode from '../src/components/TextNode'
import { flushAll } from './setup/flush-all'

describe('text node streaming consistency', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function assertSingleStreamingMathParagraph(wrapper: any, content: string) {
    const probe = 'Decentralized stochastic optimization is a fundamental paradigm'
    const checkpoints = [
      content.indexOf('communication complexity $$') + 'communication complexity $$'.length,
      content.indexOf('\n\\widetilde') + '\n\\widetilde'.length + 24,
      content.indexOf('$$ where') + '$$ where'.length,
      content.length,
    ].filter(index => index > 0)

    for (const checkpoint of checkpoints) {
      await wrapper.setProps({ content: content.slice(0, checkpoint) })
      await flushAll()

      const renderedText = wrapper.text()
      const occurrences = renderedText.split(probe).length - 1
      expect(occurrences).toBe(1)
    }
  }

  it('does not duplicate paragraph text while streaming into a display math block', async () => {
    const content = String.raw`Decentralized stochastic optimization is a fundamental paradigm for large-scale learning over networks, where agents communicate only with their neighbors and no central coordinator is required. For strongly convex problems, communication efficiency is mainly determined by the condition number $\kappa=L/\mu$ and the network spectral gap $1-\beta$. Although deterministic decentralized methods can simultaneously achieve accelerated $\sqrt{\kappa}$ and $1/\sqrt{1-\beta}$ dependences, no existing stochastic method attains both improvements at once. In this paper, we propose *Multi-Gossip Accelerated DSGD* (MG-ADSGD), a decentralized stochastic algorithm that combines Nesterov-type primal--dual extrapolation with multi-round fast gossip averaging. The key idea is to couple the gossip depth with the mini-batch size so that additional communication rounds simultaneously improve consensus accuracy and reduce gradient variance. We show that MG-ADSGD achieves the communication complexity $$
\widetilde{\mathcal O}\!\left( \frac{\sigma^2}{\mu n\epsilon}\log\frac{1}{\epsilon} + \sqrt{\frac{\kappa}{1-\beta}}\log\frac{1}{\epsilon} \right),
$$ where $\epsilon$ denotes the target accuracy, $n$ is the number of nodes, and $\sigma^2$ is the gradient variance. To the best of our knowledge, this bound yields the best currently available communication complexity for decentralized stochastic strongly convex optimization, up to logarithmic factors that are independent of $\epsilon$.`

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        batchRendering: false,
        smoothStreaming: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
        maxLiveNodes: 0,
      },
    })

    try {
      await assertSingleStreamingMathParagraph(wrapper, content)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('does not duplicate paragraph text when smooth streaming reaches a display math block', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const content = String.raw`Decentralized stochastic optimization is a fundamental paradigm for large-scale learning over networks, where agents communicate only with their neighbors and no central coordinator is required. For strongly convex problems, communication efficiency is mainly determined by the condition number $\kappa=L/\mu$ and the network spectral gap $1-\beta$. Although deterministic decentralized methods can simultaneously achieve accelerated $\sqrt{\kappa}$ and $1/\sqrt{1-\beta}$ dependences, no existing stochastic method attains both improvements at once. In this paper, we propose *Multi-Gossip Accelerated DSGD* (MG-ADSGD), a decentralized stochastic algorithm that combines Nesterov-type primal--dual extrapolation with multi-round fast gossip averaging. The key idea is to couple the gossip depth with the mini-batch size so that additional communication rounds simultaneously improve consensus accuracy and reduce gradient variance. We show that MG-ADSGD achieves the communication complexity $$
\widetilde{\mathcal O}\!\left( \frac{\sigma^2}{\mu n\epsilon}\log\frac{1}{\epsilon} + \sqrt{\frac{\kappa}{1-\beta}}\log\frac{1}{\epsilon} \right),
$$ where $\epsilon$ denotes the target accuracy, $n$ is the number of nodes, and $\sigma^2$ is the gradient variance. To the best of our knowledge, this bound yields the best currently available communication complexity for decentralized stochastic strongly convex optimization, up to logarithmic factors that are independent of $\epsilon$.`
    const probe = 'Decentralized stochastic optimization is a fundamental paradigm'

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: true,
        smoothStreaming: true,
        smoothStreamingOptions: {
          startDelayMs: 0,
          minCharsPerSecond: 1200,
          maxCharsPerSecond: 1200,
          maxCharsPerCommit: 12,
        },
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
        maxLiveNodes: 0,
        parseCoalesceMs: 0,
      },
    })

    try {
      await wrapper.setProps({ content })
      await flushAll()

      const baseline = performance.now()
      for (let step = 1; step <= 140 && queuedFrames.length > 0; step++) {
        queuedFrames.shift()?.(baseline + step * 120)
        await flushAll()

        const renderedText = wrapper.text()
        const occurrences = renderedText.split(probe).length - 1
        expect(occurrences).toBeLessThanOrEqual(1)
      }

      expect(wrapper.text()).toContain(probe)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('settles a finished strong-node delta when following sibling text keeps streaming', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '1. **记忆化递归（动态规划',
        batchRendering: false,
        smoothStreaming: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
        maxLiveNodes: 0,
      },
    })

    try {
      await wrapper.setProps({
        content: '1. **记忆化递归（动态规划）*',
      })
      await flushAll()

      let strongDelta = wrapper.find('.strong-node .text-node-stream-delta')
      expect(strongDelta.exists()).toBe(true)
      expect(strongDelta.text()).toBe('）')

      await wrapper.setProps({
        content: '1. **记忆化递归（动态规划）**：',
      })
      await flushAll()

      strongDelta = wrapper.find('.strong-node .text-node-stream-delta')
      expect(strongDelta.exists()).toBe(false)
      expect(wrapper.get('.strong-node').text()).toBe('记忆化递归（动态规划）')

      await wrapper.setProps({
        content: '1. **记忆化递归（动态规划）**：使',
      })
      await flushAll()

      expect(wrapper.find('.strong-node .text-node-stream-delta').exists()).toBe(false)
      expect(wrapper.get('.list-item').text()).toContain('记忆化递归（动态规划）：使')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('keeps explanatory list text visible while an inline code span is still streaming', async () => {
    const initial = `- **计算工具验证**
   通过数学计算工具确认结果：`
    const mid = `${initial}
   \`363 ÷ 15,135 × 100 = 2.39841427...`
    const final = `${mid}\``

    const wrapper = mount(NodeRenderer, {
      props: {
        content: initial,
        batchRendering: false,
        smoothStreaming: false,
        deferNodesUntilVisible: false,
        viewportPriority: false,
        maxLiveNodes: 0,
      },
    })

    try {
      await flushAll()

      await wrapper.setProps({
        content: mid,
      })
      await flushAll()

      const listItem = wrapper.get('.list-item')
      const midText = listItem.text().replace(/\s*\n\s*/g, '')
      expect(midText).toContain('计算工具验证通过数学计算工具确认结果：363 ÷ 15,135 × 100 = 2.39841427')
      expect(wrapper.get('.strong-node').text()).toBe('计算工具验证')
      expect(wrapper.get('code').text()).toContain('363 ÷ 15,135 × 100 = 2.39841427')

      await wrapper.setProps({
        content: final,
      })
      await flushAll()

      const finalText = wrapper.get('.list-item').text().replace(/\s*\n\s*/g, '')
      expect(finalText).toContain('计算工具验证通过数学计算工具确认结果：363 ÷ 15,135 × 100 = 2.39841427...')
      expect(wrapper.get('.strong-node').text()).toBe('计算工具验证')
      expect(wrapper.get('code').text()).toBe('363 ÷ 15,135 × 100 = 2.39841427...')
    }
    finally {
      wrapper.unmount()
    }
  })

  it.each([
    ['text', TextNode, { type: 'text', content: 'stable', raw: 'stable' }],
    ['inline code', InlineCodeNode, { type: 'inline_code', code: 'stable', raw: '`stable`' }],
  ] as const)('does not subscribe a fade-enabled stable %s node to streamRenderVersion', async (_, component, node) => {
    let version = 1
    let versionReads = 0
    const streamRenderVersion = customRef<number>((track, trigger) => ({
      get() {
        versionReads += 1
        track()
        return version
      },
      set(next) {
        version = next
        trigger()
      },
    }))
    const wrapper = mount(component, {
      props: { node } as any,
      attrs: { fade: true },
      global: {
        provide: {
          markstreamStreamVersion: streamRenderVersion,
        },
      },
    })

    try {
      await flushAll()
      versionReads = 0
      streamRenderVersion.value = 2
      await flushAll()

      expect(versionReads).toBe(0)
      expect(wrapper.text()).toBe('stable')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('preserves active TextNode delta until streamRenderVersion changes', async () => {
    const streamRenderVersion = ref(1)
    const textStreamState = new Map<string, string>()
    const wrapper = mount(TextNode, {
      props: {
        node: { type: 'text', content: 'Hello', raw: 'Hello' },
      },
      attrs: {
        'index-key': 'text-0',
      },
      global: {
        provide: {
          markstreamTextStreamState: textStreamState,
          markstreamStreamVersion: streamRenderVersion,
        },
      },
    })

    try {
      await flushAll()
      await wrapper.setProps({
        node: { type: 'text', content: 'HelloWorld', raw: 'HelloWorld' },
      })
      await flushAll()

      let delta = wrapper.find('.text-node-stream-delta')
      expect(delta.exists()).toBe(true)
      expect(delta.text()).toBe('World')

      await wrapper.setProps({
        node: { type: 'text', content: 'HelloWorld', raw: 'HelloWorld' },
      })
      await flushAll()

      delta = wrapper.find('.text-node-stream-delta')
      expect(delta.exists()).toBe(true)
      expect(delta.text()).toBe('World')

      streamRenderVersion.value += 1
      await flushAll()

      expect(wrapper.find('.text-node-stream-delta').exists()).toBe(false)
      expect(wrapper.text()).toBe('HelloWorld')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('preserves active InlineCodeNode delta until streamRenderVersion changes', async () => {
    const streamRenderVersion = ref(1)
    const textStreamState = new Map<string, string>()
    const wrapper = mount(InlineCodeNode, {
      props: {
        node: { type: 'inline_code', code: 'foo', raw: '`foo`' },
      },
      attrs: {
        'index-key': 'code-0',
      },
      global: {
        provide: {
          markstreamTextStreamState: textStreamState,
          markstreamStreamVersion: streamRenderVersion,
        },
      },
    })

    try {
      await flushAll()
      await wrapper.setProps({
        node: { type: 'inline_code', code: 'foobar', raw: '`foobar`' },
      })
      await flushAll()

      let delta = wrapper.find('.inline-code-stream-delta')
      expect(delta.exists()).toBe(true)
      expect(delta.text()).toBe('bar')

      await wrapper.setProps({
        node: { type: 'inline_code', code: 'foobar', raw: '`foobar`' },
      })
      await flushAll()

      delta = wrapper.find('.inline-code-stream-delta')
      expect(delta.exists()).toBe(true)
      expect(delta.text()).toBe('bar')

      streamRenderVersion.value += 1
      await flushAll()

      expect(wrapper.find('.inline-code-stream-delta').exists()).toBe(false)
      expect(wrapper.text()).toBe('foobar')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('settles an active delta when fade is disabled and resumes on the next append', async () => {
    const content = ref('Hello')
    const fade = ref(true)
    const streamRenderVersion = ref(1)
    const textStreamState = new Map<string, string>()
    const Host = defineComponent({
      setup() {
        return () => h(TextNode, {
          node: { type: 'text', content: content.value, raw: content.value },
          fade: fade.value,
          indexKey: 'text-0',
        })
      },
    })
    const wrapper = mount(Host, {
      global: {
        provide: {
          markstreamTextStreamState: textStreamState,
          markstreamStreamVersion: streamRenderVersion,
        },
      },
    })

    try {
      content.value = 'HelloWorld'
      await flushAll()
      expect(wrapper.get('.text-node-stream-delta').text()).toBe('World')

      fade.value = false
      await flushAll()
      expect(wrapper.find('.text-node-stream-delta').exists()).toBe(false)
      expect(wrapper.text()).toBe('HelloWorld')

      fade.value = true
      content.value = 'HelloWorldAgain'
      await flushAll()
      expect(wrapper.get('.text-node-stream-delta').text()).toBe('Again')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('preserves an active delta when the stream state key changes', async () => {
    const content = ref('Hello')
    const streamStateKey = ref('text-0')
    const streamRenderVersion = ref(1)
    const textStreamState = new Map<string, string>()
    const Host = defineComponent({
      setup() {
        return () => h(TextNode, {
          node: { type: 'text', content: content.value, raw: content.value },
          indexKey: streamStateKey.value,
        })
      },
    })
    const wrapper = mount(Host, {
      global: {
        provide: {
          markstreamTextStreamState: textStreamState,
          markstreamStreamVersion: streamRenderVersion,
        },
      },
    })

    try {
      content.value = 'HelloWorld'
      await flushAll()
      expect(wrapper.get('.text-node-stream-delta').text()).toBe('World')

      streamStateKey.value = 'text-1'
      await flushAll()
      expect(wrapper.get('.text-node-stream-delta').text()).toBe('World')
      expect(textStreamState.get('text-1')).toBe('HelloWorld')

      streamRenderVersion.value += 1
      await flushAll()
      expect(wrapper.find('.text-node-stream-delta').exists()).toBe(false)
      expect(wrapper.text()).toBe('HelloWorld')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('settles the previous delta before a same-tick version bump and content append', async () => {
    const content = ref('Hello')
    const streamRenderVersion = ref(1)
    const textStreamState = new Map<string, string>()
    const Host = defineComponent({
      setup() {
        provide('markstreamTextStreamState', textStreamState)
        provide('markstreamStreamVersion', streamRenderVersion)
        return () => h(TextNode, {
          node: { type: 'text', content: content.value, raw: content.value },
          indexKey: 'text-0',
        })
      },
    })
    const wrapper = mount(Host)

    try {
      content.value = 'HelloWorld'
      await flushAll()
      expect(wrapper.get('.text-node-stream-delta').text()).toBe('World')

      content.value = 'HelloWorldAgain'
      streamRenderVersion.value += 1
      await flushAll()

      expect(wrapper.get('.text-node-stream-delta').text()).toBe('Again')
      expect(wrapper.text()).toBe('HelloWorldAgain')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('stops the active stream version watcher when unmounted', async () => {
    let version = 1
    let versionReads = 0
    const streamRenderVersion = customRef<number>((track, trigger) => ({
      get() {
        versionReads += 1
        track()
        return version
      },
      set(next) {
        version = next
        trigger()
      },
    }))
    const wrapper = mount(TextNode, {
      props: {
        node: { type: 'text', content: 'Hello', raw: 'Hello' },
      },
      attrs: {
        'index-key': 'text-0',
      },
      global: {
        provide: {
          markstreamTextStreamState: new Map<string, string>(),
          markstreamStreamVersion: streamRenderVersion,
        },
      },
    })

    await wrapper.setProps({
      node: { type: 'text', content: 'HelloWorld', raw: 'HelloWorld' },
    })
    await flushAll()
    expect(wrapper.get('.text-node-stream-delta').text()).toBe('World')

    wrapper.unmount()
    versionReads = 0
    streamRenderVersion.value = 2
    await flushAll()
    expect(versionReads).toBe(0)
  })
})
