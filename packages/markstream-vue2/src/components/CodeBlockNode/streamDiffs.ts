import type { CodeBlockNodeEditingApi } from 'markstream-core'
import { preload } from '../NodeRenderer/preloadStreamDiffs'

export type { StreamDiffsEditorLike, StreamDiffsSurfaceLike } from 'markstream-core'

/**
 * Public handle available through `this.$refs.codeBlock`. Vue 2.6 has no
 * `defineExpose`, so the shared editing API is attached to the component
 * instance at runtime; the generated `.vue.d.ts` cannot infer those manual
 * methods. Cast the ref when you need the typed surface:
 *
 * ```ts
 * const codeBlock = this.$refs.codeBlock as unknown as CodeBlockNodeExposed
 * ```
 */
export type CodeBlockNodeExposed = CodeBlockNodeEditingApi

let mod: any = null
let importAttempted = false

function normalizeStreamDiffsModule(value: any) {
  const source = typeof value?.createCodeBlockRuntime === 'function' || typeof value?.useMonaco === 'function'
    ? value
    : value?.default
  const factory = source?.createCodeBlockRuntime ?? source?.useMonaco
  if (typeof factory !== 'function')
    return null
  return {
    createCodeBlockRuntime: (options?: Record<string, unknown>) => factory.call(source, options),
    detectLanguage: source?.detectLanguage?.bind(source),
    preloadStreamDiffs: source?.preloadStreamDiffs?.bind(source),
  }
}

/**
 * Resolve the optional stream-diffs code-block runtime.
 *
 * stream-diffs is the only supported enhanced code/diff renderer for
 * markstream-vue2. If it is not installed we return null and the caller falls
 * back to plain `<pre><code>` rendering (PreCodeNode).
 */
export async function getStreamDiffsRuntime() {
  if (mod)
    return mod
  if (importAttempted)
    return null

  try {
    const diffs = normalizeStreamDiffsModule(await import('stream-diffs/markstream'))
    if (diffs) {
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

export async function preloadCodeBlockRuntime() {
  return Boolean(await getStreamDiffsRuntime())
}
