import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(resolve(process.cwd(), 'playground-angular/package.json'))
await import(require.resolve('@angular/compiler'))
const { provideZonelessChangeDetection } = await import(require.resolve('@angular/core'))
const { TestBed } = await import(require.resolve('@angular/core/testing'))
const { BrowserTestingModule, platformBrowserTesting } = await import(require.resolve('@angular/platform-browser/testing'))
const { CodeBlockNodeComponent } = await import('../packages/markstream-angular/src/components/CodeBlockNode/CodeBlockNode.component')

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect

function helpers() {
  return (globalThis as any).__streamDiffsHelpers
}

function makeNode(code: string, extra: Record<string, unknown> = {}) {
  return {
    type: 'code_block',
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

async function mountCodeBlock(options: {
  codeBlockOptions?: Record<string, unknown>
  node?: Record<string, unknown>
  props?: Record<string, unknown>
  waitForSurface?: boolean
} = {}) {
  TestBed.resetTestingModule()
  TestBed.configureTestingModule({
    imports: [CodeBlockNodeComponent],
    providers: [provideZonelessChangeDetection()],
  })
  const fixture = TestBed.createComponent(CodeBlockNodeComponent)
  fixture.componentRef.setInput('node', options.node ?? makeNode('const ready = true'))
  fixture.componentRef.setInput('props', { stream: true, showHeader: false, ...(options.props ?? {}) })
  if (options.codeBlockOptions)
    fixture.componentRef.setInput('codeBlockOptions', options.codeBlockOptions)
  fixture.detectChanges()
  await fixture.whenStable()
  if (options.waitForSurface !== false) {
    await vi.waitFor(() => {
      expect(fixture.componentInstance.getSurface()).not.toBeNull()
    })
  }
  return fixture
}

describe('angular CodeBlockNode editing API', () => {
  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting())
    Element.prototype.getBoundingClientRect = () => ({
      width: 100,
      height: 100,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect
  })

  beforeEach(() => {
    const runtimeHelpers = helpers()
    runtimeHelpers.getSurface.mockReturnValue(null)
    runtimeHelpers.createCodeBlockRuntime.mockReturnValue(runtimeHelpers)
    runtimeHelpers.createEditor.mockImplementation(async (host: HTMLElement) => {
      host.innerHTML = '<diffs-container></diffs-container>'
    })
    runtimeHelpers.createDiffEditor.mockImplementation(async (host: HTMLElement) => {
      host.innerHTML = '<diffs-container></diffs-container>'
    })
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

  afterAll(() => {
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
    TestBed.resetTestEnvironment()
  })

  it('delegates the shared editing API to the live surface', async () => {
    const { surface, editor } = makeSurface()
    helpers().getSurface.mockReturnValue(surface)
    const fixture = await mountCodeBlock()
    const api = fixture.componentInstance

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

    fixture.destroy()
  })

  it('prepares a not-yet-ready surface before starting an edit', async () => {
    const { surface } = makeSurface()
    surface.isReadyToEdit.mockReturnValue(false)
    surface.prepareForEditing = vi.fn(async () => {})
    helpers().getSurface.mockReturnValue(surface)
    const fixture = await mountCodeBlock()

    await fixture.componentInstance.startEditing()
    expect(surface.prepareForEditing).toHaveBeenCalledTimes(1)

    fixture.destroy()
  })

  it('reports shared loading and missing-surface errors', async () => {
    const loadingFixture = await mountCodeBlock({
      node: makeNode('const pending = true', { loading: true }),
      props: { loading: true },
      waitForSurface: false,
    })
    const loadingApi = loadingFixture.componentInstance
    expect(loadingApi.getSurface()).toBeNull()
    await expect(loadingApi.startEditing()).rejects.toThrow(/finish streaming/)
    expect(() => loadingApi.applyEdits([], false)).toThrow(/not ready for edits/)
    loadingFixture.destroy()

    const idleFixture = await mountCodeBlock({ waitForSurface: false })
    const idleApi = idleFixture.componentInstance
    expect(idleApi.getSurface()).toBeNull()
    await expect(idleApi.startEditing()).rejects.toThrow(/not ready/)
    idleFixture.destroy()
  })

  it('reads native and diff fallback code with normalization', async () => {
    const { surface } = makeSurface()
    helpers().getSurface.mockReturnValue(surface)
    const fixture = await mountCodeBlock({ node: makeNode('fallback code\n') })
    const api = fixture.componentInstance

    surface.getEditingFile.mockReturnValue(undefined)
    surface.getResolvedFile.mockReturnValue(undefined)
    surface.getNativeInstance = vi.fn(() => ({ file: { contents: 'native code\n' } }))
    expect(api.getCode()).toBe('native code')

    surface.getNativeInstance = vi.fn(() => ({ fileDiff: { additionLines: ['completed diff code\n'] } }))
    expect(api.getCode()).toBe('completed diff code')

    surface.getNativeInstance = vi.fn(() => undefined)
    expect(api.getCode()).toBe('fallback code')

    fixture.destroy()
  })

  it('uses diff updated code as the display fallback and supplies an accepting default', async () => {
    const { surface } = makeSurface()
    helpers().getSurface.mockReturnValue(surface)
    const fixture = await mountCodeBlock({
      node: makeNode('original code', {
        diff: true,
        originalCode: 'original code',
        updatedCode: 'updated code\n',
      }),
    })
    const api = fixture.componentInstance

    surface.getEditingFile.mockReturnValue(undefined)
    surface.getResolvedFile.mockReturnValue(undefined)
    surface.getNativeInstance = vi.fn(() => undefined)
    expect(api.getCode()).toBe('updated code')

    const runtimeOptions = helpers().createCodeBlockRuntime.mock.calls.map(([options]: [Record<string, any>]) => options).filter(options => options?.stream === false).at(-1)
    expect(runtimeOptions?.onEditComplete?.({})).toBe('accept')

    fixture.destroy()
  })

  it('preserves a configured onEditComplete handler', async () => {
    const { surface } = makeSurface()
    helpers().getSurface.mockReturnValue(surface)
    const onEditComplete = vi.fn(() => 'reject' as const)
    const fixture = await mountCodeBlock({ codeBlockOptions: { onEditComplete } })

    const runtimeOptions = helpers().createCodeBlockRuntime.mock.calls.map(([options]: [Record<string, any>]) => options).filter(options => options?.stream === false).at(-1)
    expect(runtimeOptions?.onEditComplete).toBe(onEditComplete)

    fixture.destroy()
  })
})
