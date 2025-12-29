import { preload } from '../NodeRenderer/preloadMonaco'

let mod: any = null
let importAttempted = false

export async function getUseMonaco() {
  if (mod)
    return mod
  if (importAttempted)
    return null

  try {
    mod = await import('stream-monaco')
    await preload(mod)
    return mod
  }
  catch {
    importAttempted = true
    // Return null to indicate the module is not available
    // The caller should handle the fallback gracefully
    return null
  }
}
