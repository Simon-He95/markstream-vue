import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import CodeBlockNode from '../src/components/CodeBlockNode/CodeBlockNode.vue'
import { resetCodeBlockRuntimeReadyForTest } from '../src/components/CodeBlockNode/runtime'

function getStreamMonacoHelpers() {
  return (globalThis as any).__streamMonacoHelpers
}

function resetHelpers() {
  resetCodeBlockRuntimeReadyForTest()
  const helpers = getStreamMonacoHelpers()
  const makeEditorView = () => ({
    getModel: () => ({ getLineCount: () => 1 }),
    getOption: () => 18,
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
}

describe('diff CodeBlockNode fallback height stability', () => {
  beforeEach(() => {
    resetHelpers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('does not create an editor host observer while a diff is streaming', async () => {
    const observations: Array<{ options: MutationObserverInit, target: Node }> = []
    vi.stubGlobal('MutationObserver', class {
      constructor(_callback: MutationCallback) {}

      observe(target: Node, options: MutationObserverInit) {
        observations.push({ options, target })
      }

      disconnect() {}
    })

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: '',
          raw: '',
          diff: true,
          originalCode: 'const a = 1',
          updatedCode: 'const a = 2',
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    const hostObservation = observations.find(({ target }) =>
      (target as HTMLElement).classList?.contains('code-editor-container'),
    )
    expect(hostObservation).toBeUndefined()

    wrapper.unmount()
  })

  it('keeps diff fallback height owned by its rendered rows when an estimate is set', async () => {
    const helpers = getStreamMonacoHelpers()
    // Hold createDiffEditor so Monaco is never "ready" during this test
    helpers.createDiffEditor.mockImplementation(() => new Promise<void>(() => {}))

    const originalCode = 'const a = 1\nconst b = 2\nconst c = 3\n'
    const updatedCode = 'const a = 1\nconst b = 99\nconst c = 3\n'

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: '',
          raw: '',
          diff: true,
          originalCode,
          updatedCode,
        },
        // Simulate virtual scroll passing an estimated height
        estimatedContentHeightPx: 240,
        estimatedHeightPx: 280,
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    const pre = wrapper.find('pre.code-pre-fallback')
    expect(pre.exists()).toBe(true)

    expect((pre.element as HTMLElement).style.minHeight).toBe('')

    wrapper.unmount()
  })

  it('keeps the default diff fallback padding aligned with the final surface', async () => {
    const helpers = getStreamMonacoHelpers()
    helpers.createDiffEditor.mockImplementation(() => new Promise<void>(() => {}))

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '',
          raw: '',
          diff: true,
          originalCode: 'const a = 1',
          updatedCode: 'const a = 2',
        },
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    const pre = wrapper.get('pre.code-pre-fallback').element as HTMLElement
    expect(pre.style.paddingTop).toBe('0px')
    expect(pre.style.paddingBottom).toBe('0px')
    expect(helpers.useMonaco.mock.calls[0]?.[0]?.padding).toEqual({ top: 0, bottom: 0 })

    wrapper.unmount()
  })

  it('does not reserve the full source height for a folded diff fallback', async () => {
    const helpers = getStreamMonacoHelpers()
    helpers.createDiffEditor.mockImplementation(() => new Promise<void>(() => {}))

    const tenLines = Array.from({ length: 10 }, (_, i) => `const x${i} = ${i}`).join('\n')
    const twoLines = 'const a = 1\nconst b = 2'

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: '',
          raw: '',
          diff: true,
          originalCode: tenLines,
          updatedCode: twoLines,
        },
        // A large estimate must not force the fallback to its full source height.
        estimatedContentHeightPx: 500,
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    const pre = wrapper.find('pre.code-pre-fallback')
    expect(pre.exists()).toBe(true)

    expect((pre.element as HTMLElement).style.minHeight).toBe('')

    wrapper.unmount()
  })

  it('releases the fallback height when unchanged diff rows are folded', async () => {
    const helpers = getStreamMonacoHelpers()
    helpers.createDiffEditor.mockImplementation(() => new Promise<void>(() => {}))
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const height = this.matches('pre.code-pre-fallback') ? 360 : 0
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: height,
        width: 0,
        height,
        toJSON: () => ({}),
      } as DOMRect
    })

    const unchanged = Array.from({ length: 24 }, (_, index) => `const shared${index} = ${index}`).join('\n')
    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: '',
          raw: '',
          diff: true,
          originalCode: `const before = true\n${unchanged}`,
          updatedCode: `const after = true\n${unchanged}`,
        },
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    const pre = wrapper.get('pre.code-pre-fallback')
    expect(pre.classes()).toContain('markstream-pre--diff-collapsed')
    expect((pre.element as HTMLElement).style.height).toBe('')
    expect((pre.element as HTMLElement).style.minHeight).toBe('')

    wrapper.unmount()
  })

  it('does not reserve an extra side-by-side diff fallback row for terminal newline', async () => {
    const helpers = getStreamMonacoHelpers()
    helpers.createDiffEditor.mockImplementation(() => new Promise<void>(() => {}))

    const patch = [
      '{',
      '  "dependencies": {',
      '-   "stream-monaco": "^0.0.45",',
      '+   "stream-monaco": "link:~/Github/stream-monaco",',
      '    "tailwind-merge": "^3.6.0"',
      '  }',
      '}',
      '',
    ].join('\n')

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff ts:package.json',
          code: patch,
          raw: '',
          diff: true,
        },
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    const pre = wrapper.find('pre.code-pre-fallback')
    expect(pre.exists()).toBe(true)
    expect(wrapper.findAll('.markstream-pre__diff-pane--original .markstream-pre__diff-line')).toHaveLength(6)
    expect(wrapper.findAll('.markstream-pre__diff-pane--modified .markstream-pre__diff-line')).toHaveLength(6)
    expect((pre.element as HTMLElement).style.minHeight).toBe('')

    wrapper.unmount()
  })

  it('does not stretch a near-max side-by-side diff fallback with empty space', async () => {
    const helpers = getStreamMonacoHelpers()
    helpers.createDiffEditor.mockImplementation(() => new Promise<void>(() => {}))

    const patch = [
      'const diffCodeBlockMonacoOptions = computed<CodeBlockMonacoOptions>(() => ({',
      '  ...codeBlockMonacoOptions.value,',
      '  padding: { top: 0, bottom: 0 },',
      '-lineDecorationsWidth: 0,',
      '+lineDecorationsWidth: 4,',
      '  glyphMargin: false,',
      '  wordWrap: "off",',
      '  renderSideBySide: false,',
      '  margin: 0,',
      '  padding: 0,',
      '  overflow-x: auto,',
      '+ --context-panel-diff-gutter-marker-width: 4px;',
      '+ --context-panel-diff-line-number-width: 15.6px;',
      '+ --context-panel-diff-line-number-padding-left: 15.6px;',
      '+ --context-panel-diff-line-number-padding-right: 7.8px;',
      '+ --context-panel-diff-line-number-gap-to-code: 7.8px;',
      '+ --context-panel-diff-code-padding-left: 0px;',
      '+ --context-panel-diff-line-number-box-width: calc(var(--context-panel-diff-line-number-padding-left) + var(--context-panel-diff-line-number-width) + var(--context-panel-diff-line-number-padding-right));',
      '+ --context-panel-diff-content-left: calc(var(--context-panel-diff-gutter-marker-width) + var(--context-panel-diff-line-number-box-width) + var(--context-panel-diff-line-number-gap-to-code));',
      '+ --context-panel-diff-right-reserve-width: 7.8px;',
      '+ --stream-monaco-gutter-marker-width: var(--context-panel-diff-gutter-marker-width);',
      '+ --stream-monaco-line-number-left: var(--context-panel-diff-gutter-marker-width);',
      '+ --stream-monaco-line-number-width: var(--context-panel-diff-line-number-width);',
      '+ --stream-monaco-line-number-padding-left: var(--context-panel-diff-line-number-padding-left);',
      '+ --stream-monaco-line-number-padding-right: var(--context-panel-diff-line-number-padding-right);',
      '+ --stream-monaco-line-number-gap-to-code: var(--context-panel-diff-line-number-gap-to-code);',
      '}))',
    ].join('\n')

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff ts:DiffView.vue',
          code: patch,
          raw: '',
          diff: true,
        },
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    const pre = wrapper.find('pre.code-pre-fallback')
    expect(pre.exists()).toBe(true)
    expect((pre.element as HTMLElement).style.height).toBe('')
    expect((pre.element as HTMLElement).style.minHeight).toBe('')

    wrapper.unmount()
  })

  it('diff fallback is visible before Monaco diff editor becomes ready', async () => {
    const helpers = getStreamMonacoHelpers()
    helpers.createDiffEditor.mockImplementation(() => new Promise<void>(() => {}))

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: '',
          raw: '',
          diff: true,
          originalCode: 'const a = 1',
          updatedCode: 'const a = 2',
        },
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    // Fallback pre must be visible (not hidden) while Monaco hasn't loaded
    const pre = wrapper.find('pre.code-pre-fallback')
    expect(pre.exists()).toBe(true)
    expect(pre.isVisible()).toBe(true)

    wrapper.unmount()
  })
})
