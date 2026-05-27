import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import CodeBlockNode from '../src/components/CodeBlockNode/CodeBlockNode.vue'
import { isCodeBlockRuntimeReady, preloadCodeBlockRuntime } from '../src/components/CodeBlockNode/monaco'
import { resetCodeBlockRuntimeReadyForTest } from '../src/components/CodeBlockNode/runtime'

interface StreamMonacoHelpers {
  useMonaco: ReturnType<typeof vi.fn>
  createEditor: ReturnType<typeof vi.fn>
  createDiffEditor: ReturnType<typeof vi.fn>
  updateCode: ReturnType<typeof vi.fn>
  updateDiff: ReturnType<typeof vi.fn>
  getEditor: ReturnType<typeof vi.fn>
  getEditorView: ReturnType<typeof vi.fn>
  getDiffEditorView: ReturnType<typeof vi.fn>
  cleanupEditor: ReturnType<typeof vi.fn>
  safeClean: ReturnType<typeof vi.fn>
  refreshDiffPresentation: ReturnType<typeof vi.fn>
  setTheme: ReturnType<typeof vi.fn>
}

function getStreamMonacoHelpers(): StreamMonacoHelpers {
  return (globalThis as any).__streamMonacoHelpers
}

function resetStreamMonacoHelpers() {
  resetCodeBlockRuntimeReadyForTest()
  const helpers = getStreamMonacoHelpers()
  const makeEditorView = () => ({
    getModel: () => ({ getLineCount: () => 1 }),
    getOption: () => 14,
    updateOptions: vi.fn(),
    layout: vi.fn(),
  })

  helpers.useMonaco.mockReset().mockImplementation(() => helpers)
  helpers.createEditor.mockReset().mockImplementation(async () => {})
  helpers.createDiffEditor.mockReset().mockImplementation(async () => {})
  helpers.updateCode.mockReset()
  helpers.updateDiff.mockReset()
  helpers.getEditor.mockReset().mockImplementation(() => null)
  helpers.getEditorView.mockReset().mockReturnValue(makeEditorView())
  helpers.getDiffEditorView.mockReset().mockReturnValue(makeEditorView())
  helpers.cleanupEditor.mockReset().mockImplementation(() => {})
  helpers.safeClean.mockReset().mockImplementation(() => {})
  helpers.refreshDiffPresentation.mockReset().mockImplementation(() => {})
  helpers.setTheme.mockReset().mockImplementation(async () => {})
}

async function flushPendingMicrotasks() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  await new Promise<void>((resolve) => {
    if (typeof globalThis.requestAnimationFrame === 'function')
      globalThis.requestAnimationFrame(() => resolve())
    else
      setTimeout(resolve, 0)
  })
  await new Promise<void>((resolve) => {
    if (typeof globalThis.requestAnimationFrame === 'function')
      globalThis.requestAnimationFrame(() => resolve())
    else
      setTimeout(resolve, 0)
  })
}

async function waitForCreateEditorCalls(expected: number, helpers: StreamMonacoHelpers, timeout = 1000) {
  const start = Date.now()
  while (helpers.createEditor.mock.calls.length < expected) {
    if (Date.now() - start > timeout)
      throw new Error('Timed out waiting for createEditor call')
    await flushPendingMicrotasks()
  }
}

async function waitForCreateDiffEditorCalls(expected: number, helpers: StreamMonacoHelpers, timeout = 1000) {
  const start = Date.now()
  while (helpers.createDiffEditor.mock.calls.length < expected) {
    if (Date.now() - start > timeout)
      throw new Error('Timed out waiting for createDiffEditor call')
    await flushPendingMicrotasks()
  }
}

