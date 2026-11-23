import type { StreamDiffsEditorLike, StreamDiffsSurfaceLike } from 'markstream-core'
import type { SolidCodeBlockNodeHandle, SolidCodeBlockNodeProps } from '../src'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CodeBlockNode } from '../src'

const state = vi.hoisted(() => ({
  available: true,
  surface: null as StreamDiffsSurfaceLike | null,
  create: vi.fn(),
  update: vi.fn(),
  cleanup: vi.fn(),
  updateOptions: vi.fn(),
  runtime: vi.fn(),
  theme: vi.fn(),
  finalize: vi.fn(),
  finalizeDiff: vi.fn(),
}))

vi.mock('../src/optional/streamDiffs', () => ({
  getStreamDiffsRuntime: async () => state.available
    ? {
        createCodeBlockRuntime: (options: Record<string, unknown>) => {
          state.runtime(options)
          let host: HTMLElement | undefined
          return {
            createEditor: async (element: HTMLElement, source: string, language: string) => {
              host = element
              element.textContent = source
              state.create(element, source, language)
            },
            updateCode: async (source: string, language: string) => {
              if (host)
                host.textContent = source
              state.update(source, language)
            },
            cleanupEditor: state.cleanup,
            setTheme: state.theme,
            finalizeCode: state.finalize,
            finalizeDiff: state.finalizeDiff,
            getEditorView: () => ({ updateOptions: state.updateOptions }),
            getSurface: () => state.surface,
            whenVisualReady: async () => true,
          }
        },
      }
    : null,
}))

function makeNode(code: string, loading = false) {
  return {
    type: 'code_block' as const,
    language: 'typescript',
    code,
    raw: `\`\`\`typescript\n${code}\n\`\`\``,
    loading,
  }
}

function makeSurface(editor: StreamDiffsEditorLike): StreamDiffsSurfaceLike & Record<string, any> {
  return {
    isReadyToEdit: vi.fn(() => true),
    isEditing: vi.fn(() => false),
    startEditing: vi.fn(async () => editor),
    stopEditing: vi.fn(),
    getEditor: vi.fn(() => editor),
    getEditingFile: vi.fn(() => ({ contents: 'edited', lang: 'typescript' })),
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
    prepareForEditing: vi.fn(async () => {}),
  } as StreamDiffsSurfaceLike & Record<string, any>
}

let dispose: (() => void) | undefined
let host: HTMLDivElement

function mount(initial: SolidCodeBlockNodeProps) {
  const [props, update] = createSignal(initial)
  dispose = render(() => <CodeBlockNode {...props()} />, host)
  return update
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
}

async function waitForSettled() {
  await vi.waitFor(() => expect(host.querySelector('[data-markstream-pending]')).toBeNull())
  await flush()
}

beforeEach(() => {
  state.available = true
  state.surface = null
  vi.clearAllMocks()
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  host.remove()
  vi.unstubAllGlobals()
})

