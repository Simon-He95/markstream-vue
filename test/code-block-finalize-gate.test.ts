import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick } from 'vue'
import CodeBlockNode from '../src/components/CodeBlockNode/CodeBlockNode.vue'
import { resetCodeBlockRuntimeReadyForTest } from '../src/components/CodeBlockNode/runtime'
import { clearStreamDiffsWorkerPool, setStreamDiffsWorkerPool } from '../src/components/CodeBlockNode/streamDiffsWorker'
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
  return (globalThis as any).__streamDiffsHelpers
}

function installFinalDiffsDom(container: HTMLElement, height?: number) {
  const surface = document.createElement('diffs-container')
  surface.textContent = 'final diffs surface'
  if (height != null) {
    surface.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: height,
      width: 800,
      height,
      toJSON: () => ({}),
    }) as DOMRect
  }
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

  runtime.createCodeBlockRuntime.mockReset().mockImplementation(() => runtime)
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
    clearStreamDiffsWorkerPool()
  })

  afterEach(() => {
    clearStreamDiffsWorkerPool()
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
    expect(runtime.createCodeBlockRuntime).not.toHaveBeenCalled()
    expect(runtime.createEditor).not.toHaveBeenCalled()
    expect(observers.at(-1)?.options.rootMargin).toBe('0px')

    observers.at(-1)?.emit()
    await flush()
    expect(runtime.createCodeBlockRuntime).not.toHaveBeenCalled()
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
      },
    })

    await flush()
    expect(runtime.createCodeBlockRuntime).not.toHaveBeenCalled()
    expect(runtime.createEditor).not.toHaveBeenCalled()

    observers.at(-1)?.emit()
    await vi.waitFor(() => {
      expect(runtime.createCodeBlockRuntime).toHaveBeenCalledTimes(1)
      expect(runtime.createEditor).toHaveBeenCalledTimes(1)
      expect(runtime.createCodeBlockRuntime.mock.calls[0]?.[0]?.stream).toBe(false)
      expect(runtime.createCodeBlockRuntime.mock.calls[0]?.[0]?.disableFileHeader).toBe(true)
      expect(runtime.createCodeBlockRuntime.mock.calls[0]?.[0]?.unsafeCSS).toContain('--diffs-min-number-column-width-default: 2ch !important')
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

  it('does not update the new File surface with the same snapshot when the fence closes', async () => {
    const runtime = helpers()
    let finishCreation!: () => void
    runtime.createEditor.mockImplementation((container: HTMLElement) => new Promise<void>((resolve) => {
      finishCreation = () => {
        installFinalDiffsDom(container)
        resolve()
      }
    }))
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const value =', true),
        loading: true,
        stream: true,
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await wrapper.setProps({ node: makeNode('const value = 1', false), loading: false })
    await vi.waitFor(() => expect(runtime.createEditor).toHaveBeenCalledTimes(1))
    finishCreation()
    await vi.waitFor(() => expect(wrapper.get('[data-markstream-enhanced]').attributes('data-markstream-enhanced')).toBe('true'))
    expect(runtime.updateCode).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('merges neutral options before host invariants and recreates when options change', async () => {
    const runtime = helpers()
    const onLineClick = vi.fn()
    const consumerThemeChange = vi.fn()
    const node = {
      type: 'code_block' as const,
      language: 'typescript',
      code: '',
      raw: '```diff\n-const before = 1\n+const after = 2\n```',
      diff: true,
      originalCode: 'const before = 1',
      updatedCode: 'const after = 2',
      loading: false,
    }
    const codeBlockOptions = {
      maxHeight: 420,
      padding: 6,
      tabSize: 8,
      fontSize: 16,
      lineHeight: 24,
      fontFamily: 'Fira Code',
      diffStyle: 'unified' as const,
      parseDiffOptions: { context: 7, ignoreWhitespace: true },
      disableLineNumbers: true,
      onLineClick,
      unsafeCSS: '.consumer-rule { color: red; }',
      theme: 'consumer-theme',
      stream: true,
      disableFileHeader: false,
      onThemeChange: consumerThemeChange,
    }
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node,
        loading: false,
        stream: true,
        showHeader: false,
        isDark: true,
        theme: 'github-dark',
        themes: ['github-dark', 'github-light'],
        codeBlockOptions,
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => expect(runtime.createDiffEditor).toHaveBeenCalledTimes(1))

    const firstOptions = runtime.createCodeBlockRuntime.mock.calls[0]?.[0]
    expect(firstOptions).toMatchObject({
      MAX_HEIGHT: 420,
      fontSize: 16,
      lineHeight: 24,
      fontFamily: 'Fira Code',
      diffStyle: 'unified',
      disableLineNumbers: true,
      wordWrap: 'on',
      overflow: 'wrap',
      stream: false,
      disableFileHeader: true,
      theme: 'github-dark',
      themes: ['github-dark', 'github-light'],
    })
    expect(firstOptions.parseDiffOptions).toEqual({ context: 7, ignoreWhitespace: true })
    expect(firstOptions.onLineClick).toBe(onLineClick)
    expect(firstOptions.onThemeChange).not.toBe(consumerThemeChange)
    expect(firstOptions.maxHeight).toBeUndefined()
    expect(firstOptions.padding).toBeUndefined()
    expect(firstOptions.tabSize).toBeUndefined()
    expect(firstOptions.unsafeCSS.indexOf('[data-file], [data-diff]')).toBeLessThan(firstOptions.unsafeCSS.indexOf('.consumer-rule'))
    expect(firstOptions.unsafeCSS).toContain('overflow-wrap: anywhere !important')
    expect(firstOptions.unsafeCSS).toContain('word-break: normal !important')
    expect(firstOptions.unsafeCSS).toContain('[data-no-newline],')
    expect(firstOptions.unsafeCSS).toContain('[data-gutter-buffer="metadata"]')
    expect(firstOptions.unsafeCSS).toContain('color: var(--markstream-diff-metadata-fg) !important')
    expect(firstOptions.unsafeCSS).toContain('background-color: var(--markstream-diff-metadata-bg) !important')

    const editorHost = wrapper.get('.code-editor-container').element as HTMLElement
    expect(editorHost.style.getPropertyValue('--diffs-tab-size')).toBe('8')
    expect(editorHost.style.getPropertyValue('--diffs-gap-block')).toBe('6px')
    expect(editorHost.style.getPropertyValue('--markstream-diff-metadata-bg')).toBe('var(--markstream-code-theme-bg, #121212)')
    expect(editorHost.style.getPropertyValue('--markstream-diff-metadata-fg')).toBe('var(--markstream-code-theme-line-number, #dedcd550)')

    await wrapper.setProps({
      codeBlockOptions: {
        ...codeBlockOptions,
        diffStyle: 'split',
      },
    })
    await vi.waitFor(() => {
      expect(runtime.createCodeBlockRuntime).toHaveBeenCalledTimes(2)
      expect(runtime.createDiffEditor).toHaveBeenCalledTimes(2)
    })
    expect(runtime.createCodeBlockRuntime.mock.calls[1]?.[0]?.diffStyle).toBe('split')

    wrapper.unmount()
  })

  it('maps overflow scroll to a non-wrapping enhanced surface', async () => {
    const runtime = helpers()
    runtime.createEditor.mockImplementation(() => new Promise<void>(() => {}))
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const veryLongLine = true', false),
        loading: false,
        stream: true,
        showHeader: false,
        codeBlockOptions: { overflow: 'scroll' },
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => expect(runtime.createCodeBlockRuntime).toHaveBeenCalledTimes(1))

    const options = runtime.createCodeBlockRuntime.mock.calls[0]?.[0]
    expect(options?.wordWrap).toBe('off')
    expect(options?.overflow).toBe('scroll')
    expect(options?.unsafeCSS).toContain('white-space: pre !important')
    expect(options?.unsafeCSS).toContain('overflow-wrap: normal !important')
    const pre = wrapper.get('pre.code-pre-fallback').element as HTMLElement
    expect(pre.style.whiteSpace).toBe('pre')
    expect(pre.style.overflowWrap).toBe('normal')
    expect(wrapper.get('pre.code-pre-fallback').classes()).not.toContain('is-wrap')
    wrapper.unmount()
  })

  it('counts changed source lines instead of runtime hunk rows', async () => {
    const runtime = helpers()
    const diffView = runtime.getDiffEditorView()
    runtime.getDiffEditorView.mockReturnValue({
      ...diffView,
      getLineChanges: () => [{
        originalStartLineNumber: 1,
        originalEndLineNumber: 2,
        modifiedStartLineNumber: 1,
        modifiedEndLineNumber: 2,
      }],
    })
    const originalCode = 'const value = true'
    const updatedCode = 'const value = false'
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: {
          type: 'code_block' as const,
          language: 'typescript',
          code: '',
          raw: '```diff\n-old\n+new\n```',
          diff: true,
          originalCode,
          updatedCode,
          loading: false,
        },
        loading: false,
        stream: true,
        showHeader: true,
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => expect(runtime.createDiffEditor).toHaveBeenCalledTimes(1))
    await flush()

    expect(wrapper.get('.code-diff-stats').attributes('aria-label')).toBe('-1 +1')
    expect(wrapper.get('.code-diff-stat.removed').text()).toBe('-1')
    expect(wrapper.get('.code-diff-stat.added').text()).toBe('+1')
    wrapper.unmount()
  })

  it('keeps wrapped source lines as one logical line in the fallback', async () => {
    const runtime = helpers()
    runtime.createEditor.mockImplementation(async () => new Promise<void>(() => {}))
    const code = 'const veryLongLineThatWrapsVisually = true'
    const wrapper = mount(CodeBlockNode, {
      props: {
        node: makeNode(code, false),
        loading: false,
        stream: true,
        showHeader: false,
        codeBlockOptions: { overflow: 'wrap' },
      },
    })

    await flush()
    const lines = wrapper.findAll('.markstream-pre__logical-line')
    expect(lines).toHaveLength(1)
    expect(lines[0].attributes('data-line-number')).toBe('1')
    const pre = wrapper.get('pre.code-pre-fallback').element as HTMLElement
    expect(pre.style.whiteSpace).toBe('pre-wrap')
    expect(pre.style.overflowWrap).toBe('anywhere')
    wrapper.unmount()
  })

  it('restores the default font size when codeBlockOptions.fontSize is removed', async () => {
    const runtime = helpers()
    const createdTypography: Array<{ fontSize: number, lineHeight: number }> = []
    runtime.createEditor.mockImplementation(async (container: HTMLElement) => {
      const options = runtime.createCodeBlockRuntime.mock.calls.at(-1)?.[0]
      createdTypography.push({ fontSize: options?.fontSize, lineHeight: options?.lineHeight })
      installFinalDiffsDom(container)
    })
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const value = true', false),
        loading: false,
        stream: true,
        showHeader: false,
        codeBlockOptions: { fontSize: 16 },
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => expect(runtime.createEditor).toHaveBeenCalledTimes(1))
    expect(createdTypography[0]).toEqual({ fontSize: 16, lineHeight: 24 })

    let resolveVisualReady!: (ready: boolean) => void
    runtime.whenVisualReady = vi.fn(() => new Promise<boolean>((resolve) => {
      resolveVisualReady = resolve
    }))
    await wrapper.setProps({ codeBlockOptions: {} })
    await vi.waitFor(() => {
      expect(runtime.createCodeBlockRuntime).toHaveBeenCalledTimes(2)
      expect(runtime.createEditor).toHaveBeenCalledTimes(2)
    })

    expect(createdTypography[1]).toEqual({ fontSize: 12, lineHeight: 18 })
    expect((wrapper.get('pre.code-pre-fallback').element as HTMLElement).style.fontSize).toBe('12px')

    resolveVisualReady(true)
    wrapper.unmount()
  })

  it('lets the direct showLineNumbers prop override neutral options on enhanced surfaces', async () => {
    const runtime = helpers()
    const mountBlock = (showLineNumbers: boolean, disableLineNumbers: boolean) => mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const value = true', false),
        loading: false,
        stream: true,
        showHeader: false,
        showLineNumbers,
        codeBlockOptions: { disableLineNumbers },
      },
    })

    const enabled = mountBlock(true, true)
    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => expect(runtime.createCodeBlockRuntime).toHaveBeenCalledTimes(1))
    expect(runtime.createCodeBlockRuntime.mock.calls[0]?.[0]?.disableLineNumbers).toBe(false)
    enabled.unmount()

    observers.length = 0
    resetHelpers()
    const disabled = mountBlock(false, false)
    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => expect(runtime.createCodeBlockRuntime).toHaveBeenCalledTimes(1))
    expect(runtime.createCodeBlockRuntime.mock.calls[0]?.[0]?.disableLineNumbers).toBe(true)
    disabled.unmount()
  })

  it('selects theme pairs and tuples by host precedence', async () => {
    const runtime = helpers()
    const mountBlock = (props: Record<string, unknown>) => mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const value = true', false),
        loading: false,
        showHeader: false,
        stream: true,
        ...props,
      },
    })

    const tuple = mountBlock({ isDark: false, themes: ['tuple-dark', 'tuple-light'] })
    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => expect(runtime.createCodeBlockRuntime).toHaveBeenCalledTimes(1))
    expect(runtime.createCodeBlockRuntime.mock.calls[0]?.[0]?.theme).toBe('tuple-light')
    tuple.unmount()

    observers.length = 0
    resetHelpers()
    const pair = mountBlock({
      isDark: true,
      theme: { dark: 'pair-dark', light: 'pair-light' },
      themes: ['tuple-dark', 'tuple-light'],
    })
    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => expect(runtime.createCodeBlockRuntime).toHaveBeenCalledTimes(1))
    expect(runtime.createCodeBlockRuntime.mock.calls[0]?.[0]?.theme).toBe('pair-dark')
    pair.unmount()
  })

  it('recreates deferred static runtime options after loading settles', async () => {
    const runtime = helpers()
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const staticValue = true', false),
        loading: false,
        stream: false,
        showHeader: false,
        codeBlockOptions: { diffStyle: 'unified' },
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => expect(runtime.createEditor).toHaveBeenCalledTimes(1))

    await wrapper.setProps({ loading: true })
    await wrapper.setProps({ codeBlockOptions: { diffStyle: 'split' } })
    await flush()
    expect(runtime.createCodeBlockRuntime).toHaveBeenCalledTimes(1)
    expect(runtime.createEditor).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ loading: false })
    await vi.waitFor(() => {
      expect(runtime.createCodeBlockRuntime).toHaveBeenCalledTimes(2)
      expect(runtime.createEditor).toHaveBeenCalledTimes(2)
    })
    expect(runtime.createCodeBlockRuntime.mock.calls[1]?.[0]?.diffStyle).toBe('split')

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

  it('passes the active theme when creating a visible File surface', async () => {
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
      expect(runtime.createCodeBlockRuntime.mock.calls[0]?.[0]?.theme).toBe('initial-surface-dark')
      expect(runtime.createEditor).toHaveBeenCalledTimes(1)
    })
    expect(runtime.setTheme).not.toHaveBeenCalled()

    await wrapper.setProps({ isDark: false })
    await vi.waitFor(() => {
      expect(runtime.setTheme).toHaveBeenCalledWith('initial-surface-light')
    })
    expect(runtime.createEditor).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('applies a theme change queued while the worker prepares the initial surface', async () => {
    let resolveWorkerTheme!: () => void
    const workerThemePending = new Promise<void>((resolve) => {
      resolveWorkerTheme = resolve
    })
    const setRenderOptions = vi.fn(() => workerThemePending)
    setStreamDiffsWorkerPool({ setRenderOptions })
    const runtime = helpers()
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const ready = true', false),
        loading: false,
        stream: true,
        showHeader: false,
        isDark: true,
        darkTheme: 'queued-surface-dark',
        lightTheme: 'queued-surface-light',
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => expect(setRenderOptions).toHaveBeenCalledTimes(1))
    expect(runtime.createEditor).not.toHaveBeenCalled()

    await wrapper.setProps({ isDark: false })
    resolveWorkerTheme()

    await vi.waitFor(() => expect(runtime.setTheme).toHaveBeenCalledWith('queued-surface-light'))
    expect(runtime.createEditor).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('applies the latest theme when it changes again during queued theme sync', async () => {
    const workerThemeResolvers: Array<() => void> = []
    const setRenderOptions = vi.fn(() => new Promise<void>((resolve) => {
      workerThemeResolvers.push(resolve)
    }))
    setStreamDiffsWorkerPool({ setRenderOptions })
    const runtime = helpers()
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const ready = true', false),
        loading: false,
        stream: true,
        showHeader: false,
        isDark: true,
        darkTheme: 'queued-surface-dark',
        lightTheme: 'queued-surface-light',
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => expect(setRenderOptions).toHaveBeenCalledTimes(1))

    await wrapper.setProps({ isDark: false })
    workerThemeResolvers[0]!()
    await vi.waitFor(() => expect(setRenderOptions).toHaveBeenCalledTimes(2))

    await wrapper.setProps({ isDark: true })
    workerThemeResolvers[1]!()
    await vi.waitFor(() => expect(setRenderOptions).toHaveBeenCalledTimes(3))
    workerThemeResolvers[2]!()

    await vi.waitFor(() => expect(runtime.setTheme).toHaveBeenLastCalledWith('queued-surface-dark'))
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
      expect(runtime.createCodeBlockRuntime.mock.calls[0]?.[0]?.stream).toBe(false)
      expect(wrapper.find('diffs-container').exists()).toBe(true)
      expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(false)
      expect(wrapper.get('[data-markstream-code-block="1"]').attributes('data-markstream-code-block-state')).toBe('settled')
    })
    wrapper.unmount()
  })

  it('retries a settled diff pair after the runtime result is still pending', async () => {
    const runtime = helpers()
    const pending = new Error('no diff result available')
    runtime.updateDiff
      .mockRejectedValueOnce(pending)
      .mockRejectedValueOnce(pending)
      .mockResolvedValue(undefined)
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
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => expect(runtime.createDiffEditor).toHaveBeenCalledTimes(1))
    await wrapper.setProps({
      node: {
        ...diffNode,
        originalCode: 'const before = 0',
      },
    })
    await vi.waitFor(() => expect(runtime.updateDiff).toHaveBeenCalledTimes(2))
    await wrapper.setProps({ stream: false })

    await vi.waitFor(() => expect(runtime.updateDiff).toHaveBeenCalledTimes(3))
    wrapper.unmount()
  })

  it.each([
    { diffStyle: 'unified' as const, contentHeight: 120, expectedHeight: 120, expectedOverflow: 'hidden' },
    { diffStyle: 'unified' as const, contentHeight: 720, expectedHeight: 240, expectedOverflow: 'auto' },
    { diffStyle: 'split' as const, contentHeight: 120, expectedHeight: 120, expectedOverflow: 'hidden' },
    { diffStyle: 'split' as const, contentHeight: 720, expectedHeight: 240, expectedOverflow: 'auto' },
  ])('keeps a finalized $diffStyle diff with height $contentHeight visible or scrollable', async ({
    diffStyle,
    contentHeight,
    expectedHeight,
    expectedOverflow,
  }) => {
    const runtime = helpers()
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (!this.matches('pre.code-pre-fallback'))
        return originalGetBoundingClientRect.call(this)
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 800,
        bottom: expectedHeight,
        width: 800,
        height: expectedHeight,
        toJSON: () => ({}),
      } as DOMRect
    })
    runtime.createDiffEditor.mockImplementation(async (container: HTMLElement) => {
      installFinalDiffsDom(container, contentHeight)
    })
    runtime.whenVisualReady = vi.fn(() => Promise.resolve(true))
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'typescript',
          code: '',
          raw: '```diff\n-const before = 1\n+const after = 2\n```',
          diff: true,
          originalCode: 'const before = 1',
          updatedCode: 'const after = 2',
          loading: false,
        },
        codeBlockOptions: { diffStyle, maxHeight: 240 },
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(false))

    const host = wrapper.get('.code-editor-container').element as HTMLElement
    expect(host.style.height).toBe(`${expectedHeight}px`)
    expect(host.style.maxHeight).toBe('240px')
    expect(host.style.overflow).toBe(expectedOverflow)

    wrapper.unmount()
  })

  it('keeps a mounted FileDiff surface across theme-only prop changes', async () => {
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
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => expect(runtime.createDiffEditor).toHaveBeenCalledTimes(1))
    expect(runtime.setTheme).not.toHaveBeenCalled()
    runtime.safeClean.mockClear()
    runtime.createDiffEditor.mockClear()
    runtime.setTheme.mockClear()

    await wrapper.setProps({ isDark: true })
    await vi.waitFor(() => expect(runtime.setTheme).toHaveBeenCalledTimes(1))
    expect(runtime.safeClean).not.toHaveBeenCalled()
    expect(runtime.createDiffEditor).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('accepts a fixed theme name with a dark/light theme tuple', async () => {
    const runtime = helpers()
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const themed = true', false),
        loading: false,
        stream: true,
        showHeader: false,
        theme: 'github-dark',
        themes: ['github-dark', 'github-light'],
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => {
      expect(runtime.createCodeBlockRuntime).toHaveBeenCalledTimes(1)
      expect(runtime.createEditor).toHaveBeenCalledTimes(1)
      expect(wrapper.find('diffs-container').exists()).toBe(true)
      expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(false)
    })
    expect(runtime.createCodeBlockRuntime.mock.calls[0]?.[0]?.theme).toBe('github-dark')
    wrapper.unmount()
  })
})
