import type { ParsedNode } from 'stream-markdown-parser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

export type ClipboardWriter = (text: string) => void | Promise<void>

export interface ClipboardHarness {
  copy: () => void | Promise<void>
  copied: () => boolean | undefined
  updateCode: (text: string) => void | Promise<void>
  flush: () => Promise<void>
  dispose: () => void | Promise<void>
}

export interface ClipboardHarnessOptions {
  code: string
  clipboardWriter?: ClipboardWriter
  onCopy: (text: string) => void
  nested?: boolean
}

export const clipboardRendererProps = {
  final: true,
  batchRendering: false,
  deferNodesUntilVisible: false,
  viewportPriority: false,
  smoothStreaming: false,
  maxLiveNodes: 0,
  fade: false,
  typewriter: false,
}

export function clipboardNodes(code: string, nested = false): ParsedNode[] {
  const node = { type: 'code_block' as const, language: 'ts', code, raw: `\`\`\`ts\n${code}\`\`\`` }
  return nested ? [{ type: 'blockquote', raw: '', children: [node] }] : [node]
}

export async function clipboardButton(container: ParentNode) {
  await vi.waitFor(() => expect(container.querySelector('button[aria-label="Copy"]')).not.toBeNull())
  return container.querySelector<HTMLButtonElement>('button[aria-label="Copy"]')!
}

export function clipboardContract(
  name: string,
  mount: (options: ClipboardHarnessOptions) => Promise<ClipboardHarness>,
) {
  describe(name, () => {
    const code = 'const answer = 42\n\n'
    const browserWrite = vi.fn<(text: string) => Promise<void>>()
    const execCommand = vi.fn(() => true)
    const onCopy = vi.fn()
    let view: ClipboardHarness | undefined
    let previousClipboard: PropertyDescriptor | undefined
    let previousExecCommand: PropertyDescriptor | undefined

    beforeEach(() => {
      previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
      previousExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand')
      browserWrite.mockReset().mockResolvedValue(undefined)
      execCommand.mockClear()
      onCopy.mockClear()
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: browserWrite } })
      Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })
    })

    afterEach(async () => {
      await view?.dispose()
      view = undefined
      if (previousClipboard)
        Object.defineProperty(navigator, 'clipboard', previousClipboard)
      else
        Reflect.deleteProperty(navigator, 'clipboard')
      if (previousExecCommand)
        Object.defineProperty(document, 'execCommand', previousExecCommand)
      else
        Reflect.deleteProperty(document, 'execCommand')
    })

    async function setup(clipboardWriter?: ClipboardWriter, nested = false) {
      view = await mount({ code, clipboardWriter, onCopy, nested })
      return view
    }

    it('waits for the host write and reports the clicked code even if streaming advances', async () => {
      let completeWrite!: () => void
      const clipboardWriter = vi.fn((_text: string) => new Promise<void>((resolve) => {
        completeWrite = resolve
      }))
      browserWrite.mockRejectedValue(new Error('Browser clipboard denied'))
      const view = await setup(clipboardWriter)
      await view.copy()
      await view.flush()

      expect(clipboardWriter).toHaveBeenCalledExactlyOnceWith(code)
      expect(onCopy).not.toHaveBeenCalled()
      expect(view.copied()).not.toBe(true)
      expect(browserWrite).not.toHaveBeenCalled()
      await view.updateCode('const answer = 43\n')
      completeWrite()
      await view.flush()

      expect(onCopy).toHaveBeenCalledExactlyOnceWith(code)
      if (view.copied() !== undefined)
        expect(view.copied()).toBe(true)
      expect(browserWrite).not.toHaveBeenCalled()
      expect(execCommand).not.toHaveBeenCalled()
    })

    it.each(['throw', 'reject'])('does not report success or retry the browser when the host writer fails (%s)', async (failure) => {
      const error = new Error('Host clipboard denied')
      const clipboardWriter = vi.fn(() => {
        if (failure === 'throw')
          throw error
        return Promise.reject(error)
      })
      const view = await setup(clipboardWriter)
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await view.copy()
      await view.flush()

      expect(clipboardWriter).toHaveBeenCalledExactlyOnceWith(code)
      expect(onCopy).not.toHaveBeenCalled()
      expect(view.copied()).not.toBe(true)
      expect(browserWrite).not.toHaveBeenCalled()
      expect(execCommand).not.toHaveBeenCalled()
    })

    it('accepts a synchronous host writer', async () => {
      let copied = ''
      const view = await setup((text) => {
        copied = text
      })
      await view.copy()
      await view.flush()

      expect(copied).toBe(code)
      expect(onCopy).toHaveBeenCalledExactlyOnceWith(code)
      expect(browserWrite).not.toHaveBeenCalled()
      if (view.copied() !== undefined)
        expect(view.copied()).toBe(true)
    })

    it('preserves the default browser clipboard path', async () => {
      const view = await setup()
      await view.copy()
      await view.flush()

      expect(browserWrite).toHaveBeenCalledExactlyOnceWith(code)
      expect(onCopy).toHaveBeenCalledExactlyOnceWith(code)
      if (view.copied() !== undefined)
        expect(view.copied()).toBe(true)
    })

    it('uses the host writer for nested code blocks', async () => {
      const clipboardWriter = vi.fn().mockResolvedValue(undefined)
      const view = await setup(clipboardWriter, true)
      await view.copy()
      await view.flush()

      expect(clipboardWriter).toHaveBeenCalledExactlyOnceWith(code)
      expect(onCopy).toHaveBeenCalledExactlyOnceWith(code)
      expect(browserWrite).not.toHaveBeenCalled()
    })
  })
}
