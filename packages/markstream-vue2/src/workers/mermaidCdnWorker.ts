export type MermaidCDNWorkerMode = 'classic' | 'module'

export interface MermaidCDNWorkerOptions {
  /**
   * Where to load mermaid from inside the worker.
   * - classic mode: non-module build (used via importScripts)
   * - module mode: ESM build (used via dynamic import(url))
   */
  mermaidUrl: string
  /**
   * - classic: widest compatibility, uses importScripts()
   * - module: requires { type: 'module' } workers, uses import(url)
   */
  mode?: MermaidCDNWorkerMode
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
   * Mermaid initialize options used in the worker.
   * This worker is used for parsing only; keep options minimal.
   */
  initializeOptions?: Record<string, any>
}

export interface MermaidCDNWorkerHandle {
  worker: Worker | null
  dispose: () => void
  source: string
}

function stringifyForWorker(val: any) {
  return JSON.stringify(val)
}

export function buildMermaidCDNWorkerSource(options: MermaidCDNWorkerOptions): string {
  const mode: MermaidCDNWorkerMode = options.mode ?? 'module'
  const mermaidUrlLiteral = stringifyForWorker(options.mermaidUrl)
  const initializeOptions = {
    startOnLoad: false,
    securityLevel: 'loose',
    ...(options.initializeOptions || {}),
  }
  const initLiteral = stringifyForWorker(initializeOptions)

  // Worker protocol mirrors src/workers/mermaidParser.worker.ts:
  // { id, action: 'canParse'|'findPrefix', payload: { code, theme } }
  // -> { id, ok: true, result } | { id, ok: false, error }

  const sharedLogic = `
let DEBUG = false
let mermaid = null
let mermaidLoadError = null

function normalizeMermaidModule(mod) {
  if (!mod)
    return mod
  const candidate = (mod && mod.default) ? mod.default : mod
  if (candidate && (typeof candidate.render === 'function' || typeof candidate.parse === 'function' || typeof candidate.initialize === 'function'))
    return candidate
  if (candidate && candidate.mermaidAPI && (typeof candidate.mermaidAPI.render === 'function' || typeof candidate.mermaidAPI.parse === 'function')) {
    const api = candidate.mermaidAPI
    return {
      ...candidate,
      render: api.render ? api.render.bind(api) : undefined,
      parse: api.parse ? api.parse.bind(api) : undefined,
      initialize: (opts) => {
        if (typeof candidate.initialize === 'function')
          return candidate.initialize(opts)
        return api.initialize ? api.initialize(opts) : undefined
      },
    }
  }
  if (mod && mod.mermaid && typeof mod.mermaid.parse === 'function')
    return mod.mermaid
  return candidate
}

function applyThemeTo(code, theme) {
  const themeValue = theme === 'dark' ? 'dark' : 'default'
  const themeConfig = \`%%{init: {"theme": "\${themeValue}"}}%%\\n\`
  const trimmed = (code || '').trimStart()
  if (trimmed.startsWith('%%{'))
    return code
  return themeConfig + code
}

function findHeaderIndex(lines) {
  const headerRe = /^(?:graph|flowchart|flowchart\\s+tb|flowchart\\s+lr|sequenceDiagram|gantt|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|pie|quadrantChart|timeline|xychart(?:-beta)?)\\b/
  for (let i = 0; i < lines.length; i++) {
    const l = (lines[i] || '').trim()
    if (!l)
      continue
    if (l.startsWith('%%'))
      continue
    if (headerRe.test(l))
      return i
  }
  return -1
}

async function canParse(code, theme) {
  const themed = applyThemeTo(code, theme)
  const anyMermaid = mermaid
  if (anyMermaid && typeof anyMermaid.parse === 'function') {
    await anyMermaid.parse(themed)
    return true
  }
  throw new Error('mermaid.parse not available in worker')
}

async function findLastRenderablePrefix(baseCode, theme) {
  const lines = String(baseCode || '').split('\\n')
  const headerIdx = findHeaderIndex(lines)
  if (headerIdx === -1)
    return null
  const head = lines.slice(0, headerIdx + 1)
  await canParse(head.join('\\n'), theme)

  let low = headerIdx + 1
  let high = lines.length
  let lastGood = headerIdx + 1
  let tries = 0
  const MAX_TRIES = 12

  while (low <= high && tries < MAX_TRIES) {
    const mid = Math.floor((low + high) / 2)
    const candidate = [...head, ...lines.slice(headerIdx + 1, mid)].join('\\n')
    tries++
    try {
      await canParse(candidate, theme)
      lastGood = mid
      low = mid + 1
    }
    catch {
      high = mid - 1
    }
  }

  return [...head, ...lines.slice(headerIdx + 1, lastGood)].join('\\n')
}

function initMermaidOnce() {
  if (!mermaid)
    return
  try {
    if (typeof mermaid.initialize === 'function')
      mermaid.initialize(${initLiteral})
  }
  catch (e) {
    if (DEBUG)
      console.warn('[mermaid-cdn-worker] initialize failed', e)
  }
}

globalThis.addEventListener('message', async (ev) => {
  const msg = ev.data || {}
  if (msg.type === 'init') {
    DEBUG = !!msg.debug
    if (DEBUG)
      console.debug('[mermaid-cdn-worker] debug enabled')
    return
  }

  const id = msg.id
  const action = msg.action
  const payload = msg.payload || {}

  if (!mermaid) {
    const errMsg = mermaidLoadError ? String(mermaidLoadError?.message || mermaidLoadError) : 'Mermaid is not available in worker'
    globalThis.postMessage({ id, ok: false, error: errMsg })
    return
  }

  try {
    if (action === 'canParse') {
      const ok = await canParse(payload.code, payload.theme)
      globalThis.postMessage({ id, ok: true, result: ok })
      return
    }
    if (action === 'findPrefix') {
      const res = await findLastRenderablePrefix(payload.code, payload.theme)
      globalThis.postMessage({ id, ok: true, result: res })
      return
    }
    globalThis.postMessage({ id, ok: false, error: 'Unknown action' })
  }
  catch (e) {
    globalThis.postMessage({ id, ok: false, error: String(e?.message || e) })
  }
})
`.trimStart()

  if (mode === 'module') {
    return `
${sharedLogic}

let loadPromise = null
async function loadMermaid() {
  if (mermaid || mermaidLoadError)
    return
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const mod = await import(${mermaidUrlLiteral})
        mermaid = normalizeMermaidModule(mod) || null
        initMermaidOnce()
      }
      catch (e) {
        mermaidLoadError = e
      }
    })()
  }
  await loadPromise
}

// Load immediately; failures are reported per-request
await loadMermaid()
`.trimStart()
  }

  // classic mode: importScripts (requires non-module build)
  return `
${sharedLogic}

function loadMermaidClassic() {
  if (mermaid || mermaidLoadError)
    return
  try {
    importScripts(${mermaidUrlLiteral})
    mermaid = normalizeMermaidModule(globalThis.mermaid) || null
    initMermaidOnce()
  }
  catch (e) {
    mermaidLoadError = e
  }
}

loadMermaidClassic()
`.trimStart()
}

export function createMermaidWorkerFromCDN(options: MermaidCDNWorkerOptions): MermaidCDNWorkerHandle {
  const source = buildMermaidCDNWorkerSource(options)

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
    catch {}
  }

  const mode: MermaidCDNWorkerMode = options.mode ?? 'module'
  const workerOptions = mode === 'module'
    ? ({ ...(options.workerOptions ?? {}), type: 'module' as const } satisfies WorkerOptions)
    : options.workerOptions

  const worker = new Worker(url, workerOptions)
  if (options.debug) {
    try {
      ;(worker as any).postMessage({ type: 'init', debug: true })
    }
    catch {}
  }

  return { worker, dispose, source }
}
