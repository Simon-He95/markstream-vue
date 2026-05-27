import { isKatexEnabled } from '../optional/katex'
import { normalizeKaTeXRenderInput } from '../utils/normalizeKaTeXRenderInput'

export const WORKER_BUSY_CODE = 'WORKER_BUSY'

interface Pending {
  resolve: (val: string) => void
  reject: (err: any) => void
  timeoutId: ReturnType<typeof globalThis.setTimeout>
}

let worker: Worker | null = null
let workerInitError: any = null
let debugKatexWorker = false

const pending = new Map<string, Pending>()
const cache = new Map<string, string>()
const cacheMax = 200
const drainWaiters = new Set<() => void>()

let maxConcurrency = 5

function notifyDrainIfBelowCap() {
  if (pending.size >= maxConcurrency || drainWaiters.size === 0)
    return

  const currentWaiters = Array.from(drainWaiters)
  drainWaiters.clear()
  for (const waiter of currentWaiters) {
    try {
      waiter()
    }
    catch {
      // Ignore waiter failures.
    }
  }
}

function rememberCache(content: string, displayMode: boolean, html: string) {
  cache.set(`${displayMode ? 'd' : 'i'}:${content}`, html)
  if (cache.size > cacheMax) {
    const firstKey = cache.keys().next().value
    if (firstKey)
      cache.delete(firstKey)
  }
}

export function setKaTeXWorker(nextWorker: Worker) {
  worker = nextWorker
  workerInitError = null

  worker.onmessage = (event: MessageEvent) => {
    const { id, html, error, content, displayMode } = event.data || {}
    const active = pending.get(id)
    if (!active)
      return

    pending.delete(id)
    clearTimeout(active.timeoutId)
    notifyDrainIfBelowCap()

    if (error) {
      active.reject(new Error(error))
      return
    }

    if (content)
      rememberCache(String(content), Boolean(displayMode), String(html || ''))
    active.resolve(String(html || ''))
  }

  worker.onerror = (event: ErrorEvent) => {
    for (const [, active] of pending.entries()) {
      clearTimeout(active.timeoutId)
      active.reject(new Error(`Worker error: ${event.message}`))
    }
    pending.clear()
    notifyDrainIfBelowCap()
  }

  if (debugKatexWorker)
    worker.postMessage({ type: 'init', debug: true })
}

export function clearKaTeXWorker() {
  if (worker)
    worker.terminate?.()
  worker = null
  workerInitError = null
}

function ensureWorker() {
  if (worker)
    return worker

  workerInitError = new Error('[markstream-svelte:katexWorkerClient] No worker instance set. Please inject a Worker via setKaTeXWorker().')
  ;(workerInitError as any).name = 'WorkerInitError'
  ;(workerInitError as any).code = 'WORKER_INIT_ERROR'
  return null
}

export function setKaTeXWorkerDebug(enabled: boolean) {
  debugKatexWorker = !!enabled
  if (worker)
    worker.postMessage({ type: 'init', debug: debugKatexWorker })
}

export async function renderKaTeXInWorker(content: string, displayMode = true, timeout = 2000, signal?: AbortSignal): Promise<string> {
  const normalizedContent = normalizeKaTeXRenderInput(content)
  if (!isKatexEnabled()) {
    const error = new Error('KaTeX rendering disabled')
    ;(error as any).name = 'KaTeXDisabled'
    ;(error as any).code = 'KATEX_DISABLED'
    return Promise.reject(error)
  }

  if (workerInitError)
    return Promise.reject(workerInitError)

  const cacheKey = `${displayMode ? 'd' : 'i'}:${normalizedContent}`
  const cached = cache.get(cacheKey)
  if (cached)
    return cached

  const activeWorker = ensureWorker()
  if (!activeWorker)
    return Promise.reject(workerInitError)

  if (pending.size >= maxConcurrency) {
    const error = new Error('Worker busy')
    ;(error as any).name = 'WorkerBusy'
    ;(error as any).code = WORKER_BUSY_CODE
    ;(error as any).busy = true
    ;(error as any).inFlight = pending.size
    ;(error as any).max = maxConcurrency
    return Promise.reject(error)
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const error = new Error('Aborted')
      ;(error as any).name = 'AbortError'
      reject(error)
      return
    }

    const id = Math.random().toString(36).slice(2)
    const timeoutId = globalThis.setTimeout(() => {
      pending.delete(id)
      notifyDrainIfBelowCap()
      const error = new Error('Worker render timed out')
      ;(error as any).name = 'WorkerTimeout'
      ;(error as any).code = 'WORKER_TIMEOUT'
      reject(error)
    }, timeout)

    const onAbort = () => {
      globalThis.clearTimeout(timeoutId)
      if (pending.delete(id))
        notifyDrainIfBelowCap()
      const error = new Error('Aborted')
      ;(error as any).name = 'AbortError'
      reject(error)
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    pending.set(id, {
      timeoutId,
      resolve: (html) => {
        signal?.removeEventListener('abort', onAbort)
        resolve(html)
      },
      reject: (error) => {
        signal?.removeEventListener('abort', onAbort)
        reject(error)
      },
    })

    activeWorker.postMessage({
      id,
      type: 'render',
      content: normalizedContent,
      displayMode,
    })
  })
}

