import type { CodeBlockNodeProps } from '../src/types/component-props'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as streamDiffs from '../src/components/CodeBlockNode/streamDiffs'
import NodeRenderer from '../src/components/NodeRenderer'
import { flushAll } from './setup/flush-all'

enableAutoUnmount(afterEach)

const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
const browserWrite = vi.fn<(text: string) => Promise<void>>()
const code = 'const answer = 42\n\n'
const node = { type: 'code_block' as const, language: 'ts', code, raw: `\`\`\`ts\n${code}\`\`\`` }
const modes = ['pre', 'enhanced', 'fallback'] as const

beforeEach(() => {
  browserWrite.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: browserWrite },
  })
})

afterEach(() => {
  if (previousClipboard)
    Object.defineProperty(navigator, 'clipboard', previousClipboard)
  else
    Reflect.deleteProperty(navigator, 'clipboard')
})

function mountRenderer(mode: typeof modes[number], clipboardWriter?: CodeBlockNodeProps['clipboardWriter']) {
  if (mode === 'fallback') {
    vi.spyOn(streamDiffs, 'getStreamDiffsRuntime').mockResolvedValue(null)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  }

  return mount(NodeRenderer, {
    props: {
      nodes: [node],
      final: true,
      renderCodeBlocksAsPre: mode === 'pre',
      codeBlockProps: { clipboardWriter },
      batchRendering: false,
      deferNodesUntilVisible: false,
      fade: false,
      nodeVirtual: false,
      typewriter: false,
      viewportPriority: false,
    },
  })
}

async function getCopyButton(wrapper: ReturnType<typeof mountRenderer>, selector = 'button[aria-label="Copy"]') {
  await vi.waitFor(() => expect(wrapper.find(selector).exists()).toBe(true))
  return wrapper.get(selector)
}

describe.each(modes)('code block clipboard writer (%s)', (mode) => {
  it('waits for the host write before showing success and emitting the original code', async () => {
    let completeWrite!: () => void
    const clipboardWriter = vi.fn((_text: string) => new Promise<void>((resolve) => {
      completeWrite = resolve
    }))
    browserWrite.mockRejectedValue(new Error('Browser clipboard denied'))
    const wrapper = mountRenderer(mode, clipboardWriter)
    await flushAll()

    const button = await getCopyButton(wrapper)
    await button.trigger('click')
    await flushAll()

    expect(clipboardWriter).toHaveBeenCalledExactlyOnceWith(code)
    expect(browserWrite).not.toHaveBeenCalled()
    expect(button.attributes('aria-label')).toBe('Copy')
    expect(wrapper.emitted('copy')).toBeUndefined()
    expect(wrapper.emitted('copy-code')).toBeUndefined()

    await wrapper.setProps({ nodes: [{ ...node, code: 'const answer = 43\n' }] })
    completeWrite()
    await flushAll()

    expect(button.attributes('aria-label')).toBe('Copied')
    expect(wrapper.emitted('copy')).toEqual([[code]])
    expect(wrapper.emitted('copy-code')).toEqual([[code]])
  })

  it.each(['throw', 'reject'])('does not report success or fall back to the browser after a failed host write (%s)', async (failure) => {
    const error = new Error('Host clipboard denied')
    const clipboardWriter = vi.fn(() => {
      if (failure === 'throw')
        throw error
      return Promise.reject(error)
    })
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = mountRenderer(mode, clipboardWriter)
    await flushAll()

    const button = await getCopyButton(wrapper)
    await button.trigger('click')
    await flushAll()

    expect(clipboardWriter).toHaveBeenCalledExactlyOnceWith(code)
    expect(browserWrite).not.toHaveBeenCalled()
    expect(button.attributes('aria-label')).toBe('Copy')
    expect(wrapper.emitted('copy')).toBeUndefined()
    expect(wrapper.emitted('copy-code')).toBeUndefined()
    expect(logError).toHaveBeenCalledWith(expect.any(String), error)
  })

  it('accepts a synchronous host writer', async () => {
    let copied = ''
    const wrapper = mountRenderer(mode, (text) => {
      copied = text
    })
    await flushAll()

    const button = await getCopyButton(wrapper)
    await button.trigger('click')
    await flushAll()

    expect(copied).toBe(code)
    expect(browserWrite).not.toHaveBeenCalled()
    expect(button.attributes('aria-label')).toBe('Copied')
    expect(wrapper.emitted('copy-code')).toEqual([[code]])
  })

  it('keeps browser clipboard writes when no host writer is supplied', async () => {
    const wrapper = mountRenderer(mode)
    await flushAll()

    const button = await getCopyButton(wrapper)
    await button.trigger('click')
    await flushAll()

    expect(browserWrite).toHaveBeenCalledExactlyOnceWith(code)
    expect(wrapper.emitted('copy')).toEqual([[code]])
    expect(wrapper.emitted('copy-code')).toEqual([[code]])
  })

  it('uses the same host writer for a code block nested in a blockquote', async () => {
    const clipboardWriter = vi.fn().mockResolvedValue(undefined)
    const wrapper = mountRenderer(mode, clipboardWriter)
    await wrapper.setProps({ nodes: [{ type: 'blockquote', raw: '', children: [node] }] })
    await flushAll()

    const button = await getCopyButton(wrapper, 'blockquote button[aria-label="Copy"]')
    await button.trigger('click')
    await flushAll()

    expect(clipboardWriter).toHaveBeenCalledExactlyOnceWith(code)
    expect(browserWrite).not.toHaveBeenCalled()
    expect(wrapper.emitted('copy-code')).toEqual([[code]])
  })
})
