import type { CodeBlockNodeEditingApi, StreamDiffsSurfaceLike } from 'markstream-core'
import type { CodeBlockThemeProp, CodeBlockThemes } from '../../types/component-props'
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
  theme?: CodeBlockThemeProp
  themes?: CodeBlockThemes
  onThemeChange?: () => void
  onEditComplete?: (...args: any[]) => 'accept' | 'reject'
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
  /** Native-backed controller used by the editing API. */
  getSurface?: () => StreamDiffsSurfaceLike | null
  cleanupEditor?: () => void
  safeClean?: () => void
  refreshDiffPresentation?: () => Promise<unknown> | unknown
  setTheme?: (theme: CodeBlockThemeProp | undefined) => Promise<void> | void
  whenVisualReady?: () => Promise<boolean>
}

export interface StreamDiffsModule {
  createCodeBlockRuntime: (options: StreamDiffsRuntimeOptions) => StreamDiffsHelpers | null | undefined
  detectLanguage?: (code: string) => string
  preloadStreamDiffs?: () => Promise<unknown> | unknown
}

interface StreamDiffsUpstreamModule {
  createCodeBlockRuntime?: StreamDiffsModule['createCodeBlockRuntime']
  useMonaco?: StreamDiffsModule['createCodeBlockRuntime']
  detectLanguage?: StreamDiffsModule['detectLanguage']
  preloadStreamDiffs?: StreamDiffsModule['preloadStreamDiffs']
}

let mod: StreamDiffsModule | null = null
let loadingPromise: Promise<StreamDiffsModule | null> | null = null

function normalizeStreamDiffsModule(value: unknown): StreamDiffsModule | null {
  const moduleValue = value as StreamDiffsUpstreamModule | undefined
  const source = typeof moduleValue?.createCodeBlockRuntime === 'function' || typeof moduleValue?.useMonaco === 'function'
    ? moduleValue
    : (value as { default?: unknown } | undefined)?.default as StreamDiffsUpstreamModule | undefined
  const factory = source?.createCodeBlockRuntime ?? source?.useMonaco
  if (typeof factory !== 'function')
    return null

  return {
    createCodeBlockRuntime: options => factory.call(source, options),
    detectLanguage: source?.detectLanguage?.bind(source),
    preloadStreamDiffs: source?.preloadStreamDiffs?.bind(source),
  }
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
        mod = normalizeStreamDiffsModule(await import('stream-diffs/markstream'))
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

export type { StreamDiffsEditorLike, StreamDiffsSurfaceLike } from 'markstream-core'

export type CodeBlockNodeExposed = CodeBlockNodeEditingApi