export function setKaTeXCache(content: string, displayMode = true, html: string) {
  rememberCache(normalizeKaTeXRenderInput(content), displayMode, html)
}

export function getKaTeXWorkerLoad() {
  return {
    inFlight: pending.size,
    max: maxConcurrency,
  }
}

export function setKaTeXWorkerMaxConcurrency(value: number) {
  if (Number.isFinite(value) && value > 0)
    maxConcurrency = Math.floor(value)
}

export function isKaTeXWorkerBusy() {
  return pending.size >= maxConcurrency
}

export function waitForKaTeXWorkerSlot(timeout = 2000, signal?: AbortSignal): Promise<void> {
  if (pending.size < maxConcurrency)
    return Promise.resolve()

  return new Promise((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const onDrain = () => {
      if (settled)
        return
      settled = true
      if (timer)
        clearTimeout(timer)
      drainWaiters.delete(onDrain)
      resolve()
    }

    drainWaiters.add(onDrain)

    timer = setTimeout(() => {
      if (settled)
        return
      settled = true
      drainWaiters.delete(onDrain)
      const error = new Error('Wait for worker slot timed out')
      ;(error as any).name = 'WorkerBusyTimeout'
      ;(error as any).code = 'WORKER_BUSY_TIMEOUT'
      reject(error)
    }, timeout)

    queueMicrotask(() => notifyDrainIfBelowCap())

    if (signal) {
      const onAbort = () => {
        if (settled)
          return
        settled = true
        if (timer)
          clearTimeout(timer)
        drainWaiters.delete(onDrain)
        const error = new Error('Aborted')
        ;(error as any).name = 'AbortError'
        reject(error)
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

const defaultBackpressure = {
  timeout: 2000,
  waitTimeout: 1500,
  backoffMs: 30,
  maxRetries: 1,
}
const maxBackpressureRetries = 8

export function setKaTeXBackpressureDefaults(options: Partial<typeof defaultBackpressure>) {
  if (options.timeout != null)
    defaultBackpressure.timeout = Math.max(0, Math.floor(options.timeout))
  if (options.waitTimeout != null)
    defaultBackpressure.waitTimeout = Math.max(0, Math.floor(options.waitTimeout))
  if (options.backoffMs != null)
    defaultBackpressure.backoffMs = Math.max(0, Math.floor(options.backoffMs))
  if (options.maxRetries != null)
    defaultBackpressure.maxRetries = Math.max(0, Math.floor(options.maxRetries))
}

export function getKaTeXBackpressureDefaults() {
  return { ...defaultBackpressure }
}

export async function renderKaTeXWithBackpressure(
  content: string,
  displayMode = true,
  options: BackpressureOptions = {},
): Promise<string> {
  if (!isKatexEnabled()) {
    const error = new Error('KaTeX rendering disabled')
    ;(error as any).name = 'KaTeXDisabled'
    ;(error as any).code = 'KATEX_DISABLED'
    throw error
  }

  const timeout = options.timeout ?? defaultBackpressure.timeout
  const waitTimeout = options.waitTimeout ?? defaultBackpressure.waitTimeout
  const backoffMs = options.backoffMs ?? defaultBackpressure.backoffMs
  const rawMaxRetries = options.maxRetries ?? defaultBackpressure.maxRetries
  const maxRetries = Number.isFinite(rawMaxRetries)
    ? Math.max(0, Math.min(Math.floor(rawMaxRetries), maxBackpressureRetries))
    : defaultBackpressure.maxRetries

  let attempt = 0
  for (;;) {
    if (options.signal?.aborted) {
      const error = new Error('Aborted')
      ;(error as any).name = 'AbortError'
      throw error
    }

    try {
      return await renderKaTeXInWorker(content, displayMode, timeout, options.signal)
    }
    catch (error: any) {
      if (error?.code !== WORKER_BUSY_CODE || attempt >= maxRetries)
        throw error

      attempt += 1
      await waitForKaTeXWorkerSlot(waitTimeout, options.signal).catch(() => {})
      if (backoffMs > 0)
        await new Promise(resolve => globalThis.setTimeout(resolve, backoffMs * attempt))
    }
  }
}
