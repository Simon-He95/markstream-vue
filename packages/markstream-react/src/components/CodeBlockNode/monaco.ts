import { preloadStreamDiffs } from '../NodeRenderer/preloadStreamDiffs'

let mod: any = null
let importAttempted = false

/**
 * Resolve the stream-diffs runtime. markstream-react 2.0 no longer supports the
 * heavy `stream-monaco` runtime — only the lightweight `stream-diffs` runtime is
 * used to render diff/single code blocks.
 */
export async function getStreamDiffsRuntime() {
  if (mod)
    return mod
  if (importAttempted)
    return null

  importAttempted = true
  try {
    const diffs = await import('stream-diffs')
    if (diffs?.useMonaco) {
      mod = diffs
      await preloadStreamDiffs(mod)
      return mod
    }
  }
  catch {
    // stream-diffs is not installed; the component falls back to the <pre>.
  }

  return null
}
