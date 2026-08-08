let isPreloaded = false
let preloadPromise: Promise<void> | null = null

export async function preload(m: { preloadMonacoWorkers?: () => Promise<unknown> | unknown }) {
  if (isPreloaded)
    return
  if (preloadPromise)
    return preloadPromise

  const pending = (async () => {
    if (typeof m?.preloadMonacoWorkers !== 'function') {
      isPreloaded = true
      return
    }

    await m.preloadMonacoWorkers()
    isPreloaded = true
  })()

  preloadPromise = pending.finally(() => {
    preloadPromise = null
  })

  return preloadPromise
}