describe('codeBlockNode editor creation locking', () => {
  beforeEach(() => {
    resetStreamMonacoHelpers()
  })

  it('renders a `<pre>` fallback until Monaco finishes mounting', async () => {
    const helpers = getStreamMonacoHelpers()
    let resolveCreate: (() => void) | null = null
    helpers.createEditor.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = () => resolve()
        }),
    )

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'js',
          code: 'console.log(1)',
          raw: '```js\nconsole.log(1)\n```',
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()
    await waitForCreateEditorCalls(1, helpers)

    expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(true)
    expect(wrapper.find('.code-editor-container').classes()).toContain('is-hidden')

    const finish = resolveCreate
    if (finish)
      finish()
    await flushPendingMicrotasks()

    await vi.waitFor(() => {
      expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(false)
      expect(wrapper.find('.code-editor-container').classes()).not.toContain('is-hidden')
    })

    wrapper.unmount()
  })

  it('matches fallback metrics to Monaco defaults while Monaco is mounting', async () => {
    const helpers = getStreamMonacoHelpers()
    let resolveCreate: (() => void) | null = null
    helpers.createEditor.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = () => resolve()
        }),
    )

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'js',
          code: 'console.log(1)',
          raw: '```js\nconsole.log(1)\n```',
        },
        loading: true,
        stream: true,
        showHeader: false,
        monacoOptions: {
          MAX_HEIGHT: 320,
        },
      },
    })

    try {
      await flushPendingMicrotasks()
      await waitForCreateEditorCalls(1, helpers)

      const fallback = wrapper.get('pre.code-pre-fallback').element as HTMLElement
      expect(fallback.style.fontSize).toBe('14px')
      expect(fallback.style.lineHeight).toBe('19px')
      expect(fallback.style.tabSize).toBe('4')
      expect(fallback.style.paddingTop).toBe('0px')
      expect(fallback.style.paddingBottom).toBe('0px')
      expect(fallback.style.maxHeight).toBe('320px')
      expect(fallback.style.overflow).toBe('auto')
    }
    finally {
      resolveCreate?.()
      wrapper.unmount()
    }
  })

  it('applies Monaco font and padding options to the fallback metrics', async () => {
    const helpers = getStreamMonacoHelpers()
    let resolveCreate: (() => void) | null = null
    helpers.createEditor.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = () => resolve()
        }),
    )

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'js',
          code: 'console.log(1)',
          raw: '```js\nconsole.log(1)\n```',
        },
        loading: true,
        stream: true,
        showHeader: false,
        monacoOptions: {
          fontSize: 16,
          lineHeight: 22,
          tabSize: 2,
          padding: { top: 3, bottom: 5 },
        },
      },
    })

    try {
      await flushPendingMicrotasks()
      await waitForCreateEditorCalls(1, helpers)

      const fallback = wrapper.get('pre.code-pre-fallback').element as HTMLElement
      expect(fallback.style.fontSize).toBe('16px')
      expect(fallback.style.lineHeight).toBe('22px')
      expect(fallback.style.tabSize).toBe('2')
      expect(fallback.style.paddingTop).toBe('3px')
      expect(fallback.style.paddingBottom).toBe('5px')
    }
    finally {
      resolveCreate?.()
      wrapper.unmount()
    }
  })

  it('does not render the `<pre>` fallback on warm remounts after the runtime is ready', async () => {
    const helpers = getStreamMonacoHelpers()
    let resolveCreate: (() => void) | null = null
    helpers.createEditor.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = () => resolve()
        }),
    )

    const node = {
      type: 'code_block',
      language: 'js',
      code: 'console.log(1)',
      raw: '```js\nconsole.log(1)\n```',
    }

    const first = mount(CodeBlockNode, {
      props: {
        node,
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()
    await waitForCreateEditorCalls(1, helpers)

    expect(first.find('pre.code-pre-fallback').exists()).toBe(true)

    const finish = resolveCreate
    if (finish)
      finish()
    await flushPendingMicrotasks()
    await vi.waitFor(() => {
      expect(first.find('pre.code-pre-fallback').exists()).toBe(false)
    })
    expect(isCodeBlockRuntimeReady()).toBe(true)
    first.unmount()

    let resolveSecondCreate: (() => void) | null = null
    helpers.createEditor.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSecondCreate = () => resolve()
        }),
    )
    const second = mount(CodeBlockNode, {
      props: {
        node,
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()
    await waitForCreateEditorCalls(2, helpers)

    expect(second.find('pre.code-pre-fallback').exists()).toBe(false)
    expect(second.find('.code-editor-container').classes()).not.toContain('is-hidden')

    resolveSecondCreate?.()
    await flushPendingMicrotasks()
    second.unmount()
  })

  it('lets callers preload the code block runtime before mounting', async () => {
    const helpers = getStreamMonacoHelpers()
    let resolveCreate: (() => void) | null = null
    helpers.createEditor.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = () => resolve()
        }),
    )

    await expect(preloadCodeBlockRuntime()).resolves.toBe(true)
    expect(isCodeBlockRuntimeReady()).toBe(true)

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'js',
          code: 'console.log(1)',
          raw: '```js\nconsole.log(1)\n```',
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()
    await waitForCreateEditorCalls(1, helpers)

    expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(false)
    expect(wrapper.find('.code-editor-container').classes()).not.toContain('is-hidden')

    resolveCreate?.()
    await flushPendingMicrotasks()
    wrapper.unmount()
  })

  it('keeps the `<pre>` fallback if a warm runtime fails to create an editor', async () => {
    const helpers = getStreamMonacoHelpers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(preloadCodeBlockRuntime()).resolves.toBe(true)
    const createFailed = async () => {
      throw new Error('create failed')
    }
    helpers.createEditor
      .mockImplementationOnce(createFailed)
      .mockImplementationOnce(createFailed)

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'js',
          code: 'console.log(1)',
          raw: '```js\nconsole.log(1)\n```',
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()
    await waitForCreateEditorCalls(1, helpers)

    try {
      await vi.waitFor(() => {
        const fallback = wrapper.find('pre')
        expect(fallback.exists()).toBe(true)
        expect(fallback.text()).toContain('console.log(1)')
      })
    }
    finally {
      warn.mockRestore()
    }

    wrapper.unmount()
  })

  it('caps the `<pre>` fallback while Monaco is mounting', async () => {
    const helpers = getStreamMonacoHelpers()
    let resolveCreate: (() => void) | null = null
    helpers.createEditor.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = () => resolve()
        }),
    )

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'json',
          code: Array.from({ length: 80 }, (_, index) => `  "key${index}": "value"`).join('\n'),
          raw: '```json\n{}\n```',
        },
        loading: false,
        stream: false,
        showHeader: false,
        monacoOptions: {
          MAX_HEIGHT: 320,
        },
      },
    })

    await flushPendingMicrotasks()
    await waitForCreateEditorCalls(1, helpers)

    const fallback = wrapper.get('pre.code-pre-fallback').element as HTMLElement
    expect(fallback.style.maxHeight).toBe('320px')
    expect(fallback.style.overflow).toBe('auto')

    const finish = resolveCreate
    if (finish)
      finish()
    await flushPendingMicrotasks()

    wrapper.unmount()
  })

  it('keeps the restored estimated height while Monaco swaps in', async () => {
    const helpers = getStreamMonacoHelpers()
    helpers.getEditorView.mockReturnValue({
      getModel: () => ({ getLineCount: () => 1 }),
      getOption: () => 14,
      updateOptions: vi.fn(),
      layout: vi.fn(),
      getContentHeight: () => 0,
    })
    helpers.createEditor.mockImplementation(async (el: HTMLElement) => {
      el.style.minHeight = ''
      el.style.height = '0px'
    })

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'js',
          code: 'console.log(1)',
          raw: '```js\nconsole.log(1)\n```',
        },
        estimatedHeightPx: 280,
        estimatedContentHeightPx: 240,
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await waitForCreateEditorCalls(1, helpers)
    await flushPendingMicrotasks()

    const host = wrapper.get('.code-editor-container').element as HTMLElement
    const block = wrapper.get('.code-block-container').element as HTMLElement
    await vi.waitFor(() => {
      expect(Number.parseFloat(host.style.height)).toBeGreaterThanOrEqual(240)
      expect(host.style.minHeight).toBe('240px')
      expect(block.style.minHeight).toBe('280px')
    })

    wrapper.unmount()
  })

  it('keeps the estimated height floor after Monaco reports a shorter first layout', async () => {
    const helpers = getStreamMonacoHelpers()
    helpers.getEditorView.mockReturnValue({
      getModel: () => ({ getLineCount: () => 5 }),
      getOption: () => 18,
      updateOptions: vi.fn(),
      layout: vi.fn(),
      getContentHeight: () => 238,
    })

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'sh',
          code: 'a\nb\nc\nd\ne',
          raw: '```sh\na\nb\nc\nd\ne\n```',
        },
        estimatedHeightPx: 280,
        estimatedContentHeightPx: 240,
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await waitForCreateEditorCalls(1, helpers)
    await vi.waitFor(() => {
      expect(wrapper.get('.code-block-container').attributes('data-markstream-enhanced')).toBe('true')
    })
    await flushPendingMicrotasks()

    const host = wrapper.get('.code-editor-container').element as HTMLElement
    const block = wrapper.get('.code-block-container').element as HTMLElement
    expect(host.style.minHeight).toBe('240px')
    expect(block.style.minHeight).toBe('280px')

    wrapper.unmount()
  })

  it('invokes createEditor only once while loading toggles mid-creation', async () => {
    const helpers = getStreamMonacoHelpers()
    let resolveCreate: (() => void) | null = null
    helpers.createEditor.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = () => resolve()
        }),
    )

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'js',
          code: 'console.log(1)',
          raw: '```js\nconsole.log(1)\n```',
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()
    expect(wrapper.find('.code-editor-container').exists()).toBe(true)

    await waitForCreateEditorCalls(1, helpers)

    await wrapper.setProps({ loading: false })
    await flushPendingMicrotasks()
    expect(helpers.createEditor).toHaveBeenCalledTimes(1)

    const finish = resolveCreate
    if (finish)
      finish()
    await flushPendingMicrotasks()
    wrapper.unmount()
  })

  it('waits for the in-flight single editor creation before recreating as diff', async () => {
    const helpers = getStreamMonacoHelpers()
    let resolveCreate: (() => void) | null = null
    helpers.createEditor.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = () => resolve()
        }),
    )

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: 'const value = 1',
          raw: '```ts\nconst value = 1\n```',
        },
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()
    await waitForCreateEditorCalls(1, helpers)

    await wrapper.setProps({
      node: {
        type: 'code_block',
        language: 'diff',
        code: '@@ -1 +1 @@',
        diff: true,
        originalCode: 'const value = 1\n',
        updatedCode: 'const value = 2\n',
        raw: '```diff\n-const value = 1\n+const value = 2\n```',
      },
    })
    await flushPendingMicrotasks()

    expect(helpers.createDiffEditor).not.toHaveBeenCalled()

    const finish = resolveCreate
    if (finish)
      finish()
    await waitForCreateDiffEditorCalls(1, helpers)

    expect(helpers.createEditor).toHaveBeenCalledTimes(1)
    expect(helpers.createDiffEditor).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })
})

