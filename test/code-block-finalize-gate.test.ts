import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick } from 'vue'
import CodeBlockNode from '../src/components/CodeBlockNode/CodeBlockNode.vue'
import { resetCodeBlockRuntimeReadyForTest } from '../src/components/CodeBlockNode/runtime'
import { provideOffscreenHeavyNodeDeferral, provideViewportPriority } from '../src/composables/viewportPriority'

interface VisibilityObserver {
  emit: () => void
  options: IntersectionObserverInit
}

const observers: VisibilityObserver[] = []

class IntersectionObserverStub {
  private target?: Element

  constructor(
    private callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit = {},
  ) {
    observers.push({
      options,
      emit: () => {
        if (!this.target)
          return
        this.callback([
          {
            target: this.target,
            isIntersecting: true,
            intersectionRatio: 1,
          } as IntersectionObserverEntry,
        ], this as unknown as IntersectionObserver)
      },
    })
  }

  observe(target: Element) {
    this.target = target
  }

  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}

function helpers() {
  return (globalThis as any).__streamMonacoHelpers
}

function installFinalDiffsDom(container: HTMLElement) {
  const surface = document.createElement('diffs-container')
  surface.textContent = 'final diffs surface'
  container.replaceChildren(surface)
}

function resetHelpers() {
  resetCodeBlockRuntimeReadyForTest()
  const runtime = helpers()
  const editorView = {
    getModel: () => ({ getValue: () => '', getLineCount: () => 1 }),
    getOption: () => 14,
    updateOptions: vi.fn(),
    layout: vi.fn(),
    getContentHeight: () => 18,
  }

  runtime.useMonaco.mockReset().mockImplementation(() => runtime)
  runtime.createEditor.mockReset().mockImplementation(async (container: HTMLElement) => {
    installFinalDiffsDom(container)
  })
  runtime.createDiffEditor.mockReset().mockImplementation(async (container: HTMLElement) => {
    installFinalDiffsDom(container)
  })
  runtime.updateCode.mockReset()
  runtime.updateDiff.mockReset()
  runtime.getEditor.mockReset().mockReturnValue(null)
  runtime.getEditorView.mockReset().mockReturnValue(editorView)
  runtime.getDiffEditorView.mockReset().mockReturnValue({
    ...editorView,
    getLineChanges: () => [],
    getOriginalEditor: () => editorView,
    getModifiedEditor: () => editorView,
  })
  runtime.cleanupEditor.mockReset()
  runtime.safeClean.mockReset()
  runtime.refreshDiffPresentation.mockReset()
  runtime.setTheme.mockReset()
  runtime.whenVisualReady = undefined
}

async function flush() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

function makeNode(code: string, loading: boolean) {
  return {
    type: 'code_block' as const,
    language: 'typescript',
    code,
    raw: `\`\`\`typescript\n${code}\n\`\`\``,
    loading,
  }
}

const DeferredCodeBlockNode = defineComponent({
  inheritAttrs: false,
  setup(_props, { attrs }) {
    provideOffscreenHeavyNodeDeferral(computed(() => true))
    provideViewportPriority(() => null, true)
    return () => h(CodeBlockNode as any, attrs)
  },
})

