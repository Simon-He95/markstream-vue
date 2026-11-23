import type { CodeBlockNodeHandle } from '../packages/markstream-react/src/components/CodeBlockNode/CodeBlockNode'
import React, { act, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CodeBlockNode } from '../packages/markstream-react/src/components/CodeBlockNode/CodeBlockNode'

interface StreamDiffsHelpers {
  createCodeBlockRuntime: ReturnType<typeof vi.fn>
  createEditor: ReturnType<typeof vi.fn>
  createDiffEditor: ReturnType<typeof vi.fn>
  updateCode: ReturnType<typeof vi.fn>
  updateDiff: ReturnType<typeof vi.fn>
  getEditor: ReturnType<typeof vi.fn>
  getEditorView: ReturnType<typeof vi.fn>
  getDiffEditorView: ReturnType<typeof vi.fn>
  getSurface: ReturnType<typeof vi.fn>
  cleanupEditor: ReturnType<typeof vi.fn>
  safeClean: ReturnType<typeof vi.fn>
  refreshDiffPresentation: ReturnType<typeof vi.fn>
  setTheme: ReturnType<typeof vi.fn>
  finalizeCode?: ReturnType<typeof vi.fn>
  finalizeDiff?: ReturnType<typeof vi.fn>
  whenVisualReady?: ReturnType<typeof vi.fn>
}

function helpers(): StreamDiffsHelpers {
  return (globalThis as any).__streamDiffsHelpers
}

function resetHelpers() {
  const runtime = helpers()
  const makeEditorView = () => ({
    getModel: () => ({ getLineCount: () => 1 }),
    getOption: () => 14,
    updateOptions: vi.fn(),
    layout: vi.fn(),
  })

  runtime.createCodeBlockRuntime.mockReset().mockImplementation(() => runtime)
  runtime.createEditor.mockReset().mockImplementation(async () => {})
  runtime.createDiffEditor.mockReset().mockImplementation(async () => {})
  runtime.updateCode.mockReset()
  runtime.updateDiff.mockReset()
  runtime.getEditor.mockReset().mockImplementation(() => null)
  runtime.getEditorView.mockReset().mockReturnValue(makeEditorView())
  runtime.getDiffEditorView.mockReset().mockReturnValue(makeEditorView())
  runtime.getSurface.mockReset().mockReturnValue(null)
  runtime.cleanupEditor.mockReset().mockImplementation(() => {})
  runtime.safeClean.mockReset().mockImplementation(() => {})
  runtime.refreshDiffPresentation.mockReset().mockImplementation(() => {})
  runtime.setTheme.mockReset().mockImplementation(async () => {})
  runtime.finalizeCode?.mockReset().mockImplementation(async () => {})
  runtime.finalizeDiff?.mockReset().mockImplementation(async () => {})
  delete runtime.whenVisualReady
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  })
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

interface MountedBlock {
  ref: React.RefObject<CodeBlockNodeHandle | null>
  rerender: (props: Record<string, unknown>) => Promise<void>
  unmount: () => Promise<void>
}