describe('codeBlockNode language normalization', () => {
  beforeEach(() => {
    resetStreamMonacoHelpers()
  })

  it('normalizes js aliases before invoking Monaco helpers', async () => {
    const helpers = getStreamMonacoHelpers()

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'js',
          code: 'console.log(1)',
          raw: '```js\nconsole.log(1)\n```',
        },
        loading: false,
      },
    })

    await waitForCreateEditorCalls(1, helpers)

    const createArgs = helpers.createEditor.mock.calls[0]
    expect(createArgs[2]).toBe('javascript')

    wrapper.unmount()
  })
})

describe('codeBlockNode diff defaults', () => {
  beforeEach(() => {
    resetStreamMonacoHelpers()
  })

  it('defaults diff blocks to the line-info collapsed preset', async () => {
    const helpers = getStreamMonacoHelpers()

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          diff: true,
          originalCode: 'const a = 1\\nconst b = 2\\n',
          updatedCode: 'const a = 1\\nconst c = 3\\n',
          raw: '```diff\\n-const b = 2\\n+const c = 3\\n```',
        },
        loading: false,
        showHeader: false,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)

    expect(helpers.useMonaco).toHaveBeenCalled()
    const monacoOptions = helpers.useMonaco.mock.calls[0]?.[0] ?? {}
    expect(monacoOptions.diffHideUnchangedRegions).toEqual({
      enabled: true,
      contextLineCount: 2,
      minimumLineCount: 4,
      revealLineCount: 5,
    })
    expect(monacoOptions.diffLineStyle).toBe('background')
    expect(monacoOptions.diffAppearance).toBe('light')
    expect(monacoOptions.diffUnchangedRegionStyle).toBe('line-info')
    expect(monacoOptions.renderLineHighlight).toBe('none')
    expect(monacoOptions.renderLineHighlightOnlyWhenFocus).toBe(true)
    expect(monacoOptions.selectionHighlight).toBe(false)
    expect(monacoOptions.occurrencesHighlight).toBe('off')
    expect(monacoOptions.matchBrackets).toBe('never')
    expect(monacoOptions.lineDecorationsWidth).toBe(4)
    expect(monacoOptions.lineNumbersMinChars).toBe(2)
    expect(monacoOptions.glyphMargin).toBe(false)
    expect(monacoOptions.fontSize).toBeUndefined()
    expect(monacoOptions.lineHeight).toBeUndefined()
    expect(monacoOptions.renderOverviewRuler).toBe(false)
    expect(monacoOptions.overviewRulerBorder).toBe(false)
    expect(monacoOptions.hideCursorInOverviewRuler).toBe(true)
    expect(monacoOptions.scrollBeyondLastLine).toBe(false)
    expect(monacoOptions.padding).toBeUndefined()
    expect(monacoOptions.diffHunkActionsOnHover).toBe(false)
    expect(monacoOptions.diffHunkHoverHideDelayMs).toBeUndefined()
    expect(monacoOptions.ignoreTrimWhitespace).toBe(false)
    expect(monacoOptions.renderIndicators).toBe(true)
    expect(monacoOptions.maxComputationTime).toBe(0)
    expect(monacoOptions.diffAlgorithm).toBe('legacy')
    expect(monacoOptions.diffUpdateThrottleMs).toBe(120)

    wrapper.unmount()
  })

  it('preserves the five-line reveal default when callers pass a partial unchanged-region object', async () => {
    const helpers = getStreamMonacoHelpers()

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          diff: true,
          originalCode: 'const a = 1\\nconst b = 2\\n',
          updatedCode: 'const a = 1\\nconst c = 3\\n',
          raw: '```diff\\n-const b = 2\\n+const c = 3\\n```',
        },
        monacoOptions: {
          diffHideUnchangedRegions: {
            enabled: true,
            contextLineCount: 1,
          },
        },
        loading: false,
        showHeader: false,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)

    const monacoOptions = helpers.useMonaco.mock.calls[0]?.[0] ?? {}
    expect(monacoOptions.diffHideUnchangedRegions).toEqual({
      enabled: true,
      contextLineCount: 1,
      minimumLineCount: 4,
      revealLineCount: 5,
    })

    wrapper.unmount()
  })

  it('disables unchanged-region folding while diff blocks are still streaming', async () => {
    const helpers = getStreamMonacoHelpers()

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          diff: true,
          originalCode: 'const a = 1\\nconst b = 2\\n',
          updatedCode: 'const a = 1\\nconst c = 3\\n',
          raw: '```diff\\n-const b = 2\\n+const c = 3\\n```',
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)

    const monacoOptions = helpers.useMonaco.mock.calls[0]?.[0] ?? {}
    expect(monacoOptions.diffHideUnchangedRegions).toEqual({
      enabled: false,
      contextLineCount: 2,
      minimumLineCount: 4,
      revealLineCount: 0,
    })
    expect(monacoOptions.hideUnchangedRegions).toEqual({
      enabled: false,
      contextLineCount: 2,
      minimumLineCount: 4,
      revealLineCount: 0,
    })

    wrapper.unmount()
  })

  it('disables Monaco automatic inline fallback for diff blocks by default', async () => {
    const helpers = getStreamMonacoHelpers()

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          diff: true,
          originalCode: 'const a = 1\\nconst b = 2\\n',
          updatedCode: 'const a = 1\\nconst c = 3\\n',
          raw: '```diff\\n-const b = 2\\n+const c = 3\\n```',
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)

    const monacoOptions = helpers.useMonaco.mock.calls[0]?.[0] ?? {}
    expect(monacoOptions.useInlineViewWhenSpaceIsLimited).toBe(false)

    wrapper.unmount()
  })

  it('preserves explicit Monaco diff inline fallback settings', async () => {
    const helpers = getStreamMonacoHelpers()

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          diff: true,
          originalCode: 'const a = 1\\nconst b = 2\\n',
          updatedCode: 'const a = 1\\nconst c = 3\\n',
          raw: '```diff\\n-const b = 2\\n+const c = 3\\n```',
        },
        loading: true,
        stream: true,
        showHeader: false,
        monacoOptions: {
          useInlineViewWhenSpaceIsLimited: true,
        },
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)

    const monacoOptions = helpers.useMonaco.mock.calls[0]?.[0] ?? {}
    expect(monacoOptions.useInlineViewWhenSpaceIsLimited).toBe(true)

    wrapper.unmount()
  })

  it('creates streaming diff editors from the parser-produced original and updated sides', async () => {
    const helpers = getStreamMonacoHelpers()
    const original = [
      '{',
      '  "name": "markstream-vue",',
      '  "type": "module",',
      '  "version": "0.0.49",',
    ].join('\n')
    const updated = [
      '{',
      '  "name": "markstream-vue",',
      '  "type": "module",',
      '  "version": "0.0.54-b',
    ].join('\n')
    const raw = [
      '```diff',
      '{',
      '  "name": "markstream-vue",',
      '  "type": "module",',
      '- "version": "0.0.49",',
      '+ "version": "0.0.54-b',
    ].join('\n')

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -2 +2 @@',
          diff: true,
          originalCode: original,
          updatedCode: updated,
          raw,
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)

    expect(helpers.createDiffEditor.mock.calls[0]?.[1]).toBe(original)
    expect(helpers.createDiffEditor.mock.calls[0]?.[2]).toBe(updated)

    wrapper.unmount()
  })

  it('passes parser-produced streaming diff updates through without rebuilding them from raw', async () => {
    const helpers = getStreamMonacoHelpers()
    const initialOriginal = [
      '{',
      '  "name": "markstream-vue",',
      '  "version": "0.0.49",',
    ].join('\n')
    const initialUpdated = [
      '{',
      '  "name": "markstream-vue",',
      '  "version": "0.0.54-b',
    ].join('\n')
    const completedOriginal = [
      '{',
      '  "name": "markstream-vue",',
      '  "version": "0.0.49",',
      '  "packageManager": "pnpm@10.16.1",',
      '}',
    ].join('\n')
    const completedUpdated = [
      '{',
      '  "name": "markstream-vue",',
      '  "version": "0.0.54-beta.1",',
      '  "packageManager": "pnpm@10.16.1",',
      '}',
    ].join('\n')
    const initialRaw = [
      '```diff',
      '{',
      '  "name": "markstream-vue",',
      '- "version": "0.0.49",',
      '+ "version": "0.0.54-b',
    ].join('\n')
    const completedRaw = [
      '```diff',
      '{',
      '  "name": "markstream-vue",',
      '- "version": "0.0.49",',
      '+ "version": "0.0.54-beta.1",',
      '  "packageManager": "pnpm@10.16.1",',
      '}',
      '```',
    ].join('\n')

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -2 +2 @@',
          diff: true,
          originalCode: initialOriginal,
          updatedCode: initialUpdated,
          raw: initialRaw,
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)
    expect(helpers.createDiffEditor.mock.calls[0]?.[1]).toBe(initialOriginal)
    expect(helpers.createDiffEditor.mock.calls[0]?.[2]).toBe(initialUpdated)
    helpers.updateDiff.mockClear()

    await wrapper.setProps({
      node: {
        type: 'code_block',
        language: 'diff',
        code: '@@ -2 +2 @@',
        diff: true,
        originalCode: completedOriginal,
        updatedCode: completedUpdated,
        raw: completedRaw,
      },
    })
    await flushPendingMicrotasks()

    expect(helpers.updateDiff).toHaveBeenCalledTimes(1)
    expect(helpers.updateDiff.mock.calls[0]?.[0]).toBe(completedOriginal)
    expect(helpers.updateDiff.mock.calls[0]?.[1]).toBe(completedUpdated)

    wrapper.unmount()
  })

  it('updates diff editors when original or updated sides change even if code stays the same', async () => {
    const helpers = getStreamMonacoHelpers()

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: 'const a = 1\\nconst b = 2\\n',
          updatedCode: 'const a = 1\\nconst b = 2\\n',
          raw: '```diff\\n@@ -1 +1 @@\\n```',
        },
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)
    helpers.updateDiff.mockClear()

    await wrapper.setProps({
      node: {
        type: 'code_block',
        language: 'diff',
        code: '@@ -1 +1 @@',
        diff: true,
        originalCode: 'const a = 1\\nconst b = 2\\n',
        updatedCode: 'const a = 1\\nconst c = 3\\n',
        raw: '```diff\\n@@ -1 +1 @@\\n```',
      },
    })
    await flushPendingMicrotasks()

    expect(helpers.updateDiff).toHaveBeenCalledTimes(1)
    expect(helpers.updateDiff.mock.calls[0]?.[0]).toBe('const a = 1\\nconst b = 2\\n')
    expect(helpers.updateDiff.mock.calls[0]?.[1]).toBe('const a = 1\\nconst c = 3\\n')

    wrapper.unmount()
  })

  it('recreates diff presentation when loading transitions from true to false', async () => {
    const helpers = getStreamMonacoHelpers()

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: 'const a = 1\\nconst b = 2\\n',
          updatedCode: 'const a = 1\\nconst c = 3\\n',
          raw: '```diff\\n-const b = 2\\n+const c = 3\\n```',
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)
    await flushPendingMicrotasks()

    helpers.createDiffEditor.mockClear()
    helpers.safeClean.mockClear()
    helpers.refreshDiffPresentation.mockClear()
    helpers.updateDiff.mockClear()

    await wrapper.setProps({ loading: false })
    await flushPendingMicrotasks()

    expect(helpers.safeClean).toHaveBeenCalled()
    expect(helpers.createDiffEditor).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'const a = 1\\nconst b = 2\\n',
      'const a = 1\\nconst c = 3\\n',
      'diff',
    )
    await vi.waitFor(() => {
      expect(helpers.refreshDiffPresentation).toHaveBeenCalled()
    })

    wrapper.unmount()
  })

  it('refreshes diff presentation again when a diff block settles after a new streaming cycle', async () => {
    const helpers = getStreamMonacoHelpers()

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: 'const a = 1\\nconst b = 2\\n',
          updatedCode: 'const a = 1\\nconst c = 3\\n',
          raw: '```diff\\n-const b = 2\\n+const c = 3\\n```',
        },
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)
    await flushPendingMicrotasks()

    helpers.refreshDiffPresentation.mockClear()
    helpers.safeClean.mockClear()

    await wrapper.setProps({ loading: true })
    await flushPendingMicrotasks()

    await wrapper.setProps({ loading: false })
    await flushPendingMicrotasks()

    expect(helpers.safeClean).toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(helpers.refreshDiffPresentation).toHaveBeenCalled()
    })

    wrapper.unmount()
  })

  it('refreshes diff presentation after the final diff update when loading settles with new diff content', async () => {
    const helpers = getStreamMonacoHelpers()

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: 'const a = 1\\nconst b = 2\\n',
          updatedCode: 'const a = 1\\nconst b = 2\\n',
          raw: '```diff\\n@@ -1 +1 @@\\n```',
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)
    await flushPendingMicrotasks()

    helpers.refreshDiffPresentation.mockClear()
    helpers.updateDiff.mockClear()

    await wrapper.setProps({
      loading: false,
      node: {
        type: 'code_block',
        language: 'diff',
        code: '@@ -1 +1 @@',
        diff: true,
        originalCode: 'const a = 1\\nconst b = 2\\n',
        updatedCode: 'const a = 1\\nconst c = 3\\n',
        raw: '```diff\\n-const b = 2\\n+const c = 3\\n```',
      },
    })
    await flushPendingMicrotasks()

    await vi.waitFor(() => {
      expect(helpers.refreshDiffPresentation).toHaveBeenCalled()
    })
    expect(helpers.updateDiff).toHaveBeenCalled()
    expect(
      helpers.updateDiff.mock.invocationCallOrder[0],
    ).toBeLessThan(helpers.refreshDiffPresentation.mock.invocationCallOrder[0])

    wrapper.unmount()
  })

  it('keeps diff editor DOM mounted when the code block is collapsed and expanded', async () => {
    const helpers = getStreamMonacoHelpers()

    helpers.createDiffEditor.mockImplementation(async (el: HTMLElement) => {
      const editor = document.createElement('div')
      editor.className = 'monaco-diff-editor'
      editor.textContent = 'diff editor'
      el.appendChild(editor)
    })

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: 'const a = 1\\nconst b = 2\\n',
          updatedCode: 'const a = 1\\nconst c = 3\\n',
          raw: '```diff\\n-const b = 2\\n+const c = 3\\n```',
        },
        loading: false,
        stream: false,
        showHeader: true,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)
    await flushPendingMicrotasks()

    const collapseButton = wrapper.findAll('.code-action-btn')[1]
    expect(wrapper.find('.monaco-diff-editor').exists()).toBe(true)

    helpers.createDiffEditor.mockClear()
    helpers.safeClean.mockClear()

    await collapseButton.trigger('click')
    await flushPendingMicrotasks()
    expect(wrapper.find('.monaco-diff-editor').exists()).toBe(true)

    await collapseButton.trigger('click')
    await flushPendingMicrotasks()

    expect(wrapper.find('.monaco-diff-editor').exists()).toBe(true)
    expect(helpers.createDiffEditor).not.toHaveBeenCalled()
    expect(helpers.safeClean).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('attaches diff listeners without forcing inner editor layout during streaming height sync', async () => {
    const helpers = getStreamMonacoHelpers()
    const dispose = vi.fn()
    let originalContentSizeListener: (() => void) | null = null
    let modifiedContentSizeListener: (() => void) | null = null
    const originalEditor = {
      onDidContentSizeChange: vi.fn((listener: () => void) => {
        originalContentSizeListener = listener
        return { dispose }
      }),
      onDidLayoutChange: vi.fn(() => ({ dispose })),
      layout: vi.fn(),
      getContentHeight: vi.fn(() => 999),
      getModel: vi.fn(() => ({ getLineCount: () => 200 })),
      getOption: vi.fn(() => 14),
    }
    const modifiedEditor = {
      onDidContentSizeChange: vi.fn((listener: () => void) => {
        modifiedContentSizeListener = listener
        return { dispose }
      }),
      onDidLayoutChange: vi.fn(() => ({ dispose })),
      layout: vi.fn(),
      getContentHeight: vi.fn(() => 999),
      getModel: vi.fn(() => ({ getLineCount: () => 200 })),
      getOption: vi.fn(() => 14),
    }
    const diffEditor = {
      getOriginalEditor: vi.fn(() => originalEditor),
      getModifiedEditor: vi.fn(() => modifiedEditor),
      onDidUpdateDiff: vi.fn(() => ({ dispose })),
      getLineChanges: vi.fn(() => []),
      getModel: vi.fn(() => ({ getLineCount: () => 1 })),
      getOption: vi.fn(() => 14),
      updateOptions: vi.fn(),
      layout: vi.fn(),
    }
    helpers.getDiffEditorView.mockReturnValue(diffEditor as any)

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: 'const a = 1\\nconst b = 2\\n',
          updatedCode: 'const a = 1\\nconst c = 3\\n',
          raw: '```diff\\n-const b = 2\\n+const c = 3\\n```',
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)
    await flushPendingMicrotasks()

    expect(diffEditor.onDidUpdateDiff).toHaveBeenCalledTimes(1)
    expect(originalEditor.onDidContentSizeChange).toHaveBeenCalledTimes(1)
    expect(originalEditor.onDidLayoutChange).toHaveBeenCalledTimes(1)
    expect(modifiedEditor.onDidContentSizeChange).toHaveBeenCalledTimes(1)
    expect(modifiedEditor.onDidLayoutChange).toHaveBeenCalledTimes(1)
    expect(originalContentSizeListener).toBeTypeOf('function')
    expect(modifiedContentSizeListener).toBeTypeOf('function')

    originalEditor.layout.mockClear()
    modifiedEditor.layout.mockClear()
    originalContentSizeListener?.()
    modifiedContentSizeListener?.()
    await flushPendingMicrotasks()

    expect(originalEditor.layout).not.toHaveBeenCalled()
    expect(modifiedEditor.layout).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('estimates diff host height from the current streamed line count instead of pinning to max height', async () => {
    const helpers = getStreamMonacoHelpers()
    const diffEditor = {
      getOriginalEditor: vi.fn(() => ({
        onDidContentSizeChange: vi.fn((listener: () => void) => {
          void listener
          return { dispose: vi.fn() }
        }),
        onDidLayoutChange: vi.fn(() => ({ dispose: vi.fn() })),
        getModel: vi.fn(() => ({ getLineCount: () => 4 })),
        getOption: vi.fn(() => 14),
      })),
      getModifiedEditor: vi.fn(() => ({
        onDidContentSizeChange: vi.fn(() => ({ dispose: vi.fn() })),
        onDidLayoutChange: vi.fn(() => ({ dispose: vi.fn() })),
        getModel: vi.fn(() => ({ getLineCount: () => 4 })),
        getOption: vi.fn(() => 14),
      })),
      onDidUpdateDiff: vi.fn(() => ({ dispose: vi.fn() })),
      getModel: vi.fn(() => ({ getLineCount: () => 1 })),
      getOption: vi.fn(() => 14),
      updateOptions: vi.fn(),
      layout: vi.fn(),
      getLineChanges: vi.fn(() => []),
    }
    helpers.getDiffEditorView.mockReturnValue(diffEditor as any)

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: 'const a = 1\\nconst b = 2\\n',
          updatedCode: 'const a = 1\\nconst c = 3\\n',
          raw: '```diff\\n-const b = 2\\n+const c = 3\\n```',
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)
    await flushPendingMicrotasks()

    const host = wrapper.get('.code-editor-container').element as HTMLElement
    expect(host.style.overflow).toBe('hidden')
    expect(Number.parseFloat(host.style.height)).toBeGreaterThan(0)
    expect(host.style.height).not.toBe('500px')
    expect(host.style.maxHeight).toBe('500px')

    wrapper.unmount()
  })

  it('keeps diff host height at least the model-estimated height when rendered DOM is still partial', async () => {
    const helpers = getStreamMonacoHelpers()
    const rect = (height: number) => ({
      x: 0,
      y: 0,
      width: 0,
      height,
      top: 0,
      left: 0,
      right: 0,
      bottom: height,
      toJSON: () => ({}),
    }) as DOMRect
    const makeSideEditor = () => ({
      onDidContentSizeChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidLayoutChange: vi.fn(() => ({ dispose: vi.fn() })),
      getModel: vi.fn(() => ({ getLineCount: () => 20 })),
      getOption: vi.fn(() => 14),
    })
    const diffEditor = {
      getOriginalEditor: vi.fn(() => makeSideEditor()),
      getModifiedEditor: vi.fn(() => makeSideEditor()),
      onDidUpdateDiff: vi.fn(() => ({ dispose: vi.fn() })),
      getLineChanges: vi.fn(() => []),
      updateOptions: vi.fn(),
      layout: vi.fn(),
    }
    helpers.getDiffEditorView.mockReturnValue(diffEditor as any)
    helpers.createDiffEditor.mockImplementation(async (el: HTMLElement) => {
      Object.defineProperty(el, 'getBoundingClientRect', {
        configurable: true,
        value: () => rect(120),
      })
      const diffRoot = document.createElement('div')
      diffRoot.className = 'monaco-diff-editor'
      Object.defineProperty(diffRoot, 'getBoundingClientRect', {
        configurable: true,
        value: () => rect(120),
      })
      el.appendChild(diffRoot)
    })

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: Array.from({ length: 20 }, (_, index) => `old ${index}`).join('\n'),
          updatedCode: Array.from({ length: 20 }, (_, index) => `new ${index}`).join('\n'),
          raw: '```diff\n-old\n+new\n```',
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)
    await vi.waitFor(() => {
      const host = wrapper.get('.code-editor-container').element as HTMLElement
      expect(Number.parseFloat(host.style.height)).toBeGreaterThan(300)
    })

    wrapper.unmount()
  })
})

