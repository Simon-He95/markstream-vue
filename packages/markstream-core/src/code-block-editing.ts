export type CodeBlockEditStopReason = 'discard' | 'complete'
export type CodeBlockEditSide = 'additions' | 'deletions'
export type CodeBlockEditHunkDirection = 'up' | 'down' | 'both'

export interface CodeBlockEditingFile {
  name?: string
  contents: string
  lang?: string
}

export interface StreamDiffsEditorLike {
  getText: () => string
  getFile?: () => CodeBlockEditingFile | undefined
  canUndo?: boolean
  canRedo?: boolean
  undo?: () => void
  redo?: () => void
  applyEdits?: (edits: unknown[], updateHistory?: boolean) => void
  focus?: (options?: Record<string, unknown>) => void
  blur?: () => void
  getViewState?: () => unknown
  setViewState?: (state: unknown) => void
  setSelections?: (selections: unknown[]) => void
}

export interface StreamDiffsSurfaceLike {
  isReadyToEdit?: () => boolean
  isEditing?: () => boolean
  prepareForEditing?: () => Promise<void>
  startEditing?: (options?: Record<string, unknown>, editStateKey?: string) => Promise<StreamDiffsEditorLike>
  stopEditing?: (reason?: CodeBlockEditStopReason) => void
  getEditor?: () => StreamDiffsEditorLike | undefined
  getEditingFile?: () => CodeBlockEditingFile | undefined
  getEditingText?: () => string | undefined
  canUndo?: () => boolean
  canRedo?: () => boolean
  undo?: () => void
  redo?: () => void
  applyEdits?: (edits: unknown[], updateHistory?: boolean) => void
  focusEditor?: (options?: Record<string, unknown>) => void
  blurEditor?: () => void
  getEditorViewState?: () => unknown
  setEditorViewState?: (state: unknown) => void
  setEditorSelections?: (selections: unknown[]) => void
  revealLine?: (lineNumber: number, side?: CodeBlockEditSide) => boolean
  expandLine?: (target: unknown) => void
  expandHunk?: (hunkIndex: number, direction: CodeBlockEditHunkDirection, expansionLineCountOverride?: number) => void
  setEditorActiveLine?: (lineNumber: number | null, options?: Record<string, unknown>) => void
  getNearestRenderableLine?: (lineNumber: number, direction: 'up' | 'down') => number | undefined
  isLineInCollapsedContext?: (lineNumber: number, side?: CodeBlockEditSide, expandedHunks?: Map<number, unknown>) => boolean
  getCodeScrollLeft?: () => number
  setCodeScrollLeft?: (position: number) => void
  getResolvedFile?: () => CodeBlockEditingFile | undefined
  getNativeInstance?: () => {
    file?: { contents?: string }
    fileDiff?: { additionLines?: readonly string[] }
  } | undefined
  getDiff?: () => unknown
  getInput?: () => unknown
}

export interface CodeBlockNodeEditingApi {
  /** Current native-backed surface once the block has finalized. */
  getSurface: () => StreamDiffsSurfaceLike | null
  /** Whether an edit session can attach without waiting. */
  isReadyToEdit: () => boolean
  isEditing: () => boolean
  /** Attach an upstream Diffs editor; resolves with the editor instance. */
  startEditing: (options?: Record<string, unknown>, editStateKey?: string) => Promise<StreamDiffsEditorLike>
  stopEditing: (reason?: CodeBlockEditStopReason) => void
  getEditor: () => StreamDiffsEditorLike | null
  getEditingText: () => string | null
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  applyEdits: (edits: unknown[], updateHistory?: boolean) => void
  focusEditor: (options?: Record<string, unknown>) => void
  blurEditor: () => void
  revealLine: (lineNumber: number, side?: CodeBlockEditSide) => boolean
  expandLine: (target: unknown) => void
  expandHunk: (hunkIndex: number, direction: CodeBlockEditHunkDirection, expansionLineCountOverride?: number) => void
  setEditorActiveLine: (lineNumber: number | null, options?: Record<string, unknown>) => void
  getCodeScrollLeft: () => number
  setCodeScrollLeft: (position: number) => void
  /** Current code, including active edits and completed edit sessions. */
  getCode: () => string
}

export const CODE_BLOCK_EDIT_COMPLETE_ACCEPT = () => 'accept' as const
export const CODE_BLOCK_EDIT_COMPLETE_REJECT = () => 'reject' as const

export const CODE_BLOCK_EDITING_ERRORS = {
  mounted: 'CodeBlockNode is not mounted',
  enhancedRuntime: 'The enhanced code-block runtime is unavailable; install stream-diffs and keep it loaded before editing',
  loading: 'Wait for the code block to finish streaming before editing',
  notReady: 'The code block surface is not ready',
  missingEdits: 'The code block surface is not ready for edits',
  unsupported: 'The installed stream-diffs version does not expose editing; upgrade stream-diffs',
} as const

export function normalizeCodeBlockDisplayCode(value: unknown): string {
  return String(value ?? '').replace(/\r\n$|\n$|\r$/, '')
}

