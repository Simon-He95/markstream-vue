let streamDiffsModule: any = null
let importAttempted = false
let pendingImport: Promise<StreamDiffsRuntimeModule | null> | null = null
let runtimePreloaded = false
let codeBlockRuntimeReady = false
export type StreamDiffsLoader = () => Promise<unknown> | unknown
const defaultStreamDiffsLoader: StreamDiffsLoader = () => import('stream-diffs/markstream')
let streamDiffsLoader: StreamDiffsLoader | null = defaultStreamDiffsLoader

export interface StreamDiffsRuntimeHelpers {
  createEditor?: (container: HTMLElement, code: string, language: string) => Promise<unknown> | unknown
  createDiffEditor?: (container: HTMLElement, original: string, modified: string, language: string) => Promise<unknown> | unknown
  updateCode?: (code: string, language?: string) => Promise<unknown> | unknown
  updateDiff?: (original: string, modified: string, language?: string) => Promise<unknown> | unknown
  cleanupEditor?: () => unknown
  safeClean?: () => unknown
  setTheme?: (theme?: string | Record<string, unknown>) => Promise<unknown> | unknown
  updateOptions?: (options?: Record<string, unknown>) => Promise<unknown> | unknown
  getEditorView?: () => unknown
  getDiffEditorView?: () => unknown
  refreshDiffPresentation?: () => unknown
}

export interface StreamDiffsRuntimeModule {
  createCodeBlockRuntime: (options?: Record<string, unknown>) => StreamDiffsRuntimeHelpers
  preloadStreamDiffs?: () => Promise<unknown> | unknown
}

interface StreamDiffsUpstreamModule {
  createCodeBlockRuntime?: StreamDiffsRuntimeModule['createCodeBlockRuntime']
  useMonaco?: StreamDiffsRuntimeModule['createCodeBlockRuntime']
  preloadStreamDiffs?: StreamDiffsRuntimeModule['preloadStreamDiffs']
}

function normalizeStreamDiffsModule(value: unknown): StreamDiffsRuntimeModule | null {
  const moduleValue = value as StreamDiffsUpstreamModule | undefined
  const source = typeof moduleValue?.createCodeBlockRuntime === 'function' || typeof moduleValue?.useMonaco === 'function'
    ? moduleValue
    : (value as { default?: unknown } | undefined)?.default as StreamDiffsUpstreamModule | undefined
  const factory = source?.createCodeBlockRuntime ?? source?.useMonaco
  if (typeof factory !== 'function')
    return null
  return {
    createCodeBlockRuntime: options => factory.call(source, options),
    preloadStreamDiffs: source?.preloadStreamDiffs?.bind(source),
  }
}

export function isCodeBlockRuntimeReady() {
  return codeBlockRuntimeReady
}

export function resetCodeBlockRuntimeReadyForTest() {
  codeBlockRuntimeReady = false
}

export function setStreamDiffsLoader(loader: StreamDiffsLoader | null) {
  streamDiffsLoader = loader
  streamDiffsModule = null
  pendingImport = null
  importAttempted = false
  runtimePreloaded = false
  codeBlockRuntimeReady = false
}

export function disableStreamDiffs() {
  setStreamDiffsLoader(null)
}

export function enableStreamDiffs(loader?: StreamDiffsLoader) {
  setStreamDiffsLoader(loader ?? defaultStreamDiffsLoader)
}

export async function preloadCodeBlockRuntime() {
  const runtime = await getStreamDiffsRuntime()
  return !!runtime
}

async function preloadRuntime(mod: any) {
  if (runtimePreloaded)
    return
  runtimePreloaded = true
  if (typeof mod?.preloadStreamDiffs === 'function')
    await mod.preloadStreamDiffs()
}

export async function getStreamDiffsRuntime(): Promise<StreamDiffsRuntimeModule | null> {
  if (streamDiffsModule)
    return streamDiffsModule
  if (pendingImport)
    return await pendingImport
  if (importAttempted)
    return null

  pendingImport = (async () => {
    // `stream-diffs` is the only supported enhanced code-block runtime in 2.0.
    try {
      const loader = streamDiffsLoader
      if (!loader) {
        importAttempted = true
        return null
      }
      const candidate = normalizeStreamDiffsModule(await loader())
      if (!candidate)
        return null
      streamDiffsModule = candidate
      await preloadRuntime(streamDiffsModule)
      codeBlockRuntimeReady = true
      return streamDiffsModule
    }
    catch {
      importAttempted = true
      return null
    }
  })()

  try {
    return await pendingImport
  }
  finally {
    pendingImport = null
  }
}
