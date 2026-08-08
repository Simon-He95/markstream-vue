let monacoModule: any = null
let importAttempted = false
let pendingImport: Promise<MonacoRuntimeModule | null> | null = null
let workersPreloaded = false

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
  getOrCreateHighlighter?: (...args: unknown[]) => Promise<unknown> | unknown
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
  if (monacoModule)
    return monacoModule
  if (pendingImport)
    return await pendingImport
  if (importAttempted)
    return null

  pendingImport = (async () => {
    try {
      const candidate = await import('stream-diffs')
      if (typeof (candidate as any)?.useMonaco !== 'function') {
        importAttempted = true
        return null
      }
      monacoModule = candidate
      await preloadWorkers(monacoModule)
      return monacoModule
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