describe('codeBlockNode theme updates', () => {
  beforeEach(() => {
    resetStreamMonacoHelpers()
  })

  it('updates single-editor themes without recreating the editor when isDark toggles', async () => {
    const helpers = getStreamMonacoHelpers()

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'json',
          code: '{\"hello\": \"world\"}',
          raw: '```json\n{\"hello\": \"world\"}\n```',
        },
        loading: false,
        showHeader: false,
        isDark: false,
        darkTheme: 'vitesse-dark',
        lightTheme: 'vitesse-light',
      },
    })

    await waitForCreateEditorCalls(1, helpers)
    await flushPendingMicrotasks()

    helpers.createEditor.mockClear()
    helpers.cleanupEditor.mockClear()
    helpers.safeClean.mockClear()
    helpers.setTheme.mockClear()

    await wrapper.setProps({ isDark: true })
    await flushPendingMicrotasks()

    expect(helpers.createEditor).not.toHaveBeenCalled()
    expect(helpers.cleanupEditor).not.toHaveBeenCalled()
    expect(helpers.safeClean).not.toHaveBeenCalled()
    expect(helpers.setTheme).toHaveBeenCalledTimes(1)
    expect(helpers.setTheme).toHaveBeenCalledWith('vitesse-dark')

    wrapper.unmount()
  })

  it('updates diff themes without recreating the diff editor when isDark toggles', async () => {
    const helpers = getStreamMonacoHelpers()

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: 'const a = 1\\nconst b = 2\\n',
          updatedCode: 'const a = 1\\nconst c = 3\\n',
          raw: '```diff\\n-const b = 2\\n+const c = 3\\n```',
        },
        loading: false,
        showHeader: false,
        isDark: false,
        darkTheme: 'vitesse-dark',
        lightTheme: 'vitesse-light',
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)
    await flushPendingMicrotasks()

    helpers.createDiffEditor.mockClear()
    helpers.cleanupEditor.mockClear()
    helpers.safeClean.mockClear()
    helpers.refreshDiffPresentation.mockClear()
    helpers.setTheme.mockClear()

    await wrapper.setProps({ isDark: true })
    await flushPendingMicrotasks()

    expect(helpers.createDiffEditor).not.toHaveBeenCalled()
    expect(helpers.cleanupEditor).not.toHaveBeenCalled()
    expect(helpers.safeClean).not.toHaveBeenCalled()
    expect(helpers.setTheme.mock.calls.length).toBeLessThanOrEqual(1)
    if (helpers.setTheme.mock.calls.length)
      expect(helpers.setTheme).toHaveBeenCalledWith('vitesse-dark')
    expect(helpers.refreshDiffPresentation).toHaveBeenCalled()

    wrapper.unmount()
  })

  it('does not reapply identical single-editor themes when isDark toggles', async () => {
    const helpers = getStreamMonacoHelpers()
    const codeTheme = {
      name: 'shared-single-code-theme',
      colors: {
        'editor.background': '#111111',
      },
    }

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'json',
          code: '{"hello": "world"}',
          raw: '```json\n{"hello": "world"}\n```',
        },
        loading: false,
        showHeader: false,
        isDark: false,
        darkTheme: { ...codeTheme },
        lightTheme: { ...codeTheme },
      },
    })

    await waitForCreateEditorCalls(1, helpers)
    await flushPendingMicrotasks()

    const monacoOptions = helpers.useMonaco.mock.calls[0]?.[0] ?? {}
    expect(monacoOptions.theme).toEqual({ ...codeTheme })
    expect(wrapper.get('[data-markstream-code-block="1"]').classes()).not.toContain('dark')

    helpers.setTheme.mockClear()
    await wrapper.setProps({ isDark: true })
    await flushPendingMicrotasks()

    expect(helpers.setTheme).not.toHaveBeenCalled()
    expect(wrapper.get('[data-markstream-code-block="1"]').classes()).toContain('dark')

    wrapper.unmount()
  })

  it('keeps automatic diff appearance on the selected theme when themes are identical', async () => {
    const helpers = getStreamMonacoHelpers()
    const codeTheme = {
      name: 'shared-code-theme',
      colors: {
        'editor.background': '#111111',
      },
    }

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: 'const a = 1\\nconst b = 2\\n',
          updatedCode: 'const a = 1\\nconst c = 3\\n',
          raw: '```diff\\n-const b = 2\\n+const c = 3\\n```',
        },
        loading: false,
        showHeader: false,
        isDark: false,
        darkTheme: { ...codeTheme },
        lightTheme: { ...codeTheme },
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)
    await flushPendingMicrotasks()

    const monacoOptions = helpers.useMonaco.mock.calls[0]?.[0] ?? {}
    expect(monacoOptions.theme).toEqual({ ...codeTheme })
    expect(monacoOptions.diffAppearance).toBe('dark')
    expect(wrapper.get('[data-markstream-code-block="1"]').classes()).toContain('is-dark')

    helpers.refreshDiffPresentation.mockClear()
    helpers.updateDiff.mockClear()
    helpers.setTheme.mockClear()
    await wrapper.setProps({ isDark: true })
    await flushPendingMicrotasks()

    expect(helpers.setTheme).not.toHaveBeenCalled()
    expect(helpers.refreshDiffPresentation).not.toHaveBeenCalled()
    expect(helpers.updateDiff).not.toHaveBeenCalled()
    expect(wrapper.get('[data-markstream-code-block="1"]').classes()).toContain('is-dark')

    wrapper.unmount()
  })

  it('uses Monaco theme variables for the diff editor surface', async () => {
    const helpers = getStreamMonacoHelpers()
    helpers.createDiffEditor.mockImplementation(async (el: HTMLElement) => {
      const editor = document.createElement('div')
      editor.className = 'monaco-editor'
      editor.style.setProperty('--vscode-editor-background', '#121212')
      editor.style.setProperty('--vscode-editor-foreground', '#dbd7ca')
      el.appendChild(editor)
    })

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: 'const a = 1\\nconst b = 2\\n',
          updatedCode: 'const a = 1\\nconst c = 3\\n',
          raw: '```diff\\n-const b = 2\\n+const c = 3\\n```',
        },
        loading: false,
        showHeader: false,
        isDark: false,
        darkTheme: 'vitesse-dark',
        lightTheme: 'vitesse-dark',
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)
    await flushPendingMicrotasks()

    const root = wrapper.get('[data-markstream-code-block="1"]').element as HTMLElement
    const host = wrapper.get('.code-editor-container').element as HTMLElement
    expect(root.style.getPropertyValue('--markstream-diff-editor-bg')).toBe('#121212')
    expect(host.style.getPropertyValue('--stream-monaco-editor-bg')).toBe('#121212')

    await wrapper.setProps({ isDark: true })
    await flushPendingMicrotasks()

    expect(root.style.getPropertyValue('--markstream-diff-editor-bg')).toBe('#121212')
    expect(host.style.getPropertyValue('--stream-monaco-editor-bg')).toBe('#121212')

    wrapper.unmount()
  })
})

