import type { CodeBlockNodeHandle } from '../../src/index'
import { cleanup, render, waitFor } from '@octanejs/testing-library'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CodeBlockNode } from '../../src/index'

function helpers(): any {
  return (globalThis as any).__streamDiffsHelpers
}

function resetHelpers() {
  const runtime = helpers()
  runtime.createCodeBlockRuntime.mockReset().mockImplementation(() => runtime)
  runtime.createEditor.mockReset().mockImplementation(async () => {})
  runtime.createDiffEditor.mockReset().mockImplementation(async () => {})
  runtime.updateCode.mockReset()
  runtime.updateDiff.mockReset()
  runtime.getEditor.mockReset().mockImplementation(() => null)
  runtime.getSurface.mockReset().mockImplementation(() => null)
  runtime.cleanupEditor.mockReset().mockImplementation(() => {})
  runtime.safeClean.mockReset().mockImplementation(() => {})
  runtime.refreshDiffPresentation.mockReset().mockImplementation(() => {})
  runtime.setTheme.mockReset().mockImplementation(async () => {})
  runtime.finalizeCode.mockReset().mockImplementation(async () => {})
  runtime.finalizeDiff.mockReset().mockImplementation(async () => {})
}

function makeNode(code: string, loading = false) {
  return {
    type: 'code_block' as const,
    language: 'typescript',
    code,
    raw: `\`\`\`typescript\n${code}\n\`\`\``,
    loading,
  }
}

function makeEditor() {
  return {
    getText: vi.fn(() => 'edited'),
    canUndo: true,
    canRedo: false,
    undo: vi.fn(),
    redo: vi.fn(),
    applyEdits: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn(),
  }
}

function makeSurface(editor: ReturnType<typeof makeEditor>) {
  return {
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
    getNativeInstance: vi.fn(() => undefined),
  }
}

