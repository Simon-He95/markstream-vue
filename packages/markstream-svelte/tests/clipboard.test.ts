import { mount, tick, unmount } from 'svelte'
import { vi } from 'vitest'
import { clipboardButton, clipboardContract } from '../../../test/setup/clipboard-contract'
import * as streamDiffs from '../src/optional/streamDiffs'
import ClipboardRenderer from './fixtures/ClipboardRenderer.svelte'
import '../../../test/setup/vitest.setup'

for (const mode of ['enhanced', 'fallback'] as const) {
  clipboardContract(`Svelte clipboard (${mode})`, async ({ code, clipboardWriter, onCopy, nested }) => {
    if (mode === 'fallback')
      vi.spyOn(streamDiffs, 'getStreamDiffsRuntime').mockResolvedValue(null)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const app = mount(ClipboardRenderer, { target: container, props: { code, clipboardWriter, onCopy, nested } })
    const button = await clipboardButton(container)
    return {
      copy: () => button.click(),
      copied: () => button.getAttribute('aria-label') === 'Copied',
      updateCode: app.updateCode,
      flush: async () => {
        await tick()
        await new Promise(resolve => setTimeout(resolve, 0))
        await tick()
      },
      dispose: async () => {
        await unmount(app)
        container.remove()
      },
    }
  })
}
