import type { StreamDiffsEditorLike } from 'markstream-core'
import type { SvelteCodeBlockNodeExposed } from '../src/types/codeBlock'
import { mount, tick, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as streamDiffs from '../src/optional/streamDiffs'
import CodeBlockEditingHarness from './fixtures/CodeBlockEditingHarness.svelte'

interface Surface extends Record<string, any> {}

function makeNode(code: string, loading = false) {
  return {
    type: 'code_block',
    language: 'typescript',
    code,
    raw: `\`\`\`typescript\n${code}\n\`\`\``,
    loading,
  } as any
}

function makeSurface(editor: StreamDiffsEditorLike): Surface {
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
  }
}

const state = {
  surface: null as Surface | null,
  create: vi.fn(),
  update: vi.fn(),
  runtime: vi.fn(),
  updateOptions: vi.fn(),
  cleanup: vi.fn(),
  theme: vi.fn(),
}

function createHelpers() {
  let host: HTMLElement | undefined
  return {
    createEditor: async (element: HTMLElement, source: string, language: string) => {
      host = element
      element.innerHTML = `<diffs-container>${source}</diffs-container>`
      state.create(element, source, language)
    },
    updateCode: async (source: string, language?: string) => {
      if (host)
        host.innerHTML = `<diffs-container>${source}</diffs-container>`
      state.update(source, language)
    },
    cleanupEditor: state.cleanup,
    setTheme: state.theme,
    getEditorView: () => ({ updateOptions: state.updateOptions }),
    getSurface: () => state.surface,
    refreshDiffPresentation: () => {},
  }
}

let runtimeSpy: ReturnType<typeof vi.spyOn>
let app: Record<string, any> | undefined
let container: HTMLDivElement
let geometrySpy: ReturnType<typeof vi.spyOn>

async function flush() {
  await tick()
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  await tick()
}

async function mountHarness(node: any, options: { loading?: boolean, stream?: boolean, codeBlockOptions?: Record<string, any> } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  app = mount(CodeBlockEditingHarness, {
    target: container,
    props: {
      node,
      loading: options.loading ?? false,
      stream: options.stream ?? true,
      codeBlockOptions: options.codeBlockOptions,
    },
  }) as unknown as Record<string, any>
  await flush()
  return app.getHandle() as SvelteCodeBlockNodeExposed
}

async function dispose() {
  if (app) {
    await unmount(app as any)
    app = undefined
  }
  container?.remove()
}

beforeEach(() => {
  state.surface = null
  vi.clearAllMocks()
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  geometrySpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 600,
    height: 200,
    top: 0,
    left: 0,
    right: 600,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON() {},
  } as DOMRect)
  runtimeSpy = vi.spyOn(streamDiffs, 'getStreamDiffsRuntime').mockResolvedValue({
    createCodeBlockRuntime: (options: Record<string, unknown>) => {
      state.runtime(options)
      return createHelpers()
    },
  } as any)
})

afterEach(async () => {
  await dispose()
  geometrySpy.mockRestore()
  runtimeSpy.mockRestore()
  vi.unstubAllGlobals()
})

