let monacoModule: any = null
let importAttempted = false
let pendingImport: Promise<MonacoRuntimeModule | null> | null = null
let workersPreloaded = false

const runtimeLoaders = [
  () => import('stream-diffs'),
  () => import('stream-monaco'),
]

function normalizeRuntimeModule(imported: any): MonacoRuntimeModule | null {
  if (typeof imported?.useMonaco === 'function')
    return imported
  return typeof imported?.default?.useMonaco === 'function' ? imported.default : null
}

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
  whenVisualReady?: () => Promise<boolean> | boolean
}

export interface MonacoRuntimeModule {
  useMonaco: (options?: Record<string, unknown>) => MonacoRuntimeHelpers
  preloadMonacoWorkers?: () => Promise<unknown> | unknown
  getOrCreateHighlighter?: (...args: unknown[]) => Promise<unknown> | unknown
}

async function preloadWorkers(mod: any) {
  if (workersPreloaded)
    return
  const existingEnv = (globalThis as any)?.MonacoEnvironment
  if (existingEnv && (typeof existingEnv.getWorker === 'function' || typeof existingEnv.getWorkerUrl === 'function')) {
    workersPreloaded = true
    return
  }
  if (typeof mod?.preloadMonacoWorkers === 'function')
    await mod.preloadMonacoWorkers()
  workersPreloaded = true
}

async function warmupShikiTokenizer(mod: any) {
  const getOrCreateHighlighter = mod?.getOrCreateHighlighter
  if (typeof getOrCreateHighlighter !== 'function')
    return true

  try {
    const highlighter = await getOrCreateHighlighter(
      ['vitesse-dark', 'vitesse-light'],
      ['javascript'],
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
    for (const load of runtimeLoaders) {
      try {
        const imported: any = await load()
        const candidate = normalizeRuntimeModule(imported)
        if (!candidate)
          continue
        await preloadWorkers(candidate)

        const ready = await warmupShikiTokenizer(candidate)
        if (!ready)
          continue

        monacoModule = candidate
        return monacoModule
      }
      catch {}
    }

    importAttempted = true
    return null
  })()

  try {
    return await pendingImport
  }
  finally {
    pendingImport = null
  }
}
