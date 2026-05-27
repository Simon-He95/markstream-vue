import { isMermaidEnabled } from '../optional/mermaid'

type Theme = 'light' | 'dark'

let worker: Worker | null = null
let workerInitError: any = null

interface Pending {
  resolve: (value: any) => void
  reject: (error: any) => void
}

const rpcMap = new Map<string, Pending>()
let maxConcurrency = 5
let debugClient = false

export function setMermaidWorkerClientDebug(enabled: boolean) {
  debugClient = !!enabled
}

export function setMermaidWorkerMaxConcurrency(value: number) {
  if (Number.isFinite(value) && value > 0)
    maxConcurrency = Math.floor(value)
}

export function getMermaidWorkerLoad() {
  return { inFlight: rpcMap.size, max: maxConcurrency }
}

export const MERMAID_WORKER_BUSY_CODE = 'WORKER_BUSY'
export const MERMAID_DISABLED_CODE = 'MERMAID_DISABLED'

export function setMermaidWorker(nextWorker: Worker) {
  worker = nextWorker
  workerInitError = null
  const current = nextWorker

  worker.onmessage = (event: MessageEvent) => {
    if (worker !== current)
      return

    const { id, ok, result, error } = event.data || {}
    const active = rpcMap.get(id)
    if (!active)
      return

    if (ok === false || error)
      active.reject(new Error(error || 'Unknown error'))
    else
      active.resolve(result)
  }

  worker.onerror = (event: ErrorEvent) => {
    if (worker !== current)
      return
    if (rpcMap.size === 0) {
      console.debug?.('[markstream-svelte:mermaidWorkerClient] Worker error (idle):', event?.message || event)
      return
    }
    try {
      if (debugClient)
        console.error('[markstream-svelte:mermaidWorkerClient] Worker error:', event?.message || event)
      else
        console.debug?.('[markstream-svelte:mermaidWorkerClient] Worker error:', event?.message || event)
    }
    catch {
      // Ignore logging failures.
    }
    for (const [, active] of rpcMap.entries())
      active.reject(new Error(`Worker error: ${event.message}`))
    rpcMap.clear()
  }

  ;(worker as any).onmessageerror = (event: MessageEvent) => {
    if (worker !== current)
      return
    if (rpcMap.size === 0) {
      console.debug?.('[markstream-svelte:mermaidWorkerClient] Worker messageerror (idle):', event)
      return
    }
    for (const [, active] of rpcMap.entries())
      active.reject(new Error('Worker messageerror'))
    rpcMap.clear()
  }
}

export function clearMermaidWorker() {
  if (worker) {
    try {
      for (const [, active] of rpcMap.entries())
        active.reject(new Error('Worker cleared'))
      rpcMap.clear()
      worker.terminate?.()
    }
    catch {
      // Ignore worker termination failures.
    }
  }
  worker = null
  workerInitError = null
}

function ensureWorker() {
  if (worker)
    return worker

  workerInitError = new Error('[markstream-svelte:mermaidWorkerClient] No worker instance set. Please inject a Worker via setMermaidWorker().')
  ;(workerInitError as any).name = 'WorkerInitError'
  ;(workerInitError as any).code = 'WORKER_INIT_ERROR'
  return null
}

function callWorker<T>(action: 'canParse' | 'findPrefix', payload: any, timeout = 1400): Promise<T> {
  if (!isMermaidEnabled()) {
    const error: any = new Error('Mermaid rendering disabled')
    error.name = 'MermaidDisabled'
    error.code = MERMAID_DISABLED_CODE
    return Promise.reject(error)
  }

  if (workerInitError)
    return Promise.reject(workerInitError)

  const activeWorker = ensureWorker()
  if (!activeWorker)
    return Promise.reject(workerInitError)

  if (rpcMap.size >= maxConcurrency) {
    const error: any = new Error('Worker busy')
    error.name = 'WorkerBusy'
    error.code = MERMAID_WORKER_BUSY_CODE
    error.inFlight = rpcMap.size
    error.max = maxConcurrency
    return Promise.reject(error)
  }

  return new Promise<T>((resolve, reject) => {
    const id = Math.random().toString(36).slice(2)
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      if (settled)
        return
      settled = true
      if (timeoutId != null)
        clearTimeout(timeoutId)
      rpcMap.delete(id)
    }

    rpcMap.set(id, {
      resolve: (value: any) => {
        cleanup()
        resolve(value)
      },
      reject: (error: any) => {
        cleanup()
        reject(error)
      },
    })

    try {
      activeWorker.postMessage({ id, action, payload })
    }
    catch (error) {
      rpcMap.delete(id)
      reject(error)
      return
    }

    timeoutId = setTimeout(() => {
      const error: any = new Error('Worker call timed out')
      error.name = 'WorkerTimeout'
      error.code = 'WORKER_TIMEOUT'
      const pending = rpcMap.get(id)
      pending?.reject(error)
    }, timeout)
  })
}

export async function canParseOffthread(code: string, theme: Theme, timeout = 1400) {
  return await callWorker<boolean>('canParse', { code, theme }, timeout)
}

export async function findPrefixOffthread(code: string, theme: Theme, timeout = 1400) {
  return await callWorker<string | null>('findPrefix', { code, theme }, timeout)
}

export function terminateWorker() {
  if (worker) {
    try {
      for (const [, active] of rpcMap.entries())
        active.reject(new Error('Worker terminated'))
      rpcMap.clear()
      worker.terminate()
    }
    finally {
      worker = null
    }
  }
}