async function mountBlock(
  props: Record<string, unknown>,
  ref: React.RefObject<CodeBlockNodeHandle | null>,
): Promise<MountedBlock> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const render = async (nextProps: Record<string, unknown>) => {
    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, { ...nextProps, ref }))
    })
    await flushReact()
  }
  await render(props)
  return {
    ref,
    rerender: render,
    unmount: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
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

afterEach(() => {
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('markstream-react CodeBlockNode editing API', () => {
  beforeEach(() => {
    resetHelpers()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  })

  it('delegates every shared method through the public forwardRef handle', async () => {
    const runtime = helpers()
    const editor = makeEditor()
    const surface = makeSurface(editor)
    runtime.getSurface.mockReturnValue(surface)

    const ref = createRef<CodeBlockNodeHandle>()
    const block = await mountBlock({
      node: makeNode('const ready = true'),
      loading: false,
      showHeader: false,
    }, ref)
    await vi.waitFor(() => expect(ref.current).not.toBeNull())
    const api = ref.current!

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

    await block.unmount()
  })

  it('prepares a not-ready surface before attaching the editor', async () => {
    const runtime = helpers()
    const editor = makeEditor()
    const surface = makeSurface(editor)
    surface.isReadyToEdit.mockReturnValue(false)
    ;(surface as any).prepareForEditing = vi.fn(async () => {})
    runtime.getSurface.mockReturnValue(surface)

    const ref = createRef<CodeBlockNodeHandle>()
    const block = await mountBlock({
      node: makeNode('const ready = false'),
      loading: false,
      showHeader: false,
    }, ref)
    await vi.waitFor(() => expect(ref.current).not.toBeNull())

    await expect(ref.current!.startEditing()).resolves.toBe(editor)
    expect(surface.prepareForEditing).toHaveBeenCalledTimes(1)
    expect(surface.startEditing).toHaveBeenCalledTimes(1)

    await block.unmount()
  })

  it('reports the shared missing-surface and loading errors', async () => {
    const runtime = helpers()
    runtime.getSurface.mockReturnValue(null)

    const ref = createRef<CodeBlockNodeHandle>()
    const block = await mountBlock({
      node: makeNode('const pending = true', true),
      loading: true,
      showHeader: false,
    }, ref)
    await vi.waitFor(() => expect(ref.current).not.toBeNull())

    expect(ref.current!.getSurface()).toBeNull()
    expect(ref.current!.isReadyToEdit()).toBe(false)
    await expect(ref.current!.startEditing()).rejects.toThrow(/finish streaming/)
    expect(() => ref.current!.applyEdits([], false)).toThrow(/not ready for edits/)

    await block.unmount()

    const notReadyRef = createRef<CodeBlockNodeHandle>()
    const notReady = await mountBlock({
      node: makeNode('const missing = true'),
      loading: false,
      showHeader: false,
    }, notReadyRef)
    await vi.waitFor(() => expect(notReadyRef.current).not.toBeNull())
    await expect(notReadyRef.current!.startEditing()).rejects.toThrow(/not ready/)
    await notReady.unmount()
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

    const ref = createRef<CodeBlockNodeHandle>()
    const block = await mountBlock({
      node: makeNode('const value = 1\n'),
      loading: false,
      showHeader: false,
    }, ref)
    await vi.waitFor(() => expect(ref.current).not.toBeNull())

    expect(ref.current!.getCode()).toBe('const value = 1')

    surface.getNativeInstance.mockReturnValue({ file: { contents: 'completed native code\n' } })
    expect(ref.current!.getCode()).toBe('completed native code')

    surface.getNativeInstance.mockReturnValue({ fileDiff: { additionLines: ['completed diff code\n'] } })
    expect(ref.current!.getCode()).toBe('completed diff code')

    surface.getEditingFile.mockReturnValue({ contents: 'active edit\n' })
    expect(ref.current!.getCode()).toBe('active edit')

    // Live display code: a new node value must not be hidden by a stale ref.
    surface.getEditingFile.mockReturnValue(undefined)
    surface.getNativeInstance.mockReturnValue(undefined)
    await block.rerender({
      node: makeNode('const value = 2\n'),
      loading: false,
      showHeader: false,
    })
    expect(ref.current!.getCode()).toBe('const value = 2')

    await block.rerender({
      node: makeNode('const value = 3\n\n'),
      loading: false,
      showHeader: false,
    })
    expect(ref.current!.getCode()).toBe('const value = 3\n')

    await block.rerender({
      node: {
        ...makeNode('const old = true\n'),
        diff: true,
        originalCode: 'const old = true\n',
        updatedCode: 'const new = true\n\n',
      },
      loading: false,
      showHeader: false,
    })
    expect(ref.current!.getCode()).toBe('const new = true\n')

    await block.unmount()
  })

  it('uses the accepting onEditComplete default and preserves a consumer handler', async () => {
    const runtime = helpers()
    runtime.getSurface.mockReturnValue(null)

    const ref = createRef<CodeBlockNodeHandle>()
    const block = await mountBlock({
      node: makeNode('const accept = true'),
      loading: false,
      showHeader: false,
    }, ref)

    const options = runtime.createCodeBlockRuntime.mock.calls
      .map(([value]: [Record<string, any>]) => value)
      .filter(Boolean)
      .find(value => value.stream === false)
    expect(options?.onEditComplete?.({})).toBe('accept')

    await block.unmount()

    const custom = vi.fn(() => 'reject' as const)
    const second = await mountBlock({
      node: makeNode('const accept = false'),
      loading: false,
      showHeader: false,
      codeBlockOptions: { onEditComplete: custom },
    }, ref)
    const customOptions = runtime.createCodeBlockRuntime.mock.calls
      .map(([value]: [Record<string, any>]) => value)
      .filter(Boolean)
      .filter(value => value.stream === false)
      .at(-1)
    expect(customOptions?.onEditComplete).toBe(custom)
    expect(customOptions?.onEditComplete({})).toBe('reject')

    await second.unmount()
  })

  it('forwards the handle through the next CodeBlock entry after hydration', async () => {
    const runtime = helpers()
    const editor = makeEditor()
    const surface = makeSurface(editor)
    runtime.getSurface.mockReturnValue(surface)
    const { CodeBlockNode: NextCodeBlockNode } = await import('../packages/markstream-react/src/next')

    const ref = createRef<CodeBlockNodeHandle>()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(React.createElement(NextCodeBlockNode as any, {
        node: makeNode('const nextEntry = true'),
        loading: false,
        showHeader: false,
        ref,
      }))
    })
    await flushReact()

    await vi.waitFor(() => expect(ref.current).not.toBeNull())
    expect(ref.current!.getSurface()).toBe(surface)

    await act(async () => root.unmount())
    host.remove()
  })
})
