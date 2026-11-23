import type { StreamDiffsSurfaceLike } from '../src/code-block-editing'
import { describe, expect, it, vi } from 'vitest'
import {
  applyDefaultCodeBlockEditComplete,
  CODE_BLOCK_EDITING_ERRORS,
  createCodeBlockEditingApi,
  normalizeCodeBlockDisplayCode,
  prepareCodeBlockSurfaceForEditing,
  resolveCodeBlockSurfaceCode,
  resolveEditableCodeBlockSurface,
} from '../src/code-block-editing'

describe('code block editing helpers', () => {
  it('normalizes exactly one trailing line ending', () => {
    expect(normalizeCodeBlockDisplayCode('a\r\n')).toBe('a')
    expect(normalizeCodeBlockDisplayCode('a\n')).toBe('a')
    expect(normalizeCodeBlockDisplayCode('a\r')).toBe('a')
    expect(normalizeCodeBlockDisplayCode('a\n\n')).toBe('a\n')
    expect(normalizeCodeBlockDisplayCode(null)).toBe('')
  })

  it('resolves code with the documented precedence', () => {
    const surface: StreamDiffsSurfaceLike = {
      getEditingFile: () => ({ contents: 'editing\n' }),
      getNativeInstance: () => ({ file: { contents: 'native\n' }, fileDiff: { additionLines: ['diff\n'] } }),
      getResolvedFile: () => ({ contents: 'resolved\n' }),
    }
    expect(resolveCodeBlockSurfaceCode(surface, 'display')).toBe('editing')

    surface.getEditingFile = undefined
    expect(resolveCodeBlockSurfaceCode(surface, 'display')).toBe('native')

    surface.getNativeInstance = () => ({ fileDiff: { additionLines: ['diff\n'] } })
    expect(resolveCodeBlockSurfaceCode(surface, 'display')).toBe('diff')

    surface.getNativeInstance = undefined
    expect(resolveCodeBlockSurfaceCode(surface, 'display')).toBe('resolved')

    surface.getResolvedFile = undefined
    expect(resolveCodeBlockSurfaceCode(surface, 'display\n')).toBe('display')
  })

  it('prepares only a surface that is not ready', async () => {
    const prepare = vi.fn(async () => {})
    await prepareCodeBlockSurfaceForEditing({ isReadyToEdit: () => true, prepareForEditing: prepare })
    expect(prepare).not.toHaveBeenCalled()
    await prepareCodeBlockSurfaceForEditing({ isReadyToEdit: () => false, prepareForEditing: prepare })
    expect(prepare).toHaveBeenCalledTimes(1)
  })

  it('resolves editable surfaces and reports lifecycle errors', async () => {
    const surface: StreamDiffsSurfaceLike = { isReadyToEdit: () => false, prepareForEditing: vi.fn(async () => {}) }
    const ensureSurface = vi.fn(async () => {})
    await expect(resolveEditableCodeBlockSurface({
      getSurface: () => surface,
      ensureSurface,
      isLoading: () => false,
    })).resolves.toBe(surface)
    expect(ensureSurface).toHaveBeenCalledTimes(1)
    expect(surface.prepareForEditing).toHaveBeenCalledTimes(1)

    await expect(resolveEditableCodeBlockSurface({
      getSurface: () => null,
      isLoading: () => true,
    })).rejects.toThrow(CODE_BLOCK_EDITING_ERRORS.loading)
    await expect(resolveEditableCodeBlockSurface({
      getSurface: () => null,
      isLoading: () => false,
    })).rejects.toThrow(CODE_BLOCK_EDITING_ERRORS.notReady)
    await expect(resolveEditableCodeBlockSurface({
      getSurface: () => null,
      isFallback: () => true,
    })).rejects.toThrow(CODE_BLOCK_EDITING_ERRORS.enhancedRuntime)
    await expect(resolveEditableCodeBlockSurface({
      getSurface: () => null,
      isUnmounted: () => true,
    })).rejects.toThrow(CODE_BLOCK_EDITING_ERRORS.mounted)

    let fallback = false
    await expect(resolveEditableCodeBlockSurface({
      getSurface: () => null,
      ensureSurface: async () => { fallback = true },
      isFallback: () => fallback,
    })).rejects.toThrow(CODE_BLOCK_EDITING_ERRORS.enhancedRuntime)

    let loading = false
    await expect(resolveEditableCodeBlockSurface({
      getSurface: () => null,
      ensureSurface: async () => { loading = true },
      isLoading: () => loading,
    })).rejects.toThrow(CODE_BLOCK_EDITING_ERRORS.loading)
  })

  it('creates one stable API contract over a surface', async () => {
    const editor = { getText: () => 'editor' }
    const surface: StreamDiffsSurfaceLike = {
      isReadyToEdit: () => true,
      isEditing: () => true,
      startEditing: vi.fn(async () => editor),
      stopEditing: vi.fn(),
      getEditor: () => editor,
      getEditingText: () => 'editor',
      canUndo: () => true,
      canRedo: () => false,
      undo: vi.fn(),
      redo: vi.fn(),
      applyEdits: vi.fn(),
      focusEditor: vi.fn(),
      blurEditor: vi.fn(),
      revealLine: () => true,
      expandLine: vi.fn(),
      expandHunk: vi.fn(),
      setEditorActiveLine: vi.fn(),
      getCodeScrollLeft: () => 12,
      setCodeScrollLeft: vi.fn(),
      getEditingFile: () => ({ contents: 'editing\n' }),
    }
    const api = createCodeBlockEditingApi({
      getSurface: () => surface,
      ensureSurface: vi.fn(async () => {}),
      isLoading: () => false,
      getDisplayCode: () => 'display',
    })

    expect(api.getSurface()).toBe(surface)
    expect(api.isReadyToEdit()).toBe(true)
    expect(api.isEditing()).toBe(true)
    await expect(api.startEditing({}, 'draft')).resolves.toBe(editor)
    expect(surface.startEditing).toHaveBeenCalledWith({}, 'draft')
    expect(api.getEditor()).toBe(editor)
    expect(api.getEditingText()).toBe('editor')
    expect(api.canUndo()).toBe(true)
    expect(api.canRedo()).toBe(false)
    api.undo()
    api.redo()
    api.applyEdits([{ newText: 'x' }], false)
    expect(surface.applyEdits).toHaveBeenCalledWith([{ newText: 'x' }], false)
    api.focusEditor()
    api.blurEditor()
    expect(surface.focusEditor).toHaveBeenCalledTimes(1)
    expect(surface.blurEditor).toHaveBeenCalledTimes(1)
    expect(api.revealLine(3, 'additions')).toBe(true)
    api.expandLine({ additionLineNumber: 3 })
    api.expandHunk(0, 'both')
    api.setEditorActiveLine(3)
    expect(surface.expandLine).toHaveBeenCalledWith({ additionLineNumber: 3 })
    expect(surface.expandHunk).toHaveBeenCalledWith(0, 'both', undefined)
    expect(surface.setEditorActiveLine).toHaveBeenCalledWith(3, undefined)
    expect(api.getCodeScrollLeft()).toBe(12)
    api.setCodeScrollLeft(40)
    expect(surface.setCodeScrollLeft).toHaveBeenCalledWith(40)
    expect(api.getCode()).toBe('editing')
    api.stopEditing('complete')
    expect(surface.stopEditing).toHaveBeenCalledWith('complete')

    const missing = createCodeBlockEditingApi({ getSurface: () => null, getDisplayCode: () => 'fallback' })
    expect(missing.getSurface()).toBeNull()
    expect(missing.isReadyToEdit()).toBe(false)
    expect(missing.isEditing()).toBe(false)
    expect(missing.getEditor()).toBeNull()
    expect(missing.getEditingText()).toBeNull()
    expect(missing.canUndo()).toBe(false)
    expect(missing.canRedo()).toBe(false)
    expect(missing.revealLine(1)).toBe(false)
    expect(missing.getCodeScrollLeft()).toBe(0)
    expect(missing.getCode()).toBe('fallback')
    expect(() => missing.applyEdits([])).toThrow(CODE_BLOCK_EDITING_ERRORS.missingEdits)
  })

  it('keeps an accepting completion default while preserving consumers', () => {
    const omitted: Record<string, unknown> = {}
    expect(applyDefaultCodeBlockEditComplete(omitted)).toBe(omitted)
    expect((omitted.onEditComplete as () => string)()).toBe('accept')

    const reject = vi.fn(() => 'reject' as const)
    const configured = applyDefaultCodeBlockEditComplete({ onEditComplete: reject })
    expect(configured.onEditComplete).toBe(reject)
  })
})