export function resolveCodeBlockSurfaceCode(
  surface: StreamDiffsSurfaceLike | null | undefined,
  displayCode: string,
): string {
  const native = surface?.getNativeInstance?.()
  const code = surface?.getEditingFile?.()?.contents
    ?? native?.file?.contents
    ?? native?.fileDiff?.additionLines?.join('')
    ?? surface?.getResolvedFile?.()?.contents
  return normalizeCodeBlockDisplayCode(code == null ? displayCode : code)
}

export async function prepareCodeBlockSurfaceForEditing(surface: StreamDiffsSurfaceLike): Promise<void> {
  if (surface.isReadyToEdit?.() === false && surface.prepareForEditing)
    await surface.prepareForEditing()
}

export interface ResolveCodeBlockEditingSurfaceOptions {
  getSurface: () => StreamDiffsSurfaceLike | null
  ensureSurface?: () => Promise<unknown>
  isLoading?: () => boolean
  isFallback?: () => boolean
  isUnmounted?: () => boolean
}

export interface CreateCodeBlockEditingApiOptions extends ResolveCodeBlockEditingSurfaceOptions {
  getDisplayCode: () => string
}

export async function resolveEditableCodeBlockSurface(
  options: ResolveCodeBlockEditingSurfaceOptions,
): Promise<StreamDiffsSurfaceLike> {
  if (options.isUnmounted?.())
    throw new Error(CODE_BLOCK_EDITING_ERRORS.mounted)
  if (options.isFallback?.())
    throw new Error(CODE_BLOCK_EDITING_ERRORS.enhancedRuntime)

  if (!options.isLoading?.())
    await options.ensureSurface?.()

  if (options.isUnmounted?.())
    throw new Error(CODE_BLOCK_EDITING_ERRORS.mounted)
  if (options.isFallback?.())
    throw new Error(CODE_BLOCK_EDITING_ERRORS.enhancedRuntime)
  if (options.isLoading?.())
    throw new Error(CODE_BLOCK_EDITING_ERRORS.loading)

  const surface = options.getSurface()
  if (!surface)
    throw new Error(CODE_BLOCK_EDITING_ERRORS.notReady)

  await prepareCodeBlockSurfaceForEditing(surface)
  return surface
}

export function createCodeBlockEditingApi(
  options: CreateCodeBlockEditingApiOptions,
): CodeBlockNodeEditingApi {
  return {
    getSurface: options.getSurface,
    isReadyToEdit: () => Boolean(options.getSurface()?.isReadyToEdit?.()),
    isEditing: () => Boolean(options.getSurface()?.isEditing?.()),
    async startEditing(editorOptions, editStateKey) {
      const surface = await resolveEditableCodeBlockSurface(options)
      if (!surface.startEditing)
        throw new Error(CODE_BLOCK_EDITING_ERRORS.unsupported)
      return surface.startEditing(editorOptions, editStateKey)
    },
    stopEditing(reason) {
      options.getSurface()?.stopEditing?.(reason)
    },
    getEditor: () => options.getSurface()?.getEditor?.() ?? null,
    getEditingText: () => options.getSurface()?.getEditingText?.() ?? null,
    undo: () => options.getSurface()?.undo?.(),
    redo: () => options.getSurface()?.redo?.(),
    canUndo: () => Boolean(options.getSurface()?.canUndo?.()),
    canRedo: () => Boolean(options.getSurface()?.canRedo?.()),
    applyEdits(edits, updateHistory) {
      const surface = options.getSurface()
      if (!surface)
        throw new Error(CODE_BLOCK_EDITING_ERRORS.missingEdits)
      if (!surface.applyEdits)
        throw new Error(CODE_BLOCK_EDITING_ERRORS.unsupported)
      surface.applyEdits(edits, updateHistory)
    },
    focusEditor: editorOptions => options.getSurface()?.focusEditor?.(editorOptions),
    blurEditor: () => options.getSurface()?.blurEditor?.(),
    revealLine: (lineNumber, side) => options.getSurface()?.revealLine?.(lineNumber, side) ?? false,
    expandLine: target => options.getSurface()?.expandLine?.(target),
    expandHunk: (hunkIndex, direction, expansionLineCountOverride) => options.getSurface()?.expandHunk?.(hunkIndex, direction, expansionLineCountOverride),
    setEditorActiveLine: (lineNumber, editorOptions) => options.getSurface()?.setEditorActiveLine?.(lineNumber, editorOptions),
    getCodeScrollLeft: () => options.getSurface()?.getCodeScrollLeft?.() ?? 0,
    setCodeScrollLeft: position => options.getSurface()?.setCodeScrollLeft?.(position),
    getCode: () => resolveCodeBlockSurfaceCode(options.getSurface(), options.getDisplayCode()),
  }
}

export function applyDefaultCodeBlockEditComplete<T extends Record<string, unknown>>(options: T): T {
  const target = options as Record<string, unknown>
  if (typeof target.onEditComplete !== 'function')
    target.onEditComplete = CODE_BLOCK_EDIT_COMPLETE_ACCEPT
  return options
}
