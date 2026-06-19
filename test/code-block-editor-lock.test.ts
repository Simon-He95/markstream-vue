import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
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
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()
    await waitForCreateEditorCalls(1, helpers)

    expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(true)
    expect(wrapper.find('pre.code-pre-fallback').classes()).toContain('markstream-pre--line-numbers')
    expect(wrapper.findAll('.markstream-pre__line-number').map(node => node.text())).toEqual(['1'])
    expect(wrapper.get('[data-markstream-code-block="1"]').attributes('data-markstream-pending')).toBe('true')
    expect(wrapper.find('.code-editor-container').classes()).toContain('is-hidden')

    const finish = resolveCreate
    if (finish)
      finish()
    await flushPendingMicrotasks()

    await vi.waitFor(() => {
      expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(false)
      expect(wrapper.get('[data-markstream-code-block="1"]').attributes('data-markstream-pending')).toBeUndefined()
      expect(wrapper.find('.code-editor-container').classes()).not.toContain('is-hidden')
    })

    wrapper.unmount()
  })

  it('does not pass a terminal newline to ordinary Monaco renders', async () => {
    const helpers = getStreamMonacoHelpers()
    helpers.createEditor.mockImplementation(async () => {})

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'js',
          code: 'console.log(1)\n',
          raw: '```js\nconsole.log(1)\n```',
        },
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()
    await waitForCreateEditorCalls(1, helpers)

    expect(helpers.createEditor.mock.calls[0]?.[1]).toBe('console.log(1)')

    helpers.updateCode.mockClear()
    await wrapper.setProps({
      node: {
        type: 'code_block',
        language: 'js',
        code: 'console.log(2)\n',
        raw: '```js\nconsole.log(2)\n```',
      },
    })
    await flushPendingMicrotasks()

    expect(helpers.updateCode).toHaveBeenCalledWith('console.log(2)', 'javascript')

    wrapper.unmount()
  })

  it('keeps a terminal newline while an ordinary Monaco code block is still loading', async () => {
    const helpers = getStreamMonacoHelpers()
    helpers.createEditor.mockImplementation(async () => {})

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'js',
          code: 'console.log(1)\n',
          raw: '```js\nconsole.log(1)\n',
          loading: true,
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()
    await waitForCreateEditorCalls(1, helpers)

    expect(helpers.createEditor.mock.calls[0]?.[1]).toBe('console.log(1)\n')

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
      expect(fallback.style.fontSize).toBe('12px')
      expect(fallback.style.lineHeight).toBe('18px')
      expect(fallback.style.tabSize).toBe('4')
      expect(fallback.style.paddingTop).toBe('0px')
      expect(fallback.style.paddingBottom).toBe('0px')
      expect(fallback.style.getPropertyValue('--markstream-pre-line-number-top')).toBe('0px')
      expect(fallback.style.getPropertyValue('--markstream-code-padding-left')).toBe('62px')
      expect(fallback.style.getPropertyValue('--markstream-pre-line-number-width')).toBe('36px')
      expect(fallback.style.getPropertyValue('--markstream-pre-line-number-gap')).toBe('0px')
      expect(fallback.style.maxHeight).toBe('320px')
      expect(fallback.style.height).toBe('')
      expect(fallback.style.minHeight).toBe('21px')
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
      expect(fallback.style.getPropertyValue('--markstream-pre-line-number-top')).toBe('3px')
    }
    finally {
      resolveCreate?.()
      wrapper.unmount()
    }
  })

  it('caps ordinary code block fallback and outer reserve when the estimate exceeds MAX_HEIGHT', async () => {
    const helpers = getStreamMonacoHelpers()
    let resolveCreate: (() => void) | null = null
    helpers.createEditor.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = () => resolve()
        }),
    )

    const code = Array.from({ length: 80 }, (_, index) => `print(${index})`).join('\n')
    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'python',
          code,
          raw: `\`\`\`python\n${code}\n\`\`\``,
        },
        estimatedHeightPx: 1200,
        estimatedContentHeightPx: 1200,
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
      const host = wrapper.get('.code-editor-container').element as HTMLElement
      const block = wrapper.get('.code-block-container').element as HTMLElement
      expect(fallback.style.height).toBe('320px')
      expect(fallback.style.minHeight).toBe('320px')
      expect(fallback.style.maxHeight).toBe('320px')
      expect(fallback.style.overflow).toBe('auto')
      expect(host.style.minHeight).toBe('320px')
      expect(block.style.minHeight).toBe('320px')
    }
    finally {
      resolveCreate?.()
      wrapper.unmount()
    }
  })

  it('does not keep the ordinary block shell taller than a capped scrolling editor', async () => {
    const helpers = getStreamMonacoHelpers()
    helpers.getEditorView.mockReturnValue({
      getModel: () => ({ getLineCount: () => 80 }),
      getOption: () => 18,
      updateOptions: vi.fn(),
      layout: vi.fn(),
      getContentHeight: () => 1200,
      onDidContentSizeChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidLayoutChange: vi.fn(() => ({ dispose: vi.fn() })),
    })

    const code = Array.from({ length: 80 }, (_, index) => `print(${index})`).join('\n')
    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'python',
          code,
          raw: `\`\`\`python\n${code}\n\`\`\``,
        },
        estimatedHeightPx: 1200,
        estimatedContentHeightPx: 1200,
        loading: false,
        stream: true,
        showHeader: false,
        monacoOptions: {
          MAX_HEIGHT: 320,
        },
      },
    })

    await waitForCreateEditorCalls(1, helpers)
    await flushPendingMicrotasks()

    const host = wrapper.get('.code-editor-container').element as HTMLElement
    const block = wrapper.get('.code-block-container').element as HTMLElement
    await vi.waitFor(() => {
      expect(host.style.height).toBe('320px')
      expect(host.style.maxHeight).toBe('320px')
      expect(host.style.overflow).toBe('auto')
      expect(Number.parseFloat(block.style.minHeight || '0')).toBeLessThanOrEqual(320)
    })

    wrapper.unmount()
  })

  it('renders a side-by-side diff fallback while Monaco is mounting', async () => {
    const helpers = getStreamMonacoHelpers()
    let resolveCreate: (() => void) | null = null
    helpers.createDiffEditor.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = () => resolve()
        }),
    )

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '-const oldValue = 1\n+const newValue = 2\n const stable = true',
          diff: true,
          originalCode: 'const oldValue = 1\nconst stable = true',
          updatedCode: 'const newValue = 2\nconst stable = true',
          raw: '```diff\n-const oldValue = 1\n+const newValue = 2\n const stable = true\n```',
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    try {
      await flushPendingMicrotasks()
      await waitForCreateDiffEditorCalls(1, helpers)

      const fallback = wrapper.get('pre.code-pre-fallback')
      const fallbackEl = fallback.element as HTMLElement
      expect(fallback.classes()).toContain('markstream-pre--diff-preview')
      expect(fallback.classes()).not.toContain('markstream-pre--diff-inline')
      expect(fallbackEl.style.height).toBe('')
      expect(fallbackEl.style.minHeight).toBe('36px')
      expect(wrapper.findAll('.markstream-pre__diff-pane')).toHaveLength(2)
      expect(wrapper.findAll('.markstream-pre__diff-pane--original .markstream-pre__diff-content').map(node => node.text())).toEqual([
        'const oldValue = 1',
        'const stable = true',
      ])
      expect(wrapper.findAll('.markstream-pre__diff-pane--modified .markstream-pre__diff-content').map(node => node.text())).toEqual([
        'const newValue = 2',
        'const stable = true',
      ])
      expect(wrapper.findAll('.markstream-pre__diff-pane--original .markstream-pre__diff-number').map(node => node.text())).toEqual(['1', '2'])
      expect(wrapper.findAll('.markstream-pre__diff-pane--modified .markstream-pre__diff-number').map(node => node.text())).toEqual(['1', '2'])
      expect(wrapper.findAll('.markstream-pre__diff-line--removed')).toHaveLength(1)
      expect(wrapper.findAll('.markstream-pre__diff-line--added')).toHaveLength(1)
    }
    finally {
      resolveCreate?.()
      wrapper.unmount()
    }
  })

  it('keeps side-by-side diff fallback stable across streaming frames', async () => {
    const helpers = getStreamMonacoHelpers()
    let resolveCreate: (() => void) | null = null
    helpers.createDiffEditor.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = () => resolve()
        }),
    )

    const frames = [
      '{\n  "name": "markstream-vue",',
      '{\n  "name": "markstream-vue",\n  "type": "module",\n-  "version": "0.0.49",',
      '{\n  "name": "markstream-vue",\n  "type": "module",\n-  "version": "0.0.49",\n+  "version": "0.0.54-beta.1",\n  "packageManager": "pnpm@10.16.1",',
      '{\n  "name": "markstream-vue",\n  "type": "module",\n-  "version": "0.0.49",\n+  "version": "0.0.54-beta.1",\n  "packageManager": "pnpm@10.16.1",\n  "description": "A Vue 3 component",\n}',
    ]
    const toNode = (code: string) => ({
      type: 'code_block',
      language: 'json:package.json',
      code,
      raw: `\`\`\`diff json:package.json\n${code}`,
    })

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: toNode(frames[0]),
        loading: true,
        stream: true,
        showHeader: false,
        monacoOptions: {
          renderSideBySide: true,
          useInlineViewWhenSpaceIsLimited: false,
          MAX_HEIGHT: 500,
        },
      },
    })

    try {
      await flushPendingMicrotasks()
      await waitForCreateDiffEditorCalls(1, helpers)

      let previousHeight = 0
      for (const code of frames) {
        await wrapper.setProps({ node: toNode(code) })
        await flushPendingMicrotasks()

        const fallback = wrapper.get('pre.code-pre-fallback')
        const fallbackEl = fallback.element as HTMLElement
        const panes = wrapper.findAll('.markstream-pre__diff-pane')
        expect(fallback.classes()).toContain('markstream-pre--diff-preview')
        expect(fallback.classes()).not.toContain('markstream-pre--diff-inline')
        expect(panes).toHaveLength(2)
        expect(wrapper.find('.markstream-pre__diff-pane--original').exists()).toBe(true)
        expect(wrapper.find('.markstream-pre__diff-pane--modified').exists()).toBe(true)
        expect(fallbackEl.style.fontSize).toBe('12px')
        expect(fallbackEl.style.lineHeight).toBe('18px')
        expect(fallbackEl.style.maxHeight).toBe('500px')
        expect(fallbackEl.style.overflow).toBe('auto')

        const height = Number.parseFloat(fallbackEl.style.minHeight || fallbackEl.style.height || '0')
        expect(height).toBeGreaterThanOrEqual(previousHeight)
        previousHeight = height
      }

      const originalText = wrapper.find('.markstream-pre__diff-pane--original').text()
      const modifiedText = wrapper.find('.markstream-pre__diff-pane--modified').text()
      expect(originalText).toContain('"version": "0.0.49"')
      expect(modifiedText).toContain('"version": "0.0.54-beta.1"')
      expect(helpers.useMonaco.mock.calls[0]?.[0]?.renderSideBySide).toBe(true)
      expect(helpers.useMonaco.mock.calls[0]?.[0]?.useInlineViewWhenSpaceIsLimited).toBe(false)
    }
    finally {
      resolveCreate?.()
      wrapper.unmount()
    }
  })

  it('caps long streaming diff fallback height at MAX_HEIGHT while Monaco is mounting', async () => {
    const helpers = getStreamMonacoHelpers()
    let resolveCreate: (() => void) | null = null
    helpers.createDiffEditor.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = () => resolve()
        }),
    )

    const originalCode = Array.from({ length: 80 }, (_, index) => `  "old${index}": true`).join('\n')
    const updatedCode = Array.from({ length: 80 }, (_, index) => `  "new${index}": true`).join('\n')

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode,
          updatedCode,
          raw: '```diff json:package.json\n```',
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
      await waitForCreateDiffEditorCalls(1, helpers)

      const fallback = wrapper.get('pre.code-pre-fallback').element as HTMLElement
      expect(fallback.style.height).toBe('320px')
      expect(fallback.style.minHeight).toBe('320px')
      expect(fallback.style.maxHeight).toBe('320px')
      expect(fallback.style.overflow).toBe('auto')
      expect(wrapper.findAll('.markstream-pre__diff-pane')).toHaveLength(2)
    }
    finally {
      resolveCreate?.()
      wrapper.unmount()
    }
  })

  it('uses inline diff fallback when Monaco diff is configured inline', async () => {
    const helpers = getStreamMonacoHelpers()
    let resolveCreate: (() => void) | null = null
    helpers.createDiffEditor.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = () => resolve()
        }),
    )

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '-const oldValue = 1\n+const newValue = 2\n const stable = true',
          diff: true,
          originalCode: 'const oldValue = 1\nconst stable = true',
          updatedCode: 'const newValue = 2\nconst stable = true',
          raw: '```diff\n-const oldValue = 1\n+const newValue = 2\n const stable = true\n```',
        },
        loading: true,
        stream: true,
        showHeader: false,
        monacoOptions: {
          renderSideBySide: false,
          useInlineViewWhenSpaceIsLimited: true,
        },
      },
    })

    try {
      await flushPendingMicrotasks()
      await waitForCreateDiffEditorCalls(1, helpers)

      const fallback = wrapper.get('pre.code-pre-fallback')
      expect(fallback.classes()).toContain('markstream-pre--diff-preview')
      expect(fallback.classes()).toContain('markstream-pre--diff-inline')
      expect(wrapper.findAll('.markstream-pre__diff-pane')).toHaveLength(1)
      expect(wrapper.findAll('.markstream-pre__diff-content').map(node => node.text())).toEqual([
        'const oldValue = 1',
        'const newValue = 2',
        'const stable = true',
      ])
      expect(helpers.useMonaco.mock.calls[0]?.[0]?.renderSideBySide).toBe(false)
    }
    finally {
      resolveCreate?.()
      wrapper.unmount()
    }
  })

  it('sizes inline diff fallback from ordered inline rows when only original and updated sides are available', async () => {
    const helpers = getStreamMonacoHelpers()
    let resolveCreate: (() => void) | null = null
    helpers.createDiffEditor.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = () => resolve()
        }),
    )

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -2 +2 @@',
          diff: true,
          originalCode: 'same before\nold value\nsame after',
          updatedCode: 'same before\nnew value\nsame after',
          raw: '```diff\n@@ -2 +2 @@\n```',
        },
        loading: true,
        stream: true,
        showHeader: false,
        monacoOptions: {
          renderSideBySide: false,
          useInlineViewWhenSpaceIsLimited: true,
        },
      },
    })

    try {
      await flushPendingMicrotasks()
      await waitForCreateDiffEditorCalls(1, helpers)

      const fallback = wrapper.get('pre.code-pre-fallback').element as HTMLElement
      expect(fallback.style.minHeight).toBe('72px')
      expect(wrapper.findAll('.markstream-pre__diff-pane')).toHaveLength(1)
      expect(wrapper.findAll('.markstream-pre__diff-content').map(node => node.text())).toEqual([
        'same before',
        'old value',
        'new value',
        'same after',
      ])
    }
    finally {
      resolveCreate?.()
      wrapper.unmount()
    }
  })

  it('uses the viewport width for the first inline fallback frame before container measurement exists', async () => {
    const helpers = getStreamMonacoHelpers()
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 820,
    })
    let resolveCreate: (() => void) | null = null
    helpers.createDiffEditor.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = () => resolve()
        }),
    )

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '-old\n+new',
          diff: true,
          originalCode: 'old',
          updatedCode: 'new',
          raw: '```diff\n-old\n+new\n```',
        },
        loading: true,
        stream: true,
        showHeader: false,
        monacoOptions: {
          useInlineViewWhenSpaceIsLimited: true,
          renderSideBySideInlineBreakpoint: 900,
        },
      },
    })

    try {
      await flushPendingMicrotasks()
      await waitForCreateDiffEditorCalls(1, helpers)

      expect(wrapper.get('pre.code-pre-fallback').classes()).toContain('markstream-pre--diff-inline')
    }
    finally {
      resolveCreate?.()
      wrapper.unmount()
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: originalInnerWidth,
      })
    }
  })

  it('keeps streaming diff fallback height, font size, and line height monotonic across frames', async () => {
    const helpers = getStreamMonacoHelpers()
    let resolveCreate: (() => void) | null = null
    helpers.createDiffEditor.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = () => resolve()
        }),
    )
    const lines = (count: number, prefix: string) =>
      Array.from({ length: count }, (_, index) => `${prefix} ${index}`).join('\n')

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: lines(6, 'old'),
          updatedCode: lines(6, 'new'),
          raw: '```diff\n-old\n+new',
        },
        loading: true,
        stream: true,
        showHeader: false,
        monacoOptions: {
          MAX_HEIGHT: 500,
        },
      },
    })

    try {
      await flushPendingMicrotasks()
      await waitForCreateDiffEditorCalls(1, helpers)

      const readFallbackMetrics = () => {
        const fallback = wrapper.get('pre.code-pre-fallback').element as HTMLElement
        return {
          minHeight: fallback.style.minHeight,
          fontSize: fallback.style.fontSize,
          lineHeight: fallback.style.lineHeight,
          diffLineHeight: fallback.style.getPropertyValue('--markstream-pre-diff-line-height'),
        }
      }

      expect(readFallbackMetrics()).toEqual({
        minHeight: '108px',
        fontSize: '12px',
        lineHeight: '18px',
        diffLineHeight: '18px',
      })

      await wrapper.setProps({
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: lines(3, 'old'),
          updatedCode: lines(3, 'new'),
          raw: '```diff\n-old\n+new',
        },
      })
      await flushPendingMicrotasks()

      expect(readFallbackMetrics()).toEqual({
        minHeight: '108px',
        fontSize: '12px',
        lineHeight: '18px',
        diffLineHeight: '18px',
      })

      await wrapper.setProps({
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: lines(10, 'old'),
          updatedCode: lines(10, 'new'),
          raw: '```diff\n-old\n+new',
        },
      })
      await flushPendingMicrotasks()

      expect(readFallbackMetrics()).toEqual({
        minHeight: '180px',
        fontSize: '12px',
        lineHeight: '18px',
        diffLineHeight: '18px',
      })

      await wrapper.setProps({
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: lines(4, 'old'),
          updatedCode: lines(4, 'new'),
          raw: '```diff\n-old\n+new',
        },
      })
      await flushPendingMicrotasks()

      expect(readFallbackMetrics()).toEqual({
        minHeight: '180px',
        fontSize: '12px',
        lineHeight: '18px',
        diffLineHeight: '18px',
      })
    }
    finally {
      resolveCreate?.()
      wrapper.unmount()
    }
  })

  it('does not move visible streaming diff fallback lines when Monaco reports later metrics', async () => {
    const helpers = getStreamMonacoHelpers()
    helpers.getEditor.mockReturnValue({
      EditorOption: {
        fontInfo: 'fontInfo',
        lineHeight: 'lineHeight',
      },
    })
    const sideEditor = {
      getModel: () => ({ getLineCount: () => 2 }),
      getOption: vi.fn((option: unknown) => {
        if (option === 'fontInfo')
          return { fontSize: 16 }
        if (option === 'lineHeight')
          return 24
        return undefined
      }),
      updateOptions: vi.fn(),
      layout: vi.fn(),
      onDidContentSizeChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidLayoutChange: vi.fn(() => ({ dispose: vi.fn() })),
    }
    helpers.getDiffEditorView.mockReturnValue({
      getOriginalEditor: () => sideEditor,
      getModifiedEditor: () => sideEditor,
      getLineChanges: () => null,
      onDidUpdateDiff: () => ({ dispose: vi.fn() }),
      getModel: () => ({ getLineCount: () => 2 }),
      getOption: sideEditor.getOption,
      updateOptions: vi.fn(),
      layout: vi.fn(),
    })
    helpers.createDiffEditor.mockImplementation(async (el: HTMLElement) => {
      const root = document.createElement('div')
      root.className = 'monaco-diff-editor'
      el.appendChild(root)
    })

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '{\n  "name":',
          diff: true,
          originalCode: '{\n  "name":',
          updatedCode: '{\n  "name":',
          raw: '```diff json:package.json\n{\n  "name":',
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)
    await flushPendingMicrotasks()

    const fallback = wrapper.get('pre.code-pre-fallback').element as HTMLElement
    expect(fallback.style.fontSize).toBe('12px')
    expect(fallback.style.lineHeight).toBe('18px')
    expect(fallback.style.getPropertyValue('--markstream-pre-diff-line-height')).toBe('18px')

    wrapper.unmount()
  })

  it('forces a diff editor layout after each streaming diff update', async () => {
    const helpers = getStreamMonacoHelpers()
    const diffEditor = helpers.getDiffEditorView() as any

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: 'old',
          updatedCode: 'new',
          raw: '```diff\n-old\n+new\n```',
        },
        loading: true,
        stream: true,
        showHeader: false,
        monacoOptions: {
          renderSideBySide: false,
        },
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)
    await flushPendingMicrotasks()

    helpers.updateDiff.mockClear()
    diffEditor?.layout?.mockClear()

    await wrapper.setProps({
      node: {
        type: 'code_block',
        language: 'diff',
        code: '@@ -1 +1 @@',
        diff: true,
        originalCode: 'old',
        updatedCode: 'newer',
        raw: '```diff\n-old\n+newer\n```',
      },
    })
    await flushPendingMicrotasks()

    expect(helpers.updateDiff).toHaveBeenCalledWith('old', 'newer', 'diff')
    expect(diffEditor?.layout).toHaveBeenCalled()

    wrapper.unmount()
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

  it('keeps the `<pre>` fallback on warm remounts when hosted by an outer virtualizer', async () => {
    const helpers = getStreamMonacoHelpers()

    await expect(preloadCodeBlockRuntime()).resolves.toBe(true)
    expect(isCodeBlockRuntimeReady()).toBe(true)

    let resolveCreate: (() => void) | null = null
    helpers.createEditor.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = () => resolve()
        }),
    )

    const wrapper = mount(CodeBlockNode, {
      global: {
        provide: {
          markstreamHostScrollManaged: ref(true),
        },
      },
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

    resolveCreate?.()
    await flushPendingMicrotasks()

    await vi.waitFor(() => {
      expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(false)
      expect(wrapper.find('.code-editor-container').classes()).not.toContain('is-hidden')
    })

    wrapper.unmount()
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

  it('keeps raw diff fence mid-frames on the diff path before the parser flag arrives', async () => {
    const helpers = getStreamMonacoHelpers()
    let resolveCreate: (() => void) | null = null
    helpers.createDiffEditor.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = () => resolve()
        }),
    )

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'json:package.json',
          code: '{\n  "name": "markstream-vue",',
          raw: '```diff json:package.json\n{\n  "name": "markstream-vue",',
        },
        loading: true,
        stream: true,
        theme: 'vitesse-dark',
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()
    await waitForCreateDiffEditorCalls(1, helpers)

    expect(helpers.createEditor).not.toHaveBeenCalled()
    expect(wrapper.get('.code-block-container').classes()).toContain('is-diff')
    expect(wrapper.get('.code-block-container').classes()).toContain('is-dark')
    expect(wrapper.get('pre.code-pre-fallback').classes()).toContain('markstream-pre--diff-preview')

    helpers.createDiffEditor.mockClear()
    helpers.safeClean.mockClear()

    await wrapper.setProps({
      node: {
        type: 'code_block',
        language: 'json:package.json',
        code: '@@ -1 +1 @@',
        diff: true,
        originalCode: '{\n  "name": "markstream-vue",\n  "version": "0.0.49",',
        updatedCode: '{\n  "name": "markstream-vue",\n  "version": "0.0.54-beta.1",',
        raw: '```diff json:package.json\n{\n  "name": "markstream-vue",\n-  "version": "0.0.49",\n+  "version": "0.0.54-beta.1",',
      },
    })
    await flushPendingMicrotasks()

    expect(helpers.createDiffEditor).not.toHaveBeenCalled()
    expect(helpers.safeClean).not.toHaveBeenCalled()

    resolveCreate?.()
    await flushPendingMicrotasks()
    wrapper.unmount()
  })

  it('reveals a diff editor once Monaco DOM renders even if createDiffEditor stays pending', async () => {
    const helpers = getStreamMonacoHelpers()
    const sideEditor = {
      getModel: () => ({ getLineCount: () => 3 }),
      getOption: () => 18,
      updateOptions: vi.fn(),
      layout: vi.fn(),
      onDidContentSizeChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidLayoutChange: vi.fn(() => ({ dispose: vi.fn() })),
    }
    helpers.getDiffEditorView.mockReturnValue({
      getOriginalEditor: () => sideEditor,
      getModifiedEditor: () => sideEditor,
      getLineChanges: () => null,
      onDidUpdateDiff: () => ({ dispose: vi.fn() }),
      getModel: () => ({ getLineCount: () => 3 }),
      getOption: sideEditor.getOption,
      updateOptions: vi.fn(),
      layout: vi.fn(),
    })
    helpers.createDiffEditor.mockImplementation((el: HTMLElement) => {
      el.innerHTML = `
        <div class="monaco-diff-editor">
          <div class="editor modified">
            <div class="view-lines">
              <div class="view-line">"type": "module"</div>
            </div>
          </div>
        </div>
      `
      return new Promise<void>(() => {})
    })

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'json',
          code: '',
          diff: true,
          originalCode: '{\n  "type": "commonjs"\n}',
          updatedCode: '{\n  "type": "module"\n}',
          raw: '```diff\n-  "type": "commonjs"\n+  "type": "module"\n```',
        },
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)

    await vi.waitFor(() => {
      expect(wrapper.get('[data-markstream-code-block="1"]').attributes('data-markstream-enhanced')).toBe('true')
      expect(wrapper.get('[data-markstream-code-block="1"]').attributes('data-markstream-pending')).toBeUndefined()
      expect(wrapper.find('.code-editor-container').classes()).not.toContain('is-hidden')
    })

    wrapper.unmount()
  })

  it('keeps inline diff fallback visible until Monaco renders deleted rows', async () => {
    const helpers = getStreamMonacoHelpers()
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const hidden = this.style.display === 'none'
      return {
        x: 0,
        y: 0,
        top: 0,
        right: hidden ? 0 : 640,
        bottom: hidden ? 0 : 18,
        left: 0,
        width: hidden ? 0 : 640,
        height: hidden ? 0 : 18,
        toJSON: () => ({}),
      }
    })
    const sideEditor = {
      getModel: () => ({ getLineCount: () => 5 }),
      getOption: () => 18,
      getVisibleRanges: () => [{ startLineNumber: 1, endLineNumber: 5 }],
      updateOptions: vi.fn(),
      layout: vi.fn(),
      onDidContentSizeChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidLayoutChange: vi.fn(() => ({ dispose: vi.fn() })),
    }
    helpers.getDiffEditorView.mockReturnValue({
      getOriginalEditor: () => sideEditor,
      getModifiedEditor: () => sideEditor,
      getLineChanges: () => [{
        originalStartLineNumber: 3,
        originalEndLineNumber: 3,
        modifiedStartLineNumber: 3,
        modifiedEndLineNumber: 3,
      }],
      onDidUpdateDiff: () => ({ dispose: vi.fn() }),
      getModel: () => ({ getLineCount: () => 5 }),
      getOption: sideEditor.getOption,
      updateOptions: vi.fn(),
      layout: vi.fn(),
    })
    let editorHost: HTMLElement | null = null
    helpers.createDiffEditor.mockImplementation((el: HTMLElement) => {
      editorHost = el
      el.innerHTML = `
        <div class="monaco-diff-editor">
          <div class="editor modified">
            <div class="view-lines">
              <div class="view-line">"version": "0.0.54-beta.1",</div>
            </div>
            <div class="view-zones"></div>
          </div>
        </div>
      `
    })

    let wrapper: ReturnType<typeof mount> | null = null
    try {
      wrapper = mount(CodeBlockNode, {
        props: {
          node: {
            type: 'code_block',
            language: 'diff',
            code: '@@ -3 +3 @@',
            diff: true,
            originalCode: '{\n  "name": "markstream-vue",\n  "version": "0.0.49",\n}',
            updatedCode: '{\n  "name": "markstream-vue",\n  "version": "0.0.54-beta.1",\n}',
            raw: '```diff\n{\n  "name": "markstream-vue",\n-  "version": "0.0.49",\n+  "version": "0.0.54-beta.1",\n}\n```',
          },
          loading: false,
          stream: true,
          showHeader: false,
          monacoOptions: {
            renderSideBySide: false,
          },
        },
      })

      await waitForCreateDiffEditorCalls(1, helpers)

      await vi.waitFor(() => {
        expect(wrapper.find('.code-editor-container').classes()).toContain('is-hidden')
        expect(wrapper.find('.markstream-pre__diff-line--removed').text()).toContain('0.0.49')
      })

      editorHost?.querySelector('.editor.modified .view-zones')?.insertAdjacentHTML('beforeend', `
        <div>
          <div class="view-lines line-delete">
            <div class="view-line char-delete">"version": "0.0.49",</div>
          </div>
        </div>
      `)

      await vi.waitFor(() => {
        expect(wrapper.find('.code-editor-container').classes()).not.toContain('is-hidden')
      })

      const nativeDeletedLine = editorHost?.querySelector('.editor.modified .view-lines.line-delete') as HTMLElement | null
      nativeDeletedLine!.style.display = 'none'
      await flushPendingMicrotasks()

      await vi.waitFor(() => {
        expect(wrapper.find('.code-editor-container').classes()).toContain('is-hidden')
        expect(wrapper.find('.markstream-pre__diff-line--removed').text()).toContain('0.0.49')
      })

      nativeDeletedLine!.style.display = ''
      await flushPendingMicrotasks()

      await vi.waitFor(() => {
        expect(wrapper.find('.code-editor-container').classes()).not.toContain('is-hidden')
      })
    }
    finally {
      wrapper?.unmount()
      rectSpy.mockRestore()
    }
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

  it('waits for code before initializing Monaco for a partial streaming fence language', async () => {
    const helpers = getStreamMonacoHelpers()

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'javascri',
          code: '',
          raw: '```javascri',
          loading: true,
        },
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()
    expect(helpers.createEditor).not.toHaveBeenCalled()

    await wrapper.setProps({
      node: {
        type: 'code_block',
        language: 'javascript:electron/main.js',
        code: 'const { app } = require(\'electron\')',
        raw: '```javascript:electron/main.js\nconst { app } = require(\'electron\')',
        loading: true,
      },
    })
    await waitForCreateEditorCalls(1, helpers)

    expect(helpers.createEditor).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      'const { app } = require(\'electron\')',
      'javascript',
    )

    wrapper.unmount()
  })

  it('applies the latest plain text stream update after Monaco creation resolves', async () => {
    const helpers = getStreamMonacoHelpers()
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
          language: 'text',
          code: '',
          raw: '```text',
          loading: true,
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()
    expect(helpers.createEditor).not.toHaveBeenCalled()

    await wrapper.setProps({
      node: {
        type: 'code_block',
        language: 'text',
        code: 'p',
        raw: '```text\np',
        loading: true,
      },
    })
    await waitForCreateEditorCalls(1, helpers)
    expect(helpers.createEditor).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      'p',
      'plaintext',
    )

    await wrapper.setProps({
      node: {
        type: 'code_block',
        language: 'text',
        code: 'plain text content',
        raw: '```text\nplain text content',
        loading: true,
      },
    })
    await flushPendingMicrotasks()
    expect(helpers.updateCode).not.toHaveBeenCalled()

    resolveCreate?.()
    await flushPendingMicrotasks()

    expect(helpers.updateCode).toHaveBeenLastCalledWith(
      'plain text content',
      'plaintext',
    )

    wrapper.unmount()
  })
})