describe('codeBlockNode plain text theme fallback', () => {
  beforeEach(() => {
    resetStreamMonacoHelpers()
  })

  it('keeps dark plain text blocks on the fallback dark surface when Monaco reports light colors', async () => {
    const helpers = getStreamMonacoHelpers()

    helpers.createEditor.mockImplementation(async (el: HTMLElement) => {
      const editor = document.createElement('div')
      editor.className = 'monaco-editor'
      editor.style.backgroundColor = 'rgb(255, 255, 255)'
      editor.style.color = 'rgb(17, 24, 39)'

      const background = document.createElement('div')
      background.className = 'monaco-editor-background'
      background.style.backgroundColor = 'rgb(255, 255, 255)'

      const lines = document.createElement('div')
      lines.className = 'view-lines'
      lines.style.color = 'rgb(17, 24, 39)'

      editor.append(background, lines)
      el.appendChild(editor)
    })

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'plaintext',
          code: 'packages/',
          raw: '```text\npackages/\n```',
        },
        loading: false,
        isDark: true,
        darkTheme: 'vitesse-dark',
        lightTheme: 'vitesse-light',
      },
    })

    await waitForCreateEditorCalls(1, helpers)
    await flushPendingMicrotasks()

    const container = wrapper.get('.code-block-container').element as HTMLElement
    expect(container.classList.contains('is-dark')).toBe(true)
    expect(container.classList.contains('is-plain-text')).toBe(true)
    expect(container.style.getPropertyValue('--vscode-editor-background')).toBe('')
    expect(container.style.getPropertyValue('--vscode-editor-foreground')).toBe('')

    wrapper.unmount()
  })
})

