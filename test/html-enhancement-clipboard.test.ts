import { vi } from 'vitest'
import { enhanceRenderedHtml as enhanceAngular } from '../packages/markstream-angular/src/enhanceRenderedHtml'
import * as angularRuntime from '../packages/markstream-angular/src/optional/streamDiffs'
import { enhanceRenderedHtml as enhanceSvelte } from '../packages/markstream-svelte/src/enhanceRenderedHtml'
import * as svelteRuntime from '../packages/markstream-svelte/src/optional/streamDiffs'
import { clipboardContract } from './setup/clipboard-contract'

for (const [name, enhance, runtime] of [
  ['Angular', enhanceAngular, angularRuntime],
  ['Svelte', enhanceSvelte, svelteRuntime],
] as const) {
  clipboardContract(`${name} HTML enhancement clipboard`, async ({ code, clipboardWriter, onCopy, nested }) => {
    vi.spyOn(runtime, 'getStreamDiffsRuntime').mockResolvedValue({
      createCodeBlockRuntime: () => ({
        createEditor: async (container: HTMLElement, text: string) => {
          const surface = document.createElement('div')
          surface.className = 'stream-diffs-shell'
          surface.textContent = text
          surface.getBoundingClientRect = () => ({ width: 200, height: 40, top: 0, bottom: 40 }) as DOMRect
          container.appendChild(surface)
        },
        cleanupEditor() {},
      }),
    } as any)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const options = { final: true, codeBlockProps: { clipboardWriter }, onCopy }
    let handle: Awaited<ReturnType<typeof enhance>> | undefined
    const updateCode = async (code: string) => {
      handle?.dispose()
      const pre = document.createElement('pre')
      pre.dataset.markstreamCodeBlock = '1'
      pre.dataset.markstreamLanguage = 'ts'
      const source = document.createElement('code')
      source.textContent = code
      pre.appendChild(source)
      const parent = nested ? document.createElement('blockquote') : document.createElement('div')
      parent.appendChild(pre)
      container.replaceChildren(parent)
      handle = await enhance(container, options)
    }
    await updateCode(code)
    const button = container.querySelector<HTMLButtonElement>('button')!
    return {
      copy: () => button.click(),
      copied: () => undefined,
      updateCode,
      flush: async () => { await new Promise(resolve => setTimeout(resolve, 0)) },
      dispose: () => {
        handle?.dispose()
        container.remove()
      },
    }
  })
}
