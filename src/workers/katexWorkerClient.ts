import { isKatexEnabled } from '../components/MathInlineNode/katex'

interface Pending {
  resolve: (val: string) => void
  reject: (err: any) => void
  timeoutId: number
}

let worker: Worker | null = null
let workerInitError: any = null

// runtime debug flag controlled by the main thread
let DEBUG_KATEX_WORKER = false
const pending = new Map<string, Pending>()
// Simple in-memory cache to avoid repeated renders for identical input.
const cache = new Map<string, string>()
const CACHE_MAX = 200
// Limit how many concurrent worker renders can be in-flight.
let MAX_CONCURRENCY = 5
// Waiters that want to be notified when load drops below MAX_CONCURRENCY.
const drainWaiters = new Set<() => void>()

function notifyDrainIfBelowCap() {
  if (pending.size < MAX_CONCURRENCY && drainWaiters.size) {
    const copy = Array.from(drainWaiters)
    drainWaiters.clear()
    for (const fn of copy) {
      try {
        fn()
      }
      catch {
        // ignore
      }
    }
  }
}

// Performance monitoring (optional, dev-only by default)
let perfMonitor: any = null
try {
  // Only load in development. This guard is statically analyzable,
  // so the import below is removed from production builds.
  if (typeof window !== 'undefined' && import.meta.env.DEV) {
    // Use an opaque dynamic import path so bundlers don't emit a chunk in prod builds.
    // This runs only in dev; in production the whole block is tree-shaken.

    import('../utils/performance-monitor').then((a) => {
      perfMonitor = a.perfMonitor
    })
  }
}
catch {
  // Ignore errors
}

/**
 * Allow user to inject a Worker instance, e.g. from Vite ?worker import.
 */
export function setKaTeXWorker(w: Worker) {
  worker = w
  workerInitError = null

  // Set up message handler to process worker responses
  worker.onmessage = (e: MessageEvent) => {
    const { id, html, error } = e.data
    const p = pending.get(id)
    if (!p)
      return

    pending.delete(id)
    clearTimeout(p.timeoutId)
    // notify possible waiters if we freed capacity
    notifyDrainIfBelowCap()

    if (error) {
      p.reject(new Error(error))
    }
    else {
      // Cache the result
      const { content, displayMode } = e.data
      if (content) {
        const cacheKey = `${displayMode ? 'd' : 'i'}:${content}`
        cache.set(cacheKey, html)
        if (cache.size > CACHE_MAX) {
          const firstKey = cache.keys().next().value
          cache.delete(firstKey)
        }
      }
      p.resolve(html)
    }
  }

  // Optional: handle worker errors
  worker.onerror = (e: ErrorEvent) => {
    console.error('[katexWorkerClient] Worker error:', e)
    // Reject all pending requests
    for (const [_id, p] of pending.entries()) {
      clearTimeout(p.timeoutId)
      p.reject(new Error(`Worker error: ${e.message}`))
    }
    pending.clear()
    // capacity is effectively zeroed; notify to allow callers to decide
    notifyDrainIfBelowCap()
  }
}

/**
 * Remove the current worker instance (for cleanup or SSR).
 */
export function clearKaTeXWorker() {
  if (worker) {
    worker.terminate?.()
  }
  worker = null
  workerInitError = null
}

function ensureWorker() {
  if (!worker) {
    workerInitError = new Error('[katexWorkerClient] No worker instance set. Please inject a Worker via setKaTeXWorker().')
    ; (workerInitError as any).name = 'WorkerInitError'
    ; (workerInitError as any).code = 'WORKER_INIT_ERROR'
    return null
  }
  return worker
}

// Allow toggling verbose worker debug logs at runtime. When set, we post an init
// message to an existing worker so the worker can enable logs.
export function setKaTeXWorkerDebug(enabled: boolean) {
  DEBUG_KATEX_WORKER = !!enabled
  if (worker) {
    (worker as any).postMessage({ type: 'init', debug: DEBUG_KATEX_WORKER })
  }
}

