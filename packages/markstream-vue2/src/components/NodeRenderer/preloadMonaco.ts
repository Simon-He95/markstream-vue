let isPreload = false

/**
 * Preload the stream-diffs worker stack ahead of the first editor mount.
 * stream-diffs exports `preloadMonacoWorkers()`; the MonacoEnvironment check
 * is kept as a harmless guard for consumers that already configured workers.
 */
export async function preload(m: any) {
  if (isPreload)
    return
  isPreload = true
  const existingEnv = (globalThis as any)?.MonacoEnvironment
  if (existingEnv && (typeof existingEnv.getWorker === 'function' || typeof existingEnv.getWorkerUrl === 'function'))
    return
  return m.preloadMonacoWorkers()
}
