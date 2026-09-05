import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, onMounted, onUnmounted, watch } from 'vue'
import NodeRenderer from '../src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'
import { flushAll } from './setup/flush-all'

const customId = 'code-block-streaming-stability'

describe('code block streaming stability', () => {
  afterEach(() => {
    removeCustomComponents(customId)
  })

  it('keeps an equivalent settled code block node stable while trailing content streams', async () => {
    let mountCount = 0
    let unmountCount = 0
    let nodeChangeCount = 0

    const CodeBlockProbe = defineComponent({
      inheritAttrs: false,
      props: {
        node: { type: Object, required: true },
      },
      setup(props) {
        onMounted(() => mountCount++)
        onUnmounted(() => unmountCount++)
        watch(() => props.node, () => nodeChangeCount++)
        return () => h('div', {
          'class': 'code-block-probe',
          'data-code': String((props.node as any).code ?? ''),
          'data-start-line': String((props.node as any).startLine ?? ''),
        })
      },
    })

    const makeCodeBlock = (updatedCode = 'const value = 2', startLine = 1) => ({
      type: 'code_block',
      language: 'diff',
      code: `-const value = 1\n+${updatedCode}`,
      raw: `\`\`\`diff\n-const value = 1\n+${updatedCode}\n\`\`\``,
      diff: true,
      originalCode: 'const value = 1',
      updatedCode,
      loading: false,
      startLine,
      endLine: startLine + 3,
    })
    const makeParagraph = (content: string) => ({
      type: 'paragraph',
      children: [{ type: 'text', content, raw: content }],
      raw: content,
    })

    setCustomComponents(customId, { code_block: CodeBlockProbe as any })
    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        nodes: [makeCodeBlock(), makeParagraph('tail')],
        batchRendering: false,
        deferNodesUntilVisible: false,
        maxLiveNodes: 0,
        viewportPriority: false,
      },
    })

    try {
      await flushAll()
      expect(mountCount).toBe(1)

      await wrapper.setProps({
        nodes: [makeCodeBlock(), makeParagraph('tail continues streaming')],
      })
      await flushAll()

      expect(nodeChangeCount).toBe(0)
      expect(mountCount).toBe(1)
      expect(unmountCount).toBe(0)

      await wrapper.setProps({
        nodes: [makeCodeBlock('const value = 2', 10), makeParagraph('tail continues streaming')],
      })
      await flushAll()

      expect(nodeChangeCount).toBe(1)
      expect(wrapper.get('.code-block-probe').attributes('data-start-line')).toBe('10')

      await wrapper.setProps({
        nodes: [makeCodeBlock('const value = 3', 10), makeParagraph('tail continues streaming')],
      })
      await flushAll()

      expect(nodeChangeCount).toBe(2)
      expect(wrapper.get('.code-block-probe').attributes('data-code')).toContain('const value = 3')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('drops cached code blocks after the node list shrinks', async () => {
    const mountedNodes: object[] = []
    const CodeBlockProbe = defineComponent({
      props: {
        node: { type: Object, required: true },
      },
      setup(props) {
        onMounted(() => mountedNodes.push(props.node))
        return () => h('div', { class: 'code-block-probe' })
      },
    })
    const codeBlock = {
      type: 'code_block',
      language: 'typescript',
      code: 'const value = 1',
      raw: '```typescript\nconst value = 1\n```',
      loading: false,
    }
    const paragraph = {
      type: 'paragraph',
      children: [{ type: 'text', content: 'before', raw: 'before' }],
      raw: 'before',
    }

    setCustomComponents(customId, { code_block: CodeBlockProbe as any })
    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        nodes: [paragraph, codeBlock],
        batchRendering: false,
        deferNodesUntilVisible: false,
        maxLiveNodes: 0,
        viewportPriority: false,
      },
    })

    try {
      await flushAll()
      const firstNode = mountedNodes[0]

      await wrapper.setProps({ nodes: [paragraph] })
      await flushAll()
      await wrapper.setProps({ nodes: [paragraph, { ...codeBlock }] })
      await flushAll()

      expect(mountedNodes).toHaveLength(2)
      expect(mountedNodes[1]).not.toBe(firstNode)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('refreshes an externally supplied code block when its source map changes', async () => {
    const CodeBlockProbe = defineComponent({
      props: {
        node: { type: Object, required: true },
      },
      setup(props) {
        return () => h('div', {
          'class': 'code-block-probe',
          'data-source-line': String((props.node as any).sourceMap?.startLine ?? ''),
        })
      },
    })
    const codeBlock = {
      type: 'code_block',
      language: 'typescript',
      code: 'const value = 1',
      raw: '```typescript\nconst value = 1\n```',
      loading: false,
      sourceMap: { startLine: 1, endLine: 4 },
    }

    setCustomComponents(customId, { code_block: CodeBlockProbe as any })
    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        nodes: [codeBlock],
        batchRendering: false,
        deferNodesUntilVisible: false,
        maxLiveNodes: 0,
        viewportPriority: false,
      },
    })

    try {
      await flushAll()
      expect(wrapper.get('.code-block-probe').attributes('data-source-line')).toBe('1')

      await wrapper.setProps({
        nodes: [{
          ...codeBlock,
          sourceMap: { startLine: 10, endLine: 13 },
        }],
      })
      await flushAll()

      expect(wrapper.get('.code-block-probe').attributes('data-source-line')).toBe('10')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('refreshes a custom code block clone when streamed content grows in place', async () => {
    const CodeBlockProbe = defineComponent({
      props: {
        node: { type: Object, required: true },
      },
      setup(props) {
        return () => h('div', {
          'class': 'code-block-probe',
          'data-code': String((props.node as any).code ?? ''),
        })
      },
    })

    setCustomComponents(customId, { code_block: CodeBlockProbe as any })
    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        content: '```ts\nconst value =',
        final: false,
        smoothStreaming: false,
        batchRendering: false,
        deferNodesUntilVisible: false,
        maxLiveNodes: 0,
        viewportPriority: false,
      },
    })

    try {
      await flushAll()
      await wrapper.setProps({
        content: '```ts\nconst value = 42\n```',
        final: true,
      })
      await flushAll()

      expect(wrapper.get('.code-block-probe').attributes('data-code')).toBe('const value = 42\n')
    }
    finally {
      wrapper.unmount()
    }
  })
})
