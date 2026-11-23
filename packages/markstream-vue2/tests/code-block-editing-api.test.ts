import type { CodeBlockNodeExposed } from '../src/components/CodeBlockNode/streamDiffs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Vue from 'vue'
import CodeBlockNode from '../src/components/CodeBlockNode/CodeBlockNode.vue'
import * as streamDiffs from '../src/components/CodeBlockNode/streamDiffs'

function helpers() {
  return (globalThis as any).__streamDiffsHelpers
}

function makeNode(code: string, extra: Record<string, unknown> = {}) {
  return {
    type: 'code_block' as const,
    language: 'typescript',
    code,
    raw: `\`\`\`typescript\n${code}\n\`\`\``,
    loading: false,
    ...extra,
  }
}

function makeSurface() {
  const editor = {
    getText: () => 'edited',
    canUndo: true,
    canRedo: false,
    undo: vi.fn(),
    redo: vi.fn(),
    applyEdits: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn(),
  }
  const surface = {
    isReadyToEdit: vi.fn(() => true),
    isEditing: vi.fn(() => false),
    startEditing: vi.fn(async () => editor),
    stopEditing: vi.fn(),
    getEditor: vi.fn(() => editor),
    getEditingFile: vi.fn(() => ({ name: 'code.ts', contents: 'edited', lang: 'typescript' })),
    getEditingText: vi.fn(() => 'edited'),
    canUndo: vi.fn(() => true),
    canRedo: vi.fn(() => false),
    undo: vi.fn(),
    redo: vi.fn(),
    applyEdits: vi.fn(),
    focusEditor: vi.fn(),
    blurEditor: vi.fn(),
    revealLine: vi.fn(() => true),
    expandLine: vi.fn(),
    expandHunk: vi.fn(),
    setEditorActiveLine: vi.fn(),
    getCodeScrollLeft: vi.fn(() => 12),
    setCodeScrollLeft: vi.fn(),
    getResolvedFile: vi.fn(() => ({ contents: 'settled' })),
  }
  return { editor, surface }
}

async function flush() {
  await Vue.nextTick()
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  await Vue.nextTick()
}

async function waitForSurface(ref: any) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (ref?.getSurface?.())
      return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('surface did not initialize')
}

function mountCodeBlock(options: {
  codeBlockOptions?: Record<string, unknown>
  loading?: boolean
  node?: Record<string, unknown>
} = {}) {
  const captured: { options?: Record<string, any> } = {}
  const runtimeHelpers = helpers()
  runtimeHelpers.createCodeBlockRuntime.mockImplementation((runtimeOptions: Record<string, any>) => {
    captured.options = runtimeOptions
    return runtimeHelpers
  })
  runtimeHelpers.createEditor.mockImplementation(async (host: HTMLElement) => {
    host.innerHTML = '<diffs-container></diffs-container>'
  })
  runtimeHelpers.createDiffEditor.mockImplementation(async (host: HTMLElement) => {
    host.innerHTML = '<diffs-container></diffs-container>'
  })
  runtimeHelpers.whenVisualReady = async () => true
  vi.spyOn(streamDiffs, 'getStreamDiffsRuntime').mockResolvedValue({
    createCodeBlockRuntime: (runtimeOptions: Record<string, any>) => {
      captured.options = runtimeOptions
      return runtimeHelpers
    },
    detectLanguage: () => 'typescript',
  } as any)

  const vm = new Vue({
    render(h) {
      return h(CodeBlockNode, {
        ref: 'codeBlock',
        props: {
          node: options.node ?? makeNode('const ready = true'),
          codeBlockOptions: options.codeBlockOptions,
          loading: options.loading ?? false,
          stream: true,
          showHeader: false,
        },
      })
    },
  }).$mount()
  document.body.appendChild(vm.$el)
  return {
    vm,
    ref: () => vm.$refs.codeBlock as unknown as CodeBlockNodeExposed & Record<string, any>,
    captured,
    destroy() {
      vm.$destroy()
      vm.$el.remove()
    },
  }
}