describe('codeBlockNode final Diffs gate', () => {
  beforeEach(() => {
    observers.length = 0
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
    resetHelpers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps a streaming block in pre even after it becomes visible', async () => {
    const runtime = helpers()
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const first = true', true),
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await flush()
    expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(true)
    expect(wrapper.get('[data-markstream-code-block="1"]').attributes('data-markstream-code-block-state')).toBe('streaming')
    expect(runtime.useMonaco).not.toHaveBeenCalled()
    expect(runtime.createEditor).not.toHaveBeenCalled()
    expect(observers.at(-1)?.options.rootMargin).toBe('0px')

    observers.at(-1)?.emit()
    await flush()
    expect(runtime.useMonaco).not.toHaveBeenCalled()
    expect(runtime.createEditor).not.toHaveBeenCalled()

    await wrapper.setProps({
      node: makeNode('const second = true', true),
      loading: true,
    })
    await flush()
    expect(runtime.createEditor).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('const second = true')
    wrapper.unmount()
  })

  it('sizes the fallback gutter to the digit width as the pending fallback grows', async () => {
    const makeCode = (lineCount: number) => Array.from({ length: lineCount }, (_, index) => `const line${index + 1} = ${index + 1}`).join('\n')
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode(makeCode(9), true),
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await flush()

    const pre = wrapper.get('pre.code-pre-fallback').element as HTMLElement
    const expectedWidths: Array<[number, string]> = [
      [9, '2ch'],
      [10, '2ch'],
      [100, '3ch'],
      [1000, '4ch'],
    ]
    for (const [lineCount, expectedWidth] of expectedWidths) {
      await wrapper.setProps({ node: makeNode(makeCode(lineCount), true) })
      await flush()
      expect(pre.style.getPropertyValue('--markstream-pre-line-number-width')).toBe(expectedWidth)
    }
    expect(pre.style.getPropertyValue('--markstream-code-padding-left')).toContain('var(--markstream-pre-line-number-width, 2ch)')
    wrapper.unmount()
  })

  it('waits for both completion and actual visibility before creating one File surface', async () => {
    const runtime = helpers()
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const ready = true', false),
        loading: false,
        stream: true,
        showHeader: false,
        monacoOptions: {
          unsafeCSS: '[data-file] { --consumer-code-gutter: 1; }',
        },
      },
    })

    await flush()
    expect(runtime.useMonaco).not.toHaveBeenCalled()
    expect(runtime.createEditor).not.toHaveBeenCalled()

    observers.at(-1)?.emit()
    await vi.waitFor(() => {
      expect(runtime.useMonaco).toHaveBeenCalledTimes(1)
      expect(runtime.createEditor).toHaveBeenCalledTimes(1)
      expect(runtime.useMonaco.mock.calls[0]?.[0]?.stream).toBe(false)
      expect(runtime.useMonaco.mock.calls[0]?.[0]?.disableFileHeader).toBe(true)
      expect(runtime.useMonaco.mock.calls[0]?.[0]?.unsafeCSS).toContain('--diffs-min-number-column-width-default: 2ch !important')
      expect(runtime.useMonaco.mock.calls[0]?.[0]?.unsafeCSS).toContain('--consumer-code-gutter: 1')
      expect(runtime.useMonaco.mock.calls[0]?.[0]?.unsafeCSS.indexOf('--diffs-min-number-column-width-default')).toBeLessThan(runtime.useMonaco.mock.calls[0]?.[0]?.unsafeCSS.indexOf('--consumer-code-gutter'))
      expect(wrapper.find('diffs-container').exists()).toBe(true)
      expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(false)
      expect(wrapper.get('[data-markstream-code-block="1"]').attributes('data-markstream-code-block-state')).toBe('settled')
    })

    await wrapper.setProps({ node: makeNode('const updated = true', false) })
    await flush()
    expect(runtime.createEditor).toHaveBeenCalledTimes(1)
    expect(runtime.updateCode).toHaveBeenCalledWith('const updated = true', 'typescript')
    wrapper.unmount()
  })

  it('keeps the fallback until stream-diffs commits its first visual frame', async () => {
    const runtime = helpers()
    let resolveVisualReady!: (ready: boolean) => void
    const visualReady = new Promise<boolean>((resolve) => {
      resolveVisualReady = resolve
    })
    runtime.whenVisualReady = vi.fn(() => visualReady)
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const ready = true', false),
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => expect(runtime.createEditor).toHaveBeenCalledTimes(1))
    expect(wrapper.find('diffs-container').exists()).toBe(true)
    expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(true)
    expect(wrapper.get('[data-markstream-code-block="1"]').attributes('data-markstream-enhanced')).toBe('false')

    resolveVisualReady(true)
    await vi.waitFor(() => {
      expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(false)
      expect(wrapper.get('[data-markstream-code-block="1"]').attributes('data-markstream-enhanced')).toBe('true')
    })
    wrapper.unmount()
  })

  it('rechecks visual readiness immediately before removing the fallback', async () => {
    const runtime = helpers()
    let resolveFirst!: (ready: boolean) => void
    let resolveCurrent!: (ready: boolean) => void
    const firstReady = new Promise<boolean>((resolve) => {
      resolveFirst = resolve
    })
    const currentReady = new Promise<boolean>((resolve) => {
      resolveCurrent = resolve
    })
    runtime.whenVisualReady = vi.fn()
      .mockReturnValueOnce(firstReady)
      .mockReturnValue(currentReady)
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const ready = true', false),
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => expect(runtime.whenVisualReady).toHaveBeenCalledTimes(1))

    resolveFirst(true)
    await vi.waitFor(() => expect(runtime.whenVisualReady).toHaveBeenCalledTimes(2))
    expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(true)

    resolveCurrent(true)
    await vi.waitFor(() => {
      expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(false)
      expect(wrapper.get('[data-markstream-code-block="1"]').attributes('data-markstream-enhanced')).toBe('true')
    })
    wrapper.unmount()
  })

  it('preserves runtime-owned font styles when the reserved height is released', async () => {
    const runtime = helpers()
    runtime.getEditorView.mockReturnValue({
      getModel: () => ({ getValue: () => '', getLineCount: () => 1 }),
      getOption: () => 14,
      updateOptions: vi.fn(),
      layout: vi.fn(),
      getContentHeight: () => 36,
    })
    let resolveVisualReady!: (ready: boolean) => void
    const visualReady = new Promise<boolean>((resolve) => {
      resolveVisualReady = resolve
    })
    runtime.whenVisualReady = vi.fn(() => visualReady)
    runtime.createEditor.mockImplementation(async (container: HTMLElement) => {
      container.style.fontSize = '13px'
      container.style.lineHeight = '20px'
      container.style.fontFamily = 'monospace'
      installFinalDiffsDom(container)
    })
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const ready = true', false),
        loading: false,
        stream: true,
        showHeader: false,
        estimatedHeightPx: 36,
        estimatedContentHeightPx: 36,
        monacoOptions: { fontSize: 13, lineHeight: 20 },
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => expect(runtime.createEditor).toHaveBeenCalledTimes(1))

    resolveVisualReady(true)
    await vi.waitFor(() => expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(false))

    const editorHost = wrapper.get('.code-editor-container').element as HTMLElement
    expect(editorHost.style.fontSize).toBe('13px')
    expect(editorHost.style.lineHeight).toBe('20px')
    expect(editorHost.style.fontFamily).toBe('monospace')
    expect(editorHost.style.height).toBe('36px')
    wrapper.unmount()
  })

  it('keeps the final editor height equal to its measured content height', async () => {
    const runtime = helpers()
    let resolveVisualReady!: (ready: boolean) => void
    const visualReady = new Promise<boolean>((resolve) => {
      resolveVisualReady = resolve
    })
    runtime.whenVisualReady = vi.fn(() => visualReady)
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const ready = true', false),
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => expect(runtime.createEditor).toHaveBeenCalledTimes(1))
    resolveVisualReady(true)
    await vi.waitFor(() => expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(false))

    expect((wrapper.get('.code-editor-container').element as HTMLElement).style.height).toBe('18px')
    wrapper.unmount()
  })

  it('does not add an extra pixel in the generic editor height fallback', async () => {
    const runtime = helpers()
    runtime.getEditorView.mockReturnValue({
      getModel: () => ({ getValue: () => '', getLineCount: () => 1 }),
      getOption: () => 18,
      updateOptions: vi.fn(),
      layout: vi.fn(),
    })
    runtime.whenVisualReady = vi.fn(() => Promise.resolve(true))
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const ready = true', false),
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(false))

    expect((wrapper.get('.code-editor-container').element as HTMLElement).style.height).toBe('19px')
    wrapper.unmount()
  })

  it('applies the active theme after a visible File surface mounts', async () => {
    const runtime = helpers()
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const ready = true', false),
        loading: false,
        stream: true,
        showHeader: false,
        isDark: true,
        darkTheme: 'initial-surface-dark',
        lightTheme: 'initial-surface-light',
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => {
      expect(runtime.createEditor).toHaveBeenCalledTimes(1)
      expect(runtime.setTheme).toHaveBeenCalledWith('initial-surface-dark')
    })

    runtime.setTheme.mockClear()
    await wrapper.setProps({ isDark: false })
    await vi.waitFor(() => {
      expect(runtime.setTheme).toHaveBeenCalledWith('initial-surface-light')
    })
    expect(runtime.createEditor).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('creates one FileDiff surface only after a visible diff completes', async () => {
    const runtime = helpers()
    const diffNode = {
      type: 'code_block' as const,
      language: 'typescript',
      code: '',
      raw: '```diff\n-const before = 1\n+const after = 2\n```',
      diff: true,
      originalCode: 'const before = 1',
      updatedCode: 'const after = 2',
      loading: true,
    }
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: diffNode,
        loading: true,
        stream: true,
        showHeader: false,
        monacoOptions: { renderSideBySide: true, diffWordWrap: 'off' },
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await flush()
    expect(runtime.createDiffEditor).not.toHaveBeenCalled()

    await wrapper.setProps({
      node: { ...diffNode, loading: false },
      loading: false,
    })
    await vi.waitFor(() => {
      expect(runtime.createDiffEditor).toHaveBeenCalledTimes(1)
      expect(runtime.useMonaco.mock.calls[0]?.[0]?.stream).toBe(false)
      expect(runtime.useMonaco.mock.calls[0]?.[0]?.wordWrap).toBe('off')
      expect(wrapper.find('diffs-container').exists()).toBe(true)
      expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(false)
      expect(wrapper.get('[data-markstream-code-block="1"]').attributes('data-markstream-code-block-state')).toBe('settled')
    })
    wrapper.unmount()
  })

  it('recreates a mounted FileDiff surface when its layout changes', async () => {
    const runtime = helpers()
    const diffNode = {
      type: 'code_block' as const,
      language: 'typescript',
      code: '',
      raw: '```diff\n-const before = 1\n+const after = 2\n```',
      diff: true,
      originalCode: 'const before = 1',
      updatedCode: 'const after = 2',
      loading: false,
    }
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: diffNode,
        loading: false,
        stream: true,
        showHeader: false,
        monacoOptions: { renderSideBySide: true },
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => expect(runtime.createDiffEditor).toHaveBeenCalledTimes(1))
    expect(runtime.useMonaco.mock.calls[0]?.[0]?.renderSideBySide).toBe(true)
    runtime.safeClean.mockClear()

    await wrapper.setProps({ monacoOptions: { renderSideBySide: false } })
    await vi.waitFor(() => {
      expect(runtime.safeClean).toHaveBeenCalled()
      expect(runtime.createDiffEditor).toHaveBeenCalledTimes(2)
    })
    expect(runtime.useMonaco.mock.calls[0]?.[0]?.renderSideBySide).toBe(false)

    await wrapper.setProps({ monacoOptions: { renderSideBySide: true } })
    await vi.waitFor(() => {
      expect(runtime.createDiffEditor).toHaveBeenCalledTimes(3)
    })
    expect(runtime.useMonaco.mock.calls[0]?.[0]?.renderSideBySide).toBe(true)
    wrapper.unmount()
  })

  it('accepts a theme name that matches an object in the theme pool', async () => {
    const runtime = helpers()
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const themed = true', false),
        loading: false,
        stream: true,
        showHeader: false,
        theme: 'github-dark',
        themes: [{ name: 'github-dark' }],
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => {
      expect(runtime.useMonaco).toHaveBeenCalledTimes(1)
      expect(runtime.createEditor).toHaveBeenCalledTimes(1)
      expect(wrapper.find('diffs-container').exists()).toBe(true)
      expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(false)
    })
    expect(runtime.useMonaco.mock.calls[0]?.[0]?.theme).toBe('github-dark')
    wrapper.unmount()
  })
})
