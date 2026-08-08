import { preload } from '../NodeRenderer/preloadStreamDiffs'

let mod: any = null
let importAttempted = false

// The 2.0.0 code-block runtime is stream-diffs only. stream-monaco has been
// removed; there is no fallback path.
export async function getStreamDiffsRuntime() {
  if (mod)
    return mod
  if (importAttempted)
    return null
  try {
    mod = await import('stream-diffs')
    await preload(mod)
    return mod
  }
  catch {
    importAttempted = true
    return null
  }
}