describe('codeBlockNode Monaco touch patch boundaries', () => {
  beforeEach(() => {
    resetStreamMonacoHelpers()
  })

  it('restores Element.prototype.addEventListener after editor creation succeeds', async () => {
    const helpers = getStreamMonacoHelpers()
    const originalAddEventListener = Element.prototype.addEventListener
    let resolveCreate: (() => void) | null = null

    helpers.createEditor.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = resolve
        }),
    )

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'js',
          code: 'console.log(1)',
          raw: '```js\nconsole.log(1)\n```',
        },
        loading: false,
        showHeader: false,
      },
    })

    await waitForCreateEditorCalls(1, helpers)
    expect(Element.prototype.addEventListener).not.toBe(originalAddEventListener)

    resolveCreate?.()
    await flushPendingMicrotasks()

    await vi.waitFor(() => {
      expect(Element.prototype.addEventListener).toBe(originalAddEventListener)
    })
    wrapper.unmount()
  })

  it('restores Element.prototype.addEventListener after editor creation fails', async () => {
    const helpers = getStreamMonacoHelpers()
    const originalAddEventListener = Element.prototype.addEventListener
    let rejectCreate: ((error?: unknown) => void) | null = null

    helpers.createEditor.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectCreate = reject
        }),
    )

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'js',
          code: 'console.log(1)',
          raw: '```js\nconsole.log(1)\n```',
        },
        loading: false,
        showHeader: false,
      },
    })

    await waitForCreateEditorCalls(1, helpers)
    expect(Element.prototype.addEventListener).not.toBe(originalAddEventListener)

    rejectCreate?.(new Error('boom'))
    await flushPendingMicrotasks()

    expect(Element.prototype.addEventListener).toBe(originalAddEventListener)
    wrapper.unmount()
  })
})
