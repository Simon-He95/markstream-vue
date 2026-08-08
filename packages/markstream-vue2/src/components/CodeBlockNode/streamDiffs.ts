import { preload } from '../NodeRenderer/preloadMonaco'

let mod: any = null
let importAttempted = false

/**
 * Resolve the stream-diffs runtime and expose its `useMonaco()` helpers.
 *
 * stream-diffs is the only supported enhanced code/diff renderer for
 * markstream-vue2. If it is not installed we return null and the caller falls
 * back to plain `<pre><code>` rendering (PreCodeNode). There is no
 * stream-monaco legacy fallback anymore.
 */
export async function getStreamDiffsRuntime() {
  if (mod)
    return mod
  if (importAttempted)
    return null

  try {
    const diffs = await import('stream-diffs')
    if (typeof diffs?.useMonaco === 'function') {
      mod = diffs
      await preload(mod)
      return mod
    }
  }
  catch {
    // stream-diffs is not installed.
  }

  importAttempted = true
  return null
}