export async function renderKaTeXInWorker(content: string, displayMode = true, timeout = 2000, signal?: AbortSignal): Promise<string> {
  const startTime = performance.now()

  if (!isKatexEnabled()) {
    const err = new Error('KaTeX rendering disabled')
    ;(err as any).name = 'KaTeXDisabled'
    ;(err as any).code = 'KATEX_DISABLED'
    return Promise.reject(err)
  }

  if (workerInitError) {
    return Promise.reject(workerInitError)
  }
  // Quick cache hit
  const cacheKey = `${displayMode ? 'd' : 'i'}:${content}`
  const cached = cache.get(cacheKey)
  if (cached) {
    // Record cache hit performance
    if (perfMonitor) {
      perfMonitor.recordRender({
        type: 'cache-hit',
        duration: performance.now() - startTime,
        formulaLength: content.length,
        timestamp: Date.now(),
        success: true,
      })
    }
    return Promise.resolve(cached)
  }
  // If workers are unavailable, reject to let caller fallback
  const wk = ensureWorker()
  if (!wk) {
    return Promise.reject(workerInitError)
  }
  // Enforce simple concurrency cap: if we already have too many in-flight
  // requests, ask caller to handle backpressure (e.g. retry later).
  if (pending.size >= MAX_CONCURRENCY) {
    const err = new Error('Worker busy')
    ; (err as any).name = 'WorkerBusy'
    ; (err as any).code = 'WORKER_BUSY'
    ; (err as any).busy = true
    ; (err as any).inFlight = pending.size
    ; (err as any).max = MAX_CONCURRENCY
    if (perfMonitor) {
      perfMonitor.recordRender({
        type: 'worker',
        duration: performance.now() - startTime,
        formulaLength: content.length,
        timestamp: Date.now(),
        success: false,
        error: 'busy',
      })
    }
    return Promise.reject(err)
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      // align with DOM abort semantics
      const err = new Error('Aborted')
      ; (err as any).name = 'AbortError'
      reject(err)
      return
    }
    const id = Math.random().toString(36).slice(2)
    const timeoutId = (globalThis as any).setTimeout(() => {
      pending.delete(id)
      const err = new Error('Worker render timed out')
      ; (err as any).name = 'WorkerTimeout'
      ; (err as any).code = 'WORKER_TIMEOUT'

      // Record timeout
      if (perfMonitor) {
        perfMonitor.recordRender({
          type: 'worker',
          duration: performance.now() - startTime,
          formulaLength: content.length,
          timestamp: Date.now(),
          success: false,
          error: 'timeout',
        })
      }
      reject(err)
      // a slot freed (this request is no longer pending)
      notifyDrainIfBelowCap()
    }, timeout)

    // Listen for abort to cancel this pending request
    const onAbort = () => {
      (globalThis as any).clearTimeout(timeoutId)
      if (pending.has(id))
        pending.delete(id)
      const err = new Error('Aborted')
      ; (err as any).name = 'AbortError'
      reject(err)
      notifyDrainIfBelowCap()
    }
    if (signal)
      signal.addEventListener('abort', onAbort, { once: true })

    // Wrap original resolve/reject to record performance
    const originalResolve = resolve
    const originalReject = reject
    const wrappedResolve = (val: string) => {
      if (perfMonitor) {
        perfMonitor.recordRender({
          type: 'worker',
          duration: performance.now() - startTime,
          formulaLength: content.length,
          timestamp: Date.now(),
          success: true,
        })
      }
      originalResolve(val)
    }
    const wrappedReject = (err: any) => {
      if (perfMonitor) {
        perfMonitor.recordRender({
          type: 'worker',
          duration: performance.now() - startTime,
          formulaLength: content.length,
          timestamp: Date.now(),
          success: false,
          error: err?.message || String(err),
        })
      }
      originalReject(err)
    }

    pending.set(id, { resolve: wrappedResolve, reject: wrappedReject, timeoutId })

    wk.postMessage({ id, content, displayMode })
  })
}

// Allow callers (e.g. main-thread fallback renderers) to populate the internal cache
// so that synchronous renders can benefit subsequent worker-based calls.
export function setKaTeXCache(content: string, displayMode = true, html: string) {
  const cacheKey = `${displayMode ? 'd' : 'i'}:${content}`
  cache.set(cacheKey, html)
  if (cache.size > CACHE_MAX) {
    const firstKey = cache.keys().next().value
    cache.delete(firstKey)
  }
}

/**
 * Utilities for clients to inspect/adjust worker load behavior
 */
export function getKaTeXWorkerLoad() {
  return { inFlight: pending.size, max: MAX_CONCURRENCY }
}

export function setKaTeXWorkerMaxConcurrency(n: number) {
  if (Number.isFinite(n) && n > 0)
    MAX_CONCURRENCY = Math.floor(n)
}

