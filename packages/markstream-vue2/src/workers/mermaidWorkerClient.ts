import { isMermaidEnabled } from '../components/MermaidBlockNode/mermaid'

type Theme = 'light' | 'dark'

let worker: Worker | null = null
let workerInitError: any = null

interface Pending {
  resolve: (v: any) => void
  reject: (e: any) => void
}

const rpcMap = new Map<string, Pending>()

// Basic concurrency cap to reduce flurries of in-flight checks during typing/polling
const MAX_CONCURRENCY_DEFAULT = 5
let maxConcurrency = MAX_CONCURRENCY_DEFAULT

// Runtime toggle for verbose logging
let DEBUG_CLIENT = false
export function setMermaidWorkerClientDebug(enabled: boolean) {
  DEBUG_CLIENT = !!enabled
}

export function setMermaidWorkerMaxConcurrency(n: number) {
  if (Number.isFinite(n) && n > 0)
    maxConcurrency = Math.floor(n)
}

export function getMermaidWorkerLoad() {
  return { inFlight: rpcMap.size, max: maxConcurrency }
}

export const MERMAID_WORKER_BUSY_CODE = 'WORKER_BUSY'
export const MERMAID_DISABLED_CODE = 'MERMAID_DISABLED'

/**
 * Allow user to inject a Worker instance, e.g. from Vite ?worker import.
 */
export function setMermaidWorker(w: Worker) {
  worker = w
  workerInitError = null
  const current = w

  // Set up message handler to process worker responses
  worker.onmessage = (e: MessageEvent) => {
    if (worker !== current)
      return
    const { id, ok, result, error } = e.data
    const p = rpcMap.get(id)
    if (!p)
      return
    if (ok === false || error)
      p.reject(new Error(error || 'Unknown error'))
    else
      p.resolve(result)
  }

  // Optional: handle worker errors
  worker.onerror = (e: ErrorEvent) => {
    if (worker !== current)
      return
    // If no pending calls, this might be a benign/late error; avoid noisy logs
    if (rpcMap.size === 0) {
      console.debug?.('[mermaidWorkerClient] Worker error (no pending):', e?.message || e)
      return
    }
    // Downgrade to debug unless explicitly enabled
    try {
      if (DEBUG_CLIENT)
        console.error('[mermaidWorkerClient] Worker error:', e?.message || e)
      else
        console.debug?.('[mermaidWorkerClient] Worker error:', e?.message || e)
    }
    catch {}
    // Reject all pending requests
    for (const [_id, p] of rpcMap.entries()) {
      p.reject(new Error(`Worker error: ${e.message}`))
    }
    rpcMap.clear()
  }

  // Optional: messageerror indicates a data cloning issue; handle similarly but quiet when idle
  ;(worker as any).onmessageerror = (ev: MessageEvent) => {
    if (worker !== current)
      return
    if (rpcMap.size === 0) {
      console.debug?.('[mermaidWorkerClient] Worker messageerror (no pending):', ev)
      return
    }
    try {
      if (DEBUG_CLIENT)
        console.error('[mermaidWorkerClient] Worker messageerror:', ev)
      else
        console.debug?.('[mermaidWorkerClient] Worker messageerror:', ev)
    }
    catch {}
    for (const [_id, p] of rpcMap.entries()) {
      p.reject(new Error('Worker messageerror'))
    }
    rpcMap.clear()
  }
}

/**
 * Remove the current worker instance (for cleanup or SSR).
 */
export function clearMermaidWorker() {
  if (worker) {
    try {
      // Proactively reject any pending calls to avoid dangling timeouts
      for (const [_id, p] of rpcMap.entries()) {
        p.reject(new Error('Worker cleared'))
      }
      rpcMap.clear()
      worker.terminate?.()
    }
    catch {}
  }
  worker = null
  workerInitError = null
}

function ensureWorker() {
  if (!worker) {
    workerInitError = new Error('[mermaidWorkerClient] No worker instance set. Please inject a Worker via setMermaidWorker().')
    ; (workerInitError as any).name = 'WorkerInitError'
    ; (workerInitError as any).code = 'WORKER_INIT_ERROR'
    return null
  }
  return worker
}

function callWorker<T>(action: 'canParse' | 'findPrefix', payload: any, timeout = 1400): Promise<T> {
  if (!isMermaidEnabled()) {
    const err: any = new Error('Mermaid rendering disabled')
    err.name = 'MermaidDisabled'
    err.code = MERMAID_DISABLED_CODE
    return Promise.reject(err)
  }
  if (workerInitError)
    return Promise.reject(workerInitError)

  const wk = ensureWorker()
  if (!wk)
    return Promise.reject(workerInitError)

  // Backpressure: avoid spamming the worker when many checks are queued
  if (rpcMap.size >= maxConcurrency) {
    const err: any = new Error('Worker busy')
    err.name = 'WorkerBusy'
    err.code = MERMAID_WORKER_BUSY_CODE
    err.inFlight = rpcMap.size
    err.max = maxConcurrency
    return Promise.reject(err)
  }

  return new Promise<T>((resolve, reject) => {
    const id = Math.random().toString(36).slice(2)
    let settled = false
    let timeoutId: any

    const cleanup = () => {
      if (settled)
        return
      settled = true
      if (timeoutId != null)
        (globalThis as any).clearTimeout(timeoutId)
      rpcMap.delete(id)
    }

    const p: Pending = {
      resolve: (v: any) => {
        cleanup()
        resolve(v)
      },
      reject: (e: any) => {
        cleanup()
        reject(e)
      },
    }
    rpcMap.set(id, p)

    try {
      wk.postMessage({ id, action, payload })
    }
    catch (err) {
      // postMessage can throw if worker is gone
      rpcMap.delete(id)
      reject(err)
      return
    }

    timeoutId = (globalThis as any).setTimeout(() => {
      const err: any = new Error('Worker call timed out')
      err.name = 'WorkerTimeout'
      err.code = 'WORKER_TIMEOUT'
      const pending = rpcMap.get(id)
      if (pending)
        pending.reject(err)
    }, timeout)
  })
}

export async function canParseOffthread(code: string, theme: Theme, timeout = 1400) {
  try {
    return await callWorker<boolean>('canParse', { code, theme }, timeout)
  }
  catch (e) {
    return Promise.reject(e)
  }
}

export async function findPrefixOffthread(code: string, theme: Theme, timeout = 1400) {
  try {
    return await callWorker<string | null>('findPrefix', { code, theme }, timeout)
  }
  catch (e) {
    return Promise.reject(e)
  }
}

export function terminateWorker() {
  if (worker) {
    try {
      // Reject all pending requests explicitly before termination to avoid late timeouts
      for (const [_id, p] of rpcMap.entries()) {
        p.reject(new Error('Worker terminated'))
      }
      rpcMap.clear()
      worker.terminate()
    }
    finally {
      worker = null
    }
  }
}
