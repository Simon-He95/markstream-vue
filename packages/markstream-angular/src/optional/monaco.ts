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

async function warmupShikiTokenizer(mod: any) {
  const getOrCreateHighlighter = mod?.getOrCreateHighlighter
  if (typeof getOrCreateHighlighter !== 'function')
    return true

  try {
    const highlighter = await getOrCreateHighlighter(
      ['vitesse-dark', 'vitesse-light'],
      ['plaintext', 'text', 'javascript'],
    )

    if (highlighter && typeof highlighter.codeToTokens === 'function') {
      highlighter.codeToTokens('const a = 1', { lang: 'javascript', theme: 'vitesse-dark' })
    }

    return true
  }
  catch (error) {
    console.warn('[markstream-angular] Failed to warm up stream-monaco tokenizer; falling back to plain code rendering.', error)
    return false
  }
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
      const imported: any = await import('stream-monaco')
      monacoModule = imported?.default ?? imported
      await preloadWorkers(monacoModule)

      const ready = await warmupShikiTokenizer(monacoModule)
      if (!ready) {
        monacoModule = null
        importAttempted = true
        return null
      }

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
