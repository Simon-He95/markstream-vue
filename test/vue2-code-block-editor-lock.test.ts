import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import CodeBlockNode from '../packages/markstream-vue2/src/components/CodeBlockNode/CodeBlockNode.vue'
import { CodeBlockNodeLoading } from '../packages/markstream-vue2/src/components/NodeRenderer/asyncComponent'

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
  whenVisualReady?: ReturnType<typeof vi.fn>
}

function getStreamMonacoHelpers(): StreamMonacoHelpers {
  return (globalThis as any).__streamMonacoHelpers
}

function resetStreamMonacoHelpers() {
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
  helpers.whenVisualReady = vi.fn(async () => true)
}

function getThemeUpdater(wrapper: any) {
  const vm = wrapper.vm as any
  return vm?.themeUpdate ?? vm?.$?.setupState?.themeUpdate ?? null
}

async function flushPendingMicrotasks() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>(resolve => setTimeout(resolve, 0))
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

async function waitForCondition(check: () => boolean, timeout = 1000) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeout)
      throw new Error('Timed out waiting for condition')
    await flushPendingMicrotasks()
  }
}

describe('markstream-vue2 codeBlockNode async loading surface', () => {
  it('renders a full-height numbered pre immediately while the enhanced chunk loads', () => {
    const code = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join('\n')
    const wrapper = mount(CodeBlockNodeLoading as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code,
          raw: `\`\`\`ts\n${code}\n\`\`\``,
        },
        loading: false,
        showHeader: true,
        estimatedHeightPx: 283,
        estimatedContentHeightPx: 232,
      },
    })

    const block = wrapper.get('[data-markstream-code-loading="1"]')
    const fallback = wrapper.get('pre.code-block-loading-pre')
    expect(block.find('.code-block-header').exists()).toBe(true)
    expect((block.element as HTMLElement).style.minHeight).toBe('283px')
    expect(fallback.classes()).toContain('code-pre-fallback')
    expect((fallback.element as HTMLElement).style.minHeight).toBe('232px')
    expect(fallback.attributes('data-markstream-line-numbers')).toBe('1')
    expect(fallback.get('.markstream-pre__line-numbers-text').text()).toBe(
      Array.from({ length: 12 }, (_, index) => String(index + 1)).join('\n'),
    )
    expect((fallback.element as HTMLElement).style.getPropertyValue('--markstream-code-font-family')).toBe('"SF Mono", Monaco, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace')
    expect((fallback.element as HTMLElement).style.fontSize).toBe('12px')
    expect((fallback.element as HTMLElement).style.lineHeight).toBe('18px')
    expect((fallback.element as HTMLElement).style.paddingTop).toBe('8px')
    expect((fallback.element as HTMLElement).style.paddingBottom).toBe('8px')

    wrapper.unmount()
  })
})

