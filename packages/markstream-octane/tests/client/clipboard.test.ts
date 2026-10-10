import { cleanup, render } from '@octanejs/testing-library'
import { vi } from 'vitest'
import { clipboardButton, clipboardContract, clipboardNodes, clipboardRendererProps } from '../../../../test/setup/clipboard-contract'
import * as streamDiffs from '../../src/components/CodeBlockNode/streamDiffs'
import { NodeRenderer } from '../../src/index'

for (const mode of ['enhanced', 'fallback'] as const) {
  clipboardContract(`Octane clipboard (${mode})`, async ({ code, clipboardWriter, onCopy, nested }) => {
    if (mode === 'fallback')
      vi.spyOn(streamDiffs, 'getStreamDiffsRuntime').mockResolvedValue(null)
    const props = { ...clipboardRendererProps, codeBlockProps: { clipboardWriter }, onCopy }
    const view = render(NodeRenderer, { props: { ...props, nodes: clipboardNodes(code, nested) } })
    const button = await clipboardButton(view.container)
    return {
      copy: () => button.click(),
      copied: () => button.getAttribute('aria-label') === 'Copied',
      updateCode: code => view.rerender({ props: { ...props, nodes: clipboardNodes(code, nested) } }),
      flush: async () => { await new Promise(resolve => setTimeout(resolve, 0)) },
      dispose: cleanup,
    }
  })
}
