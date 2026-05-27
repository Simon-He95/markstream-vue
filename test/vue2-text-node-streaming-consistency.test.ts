import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it, vi } from 'vitest'
import NodeRenderer from '../packages/markstream-vue2/src/components/NodeRenderer/NodeRenderer.vue'
import { flushAll } from './setup/flush-all'

describe('markstream-vue2 text node streaming consistency', () => {
  it('keeps the stale-delta settle hook wired to outer stream ticks', () => {
    const nodeRendererSource = readFileSync(
      resolve(process.cwd(), 'packages/markstream-vue2/src/components/NodeRenderer/NodeRenderer.vue'),
      'utf8',
    )
    const textNodeSource = readFileSync(
      resolve(process.cwd(), 'packages/markstream-vue2/src/components/TextNode/TextNode.vue'),
      'utf8',
    )

    expect(nodeRendererSource).toContain('const streamRenderVersion = ref(0)')
    expect(nodeRendererSource).toContain('provide(\'markstreamStreamVersion\', streamRenderVersion)')
    expect(nodeRendererSource).toContain('const renderVersionSource = computed(() => {')
    expect(nodeRendererSource).toContain('watch(')
    expect(nodeRendererSource).toContain('renderVersionSource,')

    expect(textNodeSource).toContain('inject<{ value?: number } | undefined>(\'markstreamStreamVersion\', undefined)')
    expect(textNodeSource).toContain('[() => props.node.content, streamStateKey, fadeEnabled, () => inheritedStreamVersion?.value]')
    expect(textNodeSource).toContain('if (normalized === previousContent)')
    expect(textNodeSource).toContain('if (streamedDelta.value)')
    expect(textNodeSource).toContain('settleStreamedDelta()')
  })

  it('keeps explanatory list text visible while an inline code span is still streaming', async () => {
    const originalWarn = console.warn
    const originalError = console.error
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((message?: any, ...args: any[]) => {
      const text = String(message ?? '')
      if (
        text.includes('provide() can only be used inside setup().')
        || text.includes('onMounted is called when there is no active component instance')
        || text.includes('onBeforeUnmount is called when there is no active component instance')
      ) {
        return
      }
      originalWarn.call(console, message, ...args)
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((message?: any, ...args: any[]) => {
      const text = String(message ?? '')
      if (
        text.includes('provide() can only be used inside setup().')
        || text.includes('onMounted is called when there is no active component instance')
        || text.includes('onBeforeUnmount is called when there is no active component instance')
      ) {
        return
      }
      originalError.call(console, message, ...args)
    })

    const initial = `- **计算工具验证**
   通过数学计算工具确认结果：`
    const mid = `${initial}
   \`363 ÷ 15,135 × 100 = 2.39841427...`
    const final = `${mid}\``
    const md = getMarkdown('vue2-inline-code-explanatory-text-stability')
    const getListItemChildren = (content: string) => {
      const nodes = parseMarkdownToStructure(content, md, { final: false }) as any[]
      return (nodes[0] as any)?.items?.[0]?.children ?? []
    }
    const initialNodes = getListItemChildren(initial)
    const midNodes = getListItemChildren(mid)
    const finalNodes = getListItemChildren(final)
    const getParagraphChildren = (nodes: any[]) => (nodes[0] as any)?.children ?? []
    expect(getParagraphChildren(midNodes).some((child: any) => child?.type === 'inline_code')).toBe(true)
    expect(getParagraphChildren(finalNodes).some((child: any) => child?.type === 'inline_code')).toBe(true)

    const wrapper = mount(NodeRenderer as any, {
      props: {
        nodes: initialNodes as any,
        batchRendering: false,
        deferNodesUntilVisible: false,
        viewportPriority: false,
        maxLiveNodes: 0,
      },
    })

    try {
      await flushAll()

      await wrapper.setProps({
        nodes: midNodes as any,
      })
      await flushAll()

      const midText = wrapper.text().replace(/\s*\n\s*/g, '')
      expect(midText).toContain('计算工具验证通过数学计算工具确认结果：')
      expect(midText.match(/通过数学计算工具确认结果：/g) ?? []).toHaveLength(1)
      expect(wrapper.get('.strong-node').text()).toBe('计算工具验证')

      await wrapper.setProps({
        nodes: finalNodes as any,
      })
      await flushAll()

      const finalText = wrapper.text().replace(/\s*\n\s*/g, '')
      expect(finalText).toContain('计算工具验证通过数学计算工具确认结果：')
      expect(finalText.match(/通过数学计算工具确认结果：/g) ?? []).toHaveLength(1)
      expect(wrapper.get('.strong-node').text()).toBe('计算工具验证')
    }
    finally {
      wrapper.unmount()
      warnSpy.mockRestore()
      errorSpy.mockRestore()
    }
  })
})