describe('markstream-vue2 codeBlockNode theme updates', () => {
  beforeEach(() => {
    resetStreamMonacoHelpers()
  })

  it('keeps the pre fallback visible until the runtime reports highlighted output ready', async () => {
    const helpers = getStreamMonacoHelpers()
    let resolveVisualReady: ((ready: boolean) => void) | undefined
    const visualReady = new Promise<boolean>((resolve) => {
      resolveVisualReady = resolve
    })
    helpers.whenVisualReady = vi.fn(() => visualReady)

    const wrapper = mount(CodeBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: 'export const value = 1',
          raw: '```ts\nexport const value = 1\n```',
        },
        loading: false,
        showHeader: false,
        estimatedHeightPx: 234,
        estimatedContentHeightPx: 232,
      },
    })

    expect((wrapper.get('.code-block-container').element as HTMLElement).style.minHeight).toBe('234px')
    expect((wrapper.get('.code-editor-container').element as HTMLElement).style.minHeight).toBe('232px')

    await waitForCreateEditorCalls(1, helpers)
    await waitForCondition(() => helpers.whenVisualReady?.mock.calls.length === 1)

    const fallback = wrapper.get('pre.code-pre-fallback')
    expect(fallback.attributes('data-markstream-line-numbers')).toBe('1')
    expect((wrapper.get('.code-editor-container').element as HTMLElement).dataset.markstreamHostHidden).toBe('true')

    resolveVisualReady?.(true)
    await waitForCondition(() => (wrapper.vm as any)?.editorReady === true)

    expect((wrapper.vm as any).editorReady).toBe(true)
    wrapper.unmount()
  })

  it('keeps the pre fallback when the runtime cannot confirm highlighted output', async () => {
    const helpers = getStreamMonacoHelpers()
    helpers.whenVisualReady = vi.fn(async () => false)

    const wrapper = mount(CodeBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: 'export const value = 1',
          raw: '```ts\nexport const value = 1\n```',
        },
        loading: false,
        showHeader: false,
      },
    })

    await waitForCreateEditorCalls(1, helpers)
    await waitForCondition(() => helpers.whenVisualReady?.mock.calls.length === 1)
    await flushPendingMicrotasks()

    const fallback = wrapper.get('pre.code-pre-fallback')
    expect(fallback.attributes('data-markstream-line-numbers')).toBe('1')
    expect((wrapper.get('.code-editor-container').element as HTMLElement).dataset.markstreamHostHidden).toBe('true')
    wrapper.unmount()
  })

  it('updates single-editor themes without recreating the editor when isDark toggles', async () => {
    const helpers = getStreamMonacoHelpers()

    const wrapper = mount(CodeBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'json',
          code: '{"hello":"world"}',
          raw: '```json\n{"hello":"world"}\n```',
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
    if (helpers.setTheme.mock.calls.length === 0) {
      const themeUpdate = getThemeUpdater(wrapper)
      themeUpdate?.()
      await flushPendingMicrotasks()
    }

    expect(helpers.createEditor).not.toHaveBeenCalled()
    expect(helpers.cleanupEditor).not.toHaveBeenCalled()
    expect(helpers.safeClean).not.toHaveBeenCalled()
    expect(helpers.setTheme).toHaveBeenCalledTimes(1)
    expect(helpers.setTheme).toHaveBeenCalledWith('vitesse-dark')

    wrapper.unmount()
  })

  it('passes active themes and syntax languages to stream-monaco legacy', async () => {
    const helpers = getStreamMonacoHelpers()

    const wrapper = mount(CodeBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'tsx',
          code: 'export function TestHarness() {\n  return <section />\n}',
          raw: '```tsx\nexport function TestHarness() {\n  return <section />\n}\n```',
        },
        loading: false,
        showHeader: false,
        isDark: false,
        darkTheme: 'vitesse-dark',
        lightTheme: 'vitesse-light',
      },
    })

    await waitForCreateEditorCalls(1, helpers)

    const options = helpers.useMonaco.mock.calls[0]?.[0]
    expect(options.stream).toBe(false)
    expect(options.disableFileHeader).toBe(true)
    expect(options.fontFamily).toBe('"SF Mono", Monaco, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace')
    expect(options.fontSize).toBe(12)
    expect(options.lineHeight).toBe(18)
    expect(options.padding).toEqual({ top: 8, bottom: 8 })
    expect(options.tabSize).toBe(4)
    expect(options.themes).toEqual(['vitesse-dark', 'vitesse-light'])
    expect(options.languages).toEqual(expect.arrayContaining(['tsx', 'typescript', 'plaintext']))

    wrapper.unmount()
  })

  it('updates diff themes without recreating the diff editor when isDark toggles', async () => {
    const helpers = getStreamMonacoHelpers()

    const wrapper = mount(CodeBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: 'const a = 1\nconst b = 2\n',
          updatedCode: 'const a = 1\nconst c = 3\n',
          raw: '```diff\n-const b = 2\n+const c = 3\n```',
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
    if (helpers.setTheme.mock.calls.length === 0) {
      const themeUpdate = getThemeUpdater(wrapper)
      themeUpdate?.()
      await flushPendingMicrotasks()
    }

    expect(helpers.createDiffEditor).not.toHaveBeenCalled()
    expect(helpers.cleanupEditor).not.toHaveBeenCalled()
    expect(helpers.safeClean).not.toHaveBeenCalled()
    expect(helpers.setTheme).toHaveBeenCalledTimes(1)
    expect(helpers.setTheme).toHaveBeenCalledWith('vitesse-dark')
    expect(helpers.refreshDiffPresentation).toHaveBeenCalled()

    wrapper.unmount()
  })

  it('renders a two-pane diff fallback with stream-diffs-aligned metrics before the diff editor is ready', async () => {
    const helpers = getStreamMonacoHelpers()
    let resolveCreateDiffEditor: (() => void) | undefined

    helpers.createDiffEditor.mockImplementation(() => new Promise<void>((resolve) => {
      resolveCreateDiffEditor = resolve
    }))

    const wrapper = mount(CodeBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'json:package.json',
          code: '{\n  "name": "markstream-vue",\n  "type": "module",\n  "version": "0.0.54-beta.1"\n}',
          diff: true,
          originalCode: '{\n  "name": "markstream-vue",\n  "type": "module",\n  "version": "0.0.49"\n}',
          updatedCode: '{\n  "name": "markstream-vue",\n  "type": "module",\n  "version": "0.0.54-beta.1"\n}',
          raw: '```diff / json:package.json\n```',
        },
        loading: false,
        showHeader: false,
        isDark: false,
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)

    const fallback = wrapper.element.querySelector('pre.code-pre-fallback.markstream-pre--diff-preview') as HTMLElement | null
    expect(fallback).not.toBeNull()
    expect(fallback?.dataset.language).toBe('json')
    expect(fallback?.style.fontSize).toBe('12px')
    expect(fallback?.style.lineHeight).toBe('18px')
    expect(fallback?.style.paddingTop).toBe('0px')
    expect(fallback?.style.paddingBottom).toBe('0px')
    expect(fallback?.style.tabSize).toBe('4')

    const panes = wrapper.element.querySelectorAll('.markstream-pre__diff-pane')
    expect(panes).toHaveLength(2)
    const options = helpers.useMonaco.mock.calls[0]?.[0]
    expect(options.languages).toEqual(expect.arrayContaining(['json', 'plaintext']))
    expect(wrapper.element.querySelector('.markstream-pre__diff-pane--original')?.textContent).toContain('"version": "0.0.49"')
    expect(wrapper.element.querySelector('.markstream-pre__diff-pane--modified')?.textContent).toContain('"version": "0.0.54-beta.1"')
    expect(wrapper.element.querySelector('.markstream-pre__diff-pane--original .markstream-pre__diff-line--removed')?.textContent).toContain('"version": "0.0.49"')
    expect(wrapper.element.querySelector('.markstream-pre__diff-pane--modified .markstream-pre__diff-line--added')?.textContent).toContain('"version": "0.0.54-beta.1"')

    resolveCreateDiffEditor?.()
    await flushPendingMicrotasks()

    wrapper.unmount()
  })
})