export const WORKER_BUSY_CODE = 'WORKER_BUSY'

export function isKaTeXWorkerBusy() {
  return pending.size >= MAX_CONCURRENCY
}

export function waitForKaTeXWorkerSlot(timeout = 2000, signal?: AbortSignal): Promise<void> {
  if (pending.size < MAX_CONCURRENCY)
    return Promise.resolve()
  return new Promise((resolve, reject) => {
    let settled = false
    let timer: any
    const onDrain = () => {
      if (settled)
        return
      settled = true
      if (timer)
        (globalThis as any).clearTimeout(timer)
      drainWaiters.delete(onDrain)
      resolve()
    }
    drainWaiters.add(onDrain)
    timer = (globalThis as any).setTimeout(() => {
      if (settled)
        return
      settled = true
      drainWaiters.delete(onDrain)
      const err = new Error('Wait for worker slot timed out')
      ; (err as any).name = 'WorkerBusyTimeout'
      ; (err as any).code = 'WORKER_BUSY_TIMEOUT'
      reject(err)
    }, timeout)
    // If capacity appears in the next microtask, resolve quickly
    queueMicrotask(() => notifyDrainIfBelowCap())
    if (signal) {
      const onAbort = () => {
        if (settled)
          return
        settled = true
        if (timer)
          (globalThis as any).clearTimeout(timer)
        drainWaiters.delete(onDrain)
        const err = new Error('Aborted')
        ; (err as any).name = 'AbortError'
        reject(err)
      }
      if (signal.aborted)
        onAbort()
      else
        signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

export interface BackpressureOptions {
  timeout?: number
  waitTimeout?: number
  backoffMs?: number
  maxRetries?: number
  signal?: AbortSignal
}

// Global defaults for backpressure behavior
const defaultBackpressure = {
  timeout: 2000,
  waitTimeout: 1500,
  backoffMs: 30,
  maxRetries: 1,
}

export function setKaTeXBackpressureDefaults(opts: Partial<typeof defaultBackpressure>) {
  if (opts.timeout != null)
    defaultBackpressure.timeout = Math.max(0, Math.floor(opts.timeout))
  if (opts.waitTimeout != null)
    defaultBackpressure.waitTimeout = Math.max(0, Math.floor(opts.waitTimeout))
  if (opts.backoffMs != null)
    defaultBackpressure.backoffMs = Math.max(0, Math.floor(opts.backoffMs))
  if (opts.maxRetries != null)
    defaultBackpressure.maxRetries = Math.max(0, Math.floor(opts.maxRetries))
}

export function getKaTeXBackpressureDefaults() {
  return { ...defaultBackpressure }
}

/**
 * Convenience wrapper: when worker reports busy, wait for a slot and retry.
 * Does not implement fallback-to-main-thread; leave that to the caller.
 */
export async function renderKaTeXWithBackpressure(
  content: string,
  displayMode = true,
  opts: BackpressureOptions = {},
): Promise<string> {
  if (!isKatexEnabled()) {
    const err = new Error('KaTeX rendering disabled')
    ;(err as any).name = 'KaTeXDisabled'
    ;(err as any).code = 'KATEX_DISABLED'
    throw err
  }

  const timeout = opts.timeout ?? defaultBackpressure.timeout
  const waitTimeout = opts.waitTimeout ?? defaultBackpressure.waitTimeout
  const backoffMs = opts.backoffMs ?? defaultBackpressure.backoffMs
  const maxRetries = opts.maxRetries ?? defaultBackpressure.maxRetries
  const signal = opts.signal

  let attempt = 0
  // quick loop to handle busy->wait->retry pattern
  for (;;) {
    if (signal?.aborted) {
      const err = new Error('Aborted')
      ; (err as any).name = 'AbortError'
      throw err
    }
    try {
      return await renderKaTeXInWorker(content, displayMode, timeout, signal)
    }
    catch (err: any) {
      if (err?.code !== WORKER_BUSY_CODE || attempt >= maxRetries) {
        throw err
      }
      attempt++
      await waitForKaTeXWorkerSlot(waitTimeout, signal).catch(() => { /* ignore, will retry/throw on next loop */ })
      if (signal?.aborted) {
        const e = new Error('Aborted')
        ; (e as any).name = 'AbortError'
        throw e
      }
      if (backoffMs > 0) {
        await new Promise(r => (globalThis as any).setTimeout(r, backoffMs * attempt))
      }
      // continue loop to retry
    }
  }
}
