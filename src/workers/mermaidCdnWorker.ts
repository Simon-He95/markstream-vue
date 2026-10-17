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
    securityLevel: 'strict',
    flowchart: { htmlLabels: false },
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
  const frontmatter = (code || '').match(/^---[ \\t]*\\r?\\n[\\s\\S]*?\\r?\\n---[ \\t]*\\r?\\n/)?.[0] || ''
  const diagram = (code || '').slice(frontmatter.length)
  if (diagram.trimStart().startsWith('%%{'))
    return code
  return frontmatter + themeConfig + diagram
}

function getMermaidDiagramKind(code) {
  const lines = String(code || '').split(/\\r?\\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('%%'))
      continue
    const match = line.match(/^([A-Z][\\w-]*)\\b/i)
    return (match && match[1] ? match[1].toLowerCase() : '')
  }
  return ''
}

function isEscapedEntityBefore(text, index) {
  return /(?:&#\\d+|#\\d+|&[a-z]+)$/i.test(text.slice(Math.max(0, index - 12), index))
}

function hasSequenceArrow(text) {
  return text.includes('->')
    || text.includes('-->')
    || text.includes('->>')
    || text.includes('-->>')
    || text.includes('-x')
    || text.includes('--x')
    || text.includes('-)')
    || text.includes('--)')
    || text.includes('-+')
    || text.includes('--+')
}

function startsSequenceMessage(text) {
  const segment = text.split(';', 1)[0]
  const colonIndex = segment.indexOf(':')
  return colonIndex > 0 && hasSequenceArrow(segment.slice(0, colonIndex))
}

function startsSequenceStatement(text) {
  const source = text.trimStart()
  return /^(?:accDescr|accTitle|activate|actor|and|alt|autonumber|box|break|critical|create\\s+(?:actor|participant)|deactivate|destroy|else|end|link|links|loop|Note|opt|option|par|participant|properties|rect)\\b/i.test(source)
    || startsSequenceMessage(source)
}

function isSequenceTextLine(line, colonIndex) {
  const prefix = line.slice(0, colonIndex)
  return /^\\s*Note\\b/i.test(prefix) || hasSequenceArrow(prefix)
}

function escapeTextSemicolons(text) {
  let escaped = ''
  let changed = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char !== ';' || isEscapedEntityBefore(text, index)) {
      escaped += char
      continue
    }
    if (startsSequenceStatement(text.slice(index + 1))) {
      escaped += char
      continue
    }
    escaped += '#59;'
    changed = true
  }
  return changed ? escaped : text
}

function escapeSequenceTextSemicolons(code) {
  if (getMermaidDiagramKind(code) !== 'sequencediagram')
    return code
  const parts = String(code || '').split(/(\\r\\n|\\n|\\r)/)
  let changed = false
  for (let index = 0; index < parts.length; index += 2) {
    const line = parts[index]
    if (!line.includes(';'))
      continue
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1 || !isSequenceTextLine(line, colonIndex))
      continue
    const escapedText = escapeTextSemicolons(line.slice(colonIndex + 1))
    if (escapedText !== line.slice(colonIndex + 1)) {
      parts[index] = line.slice(0, colonIndex + 1) + escapedText
      changed = true
    }
  }
  return changed ? parts.join('') : code
}

function findHeaderIndex(lines) {
  const headerRe = /^(?:graph|flowchart|flowchart\\s+tb|flowchart\\s+lr|sequenceDiagram|gantt|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|pie|quadrantChart|timeline|xychart(?:-beta)?)\\b/
  let inFrontmatter = lines[0]?.trimEnd() === '---'
  for (let i = 0; i < lines.length; i++) {
    const l = (lines[i] || '').trim()
    if (inFrontmatter) {
      if (i > 0 && lines[i].trimEnd() === '---')
        inFrontmatter = false
      continue
    }
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
    try {
      await anyMermaid.parse(themed)
    }
    catch (error) {
      const retryCode = escapeSequenceTextSemicolons(themed)
      if (retryCode === themed)
        throw error
      await anyMermaid.parse(retryCode)
    }
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
  // Revoke the object URL when the caller is done with the worker.
  // The URL is also revoked automatically right after Worker construction
  // (a spec-compliant fetch from an object URL keeps the blob alive even
  // after revocation). Kept public for API compatibility.
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

  let worker: Worker | null = null
  try {
    worker = new Worker(url, workerOptions)
  }
  finally {
    dispose()
  }
  if (options.debug) {
    try {
      ;(worker as any).postMessage({ type: 'init', debug: true })
    }
    catch {}
  }

  return { worker, dispose, source }
}
