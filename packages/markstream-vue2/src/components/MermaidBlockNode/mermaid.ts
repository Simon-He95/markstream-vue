export type MermaidLoader = () => Promise<any> | any

const defaultMermaidLoader: MermaidLoader = () => import('mermaid')

let cachedMermaid: any = null
let mermaidLoader: MermaidLoader | null = defaultMermaidLoader

function resetCachedMermaid() {
  cachedMermaid = null
}

function getGlobalMermaid() {
  try {
    const g: any = globalThis as any
    return normalizeMermaidModule(g?.mermaid)
  }
  catch {
    return null
  }
}

export function setMermaidLoader(loader: MermaidLoader | null) {
  mermaidLoader = loader
  resetCachedMermaid()
}

export function enableMermaid(loader?: MermaidLoader) {
  setMermaidLoader(loader ?? defaultMermaidLoader)
}

export function disableMermaid() {
  setMermaidLoader(null)
}

export function isMermaidEnabled() {
  return typeof mermaidLoader === 'function'
}

function normalizeMermaidModule(mod: any) {
  if (!mod)
    return mod
  const candidate = (mod && (mod as any).default) ? (mod as any).default : mod

  // Common shapes:
  // - `candidate.render/parse/initialize` exist -> use candidate
  // - `candidate.mermaidAPI` exists with render/parse -> bind those
  // - `mod.mermaid` or `mod.default.mermaid` may contain the API
  if (candidate && (typeof candidate.render === 'function' || typeof candidate.parse === 'function' || typeof candidate.initialize === 'function'))
    return candidate

  if (candidate && candidate.mermaidAPI && (typeof candidate.mermaidAPI.render === 'function' || typeof candidate.mermaidAPI.parse === 'function')) {
    // expose a normalized facade that provides render/parse/initialize
    const api = candidate.mermaidAPI
    return {
      ...candidate,
      render: api.render.bind(api),
      parse: api.parse ? api.parse.bind(api) : undefined,
      initialize: (opts: any) => {
        // some builds expose initialize on root, prefer that
        if (typeof candidate.initialize === 'function')
          return candidate.initialize(opts)
        // otherwise try mermaidAPI.initialize
        return api.initialize ? api.initialize(opts) : undefined
      },
    }
  }

  if ((mod as any).mermaid && typeof (mod as any).mermaid.render === 'function')
    return (mod as any).mermaid

  // fallback: use candidate as-is; it may still work or we'll surface a runtime error later
  return candidate
}

function patchInitialize(target: any) {
  if (!target)
    return
  // Ensure initialize honors a safe default: suppressErrorRendering = true.
  // This prevents mermaid from injecting verbose error diagrams into the DOM
  // when parsing/rendering fails. If the consumer passes an explicit
  // `suppressErrorRendering: false` it will be respected.
  try {
    const origInit = target?.initialize
    target.initialize = (opts: any) => {
      const merged = { suppressErrorRendering: true, ...(opts || {}) }
      if (typeof origInit === 'function')
        return origInit.call(target, merged)
      // fallback to mermaidAPI.initialize if present
      if (target?.mermaidAPI && typeof target.mermaidAPI.initialize === 'function')
        return target.mermaidAPI.initialize(merged)
      return undefined
    }
  }
  catch {
    // be defensive: if anything goes wrong wrapping initialize, ignore and
    // return the mermaid instance as-is. Consumers will handle runtime errors.
  }
}

export async function getMermaid() {
  if (cachedMermaid)
    return cachedMermaid

  const globalMermaid = getGlobalMermaid()
  if (globalMermaid) {
    cachedMermaid = globalMermaid
    patchInitialize(cachedMermaid)
    return cachedMermaid
  }

  const loader = mermaidLoader
  if (!loader)
    return null
  let mod: any
  try {
    mod = await loader()
  }
  catch (err) {
    if (loader === defaultMermaidLoader) {
      throw new Error('Optional dependency "mermaid" is not installed. Please install it to enable mermaid diagrams.')
    }
    throw err
  }
  if (!mod)
    return null
  cachedMermaid = normalizeMermaidModule(mod)
  patchInitialize(cachedMermaid)
  return cachedMermaid
}