describe('solid CodeBlockNode editing API', () => {
  it('exposes one stable handle that delegates to the live surface', async () => {
    let handle: SolidCodeBlockNodeHandle | undefined
    const editor: StreamDiffsEditorLike = {
      getText: () => 'edited',
      canUndo: true,
      canRedo: false,
      undo: vi.fn(),
      redo: vi.fn(),
      applyEdits: vi.fn(),
      focus: vi.fn(),
      blur: vi.fn(),
    }
    const surface = makeSurface(editor)
    mount({ node: makeNode('const ready = true\n', false), ref: value => handle = value })
    await vi.waitFor(() => expect(state.create).toHaveBeenCalledTimes(1))
    await waitForSettled()
    expect(handle).toBeDefined()

    expect(handle!.getSurface()).toBeNull()
    state.surface = surface
    expect(handle!.getSurface()).toBe(surface)
    expect(handle!.isReadyToEdit()).toBe(true)
    expect(handle!.isEditing()).toBe(false)

    await expect(handle!.startEditing({}, 'draft')).resolves.toBe(editor)
    expect(surface.startEditing).toHaveBeenCalledWith({}, 'draft')

    expect(handle!.getEditor()).toBe(editor)
    expect(handle!.getEditingText()).toBe('edited')
    expect(handle!.getCode()).toBe('edited')

    handle!.undo()
    handle!.redo()
    handle!.applyEdits([{ newText: 'x' }], false)
    handle!.focusEditor()
    handle!.blurEditor()
    expect(surface.undo).toHaveBeenCalledTimes(1)
    expect(surface.redo).toHaveBeenCalledTimes(1)
    expect(surface.applyEdits).toHaveBeenCalledWith([{ newText: 'x' }], false)
    expect(surface.focusEditor).toHaveBeenCalledTimes(1)
    expect(surface.blurEditor).toHaveBeenCalledTimes(1)

    expect(handle!.revealLine(3, 'additions')).toBe(true)
    handle!.expandLine({ additionLineNumber: 3 })
    handle!.expandHunk(0, 'both')
    handle!.setEditorActiveLine(3)
    expect(surface.revealLine).toHaveBeenCalledWith(3, 'additions')
    expect(surface.expandLine).toHaveBeenCalledWith({ additionLineNumber: 3 })
    expect(surface.expandHunk).toHaveBeenCalledWith(0, 'both', undefined)
    expect(surface.setEditorActiveLine).toHaveBeenCalledWith(3, undefined)

    expect(handle!.getCodeScrollLeft()).toBe(12)
    handle!.setCodeScrollLeft(40)
    expect(surface.setCodeScrollLeft).toHaveBeenCalledWith(40)

    handle!.stopEditing('complete')
    expect(surface.stopEditing).toHaveBeenCalledWith('complete')
  })

  it('tracks surface changes made after mount through the same handle', async () => {
    let handle: SolidCodeBlockNodeHandle | undefined
    const first = makeSurface({ getText: () => 'first' })
    const second = makeSurface({ getText: () => 'second' })
    mount({ node: makeNode('const ready = true', false), ref: value => handle = value })
    await vi.waitFor(() => expect(state.create).toHaveBeenCalledTimes(1))
    await waitForSettled()

    state.surface = first
    expect(handle!.getSurface()).toBe(first)
    state.surface = second
    expect(handle!.getSurface()).toBe(second)
    expect(handle!.getEditingText()).toBe('edited')
  })

  it('prepares a surface that is not ready and resolves the completed code precedence', async () => {
    let handle: SolidCodeBlockNodeHandle | undefined
    const editor: StreamDiffsEditorLike = { getText: () => 'edited' }
    const surface = makeSurface(editor)
    mount({ node: makeNode('const ready = true\n\n', false), ref: value => handle = value })
    await vi.waitFor(() => expect(state.create).toHaveBeenCalledTimes(1))
    await waitForSettled()
    state.surface = surface

    surface.isReadyToEdit.mockReturnValue(false)
    await handle!.startEditing()
    expect(surface.prepareForEditing).toHaveBeenCalledTimes(1)

    surface.getEditingFile.mockReturnValue(undefined)
    surface.getNativeInstance.mockReturnValue({ file: { contents: 'native code\n' } })
    expect(handle!.getCode()).toBe('native code')

    surface.getNativeInstance.mockReturnValue({ fileDiff: { additionLines: ['diff code\n'] } })
    expect(handle!.getCode()).toBe('diff code')

    surface.getNativeInstance.mockReturnValue(undefined)
    surface.getResolvedFile.mockReturnValue({ contents: 'settled code\n' })
    expect(handle!.getCode()).toBe('settled code')

    surface.getResolvedFile.mockReturnValue(undefined)
    surface.getEditingFile.mockReturnValue(undefined)
    expect(handle!.getCode()).toBe('const ready = true\n')
  })

  it('applies an accepting onEditComplete default while preserving consumers', async () => {
    mount({ node: makeNode('const ready = true', false) })
    await vi.waitFor(() => expect(state.create).toHaveBeenCalledTimes(1))
    await waitForSettled()
    const runtimeOptions = state.runtime.mock.calls.at(-1)![0] as Record<string, any>
    expect(runtimeOptions.onEditComplete({})).toBe('accept')

    dispose?.()
    dispose = undefined
    host.replaceChildren()
    const reject = vi.fn(() => 'reject' as const)
    mount({ node: makeNode('const ready = true', false), codeBlockOptions: { onEditComplete: reject } })
    await vi.waitFor(() => expect(state.create).toHaveBeenCalledTimes(2))
    await waitForSettled()
    const configured = state.runtime.mock.calls.at(-1)![0] as Record<string, any>
    expect(configured.onEditComplete).toBe(reject)
    expect(configured.onEditComplete({})).toBe('reject')
  })

  it('uses updatedCode for a diff fallback and normalizes once', async () => {
    let handle: SolidCodeBlockNodeHandle | undefined
    mount({
      node: {
        ...makeNode('const old = true\n', false),
        diff: true,
        originalCode: 'const old = true\n',
        updatedCode: 'const new = true\n\n',
      },
      ref: value => handle = value,
    })
    await vi.waitFor(() => expect(handle).toBeDefined())
    await waitForSettled()
    state.surface = null
    expect(handle!.getCode()).toBe('const new = true\n')
  })

  it('releases the callback ref on cleanup', async () => {
    let handle: SolidCodeBlockNodeHandle | null | undefined
    mount({ node: makeNode('const ready = true', false), ref: value => handle = value })
    await vi.waitFor(() => expect(state.create).toHaveBeenCalledTimes(1))
    await waitForSettled()
    expect(handle).toBeDefined()
    dispose?.()
    dispose = undefined
    expect(handle).toBeNull()
  })

  it('reports a loading error while streaming', async () => {
    let handle: SolidCodeBlockNodeHandle | undefined
    mount({ node: makeNode('const ready = true', true), ref: value => handle = value })
    await vi.waitFor(() => expect(state.create).toHaveBeenCalledTimes(1))
    await waitForSettled()
    await expect(handle!.startEditing()).rejects.toThrow(/finish streaming/)
    expect(() => handle!.applyEdits([], false)).toThrow(/not ready for edits/)
  })

  it('reports a missing surface error after finalization', async () => {
    let handle: SolidCodeBlockNodeHandle | undefined
    state.finalize.mockImplementation(() => {})
    mount({ node: makeNode('const ready = true', false), ref: value => handle = value })
    await vi.waitFor(() => expect(state.create).toHaveBeenCalledTimes(1))
    await waitForSettled()
    expect(handle!.getSurface()).toBeNull()
    await expect(handle!.startEditing()).rejects.toThrow(/surface is not ready/)
  })

  it('reports the enhanced-runtime error when stream-diffs is unavailable', async () => {
    state.available = false
    let handle: SolidCodeBlockNodeHandle | undefined
    mount({ node: makeNode('const ready = true', false), ref: value => handle = value })
    await waitForSettled()
    await expect(handle!.startEditing()).rejects.toThrow(/enhanced code-block runtime is unavailable/)
  })
})