describe('codeBlockNode diff defaults', () => {
  beforeEach(() => {
    resetStreamMonacoHelpers()
  })

  it('does not pass a terminal newline to Monaco diff renders', async () => {
    const helpers = getStreamMonacoHelpers()

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '-old\n+new\n',
          diff: true,
          originalCode: 'old\n',
          updatedCode: 'new\n',
          raw: '```diff\n-old\n+new\n```',
        },
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)

    expect(helpers.createDiffEditor).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      'old',
      'new',
      'diff',
    )

    wrapper.unmount()
  })

  it('keeps inline diff modified editor internals aligned without showing a horizontal scrollbar', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/CodeBlockNode/CodeBlockNode.vue'),
      'utf8',
    )

    expect(source).toContain('stream-monaco-diff-inline .monaco-diff-editor .editor.modified .monaco-editor')
    expect(source).toContain('stream-monaco-diff-inline .monaco-diff-editor .editor.modified .overflow-guard')
    expect(source).toContain('stream-monaco-diff-inline .monaco-diff-editor .editor.modified .monaco-scrollable-element.editor-scrollable')
    expect(source).toContain('stream-monaco-diff-root .monaco-diff-editor:not(.side-by-side) .editor.modified .overflow-guard')
    expect(source).toContain('stream-monaco-diff-root .monaco-diff-editor:not(.side-by-side) .editor.modified .monaco-scrollable-element.editor-scrollable')
    expect(source).toContain('width: calc(100% - var(--stream-monaco-modified-scrollable-left')
    expect(source).toContain('stream-monaco-diff-inline .monaco-diff-editor .scrollbar.horizontal')
    expect(source).toContain('stream-monaco-diff-root .monaco-diff-editor:not(.side-by-side) .scrollbar.horizontal')
    expect(source).toContain('height: 0 !important;')
    expect(source).toContain('--stream-monaco-gutter-marker-width: 4px;')
    expect(source).toContain('--stream-monaco-modified-scrollable-left: var(--stream-monaco-modified-margin-width);')
    expect(source).not.toContain('--stream-monaco-modified-scrollable-left: calc(var(--stream-monaco-modified-margin-width) + 1px);')
  })

  it('keeps the inline diff fallback height pinned during Monaco handoff', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/CodeBlockNode/CodeBlockNode.vue'),
      'utf8',
    )

    const revealStart = source.indexOf('async function revealEditorDisplay()')
    const updateStart = source.indexOf('function updateCollapsedHeight()')
    const renderMeasure = source.indexOf('const renderedDiffHeight = isDiff.value ? measureRenderedDiffHeight(container) : null', updateStart)

    expect(revealStart).toBeGreaterThanOrEqual(0)
    const diffRevealStart = source.indexOf('diffFallbackExitActive.value = true', revealStart)
    const readyWrite = source.indexOf('editorDisplayReady.value = true', diffRevealStart)
    expect(diffRevealStart).toBeGreaterThan(revealStart)
    expect(readyWrite).toBeGreaterThan(revealStart)
    expect(source.slice(revealStart, diffRevealStart)).toContain('syncDiffEditorHostToFallbackHeight()')
    expect(updateStart).toBeGreaterThanOrEqual(0)
    expect(renderMeasure).toBeGreaterThan(updateStart)
    expect(source.slice(updateStart, renderMeasure)).toContain('diffFallbackExitActive.value || diffFallbackFadingOut.value')
    expect(source.slice(updateStart, renderMeasure)).toContain('syncDiffEditorHostToFallbackHeight()')
  })

  it('uses a dark diff fallback surface before Monaco theme variables are available', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/CodeBlockNode/CodeBlockNode.vue'),
      'utf8',
    )

    expect(source).toContain('--markstream-diff-editor-bg: #121212')
    expect(source).toContain('--markstream-diff-editor-fg: #e5e5e5')
    expect(source).toContain('--markstream-diff-added-fg: hsl(152 42% 60%)')
    expect(source).toContain('--markstream-diff-removed-fg: hsl(0 58% 58%)')
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
    expect(monacoOptions.minimap).toEqual({ enabled: false })
    expect(monacoOptions.fontSize).toBeUndefined()
    expect(monacoOptions.lineHeight).toBeUndefined()
    expect(monacoOptions.renderOverviewRuler).toBe(false)
    expect(monacoOptions.overviewRulerBorder).toBe(false)
    expect(monacoOptions.hideCursorInOverviewRuler).toBe(true)
    expect(monacoOptions.scrollBeyondLastLine).toBe(false)
    expect(monacoOptions.wordWrap).toBe('on')
    expect(monacoOptions.diffWordWrap).toBe('off')
    expect(monacoOptions.renderSideBySide).toBe(true)
    expect(monacoOptions.useInlineViewWhenSpaceIsLimited).toBe(false)
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

  it('keeps side-by-side diff word wrapping off unless explicitly configured', async () => {
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
          wordWrap: 'on',
        },
        loading: false,
        showHeader: false,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)

    expect(helpers.useMonaco.mock.calls[0]?.[0]?.wordWrap).toBe('on')
    expect(helpers.useMonaco.mock.calls[0]?.[0]?.diffWordWrap).toBe('off')

    wrapper.unmount()
  })

  it('keeps streaming side-by-side diff fallback unwrapped while Monaco is mounting', async () => {
    const helpers = getStreamMonacoHelpers()
    let resolveCreate: (() => void) | null = null
    helpers.createDiffEditor.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = () => resolve()
        }),
    )
    const description = '  "description": "A Vue 3 component that renders Markdown string content as HTML, supporting custom components and advanced markdown features.",'
    const originalCode = `{\n${description}\n}`
    const updatedCode = `{\n${description}\n}`

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          diff: true,
          originalCode,
          updatedCode,
          raw: `\`\`\`diff\n${originalCode}\n\`\`\``,
        },
        monacoOptions: {
          wordWrap: 'on',
          renderSideBySide: true,
          useInlineViewWhenSpaceIsLimited: false,
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    try {
      await flushPendingMicrotasks()
      await waitForCreateDiffEditorCalls(1, helpers)

      const fallback = wrapper.get('pre.code-pre-fallback')
      expect(fallback.classes()).toContain('markstream-pre--diff-preview')
      expect(fallback.classes()).not.toContain('markstream-pre--diff-inline')
      expect(fallback.classes()).not.toContain('is-wrap')
      expect(wrapper.findAll('.markstream-pre__diff-pane')).toHaveLength(2)
      expect(wrapper.findAll('.markstream-pre__diff-content').filter(node => node.text() === description.trim())).toHaveLength(2)
      expect(helpers.useMonaco.mock.calls[0]?.[0]?.wordWrap).toBe('on')
      expect(helpers.useMonaco.mock.calls[0]?.[0]?.diffWordWrap).toBe('off')
    }
    finally {
      resolveCreate?.()
      wrapper.unmount()
    }
  })

  it('allows callers to opt into diff word wrapping explicitly', async () => {
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
          diffWordWrap: 'on',
        },
        loading: false,
        showHeader: false,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)

    expect(helpers.useMonaco.mock.calls[0]?.[0]?.diffWordWrap).toBe('on')

    wrapper.unmount()
  })

  it('keeps diff word wrapping off after streaming settles', async () => {
    const helpers = getStreamMonacoHelpers()
    const initialDescription = '  "description": "A Vue 3 component that renders Markdown string content as HTML, supporting custom components and advanced markdown fea'
    const completedDescription = '  "description": "A Vue 3 component that renders Markdown string content as HTML, supporting custom components and advanced markdown features.",'
    const initialOriginal = `{\n${initialDescription}`
    const initialUpdated = `{\n${initialDescription}`
    const completedOriginal = `{\n${completedDescription}\n}`
    const completedUpdated = `{\n${completedDescription}\n}`

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          diff: true,
          originalCode: initialOriginal,
          updatedCode: initialUpdated,
          raw: `\`\`\`diff\n${initialOriginal}`,
        },
        monacoOptions: {
          wordWrap: 'on',
          renderSideBySide: true,
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)
    const monacoOptions = helpers.useMonaco.mock.calls[0]?.[0] ?? {}
    expect(monacoOptions.diffWordWrap).toBe('off')
    expect(monacoOptions.diffHideUnchangedRegions).toEqual({
      enabled: false,
      contextLineCount: 2,
      minimumLineCount: 4,
      revealLineCount: 0,
    })

    helpers.refreshDiffPresentation.mockClear()
    helpers.updateDiff.mockClear()

    await wrapper.setProps({
      loading: false,
      node: {
        type: 'code_block',
        language: 'diff',
        diff: true,
        originalCode: completedOriginal,
        updatedCode: completedUpdated,
        raw: `\`\`\`diff\n${completedOriginal}\n\`\`\``,
      },
    })
    await flushPendingMicrotasks()

    await vi.waitFor(() => {
      expect(helpers.refreshDiffPresentation).toHaveBeenCalled()
    })
    expect(helpers.updateDiff).toHaveBeenCalledWith(completedOriginal, completedUpdated, 'diff')
    expect(monacoOptions.diffWordWrap).toBe('off')
    expect(monacoOptions.diffHideUnchangedRegions).toEqual({
      enabled: true,
      contextLineCount: 2,
      minimumLineCount: 4,
      revealLineCount: 5,
    })

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

  it('removes inline diff horizontal scrollbar from Monaco layout while preserving vertical scrollbar options', async () => {
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
        monacoOptions: {
          renderSideBySide: false,
          scrollbar: {
            horizontal: 'visible',
            vertical: 'visible',
            alwaysConsumeMouseWheel: false,
          },
        },
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)

    const monacoOptions = helpers.useMonaco.mock.calls[0]?.[0] ?? {}
    expect(monacoOptions.scrollbar).toEqual({
      horizontal: 'hidden',
      horizontalScrollbarSize: 0,
      vertical: 'visible',
      alwaysConsumeMouseWheel: false,
    })

    wrapper.unmount()
  })

  it('uses the visible diff fallback font family for Monaco when fontFamily is not configured', async () => {
    const helpers = getStreamMonacoHelpers()
    const originalGetComputedStyle = window.getComputedStyle.bind(window)
    const getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) => {
      const style = originalGetComputedStyle(element, pseudoElement)
      if (element instanceof HTMLElement && element.matches('pre.code-pre-fallback')) {
        return new Proxy(style, {
          get(target, property, receiver) {
            if (property === 'fontFamily')
              return '"Probe Mono", monospace'
            return Reflect.get(target, property, receiver)
          },
        })
      }
      return style
    })
    helpers.createDiffEditor.mockImplementation(() => new Promise<void>(() => {}))

    const wrapper = mount(CodeBlockNode, {
      attachTo: document.body,
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
        monacoOptions: {
          renderSideBySide: false,
        },
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)

    const monacoOptions = helpers.useMonaco.mock.calls[0]?.[0] ?? {}
    expect(monacoOptions.fontFamily).toBe('"Probe Mono", monospace')

    wrapper.unmount()
    getComputedStyleSpy.mockRestore()
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

  it('refreshes settled diff presentation without recreating the editor when loading transitions from true to false', async () => {
    const helpers = getStreamMonacoHelpers()
    const diffEditor = helpers.getDiffEditorView() as any

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
    await vi.waitFor(() => {
      expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(false)
    })

    helpers.createDiffEditor.mockClear()
    helpers.safeClean.mockClear()
    helpers.refreshDiffPresentation.mockClear()
    helpers.updateDiff.mockClear()
    diffEditor?.layout?.mockClear()

    await wrapper.setProps({ loading: false })
    await flushPendingMicrotasks()

    await vi.waitFor(() => {
      expect(helpers.refreshDiffPresentation).toHaveBeenCalled()
    })
    expect(helpers.safeClean).not.toHaveBeenCalled()
    expect(helpers.createDiffEditor).not.toHaveBeenCalled()
    expect(helpers.updateDiff).toHaveBeenCalledWith(
      'const a = 1\\nconst b = 2\\n',
      'const a = 1\\nconst c = 3\\n',
      'diff',
    )
    expect(diffEditor?.layout).toHaveBeenCalled()
    expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(false)

    const monacoOptions = helpers.useMonaco.mock.calls[0]?.[0] ?? {}
    expect(monacoOptions.diffHideUnchangedRegions).toEqual({
      enabled: true,
      contextLineCount: 2,
      minimumLineCount: 4,
      revealLineCount: 5,
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
    helpers.createDiffEditor.mockClear()

    await wrapper.setProps({ loading: true })
    await flushPendingMicrotasks()

    await vi.waitFor(() => {
      expect(helpers.refreshDiffPresentation).toHaveBeenCalled()
    })
    const monacoOptions = helpers.useMonaco.mock.calls[0]?.[0] ?? {}
    expect(monacoOptions.diffHideUnchangedRegions).toEqual({
      enabled: false,
      contextLineCount: 2,
      minimumLineCount: 4,
      revealLineCount: 0,
    })
    helpers.refreshDiffPresentation.mockClear()

    await wrapper.setProps({ loading: false })
    await flushPendingMicrotasks()

    expect(helpers.safeClean).not.toHaveBeenCalled()
    expect(helpers.createDiffEditor).not.toHaveBeenCalled()
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

  it('does not shrink the streaming diff host when Monaco reports a smaller partial frame', async () => {
    const helpers = getStreamMonacoHelpers()
    let lineCount = 20
    let contentSizeListener: (() => void) | null = null
    const makeSideEditor = () => ({
      onDidContentSizeChange: vi.fn((listener: () => void) => {
        contentSizeListener = listener
        return { dispose: vi.fn() }
      }),
      onDidLayoutChange: vi.fn(() => ({ dispose: vi.fn() })),
      getModel: vi.fn(() => ({ getLineCount: () => lineCount })),
      getOption: vi.fn(() => 14),
    })
    const diffEditor = {
      getOriginalEditor: vi.fn(() => makeSideEditor()),
      getModifiedEditor: vi.fn(() => makeSideEditor()),
      onDidUpdateDiff: vi.fn(() => ({ dispose: vi.fn() })),
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
          originalCode: Array.from({ length: 20 }, (_, index) => `old ${index}`).join('\n'),
          updatedCode: Array.from({ length: 20 }, (_, index) => `new ${index}`).join('\n'),
          raw: '```diff\n-old\n+new',
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)
    await flushPendingMicrotasks()

    const host = wrapper.get('.code-editor-container').element as HTMLElement
    const initialHeight = Number.parseFloat(host.style.height)
    expect(initialHeight).toBeGreaterThan(300)

    lineCount = 3
    contentSizeListener?.()
    await flushPendingMicrotasks()

    expect(Number.parseFloat(host.style.height)).toBe(initialHeight)

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

  it('keeps inline diff height aligned with the pre fallback bottom padding after Monaco renders', async () => {
    const helpers = getStreamMonacoHelpers()
    const rect = (top: number, height: number, width = 240) => ({
      x: 0,
      y: top,
      width,
      height,
      top,
      left: 0,
      right: width,
      bottom: top + height,
      toJSON: () => ({}),
    }) as DOMRect
    const setRect = (node: Element | null, top: number, height: number, width = 240) => {
      if (!(node instanceof HTMLElement))
        return
      Object.defineProperty(node, 'getBoundingClientRect', {
        configurable: true,
        value: () => rect(top, height, width),
      })
    }
    const makeSideEditor = () => ({
      getModel: () => ({ getLineCount: () => 7 }),
      getOption: () => 18,
      onDidContentSizeChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidLayoutChange: vi.fn(() => ({ dispose: vi.fn() })),
    })
    const diffView = {
      getOriginalEditor: vi.fn(() => makeSideEditor()),
      getModifiedEditor: vi.fn(() => makeSideEditor()),
      onDidUpdateDiff: vi.fn(() => ({ dispose: vi.fn() })),
      getLineChanges: vi.fn(() => []),
      updateOptions: vi.fn(),
      layout: vi.fn(),
    }
    helpers.getDiffEditorView.mockReturnValue(diffView as any)
    helpers.createDiffEditor.mockImplementation(async (el: HTMLElement) => {
      Object.defineProperty(el, 'getBoundingClientRect', {
        configurable: true,
        value: () => rect(0, Number.parseFloat(el.style.height || '') || 154, 480),
      })
      const lines = Array.from({ length: 8 }, () => '<div class="view-line" style="height:18px"></div>').join('')
      el.innerHTML = `
        <div class="monaco-diff-editor">
          <div class="editor original">
            <div class="view-lines">${lines}</div>
          </div>
          <div class="editor modified">
            <div class="view-lines">${lines}</div>
          </div>
        </div>
      `
      setRect(el.querySelector('.monaco-diff-editor'), 0, 154, 480)
      Array.from(el.querySelectorAll('.view-lines .view-line')).forEach((line, index) => {
        setRect(line, (index % 8) * 18, 18)
      })
    })

    const wrapper = mount(CodeBlockNode, {
      attachTo: document.body,
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          diff: true,
          originalCode: '{\\n  "type": "module",\\n  "version": "1.0.1",\\n  "description": "old",\\n  "author": "Simon He",\\n  "license": "MIT",\\n  "homepage": "https://github.com"\\n}',
          updatedCode: '{\\n  "type": "module",\\n  "version": "1.0.1",\\n  "description": "new",\\n  "author": "Simon He",\\n  "license": "MIT",\\n  "homepage": "https://github.com"\\n}',
          code: '',
          raw: '```diff\\n-old\\n+new\\n```',
        },
        loading: false,
        stream: true,
        showHeader: false,
        monacoOptions: {
          renderSideBySide: false,
          padding: { top: 0, bottom: 0 },
        },
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)
    const host = wrapper.get('.code-editor-container').element as HTMLElement
    await vi.waitFor(() => {
      expect(host.style.height).toBe('154px')
    })
    expect(host.style.height).not.toBe('162px')

    wrapper.unmount()
  })

  it('keeps done diff height from collapsing to a partial render after the fallback floor is released', async () => {
    const helpers = getStreamMonacoHelpers()
    let modelLineCount = 1
    let didUpdateDiff: (() => void) | null = null
    const rect = (top: number, height: number, width = 240) => ({
      x: 0,
      y: top,
      width,
      height,
      top,
      left: 0,
      right: width,
      bottom: top + height,
      toJSON: () => ({}),
    }) as DOMRect
    const setRect = (node: Element | null, top: number, height: number, width = 240) => {
      if (!(node instanceof HTMLElement))
        return
      Object.defineProperty(node, 'getBoundingClientRect', {
        configurable: true,
        value: () => rect(top, height, width),
      })
    }
    const makeSideEditor = () => ({
      getModel: () => ({ getLineCount: () => modelLineCount }),
      getOption: () => 18,
      getContentHeight: () => 24,
      layout: vi.fn(),
      onDidContentSizeChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidLayoutChange: vi.fn(() => ({ dispose: vi.fn() })),
    })
    const diffView = {
      getLineChanges: vi.fn(() => []),
      getOriginalEditor: vi.fn(() => makeSideEditor()),
      getModifiedEditor: vi.fn(() => makeSideEditor()),
      onDidUpdateDiff: vi.fn((listener: () => void) => {
        didUpdateDiff = listener
        return { dispose: vi.fn() }
      }),
      updateOptions: vi.fn(),
      layout: vi.fn(),
    }

    helpers.getDiffEditorView.mockReturnValue(diffView as any)
    helpers.createDiffEditor.mockImplementation(async (el: HTMLElement) => {
      Object.defineProperty(el, 'getBoundingClientRect', {
        configurable: true,
        value: () => rect(0, Number.parseFloat(el.style.height || '') || 18, 480),
      })
      el.innerHTML = `
        <div class="monaco-diff-editor">
          <div class="editor original">
            <div class="view-lines">
              <div class="view-line" style="height:18px"></div>
            </div>
          </div>
          <div class="editor modified">
            <div class="view-lines">
              <div class="view-line" style="height:18px"></div>
            </div>
          </div>
          <div class="stream-monaco-diff-unchanged-bridge">39 unmodified lines</div>
        </div>
      `
      setRect(el.querySelector('.monaco-diff-editor'), 0, 18, 480)
      for (const line of Array.from(el.querySelectorAll('.view-lines .view-line')))
        setRect(line, 0, 18)
      setRect(el.querySelector('.stream-monaco-diff-unchanged-bridge'), -1000, 24, 480)
    })

    const wrapper = mount(CodeBlockNode, {
      attachTo: document.body,
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          diff: true,
          originalCode: 'same',
          updatedCode: 'changed',
          code: '',
          raw: '```diff\n-same\n+changed\n```',
        },
        loading: false,
        stream: true,
        showHeader: false,
        monacoOptions: {
          MAX_HEIGHT: 500,
          diffHideUnchangedRegions: true,
        },
      },
    })

    try {
      await waitForCreateDiffEditorCalls(1, helpers)
      const editorHost = wrapper.get('.code-editor-container').element as HTMLElement

      await vi.waitFor(() => {
        expect(didUpdateDiff).toBeTypeOf('function')
        expect(Number.parseFloat(editorHost.style.height || '0')).toBeLessThan(100)
        expect(editorHost.style.minHeight).toBe('0px')
      })

      modelLineCount = 20
      didUpdateDiff?.()
      await flushPendingMicrotasks()

      await vi.waitFor(() => {
        expect(Number.parseFloat(editorHost.style.height || '0')).toBeGreaterThan(300)
      })
    }
    finally {
      wrapper.unmount()
    }
  })

  it('releases diff fallback height floor after unchanged lines are folded', async () => {
    const helpers = getStreamMonacoHelpers()
    const fullFallbackHeight = 41 * 18
    const rect = (top: number, height: number, width = 240) => ({
      x: 0,
      y: top,
      width,
      height,
      top,
      left: 0,
      right: width,
      bottom: top + height,
      toJSON: () => ({}),
    }) as DOMRect
    const setRect = (node: Element | null, top: number, height: number, width = 240) => {
      if (!(node instanceof HTMLElement))
        return
      Object.defineProperty(node, 'getBoundingClientRect', {
        configurable: true,
        value: () => rect(top, height, width),
      })
    }
    const makeSideEditor = () => ({
      getModel: () => ({ getLineCount: () => 41 }),
      getOption: () => 18,
      getContentHeight: () => 80,
      layout: vi.fn(),
      onDidContentSizeChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidLayoutChange: vi.fn(() => ({ dispose: vi.fn() })),
    })
    const diffView = {
      getLineChanges: vi.fn(() => [
        {
          originalStartLineNumber: 4,
          originalEndLineNumber: 4,
          modifiedStartLineNumber: 4,
          modifiedEndLineNumber: 4,
        },
      ]),
      getOriginalEditor: vi.fn(() => makeSideEditor()),
      getModifiedEditor: vi.fn(() => makeSideEditor()),
      onDidUpdateDiff: vi.fn(() => ({ dispose: vi.fn() })),
      updateOptions: vi.fn(),
      layout: vi.fn(),
    }

    helpers.getDiffEditorView.mockReturnValue(diffView as any)
    helpers.createDiffEditor.mockImplementation(async (el: HTMLElement) => {
      Object.defineProperty(el, 'getBoundingClientRect', {
        configurable: true,
        value: () => rect(0, Number.parseFloat(el.style.height || '') || fullFallbackHeight, 480),
      })
      el.innerHTML = `
        <div class="monaco-diff-editor">
          <div class="editor original">
            <div class="view-lines">
              <div class="view-line" style="height:18px"></div>
              <div class="view-line" style="height:18px"></div>
            </div>
            <div class="diff-hidden-lines">
              <div class="center" style="display:block;width:200px;height:28px">
                <div>39 unmodified lines</div>
              </div>
            </div>
          </div>
          <div class="editor modified">
            <div class="view-lines">
              <div class="view-line" style="height:18px"></div>
              <div class="view-line" style="height:18px"></div>
            </div>
            <div class="diff-hidden-lines">
              <div class="center" style="display:block;width:200px;height:28px">
                <div>39 unmodified lines</div>
              </div>
            </div>
          </div>
        </div>
      `

      setRect(el.querySelector('.monaco-diff-editor'), 0, 64, 480)
      for (const [index, line] of Array.from(el.querySelectorAll('.view-lines .view-line')).entries())
        setRect(line, index % 2 === 0 ? 0 : 18, 18)
      for (const hiddenLines of Array.from(el.querySelectorAll('.diff-hidden-lines')))
        setRect(hiddenLines, 36, 28)
      for (const center of Array.from(el.querySelectorAll('.diff-hidden-lines .center')))
        setRect(center, 36, 28, 200)
    })

    const wrapper = mount(CodeBlockNode, {
      attachTo: document.body,
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          diff: true,
          originalCode: Array.from({ length: 41 }, (_, i) => `same ${i}`).join('\n'),
          updatedCode: Array.from({ length: 41 }, (_, i) => i === 3 ? `changed ${i}` : `same ${i}`).join('\n'),
          code: '',
          raw: '```diff\n...\n```',
        },
        loading: false,
        stream: true,
        showHeader: false,
        monacoOptions: {
          MAX_HEIGHT: 500,
          diffHideUnchangedRegions: true,
        },
      },
    })

    try {
      await waitForCreateDiffEditorCalls(1, helpers)
      const editorHost = wrapper.get('.code-editor-container').element as HTMLElement

      await vi.waitFor(() => {
        expect(Number.parseFloat(editorHost.style.height || '0')).toBeGreaterThan(0)
      })

      await vi.waitFor(() => {
        const height = Number.parseFloat(editorHost.style.height || '0')
        const minHeight = Number.parseFloat(editorHost.style.minHeight || '0')

        expect(height).toBeLessThan(500)
        expect(minHeight).toBe(0)
      })
    }
    finally {
      wrapper.unmount()
    }
  })

  it('recovers folded diff height after the host briefly collapses to zero', async () => {
    const helpers = getStreamMonacoHelpers()
    let didUpdateDiff: (() => void) | null = null
    const rect = (top: number, height: number, width = 240) => ({
      x: 0,
      y: top,
      width,
      height,
      top,
      left: 0,
      right: width,
      bottom: top + height,
      toJSON: () => ({}),
    }) as DOMRect
    const setRect = (node: Element | null, top: number, height: number, width = 240) => {
      if (!(node instanceof HTMLElement))
        return
      Object.defineProperty(node, 'getBoundingClientRect', {
        configurable: true,
        value: () => rect(top, height, width),
      })
    }
    const makeSideEditor = () => ({
      getModel: () => ({ getLineCount: () => 1 }),
      getOption: () => 18,
      getContentHeight: () => 24,
      layout: vi.fn(),
      onDidContentSizeChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidLayoutChange: vi.fn(() => ({ dispose: vi.fn() })),
    })
    const diffView = {
      getLineChanges: vi.fn(() => []),
      getOriginalEditor: vi.fn(() => makeSideEditor()),
      getModifiedEditor: vi.fn(() => makeSideEditor()),
      onDidUpdateDiff: vi.fn((listener: () => void) => {
        didUpdateDiff = listener
        return { dispose: vi.fn() }
      }),
      updateOptions: vi.fn(),
      layout: vi.fn(),
    }

    helpers.getDiffEditorView.mockReturnValue(diffView as any)
    helpers.createDiffEditor.mockImplementation(async (el: HTMLElement) => {
      Object.defineProperty(el, 'getBoundingClientRect', {
        configurable: true,
        value: () => {
          const parsedHeight = Number.parseFloat(el.style.height || '')
          return rect(0, Number.isFinite(parsedHeight) ? parsedHeight : 24, 480)
        },
      })
      el.innerHTML = `
        <div class="monaco-diff-editor">
          <div class="editor original">
            <div class="view-lines">
              <div class="view-line" style="height:18px"></div>
            </div>
          </div>
          <div class="editor modified">
            <div class="view-lines">
              <div class="view-line" style="height:18px"></div>
            </div>
          </div>
        </div>
      `
      setRect(el.querySelector('.monaco-diff-editor'), 0, 24, 480)
      for (const line of Array.from(el.querySelectorAll('.view-lines .view-line')))
        setRect(line, 0, 18)
    })

    const wrapper = mount(CodeBlockNode, {
      attachTo: document.body,
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          diff: true,
          originalCode: 'same',
          updatedCode: 'changed',
          code: '',
          raw: '```diff\n-same\n+changed\n```',
        },
        loading: false,
        stream: true,
        showHeader: false,
        monacoOptions: {
          MAX_HEIGHT: 500,
          diffHideUnchangedRegions: true,
        },
      },
    })

    try {
      await waitForCreateDiffEditorCalls(1, helpers)
      const editorHost = wrapper.get('.code-editor-container').element as HTMLElement

      await vi.waitFor(() => {
        expect(wrapper.get('[data-markstream-code-block="1"]').attributes('data-markstream-enhanced')).toBe('true')
        expect(Number.parseFloat(editorHost.style.height || '0')).toBeGreaterThan(0)
      })
      await flushPendingMicrotasks()

      editorHost.style.height = '0px'
      editorHost.style.minHeight = '0px'
      const diffRoot = editorHost.querySelector('.monaco-diff-editor')
      if (diffRoot instanceof HTMLElement) {
        diffRoot.innerHTML = `
          <div class="editor original">
            <div class="view-lines">
              <div class="view-line" style="height:18px"></div>
              <div class="view-line" style="height:18px"></div>
            </div>
            <div class="diff-hidden-lines">
              <div class="center" style="display:block;width:200px;height:28px">
                <div>39 unmodified lines</div>
              </div>
            </div>
          </div>
          <div class="editor modified">
            <div class="view-lines">
              <div class="view-line" style="height:18px"></div>
              <div class="view-line" style="height:18px"></div>
            </div>
            <div class="diff-hidden-lines">
              <div class="center" style="display:block;width:200px;height:28px">
                <div>39 unmodified lines</div>
              </div>
            </div>
          </div>
        `
        setRect(diffRoot, 0, 0, 480)
        for (const [index, line] of Array.from(diffRoot.querySelectorAll('.view-lines .view-line')).entries())
          setRect(line, index % 2 === 0 ? 0 : 18, 18)
        for (const hiddenLines of Array.from(diffRoot.querySelectorAll('.diff-hidden-lines')))
          setRect(hiddenLines, 36, 28)
        for (const center of Array.from(diffRoot.querySelectorAll('.diff-hidden-lines .center')))
          setRect(center, 36, 28, 200)
      }

      didUpdateDiff?.()
      await flushPendingMicrotasks()

      await vi.waitFor(() => {
        expect(Number.parseFloat(editorHost.style.height || '0')).toBe(64)
      })
    }
    finally {
      wrapper.unmount()
    }
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