describe('vue 2 CodeBlockNode editing API', () => {
  beforeEach(() => {
    const runtimeHelpers = helpers()
    runtimeHelpers.getSurface.mockReturnValue(null)
    runtimeHelpers.getEditor.mockReturnValue(null)
    runtimeHelpers.getEditorView.mockReturnValue({
      getModel: () => ({ getLineCount: () => 1 }),
      getOption: () => 14,
      updateOptions: () => {},
      layout: () => {},
    })
    runtimeHelpers.getDiffEditorView.mockReturnValue({
      getModel: () => ({ getLineCount: () => 1 }),
      getOption: () => 14,
      updateOptions: () => {},
      layout: () => {},
    })
    runtimeHelpers.safeClean.mockImplementation(() => {})
    runtimeHelpers.cleanupEditor.mockImplementation(() => {})
    runtimeHelpers.setTheme.mockImplementation(async () => {})
    runtimeHelpers.refreshDiffPresentation.mockImplementation(() => {})
  })

  afterEach(() => {
    delete (helpers() as any).whenVisualReady
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('exposes the shared editing API through $refs', async () => {
    const { surface, editor } = makeSurface()
    helpers().getSurface.mockReturnValue(surface)
    const harness = mountCodeBlock()
    await flush()
    const api = harness.ref()
    await waitForSurface(api)

    expect(api.getSurface()).toBe(surface)
    expect(api.isReadyToEdit()).toBe(true)
    expect(api.isEditing()).toBe(false)

    await expect(api.startEditing({}, 'draft')).resolves.toBe(editor)
    expect(surface.startEditing).toHaveBeenCalledWith({}, 'draft')

    expect(api.getEditor()).toBe(editor)
    expect(api.getEditingText()).toBe('edited')
    expect(api.getCode()).toBe('edited')
    expect(api.canUndo()).toBe(true)
    expect(api.canRedo()).toBe(false)

    api.undo()
    api.redo()
    api.applyEdits([{ newText: 'x' }], false)
    api.focusEditor()
    api.blurEditor()
    expect(surface.undo).toHaveBeenCalledTimes(1)
    expect(surface.redo).toHaveBeenCalledTimes(1)
    expect(surface.applyEdits).toHaveBeenCalledWith([{ newText: 'x' }], false)
    expect(surface.focusEditor).toHaveBeenCalledTimes(1)
    expect(surface.blurEditor).toHaveBeenCalledTimes(1)

    expect(api.revealLine(3, 'additions')).toBe(true)
    api.expandLine({ additionLineNumber: 3 })
    api.expandHunk(0, 'both')
    api.setEditorActiveLine(3)
    expect(surface.revealLine).toHaveBeenCalledWith(3, 'additions')
    expect(surface.expandLine).toHaveBeenCalledWith({ additionLineNumber: 3 })
    expect(surface.expandHunk).toHaveBeenCalledWith(0, 'both', undefined)
    expect(surface.setEditorActiveLine).toHaveBeenCalledWith(3, undefined)

    expect(api.getCodeScrollLeft()).toBe(12)
    api.setCodeScrollLeft(40)
    expect(surface.setCodeScrollLeft).toHaveBeenCalledWith(40)

    api.stopEditing('complete')
    expect(surface.stopEditing).toHaveBeenCalledWith('complete')

    harness.destroy()
  })

  it('prepares a not-yet-ready surface before starting an edit', async () => {
    const { surface } = makeSurface()
    surface.isReadyToEdit.mockReturnValue(false)
    surface.prepareForEditing = vi.fn(async () => {})
    helpers().getSurface.mockReturnValue(surface)
    const harness = mountCodeBlock()
    await flush()
    const api = harness.ref()
    await waitForSurface(api)

    await api.startEditing()
    expect(surface.prepareForEditing).toHaveBeenCalledTimes(1)

    harness.destroy()
  })

  it('reports shared loading and missing-surface errors', async () => {
    const loadingHarness = mountCodeBlock({ loading: true })
    await flush()
    const loadingApi = loadingHarness.ref()
    expect(loadingApi.getSurface()).toBeNull()
    await expect(loadingApi.startEditing()).rejects.toThrow(/finish streaming/)
    expect(() => loadingApi.applyEdits([], false)).toThrow(/not ready for edits/)
    loadingHarness.destroy()

    const idleHarness = mountCodeBlock()
    await flush()
    const idleApi = idleHarness.ref()
    expect(idleApi.getSurface()).toBeNull()
    await expect(idleApi.startEditing()).rejects.toThrow(/not ready/)
    idleHarness.destroy()
  })

  it('reads native and diff fallback code with normalization', async () => {
    const { surface } = makeSurface()
    helpers().getSurface.mockReturnValue(surface)
    const harness = mountCodeBlock({ node: makeNode('fallback code\n') })
    await flush()
    const api = harness.ref()
    await waitForSurface(api)

    surface.getEditingFile.mockReturnValue(undefined)
    surface.getResolvedFile.mockReturnValue(undefined)
    surface.getNativeInstance = vi.fn(() => ({ file: { contents: 'native code\n' } }))
    expect(api.getCode()).toBe('native code')

    surface.getNativeInstance = vi.fn(() => ({ fileDiff: { additionLines: ['completed diff code\n'] } }))
    expect(api.getCode()).toBe('completed diff code')

    surface.getNativeInstance = vi.fn(() => undefined)
    expect(api.getCode()).toBe('fallback code')

    harness.destroy()
  })

  it('uses the diff updated code as the display fallback and supplies an accepting default', async () => {
    const { surface } = makeSurface()
    helpers().getSurface.mockReturnValue(surface)
    const harness = mountCodeBlock({
      node: makeNode('original code', {
        diff: true,
        originalCode: 'original code',
        updatedCode: 'updated code\n',
      }),
    })
    await flush()
    const api = harness.ref()
    await waitForSurface(api)

    surface.getEditingFile.mockReturnValue(undefined)
    surface.getResolvedFile.mockReturnValue(undefined)
    surface.getNativeInstance = vi.fn(() => undefined)
    expect(api.getCode()).toBe('updated code')

    expect(harness.captured.options?.onEditComplete?.({})).toBe('accept')
    harness.destroy()
  })

  it('preserves a configured onEditComplete handler', async () => {
    const { surface } = makeSurface()
    helpers().getSurface.mockReturnValue(surface)
    const onEditComplete = vi.fn(() => 'reject' as const)
    const harness = mountCodeBlock({ codeBlockOptions: { onEditComplete } })
    await flush()
    await waitForSurface(harness.ref())

    expect(harness.captured.options?.onEditComplete).toBe(onEditComplete)
    harness.destroy()
  })
})
