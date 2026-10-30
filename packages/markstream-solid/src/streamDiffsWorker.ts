/**
 * Host-injected `WorkerPoolManager` for stream-diffs / @pierre/diffs
 * highlighting.
 *
 * markstream-solid deliberately does NOT bundle or spawn the highlight worker
 * itself — worker assets are bundler-specific (`?worker` in Vite, etc.) and
 * would be fragile inside a multi-bundler library. Instead, the host app
 * creates the pool with its own bundler and injects it here; every enhanced
 * code block then forwards it as the `workerManager` runtime option so Shiki
 * tokenization runs off the main thread.
 *
 * When no pool is injected, highlighting stays on the main thread exactly as
 * before. A broken/terminated pool is non-fatal: `@pierre/diffs` falls back to
 * its main-thread highlighter when the pool reports itself unavailable.
 */

export interface StreamDiffsWorkerPoolLike {
  /**
   * True while the pool is usable. `@pierre/diffs` checks this to decide
   * between worker-based and main-thread highlighting.
   */
  isWorkingPool?: () => boolean
  /** Resolves once workers are spawned and initialized. */
  initialize?: (languages?: string[]) => Promise<void>
  /**
   * Updates worker-side render options (theme). Called by markstream-solid on
   * theme changes so worker-generated tokens match the active theme.
   */
  setRenderOptions?: (options: { theme?: string | { dark: string, light: string } }) => Promise<void> | void
  terminate?: () => void
}

let workerPool: StreamDiffsWorkerPoolLike | null = null

/**
 * Inject (or clear) the shared worker pool. Pass `null`/`undefined` to disable
 * worker-based highlighting and fall back to the main thread.
 *
 * @example
 * ```ts
 * import DiffsWorker from '@pierre/diffs/worker/worker.js?worker'
 * import { getOrCreateWorkerPoolSingleton } from '@pierre/diffs/worker'
 * import { setStreamDiffsWorkerPool } from 'markstream-solid'
 *
 * const pool = getOrCreateWorkerPoolSingleton({
 *   poolOptions: {
 *     poolSize: 4,
 *     workerFactory: () => new DiffsWorker(),
 *   },
 *   highlighterOptions: {
 *     theme: { dark: 'pierre-dark', light: 'pierre-light' },
 *   },
 * })
 * setStreamDiffsWorkerPool(pool)
 * ```
 */
export function setStreamDiffsWorkerPool(pool: StreamDiffsWorkerPoolLike | null | undefined) {
  workerPool = pool ?? null
}

export function getStreamDiffsWorkerPool(): StreamDiffsWorkerPoolLike | null {
  return workerPool
}

/** Clear the injected pool without terminating it (host keeps ownership). */
export function clearStreamDiffsWorkerPool() {
  workerPool = null
}

/** Terminate the injected pool (if it exposes `terminate`) and clear it. */
export function terminateStreamDiffsWorkerPool() {
  try {
    workerPool?.terminate?.()
  }
  catch {
    // ignore
  }
  workerPool = null
}

/**
 * Forward the active theme to the worker pool so worker-produced tokens match
 * the requested theme. No-op when no pool is injected. Failures are non-fatal:
 * tokens still render, and colors catch up on the next sync.
 */
export async function syncStreamDiffsWorkerTheme(
  theme: string | { dark: string, light: string },
) {
  const pool = workerPool
  if (!pool || typeof pool.setRenderOptions !== 'function')
    return
  try {
    await pool.setRenderOptions({ theme })
  }
  catch {
    // Worker pool failures are non-fatal; @pierre/diffs falls back upstream.
  }
}
