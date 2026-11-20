import type { CodeBlockOptions } from '../src/types/component-props'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import CodeBlockNode from '../src/components/CodeBlockNode/CodeBlockNode.vue'
import { resetCodeBlockRuntimeReadyForTest } from '../src/components/CodeBlockNode/runtime'

function helpers() {
  return (globalThis as any).__streamDiffsHelpers
}

const node = {
  type: 'code_block',
  language: 'ts',
  code: 'const answer = 42',
  raw: '```ts\nconst answer = 42\n```',
} as any

async function mountAndCaptureOptions(codeBlockOptions: CodeBlockOptions) {
  const wrapper = mount(CodeBlockNode, {
    props: { node, codeBlockOptions, stream: false, loading: false },
  })
  for (let index = 0; index < 20 && helpers().createCodeBlockRuntime.mock.calls.length === 0; index++) {
    await nextTick()
    await Promise.resolve()
  }
  const call = helpers().createCodeBlockRuntime.mock.calls.at(-1)
  wrapper.unmount()
  return call?.[0] as Record<string, unknown> | undefined
}

beforeEach(() => {
  resetCodeBlockRuntimeReadyForTest()
  helpers().createCodeBlockRuntime.mockReset().mockImplementation(() => helpers())
  helpers().createEditor.mockReset().mockImplementation(async () => {})
  helpers().getEditor.mockReset().mockImplementation(() => null)
  helpers().getEditorView.mockReset().mockImplementation(() => null)
  helpers().cleanupEditor.mockReset().mockImplementation(() => {})
  helpers().safeClean.mockReset().mockImplementation(() => {})
  helpers().setTheme.mockReset().mockImplementation(async () => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('preferredHighlighter resolution', () => {
  it('defaults to the app-wide auto backend', async () => {
    const options = await mountAndCaptureOptions({})
    expect(options?.preferredHighlighter).toBe('auto')
  })

  it('forwards an explicit backend unchanged', async () => {
    const options = await mountAndCaptureOptions({ preferredHighlighter: 'shiki-js' })
    expect(options?.preferredHighlighter).toBe('shiki-js')
  })

  it('forwards an explicit highlights request unchanged', async () => {
    const options = await mountAndCaptureOptions({ preferredHighlighter: 'highlights' })
    expect(options?.preferredHighlighter).toBe('highlights')
  })
})
