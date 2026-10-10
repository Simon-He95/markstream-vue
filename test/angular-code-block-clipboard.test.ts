import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { afterAll, beforeAll, vi } from 'vitest'
import * as streamDiffs from '../packages/markstream-angular/src/optional/streamDiffs'
import { clipboardButton, clipboardContract, clipboardNodes, clipboardRendererProps } from './setup/clipboard-contract'

const require = createRequire(resolve(process.cwd(), 'playground-angular/package.json'))
await import(require.resolve('@angular/compiler'))
const { provideZonelessChangeDetection } = await import(require.resolve('@angular/core'))
const { TestBed } = await import(require.resolve('@angular/core/testing'))
const { BrowserTestingModule, platformBrowserTesting } = await import(require.resolve('@angular/platform-browser/testing'))
const { NodeRendererComponent } = await import('../packages/markstream-angular/src/components/NodeRenderer/NodeRenderer.component')

beforeAll(() => TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting()))
afterAll(() => TestBed.resetTestEnvironment())

for (const mode of ['enhanced', 'fallback'] as const) {
  clipboardContract(`Angular clipboard (${mode})`, async ({ code, clipboardWriter, onCopy, nested }) => {
    if (mode === 'fallback')
      vi.spyOn(streamDiffs, 'getStreamDiffsRuntime').mockResolvedValue(null)
    TestBed.configureTestingModule({
      imports: [NodeRendererComponent],
      providers: [provideZonelessChangeDetection()],
    })
    const fixture = TestBed.createComponent(NodeRendererComponent)
    for (const [name, value] of Object.entries(clipboardRendererProps))
      fixture.componentRef.setInput(name, value)
    fixture.componentRef.setInput('codeBlockProps', { clipboardWriter })
    fixture.componentInstance.copy.subscribe(onCopy)
    const updateCode = async (code: string) => {
      fixture.componentRef.setInput('nodes', clipboardNodes(code, nested))
      fixture.detectChanges()
      await fixture.whenStable()
    }
    await updateCode(code)
    const button = await clipboardButton(fixture.nativeElement)
    return {
      copy: () => button.click(),
      copied: () => button.getAttribute('aria-label') === 'Copied',
      updateCode,
      flush: async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
        fixture.detectChanges()
      },
      dispose: () => {
        fixture.destroy()
        TestBed.resetTestingModule()
      },
    }
  })
}
