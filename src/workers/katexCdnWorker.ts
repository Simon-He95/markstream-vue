export type KaTeXCDNWorkerMode = 'classic' | 'module'

export interface KaTeXCDNWorkerOptions {
  /**
   * Where to load KaTeX from inside the worker.
   * - classic mode: UMD build (used via importScripts)
   * - module mode: ESM build (used via dynamic import(url))
   */
  katexUrl: string
  /**
   * Optional mhchem plugin URL to load in the worker (recommended).
   * - classic mode: UMD build (importScripts)
   * - module mode: ESM build (dynamic import(url))
   */
  mhchemUrl?: string
  /**
   * - classic: widest compatibility, uses importScripts()
   * - module: requires { type: 'module' } workers, uses import(url)
   */
  mode?: KaTeXCDNWorkerMode
  /**
   * If set, worker prints verbose logs.
   */
  debug?: boolean
  /**
   * Worker constructor options (name/type/credentials).
   * Note: for module mode you should pass { type: 'module' }.
   */
  workerOptions?: WorkerOptions
  /**
   * KaTeX render options used in the worker.
   * Keep this minimal and stable for caching and predictable output.
   */
  renderOptions?: {
    throwOnError?: boolean
    output?: string
    strict?: string
  }
}

export interface KaTeXCDNWorkerHandle {
  worker: Worker | null
  /**
   * Revoke the generated Blob URL. Call this when you no longer need the worker.
   * This does not terminate the worker automatically.
   */
  dispose: () => void
  /**
   * The generated worker source code (useful for debugging/tests).
   */
  source: string
}

function stringifyForWorker(val: any) {
  return JSON.stringify(val)
}

export function buildKaTeXCDNWorkerSource(options: KaTeXCDNWorkerOptions): string {
  const mode: KaTeXCDNWorkerMode = options.mode ?? 'classic'
  const katexUrl = options.katexUrl
  const mhchemUrl = options.mhchemUrl
  const renderOptions = {
    throwOnError: true,
    displayMode: true,
    output: 'html',
    strict: 'ignore',
    ...(options.renderOptions || {}),
  }

  const renderOptionsLiteral = stringifyForWorker(renderOptions)
  const katexUrlLiteral = stringifyForWorker(katexUrl)
  const mhchemUrlLiteral = mhchemUrl ? stringifyForWorker(mhchemUrl) : '""'

  if (mode === 'module') {
    return `
let DEBUG = false
let katex = null
let katexLoadError = null
let loadPromise = null

function normalizeKaTeX(mod) {
  const resolved = (mod && mod.default) ? mod.default : mod
  if (resolved && typeof resolved.renderToString === 'function')
    return resolved
  return null
}

async function loadKaTeX() {
  if (katex || katexLoadError)
    return
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const mod = await import(${katexUrlLiteral})
        katex = normalizeKaTeX(mod) || null
        const mhchemUrl = ${mhchemUrlLiteral}
        if (mhchemUrl) {
          try {
            await import(mhchemUrl)
          }
          catch (e) {
            // ignore optional mhchem load failures
            if (DEBUG)
              console.warn('[katex-cdn-worker] failed to load mhchem', e)
          }
        }
      }
      catch (e) {
        katexLoadError = e
      }
    })()
  }
  await loadPromise
}

globalThis.addEventListener('message', async (ev) => {
  const data = ev.data || {}
  if (data.type === 'init') {
    DEBUG = !!data.debug
    if (DEBUG)
      console.debug('[katex-cdn-worker] debug enabled')
    return
  }
  const id = data.id ?? ''
  const content = data.content ?? ''
  const displayMode = data.displayMode ?? true

  await loadKaTeX()

  if (!katex) {
    const reason = katexLoadError ? String(katexLoadError?.message || katexLoadError) : 'KaTeX is not available in worker'
    globalThis.postMessage({ id, error: reason, content, displayMode })
    return
  }

  try {
    const opts = ${renderOptionsLiteral}
    const html = katex.renderToString(content, { ...opts, displayMode: !!displayMode })
    globalThis.postMessage({ id, html, content, displayMode })
  }
  catch (err) {
    const msg = String(err?.message || err)
    globalThis.postMessage({ id, error: msg, content, displayMode })
  }
})
`.trimStart()
  }

  // classic mode (importScripts) worker
  return `
let DEBUG = false
let katex = null
let katexLoadError = null

function normalizeKaTeX(val) {
  const resolved = (val && val.default) ? val.default : val
  if (resolved && typeof resolved.renderToString === 'function')
    return resolved
  return null
}

function loadKaTeXClassic() {
  if (katex || katexLoadError)
    return
  try {
    importScripts(${katexUrlLiteral})
    const mhchemUrl = ${mhchemUrlLiteral}
    if (mhchemUrl) {
      try {
        importScripts(mhchemUrl)
      }
      catch (e) {
        // ignore optional mhchem load failures
        if (DEBUG)
          console.warn('[katex-cdn-worker] failed to load mhchem', e)
      }
    }
    katex = normalizeKaTeX(globalThis.katex)
  }
  catch (e) {
    katexLoadError = e
  }
}

loadKaTeXClassic()

globalThis.addEventListener('message', (ev) => {
  const data = ev.data || {}
  if (data.type === 'init') {
    DEBUG = !!data.debug
    if (DEBUG)
      console.debug('[katex-cdn-worker] debug enabled')
    return
  }
  const id = data.id ?? ''
  const content = data.content ?? ''
  const displayMode = data.displayMode ?? true

  if (!katex && !katexLoadError)
    loadKaTeXClassic()

  if (!katex) {
    const reason = katexLoadError ? String(katexLoadError?.message || katexLoadError) : 'KaTeX is not available in worker'
    globalThis.postMessage({ id, error: reason, content, displayMode })
    return
  }

  try {
    const opts = ${renderOptionsLiteral}
    const html = katex.renderToString(content, { ...opts, displayMode: !!displayMode })
    globalThis.postMessage({ id, html, content, displayMode })
  }
  catch (err) {
    const msg = String(err?.message || err)
    globalThis.postMessage({ id, error: msg, content, displayMode })
  }
})
`.trimStart()
}

export function createKaTeXWorkerFromCDN(options: KaTeXCDNWorkerOptions): KaTeXCDNWorkerHandle {
  const source = buildKaTeXCDNWorkerSource(options)

  // SSR-safe: allow calling this on the server without throwing
  if (typeof Worker === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
    return {
      worker: null,
      dispose: () => {},
      source,
    }
  }

  const blob = new Blob([source], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)

  let revoked = false
  const dispose = () => {
    if (revoked)
      return
    revoked = true
    try {
      URL.revokeObjectURL(url)
    }
    catch {
      // ignore
    }
  }

  const mode: KaTeXCDNWorkerMode = options.mode ?? 'classic'
  const workerOptions = mode === 'module'
    ? ({ ...(options.workerOptions ?? {}), type: 'module' as const } satisfies WorkerOptions)
    : options.workerOptions

  const worker = new Worker(url, workerOptions)
  if (options.debug) {
    try {
      ;(worker as any).postMessage({ type: 'init', debug: true })
    }
    catch {
      // ignore
    }
  }

  return { worker, dispose, source }
}
