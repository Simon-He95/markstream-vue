import type { CodeBlockTheme } from '../../types/component-props'
import { preload } from '../NodeRenderer/preloadStreamDiffs'
import { markCodeBlockRuntimeReady } from './runtime'

export { isCodeBlockRuntimeReady } from './runtime'

export interface StreamDiffsDisposableLike {
  dispose?: () => void
}

export interface StreamDiffsModelLike {
  getLineCount?: () => number
  getValue?: () => string
}

export interface StreamDiffsEditorViewLike {
  getModel?: () => StreamDiffsModelLike | null | undefined
  getOption?: (option: unknown) => unknown
  updateOptions?: (options: Record<string, unknown>) => void
  layout?: (dimension?: { width: number, height: number }) => void
  getContentHeight?: () => number
  getScrollTop?: () => number
  setScrollTop?: (scrollTop: number) => void
  onDidContentSizeChange?: (listener: () => void) => StreamDiffsDisposableLike | void
  onDidLayoutChange?: (listener: () => void) => StreamDiffsDisposableLike | void
}

export interface StreamDiffsDiffLineChangeLike {
  originalStartLineNumber?: number
  originalEndLineNumber?: number
  modifiedStartLineNumber?: number
  modifiedEndLineNumber?: number
}

export interface StreamDiffsDiffEditorViewLike extends StreamDiffsEditorViewLike {
  getOriginalEditor?: () => StreamDiffsEditorViewLike | null | undefined
  getModifiedEditor?: () => StreamDiffsEditorViewLike | null | undefined
  getLineChanges?: () => StreamDiffsDiffLineChangeLike[] | null | undefined
  onDidUpdateDiff?: (listener: () => void) => StreamDiffsDisposableLike | void
}

export interface StreamDiffsNamespaceLike {
  EditorOption?: {
    fontInfo?: unknown
    lineHeight?: unknown
  }
}

export interface StreamDiffsRuntimeOptions extends Record<string, unknown> {
  theme?: CodeBlockTheme
  themes?: CodeBlockTheme[]
  onThemeChange?: () => void
}

export interface StreamDiffsHelpers {
  createEditor?: (container: HTMLElement, code: string, language: string) => Promise<unknown> | unknown
  createDiffEditor?: (container: HTMLElement, original: string, modified: string, language: string) => Promise<unknown> | unknown
  updateCode?: (code: string, language: string) => Promise<unknown> | unknown
  updateDiff?: (original: string, modified: string, language: string) => Promise<unknown> | unknown
  finalizeCode?: () => Promise<unknown> | unknown
  finalizeDiff?: () => Promise<unknown> | unknown
  getEditor?: () => StreamDiffsNamespaceLike | null
  getEditorView?: () => StreamDiffsEditorViewLike | null
  getDiffEditorView?: () => StreamDiffsDiffEditorViewLike | null
  cleanupEditor?: () => void
  safeClean?: () => void
  refreshDiffPresentation?: () => Promise<unknown> | unknown
  setTheme?: (theme: CodeBlockTheme | undefined) => Promise<void> | void
  whenVisualReady?: () => Promise<boolean>
}

export interface StreamDiffsModule {
  useMonaco?: (options: StreamDiffsRuntimeOptions) => StreamDiffsHelpers | null | undefined
  detectLanguage?: (code: string) => string
  preloadMonacoWorkers?: () => Promise<unknown> | unknown
}

let mod: StreamDiffsModule | null = null
let loadingPromise: Promise<StreamDiffsModule | null> | null = null

function normalizeStreamDiffsModule(value: unknown): StreamDiffsModule | null {
  const moduleValue = value as StreamDiffsModule | undefined
  if (typeof moduleValue?.useMonaco === 'function')
    return moduleValue

  const defaultValue = (value as { default?: unknown } | undefined)?.default as StreamDiffsModule | undefined
  return typeof defaultValue?.useMonaco === 'function' ? defaultValue : null
}

export async function preloadCodeBlockRuntime() {
  const runtime = await getStreamDiffsRuntime()
  return !!runtime
}

export async function getStreamDiffsRuntime(): Promise<StreamDiffsModule | null> {
  if (loadingPromise)
    return loadingPromise

  loadingPromise = (async () => {
    if (!mod) {
      try {
        mod = normalizeStreamDiffsModule(await import('stream-diffs'))
        if (!mod)
          return null
      }
      catch {
        return null
      }
    }

    try {
      await preload(mod)
      markCodeBlockRuntimeReady()
      return mod
    }
    catch {
      // Keep the imported module cached so temporary preload failures can retry.
      return null
    }
  })()

  try {
    return await loadingPromise
  }
  finally {
    loadingPromise = null
  }
}