describe('svelte CodeBlockNode editing API', () => {
  it('exposes the shared methods through bind:this and delegates to the live surface', async () => {
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
    const handle = await mountHarness(makeNode('const ready = true\n'))
    await vi.waitFor(() => expect(state.create).toHaveBeenCalledTimes(1))
    await flush()

    expect(handle.getSurface()).toBeNull()
    state.surface = surface
    expect(handle.getSurface()).toBe(surface)
    expect(handle.isReadyToEdit()).toBe(true)
    expect(handle.isEditing()).toBe(false)

    await expect(handle.startEditing({}, 'draft')).resolves.toBe(editor)
    expect(surface.startEditing).toHaveBeenCalledWith({}, 'draft')

    expect(handle.getEditor()).toBe(editor)
    expect(handle.getEditingText()).toBe('edited')
    expect(handle.getCode()).toBe('edited')

    handle.undo()
    handle.redo()
    handle.applyEdits([{ newText: 'x' }], false)
    handle.focusEditor()
    handle.blurEditor()
    expect(surface.undo).toHaveBeenCalledTimes(1)
    expect(surface.redo).toHaveBeenCalledTimes(1)
    expect(surface.applyEdits).toHaveBeenCalledWith([{ newText: 'x' }], false)
    expect(surface.focusEditor).toHaveBeenCalledTimes(1)
    expect(surface.blurEditor).toHaveBeenCalledTimes(1)

    expect(handle.revealLine(3, 'additions')).toBe(true)
    handle.expandLine({ additionLineNumber: 3 })
    handle.expandHunk(0, 'both')
    handle.setEditorActiveLine(3)
    expect(surface.revealLine).toHaveBeenCalledWith(3, 'additions')
    expect(surface.expandLine).toHaveBeenCalledWith({ additionLineNumber: 3 })
    expect(surface.expandHunk).toHaveBeenCalledWith(0, 'both', undefined)
    expect(surface.setEditorActiveLine).toHaveBeenCalledWith(3, undefined)

    expect(handle.getCodeScrollLeft()).toBe(12)
    handle.setCodeScrollLeft(40)
    expect(surface.setCodeScrollLeft).toHaveBeenCalledWith(40)

    handle.stopEditing('complete')
    expect(surface.stopEditing).toHaveBeenCalledWith('complete')
  })

  it('prepares a surface that is not ready and resolves the completed code precedence', async () => {
    const surface = makeSurface({ getText: () => 'edited' })
    const handle = await mountHarness(makeNode('const ready = true\n'))
    await vi.waitFor(() => expect(state.create).toHaveBeenCalledTimes(1))
    await flush()
    state.surface = surface

    surface.isReadyToEdit.mockReturnValue(false)
    await handle.startEditing()
    expect(surface.prepareForEditing).toHaveBeenCalledTimes(1)

    surface.getEditingFile.mockReturnValue(undefined)
    surface.getNativeInstance.mockReturnValue({ file: { contents: 'native code\n' } })
    expect(handle.getCode()).toBe('native code')

    surface.getNativeInstance.mockReturnValue({ fileDiff: { additionLines: ['diff code\n'] } })
    expect(handle.getCode()).toBe('diff code')

    surface.getNativeInstance.mockReturnValue(undefined)
    surface.getResolvedFile.mockReturnValue({ contents: 'settled code\n' })
    expect(handle.getCode()).toBe('settled code')

    surface.getResolvedFile.mockReturnValue(undefined)
    surface.getEditingFile.mockReturnValue(undefined)
    expect(handle.getCode()).toBe('const ready = true')
  })

  it('applies an accepting onEditComplete default while preserving consumers', async () => {
    await mountHarness(makeNode('const ready = true'))
    await vi.waitFor(() => expect(state.create).toHaveBeenCalledTimes(1))
    await flush()
    const runtimeOptions = state.runtime.mock.calls.at(-1)![0] as Record<string, any>
    expect(runtimeOptions.onEditComplete({})).toBe('accept')

    await dispose()
    state.create.mockClear()
    const reject = vi.fn(() => 'reject' as const)
    await mountHarness(makeNode('const ready = true'), { codeBlockOptions: { onEditComplete: reject } })
    await vi.waitFor(() => expect(state.create).toHaveBeenCalledTimes(1))
    await flush()
    const configured = state.runtime.mock.calls.at(-1)![0] as Record<string, any>
    expect(configured.onEditComplete).toBe(reject)
    expect(configured.onEditComplete({})).toBe('reject')
  })

  it('does not resync the native surface before a second edit session', async () => {
    const surface = makeSurface({ getText: () => 'edited' })
    const handle = await mountHarness(makeNode('const ready = true'))
    await vi.waitFor(() => expect(state.create).toHaveBeenCalledTimes(1))
    await flush()
    state.surface = surface

    await handle.startEditing()
    handle.stopEditing('complete')
    state.update.mockClear()
    await handle.startEditing()
    expect(state.update).not.toHaveBeenCalled()
  })

  it('reports a loading error while streaming', async () => {
    const handle = await mountHarness(makeNode('const ready = true'), { loading: true })
    await vi.waitFor(() => expect(state.create).toHaveBeenCalledTimes(1))
    await flush()
    await expect(handle.startEditing()).rejects.toThrow(/finish streaming/)
    expect(() => handle.applyEdits([], false)).toThrow(/not ready for edits/)
  })

  it('reports a missing surface error and the enhanced-runtime error', async () => {
    const handle = await mountHarness(makeNode('const ready = true'))
    await vi.waitFor(() => expect(state.create).toHaveBeenCalledTimes(1))
    await flush()
    expect(handle.getSurface()).toBeNull()
    await expect(handle.startEditing()).rejects.toThrow(/surface is not ready/)

    await dispose()
    runtimeSpy.mockResolvedValue(null as any)
    const fallbackHandle = await mountHarness(makeNode('const ready = true'))
    await vi.waitFor(() => expect(runtimeSpy).toHaveBeenCalled())
    await flush()
    await expect(fallbackHandle.startEditing()).rejects.toThrow(/enhanced code-block runtime is unavailable/)
  })

  it('uses the installed stream-diffs 0.0.5 surface contract', async () => {
    runtimeSpy.mockRestore()
    const runtime = await import('stream-diffs/markstream') as Record<string, any>
    const createRuntime = runtime.createCodeBlockRuntime ?? runtime.useMonaco
    expect(typeof createRuntime).toBe('function')
    const helpers = createRuntime({ stream: false })
    expect(typeof helpers.getSurface).toBe('function')
    expect(helpers.getSurface()).toBeNull()
    expect(typeof helpers.createEditor).toBe('function')
  })
})
