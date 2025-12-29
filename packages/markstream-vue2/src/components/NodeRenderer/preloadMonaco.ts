let isPreload = false
export async function preload(m) {
  if (isPreload)
    return
  isPreload = true
  return m.preloadMonacoWorkers()
}
