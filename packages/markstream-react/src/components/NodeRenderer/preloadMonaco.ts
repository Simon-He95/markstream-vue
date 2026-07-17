let isPreloaded = false
let preloadPromise: Promise<void> | null = null

export async function preload(mod: any) {
  if (isPreloaded)
    return
  if (preloadPromise)
    return preloadPromise

  const pending = (async () => {
    const existingEnv = (globalThis as any)?.MonacoEnvironment
    if (existingEnv && (typeof existingEnv.getWorker === 'function' || typeof existingEnv.getWorkerUrl === 'function')) {
      isPreloaded = true
      return
    }
    if (typeof mod?.preloadMonacoWorkers === 'function')
      await mod.preloadMonacoWorkers()
    isPreloaded = true
  })()

  preloadPromise = pending.finally(() => {
    preloadPromise = null
  })
  return preloadPromise
}
