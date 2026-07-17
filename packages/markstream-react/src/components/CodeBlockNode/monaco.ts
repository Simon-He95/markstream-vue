import { preload } from '../NodeRenderer/preloadMonaco'

let mod: any = null
let importAttempted = false

const runtimeLoaders = [
  () => import('stream-diffs'),
  () => import('stream-monaco'),
]

function normalizeRuntimeModule(imported: any) {
  if (typeof imported?.useMonaco === 'function')
    return imported
  return typeof imported?.default?.useMonaco === 'function' ? imported.default : null
}

export async function getUseMonaco() {
  if (mod)
    return mod
  if (importAttempted)
    return null
  for (const load of runtimeLoaders) {
    try {
      const imported = await load()
      const candidate = normalizeRuntimeModule(imported)
      if (!candidate)
        continue
      await preload(candidate)
      mod = candidate
      return mod
    }
    catch {}
  }

  importAttempted = true
  return null
}
