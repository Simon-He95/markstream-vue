export type MermaidCDNWorkerMode = 'classic' | 'module'

export interface MermaidCDNWorkerOptions {
  mermaidUrl: string
  mode?: MermaidCDNWorkerMode
  debug?: boolean
  workerOptions?: WorkerOptions
  initializeOptions?: Record<string, any>
}

export interface MermaidCDNWorkerHandle {
  worker: Worker | null
  dispose: () => void
  source: string
}

function stringifyForWorker(value: any) {
  return JSON.stringify(value)
}

export function buildMermaidCDNWorkerSource(options: MermaidCDNWorkerOptions): string {
  const mode: MermaidCDNWorkerMode = options.mode ?? 'module'
  const mermaidUrlLiteral = stringifyForWorker(options.mermaidUrl)
  const initLiteral = stringifyForWorker({
    startOnLoad: false,
    securityLevel: 'strict',
    flowchart: { htmlLabels: false },
    ...(options.initializeOptions || {}),
  })

  const sharedLogic = `
let DEBUG = false
let mermaid = null
let mermaidLoadError = null

function normalizeMermaidModule(mod) {
  if (!mod)
    return mod
  const candidate = mod && mod.default ? mod.default : mod
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
  const trimmed = String(code || '').trimStart()
  if (trimmed.startsWith('%%{'))
    return code
  return themeConfig + code
}

function findHeaderIndex(lines) {
  const headerRe = /^(?:graph|flowchart|flowchart\\s+tb|flowchart\\s+lr|sequenceDiagram|gantt|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|pie|quadrantChart|timeline|xychart(?:-beta)?)\\b/
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] || '').trim()
    if (!line || line.startsWith('%%'))
      continue
    if (headerRe.test(line))
      return i
  }
  return -1
}

async function canParse(code, theme) {
  const themed = applyThemeTo(code, theme)
  if (mermaid && typeof mermaid.parse === 'function') {
    await mermaid.parse(themed)
    return true
  }
  throw new Error('mermaid.parse not available in worker')
}

async function findLastRenderablePrefix(baseCode, theme) {
  const lines = String(baseCode || '').split('\\n')
  const headerIndex = findHeaderIndex(lines)
  if (headerIndex === -1)
    return null
  const head = lines.slice(0, headerIndex + 1)
  await canParse(head.join('\\n'), theme)

  let low = headerIndex + 1
  let high = lines.length
  let lastGood = headerIndex + 1
  let tries = 0
  const MAX_TRIES = 12

  while (low <= high && tries < MAX_TRIES) {
    const mid = Math.floor((low + high) / 2)
    const candidate = [...head, ...lines.slice(headerIndex + 1, mid)].join('\\n')
    tries += 1
    try {
      await canParse(candidate, theme)
      lastGood = mid
      low = mid + 1
    }
    catch {
      high = mid - 1
    }
  }

  return [...head, ...lines.slice(headerIndex + 1, lastGood)].join('\\n')
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
      console.warn('[markstream-svelte:mermaid-cdn-worker] initialize failed', e)
  }
}

globalThis.addEventListener('message', async (ev) => {
  const msg = ev.data || {}
  if (msg.type === 'init') {
    DEBUG = !!msg.debug
    return
  }

  const id = msg.id
  const action = msg.action
  const payload = msg.payload || {}

  if (!mermaid) {
    const error = mermaidLoadError ? String(mermaidLoadError?.message || mermaidLoadError) : 'Mermaid is not available in worker'
    globalThis.postMessage({ id, ok: false, error })
    return
  }

  try {
    if (action === 'canParse') {
      const ok = await canParse(payload.code, payload.theme)
      globalThis.postMessage({ id, ok: true, result: ok })
      return
    }
    if (action === 'findPrefix') {
      const result = await findLastRenderablePrefix(payload.code, payload.theme)
      globalThis.postMessage({ id, ok: true, result })
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

await loadMermaid()
`.trimStart()
  }

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
    catch {
      // Ignore revoke failures.
    }
  }

  const mode = options.mode ?? 'module'
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
