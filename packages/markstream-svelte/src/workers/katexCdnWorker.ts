export type KaTeXCDNWorkerMode = 'classic' | 'module'

export interface KaTeXCDNWorkerOptions {
  katexUrl: string
  mhchemUrl?: string
  mode?: KaTeXCDNWorkerMode
  debug?: boolean
  workerOptions?: WorkerOptions
  renderOptions?: {
    throwOnError?: boolean
    output?: string
    strict?: string
  }
}

export interface KaTeXCDNWorkerHandle {
  worker: Worker | null
  dispose: () => void
  source: string
}

function stringifyForWorker(value: any) {
  return JSON.stringify(value)
}

export function buildKaTeXCDNWorkerSource(options: KaTeXCDNWorkerOptions): string {
  const mode: KaTeXCDNWorkerMode = options.mode ?? 'classic'
  const renderOptions = {
    throwOnError: true,
    displayMode: true,
    output: 'html',
    strict: 'ignore',
    ...(options.renderOptions || {}),
  }

  const renderOptionsLiteral = stringifyForWorker(renderOptions)
  const katexUrlLiteral = stringifyForWorker(options.katexUrl)
  const mhchemUrlLiteral = options.mhchemUrl ? stringifyForWorker(options.mhchemUrl) : '""'

  if (mode === 'module') {
    return `
let DEBUG = false
let katex = null
let katexLoadError = null
let loadPromise = null

function normalizeKaTeX(mod) {
  const resolved = mod && mod.default ? mod.default : mod
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
            if (DEBUG)
              console.warn('[markstream-svelte:katex-cdn-worker] failed to load mhchem', e)
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
    globalThis.postMessage({ id, error: String(err?.message || err), content, displayMode })
  }
})
`.trimStart()
  }

  return `
let DEBUG = false
let katex = null
let katexLoadError = null

function normalizeKaTeX(val) {
  const resolved = val && val.default ? val.default : val
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
        if (DEBUG)
          console.warn('[markstream-svelte:katex-cdn-worker] failed to load mhchem', e)
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
    globalThis.postMessage({ id, error: String(err?.message || err), content, displayMode })
  }
})
`.trimStart()
}

export function createKaTeXWorkerFromCDN(options: KaTeXCDNWorkerOptions): KaTeXCDNWorkerHandle {
  const source = buildKaTeXCDNWorkerSource(options)

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
      // Ignore revoke failures.
    }
  }

  const mode = options.mode ?? 'classic'
  const workerOptions = mode === 'module'
    ? ({ ...(options.workerOptions ?? {}), type: 'module' as const } satisfies WorkerOptions)
    : options.workerOptions

  const worker = new Worker(url, workerOptions)
  if (options.debug) {
    try {
      worker.postMessage({ type: 'init', debug: true })
    }
    catch {
      // Ignore init messaging failures.
    }
  }

  return { worker, dispose, source }
}
