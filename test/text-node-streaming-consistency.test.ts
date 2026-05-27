/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import InlineCodeNode from '../src/components/InlineCodeNode'
import NodeRenderer from '../src/components/NodeRenderer'
import TextNode from '../src/components/TextNode'
import { flushAll } from './setup/flush-all'

describe('text node streaming consistency', () => {
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
})
