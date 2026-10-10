import { vi } from 'vitest'
import Vue from 'vue'
import { clipboardButton, clipboardContract, clipboardNodes, clipboardRendererProps } from '../../../test/setup/clipboard-contract'
import * as streamDiffs from '../src/components/CodeBlockNode/streamDiffs'
import NodeRenderer from '../src/exports'

clipboardContract('Vue 2 clipboard', async ({ code, clipboardWriter, onCopy, nested }) => {
  vi.spyOn(streamDiffs, 'getStreamDiffsRuntime').mockResolvedValue({
    createCodeBlockRuntime: () => (globalThis as any).__streamDiffsHelpers,
  } as any)
  const vm = new Vue({
    data: () => ({ code }),
    render(h) {
      return h('div', [h(NodeRenderer, {
        props: {
          ...clipboardRendererProps,
          nodes: clipboardNodes(this.code, nested),
          codeBlockProps: { clipboardWriter },
        },
        on: { copy: onCopy },
      })])
    },
  }).$mount()
  document.body.appendChild(vm.$el)
  const button = await clipboardButton(vm.$el)
  return {
    copy: () => button.click(),
    copied: () => button.getAttribute('aria-label') === 'Copied',
    updateCode: async (code) => {
      vm.code = code
      await Vue.nextTick()
    },
    flush: async () => {
      await Vue.nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))
      await Vue.nextTick()
    },
    dispose: () => {
      vm.$destroy()
      vm.$el.remove()
    },
  }
})
