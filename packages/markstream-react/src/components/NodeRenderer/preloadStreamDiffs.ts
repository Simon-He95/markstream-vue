let isPreloaded = false

export async function preloadStreamDiffs(mod: any) {
  if (isPreloaded)
    return
  isPreloaded = true
  if (mod?.preloadStreamDiffsWorkers)
    await mod.preloadStreamDiffsWorkers()
  else if (mod?.preloadMonacoWorkers)
    await mod.preloadMonacoWorkers()
}