async function waitForHandle(ref: { current: CodeBlockNodeHandle | null }) {
  await waitFor(() => expect(ref.current).not.toBeNull())
  return ref.current!
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('markstream-octane CodeBlockNode editing API', () => {
  beforeEach(() => {
    resetHelpers()
  })

  it('delegates every shared method through the public ref', async () => {
    const runtime = helpers()
    const editor = makeEditor()
    const surface = makeSurface(editor)
    runtime.getSurface.mockReturnValue(surface)
    const ref = { current: null as CodeBlockNodeHandle | null }

    render(CodeBlockNode, {
      props: {
        node: makeNode('const ready = true'),
        loading: false,
        showHeader: false,
        ref,
      },
    })
    const api = await waitForHandle(ref)
    await waitFor(() => expect(runtime.createCodeBlockRuntime).toHaveBeenCalled())

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
  })

  it('prepares a not-ready surface before attaching the editor', async () => {
    const runtime = helpers()
    const editor = makeEditor()
    const surface = makeSurface(editor)
    surface.isReadyToEdit.mockReturnValue(false)
    ;(surface as any).prepareForEditing = vi.fn(async () => {})
    runtime.getSurface.mockReturnValue(surface)
    const ref = { current: null as CodeBlockNodeHandle | null }

    render(CodeBlockNode, {
      props: {
        node: makeNode('const ready = false'),
        loading: false,
        showHeader: false,
        ref,
      },
    })
    const api = await waitForHandle(ref)
    await waitFor(() => expect(runtime.createCodeBlockRuntime).toHaveBeenCalled())

    await expect(api.startEditing()).resolves.toBe(editor)
    expect((surface as any).prepareForEditing).toHaveBeenCalledTimes(1)
    expect(surface.startEditing).toHaveBeenCalledTimes(1)
  })

  it('reports the shared missing-surface and loading errors', async () => {
    const runtime = helpers()
    runtime.getSurface.mockReturnValue(null)
    const ref = { current: null as CodeBlockNodeHandle | null }

    render(CodeBlockNode, {
      props: {
        node: makeNode('const pending = true', true),
        loading: true,
        showHeader: false,
        ref,
      },
    })
    const api = await waitForHandle(ref)

    expect(api.getSurface()).toBeNull()
    expect(api.isReadyToEdit()).toBe(false)
    await expect(api.startEditing()).rejects.toThrow(/finish streaming/)
    expect(() => api.applyEdits([], false)).toThrow(/not ready for edits/)

    cleanup()

    runtime.getSurface.mockReturnValue(null)
    const notReadyRef = { current: null as CodeBlockNodeHandle | null }
    render(CodeBlockNode, {
      props: {
        node: makeNode('const missing = true'),
        loading: false,
        showHeader: false,
        ref: notReadyRef,
      },
    })
    const notReady = await waitForHandle(notReadyRef)
    await expect(notReady.startEditing()).rejects.toThrow(/not ready/)
  })

  it('reads live display code and native file/diff fallbacks with trailing-newline normalization', async () => {
    const runtime = helpers()
    const surface = {
      isReadyToEdit: vi.fn(() => true),
      getEditingFile: vi.fn(() => undefined),
      getResolvedFile: vi.fn(() => undefined),
      getNativeInstance: vi.fn(() => undefined),
    }
    runtime.getSurface.mockReturnValue(surface)
    const ref = { current: null as CodeBlockNodeHandle | null }

    const view = render(CodeBlockNode, {
      props: {
        node: makeNode('const value = 1\n'),
        loading: false,
        showHeader: false,
        ref,
      },
    })
    const api = await waitForHandle(ref)
    await waitFor(() => expect(runtime.createCodeBlockRuntime).toHaveBeenCalled())

    expect(api.getCode()).toBe('const value = 1')

    surface.getNativeInstance.mockReturnValue({ file: { contents: 'completed native code\n' } } as any)
    expect(api.getCode()).toBe('completed native code')

    surface.getNativeInstance.mockReturnValue({ fileDiff: { additionLines: ['completed diff code\n'] } } as any)
    expect(api.getCode()).toBe('completed diff code')

    surface.getEditingFile.mockReturnValue({ contents: 'active edit\n' } as any)
    expect(api.getCode()).toBe('active edit')

    surface.getEditingFile.mockReturnValue(undefined)
    surface.getNativeInstance.mockReturnValue(undefined)
    view.rerender({
      props: {
        node: makeNode('const value = 2\n'),
        loading: false,
        showHeader: false,
        ref,
      },
    })
    await waitFor(() => expect(api.getCode()).toBe('const value = 2'))

    view.rerender({
      props: {
        node: makeNode('const value = 3\n\n'),
        loading: false,
        showHeader: false,
        ref,
      },
    })
    await waitFor(() => expect(api.getCode()).toBe('const value = 3\n'))

    view.rerender({
      props: {
        node: {
          ...makeNode('const old = true\n'),
          diff: true,
          originalCode: 'const old = true\n',
          updatedCode: 'const new = true\n\n',
        },
        loading: false,
        showHeader: false,
        ref,
      },
    })
    await waitFor(() => expect(api.getCode()).toBe('const new = true\n'))
  })

  it('uses the accepting onEditComplete default and preserves a consumer handler', async () => {
    const runtime = helpers()
    runtime.getSurface.mockReturnValue(null)
    const ref = { current: null as CodeBlockNodeHandle | null }

    render(CodeBlockNode, {
      props: {
        node: makeNode('const accept = true'),
        loading: false,
        showHeader: false,
        ref,
      },
    })
    await waitForHandle(ref)
    await waitFor(() => expect(runtime.createCodeBlockRuntime).toHaveBeenCalled())

    const options = runtime.createCodeBlockRuntime.mock.calls
      .map(([value]: [Record<string, any>]) => value)
      .filter(Boolean)
      .find((value: Record<string, any>) => value.stream === false)
    expect(options?.onEditComplete?.({})).toBe('accept')

    cleanup()

    const custom = vi.fn(() => 'reject' as const)
    render(CodeBlockNode, {
      props: {
        node: makeNode('const accept = false'),
        loading: false,
        showHeader: false,
        codeBlockOptions: { onEditComplete: custom },
        ref,
      },
    })
    await waitFor(() => expect(runtime.createCodeBlockRuntime).toHaveBeenCalledTimes(2))

    const customOptions = runtime.createCodeBlockRuntime.mock.calls
      .map(([value]: [Record<string, any>]) => value)
      .filter(Boolean)
      .filter((value: Record<string, any>) => value.stream === false)
      .at(-1)
    expect(customOptions?.onEditComplete).toBe(custom)
    expect(customOptions?.onEditComplete({})).toBe('reject')
  })
})
