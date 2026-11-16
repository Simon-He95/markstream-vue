import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import Vue2CodeBlockNode from '../packages/markstream-vue2/src/components/CodeBlockNode/CodeBlockNode.vue'
import VueCodeBlockNode from '../src/components/CodeBlockNode/CodeBlockNode.vue'

const node = {
  type: 'code_block' as const,
  language: 'text',
  code: 'tree',
  raw: '```text\ntree\n```',
}

describe.each([
  ['Vue 3', VueCodeBlockNode],
  ['Vue 2', Vue2CodeBlockNode],
] as const)('%s code block scroll compensation', (_name, CodeBlockNode) => {
  it.each([
    { name: 'the fallback holds the block height', outerDelta: 0, start: 650, nativeDelta: 0, expected: 650 },
    { name: 'the block height changes by one pixel', outerDelta: -1, start: 650, nativeDelta: 0, expected: 650 },
    { name: 'the block really shrinks above the viewport', outerDelta: -24, start: 650, nativeDelta: 0, expected: 626 },
    { name: 'native anchoring already compensated', outerDelta: -24, start: 650, nativeDelta: -24, expected: 626 },
    { name: 'the chat is pinned to the bottom', outerDelta: 24, start: 700, nativeDelta: 0, expected: 700 },
  ])('uses the actual layout when $name', async ({ outerDelta, start, nativeDelta, expected }) => {
    const scrollRoot = document.createElement('div')
    scrollRoot.style.overflowY = 'auto'
    document.body.append(scrollRoot)
    const wrapper = mount(CodeBlockNode as typeof VueCodeBlockNode, {
      props: { node, loading: false },
      attachTo: scrollRoot,
    })

    try {
      await flushPromises()
      const block = wrapper.get<HTMLElement>('.code-block-container').element
      const editor = wrapper.get<HTMLElement>('.code-editor-container').element
      editor.style.height = '160px'
      scrollRoot.scrollTop = start
      const setScrollTop = vi.spyOn(scrollRoot, 'scrollTop', 'set')
      const heightCommitted = () => editor.style.height !== '160px'
      Object.defineProperties(scrollRoot, {
        clientHeight: { value: 300 },
        scrollHeight: { get: () => 1000 + (heightCommitted() ? outerDelta : 0) },
      })
      vi.spyOn(scrollRoot, 'scrollTop', 'get').mockImplementation(() => {
        const lastWrite = setScrollTop.mock.lastCall
        return lastWrite ? lastWrite[0] : start + (heightCommitted() ? nativeDelta : 0)
      })
      vi.spyOn(block, 'getBoundingClientRect').mockImplementation(() =>
        new DOMRect(0, -400, 500, 200 + (heightCommitted() ? outerDelta : 0)),
      )
      vi.spyOn(editor, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, -360, 500, 160))

      const setupState = wrapper.vm.$.setupState as { updateCollapsedHeight: () => void }
      setupState.updateCollapsedHeight()

      expect(heightCommitted()).toBe(true)
      expect(scrollRoot.scrollTop).toBe(expected)
      expect(setScrollTop).toHaveBeenCalledTimes(expected === start + nativeDelta ? 0 : 1)
    }
    finally {
      wrapper.unmount()
      scrollRoot.remove()
    }
  })
})
