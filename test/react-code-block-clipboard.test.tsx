import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { vi } from 'vitest'
import * as streamDiffs from '../packages/markstream-react/src/components/CodeBlockNode/streamDiffs'
import NodeRenderer from '../packages/markstream-react/src/components/NodeRenderer'
import { clipboardButton, clipboardContract, clipboardNodes, clipboardRendererProps } from './setup/clipboard-contract'

for (const mode of ['enhanced', 'fallback'] as const) {
  clipboardContract(`React clipboard (${mode})`, async ({ code, clipboardWriter, onCopy, nested }) => {
    if (mode === 'fallback')
      vi.spyOn(streamDiffs, 'getStreamDiffsRuntime').mockResolvedValue(null)
    const previousActEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const updateCode = async (code: string) => {
      await act(async () => root.render(
        <NodeRenderer {...clipboardRendererProps} nodes={clipboardNodes(code, nested)} codeBlockProps={{ clipboardWriter }} onCopy={onCopy} />,
      ))
    }
    await updateCode(code)
    const button = await clipboardButton(container)
    return {
      copy: () => act(async () => button.click()),
      copied: () => button.getAttribute('aria-label') === 'Copied',
      updateCode,
      flush: () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }),
      dispose: async () => {
        await act(async () => root.unmount())
        container.remove()
        ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
      },
    }
  })
}
