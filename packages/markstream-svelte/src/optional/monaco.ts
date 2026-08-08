let streamDiffsModule: any = null
let importAttempted = false
let pendingImport: Promise<MonacoRuntimeModule | null> | null = null
let workersPreloaded = false
let codeBlockRuntimeReady = false

export interface MonacoRuntimeHelpers {
  createEditor?: (container: HTMLElement, code: string, language: string) => Promise<unknown> | unknown
  createDiffEditor?: (container: HTMLElement, original: string, modified: string, language: string) => Promise<unknown> | unknown
  updateCode?: (code: string, language?: string) => Promise<unknown> | unknown
  updateDiff?: (original: string, modified: string, language?: string) => Promise<unknown> | unknown
  cleanupEditor?: () => unknown
  safeClean?: () => unknown
  setTheme?: (theme?: string | Record<string, unknown>) => Promise<unknown> | unknown
  getEditorView?: () => unknown
  getDiffEditorView?: () => unknown
  refreshDiffPresentation?: () => unknown
}

export interface MonacoRuntimeModule {
  useMonaco: (options?: Record<string, unknown>) => MonacoRuntimeHelpers
  preloadMonacoWorkers?: () => Promise<unknown> | unknown
}

export function isCodeBlockRuntimeReady() {
  return codeBlockRuntimeReady
}

export function resetCodeBlockRuntimeReadyForTest() {
  codeBlockRuntimeReady = false
}

export async function preloadCodeBlockRuntime() {
  const runtime = await getUseMonaco()
  return !!runtime
}

async function preloadWorkers(mod: any) {
  if (workersPreloaded)
    return
  workersPreloaded = true
  const existingEnv = (globalThis as any)?.MonacoEnvironment
  if (existingEnv && (typeof existingEnv.getWorker === 'function' || typeof existingEnv.getWorkerUrl === 'function'))
    return
  if (typeof mod?.preloadMonacoWorkers === 'function')
    await mod.preloadMonacoWorkers()
}

export async function getUseMonaco(): Promise<MonacoRuntimeModule | null> {
  if (streamDiffsModule)
    return streamDiffsModule
  if (pendingImport)
    return await pendingImport
  if (importAttempted)
    return null

  pendingImport = (async () => {
    // `stream-diffs` is the only supported code-block runtime in 2.0. The
    // heavy `stream-monaco` / `monaco-editor` fallback has been removed.
    try {
      const candidate = await import('stream-diffs')
      if (typeof (candidate as any)?.useMonaco !== 'function')
        return null
      streamDiffsModule = candidate
      await preloadWorkers(streamDiffsModule)
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
