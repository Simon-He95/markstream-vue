let cachedMermaid: any = null
let importAttempted = false
let lastInitKey: string | null = null
let pendingImport: Promise<MermaidModule | null> | null = null

export interface MermaidModule {
  render: (id: string, source: string) => Promise<MermaidRenderResult> | MermaidRenderResult
  parse?: (source: string) => Promise<unknown> | unknown
  initialize?: (config?: Record<string, unknown>) => unknown
  mermaidAPI?: {
    render?: MermaidModule['render']
    parse?: MermaidModule['parse']
    initialize?: MermaidModule['initialize']
  }
}

export type MermaidRenderResult = string | {
  svg?: string
  bindFunctions?: (element: Element) => unknown
}

interface MermaidInitConfig extends Record<string, unknown> {
  securityLevel?: unknown
  flowchart?: {
    htmlLabels?: unknown
  }
}

function computeInitKey(config: MermaidInitConfig) {
  const securityLevel = String(config?.securityLevel ?? 'strict')
  const htmlLabels = config?.flowchart?.htmlLabels
  return `${securityLevel}|htmlLabels:${htmlLabels === false ? '0' : '1'}`
}

function ensureInitialized(instance: any, config?: MermaidInitConfig) {
  if (!instance || !config)
    return
  const key = computeInitKey(config)
  if (lastInitKey === key)
    return
  try {
    if (typeof instance.initialize === 'function')
      instance.initialize(config)
    else if (instance.mermaidAPI?.initialize)
      instance.mermaidAPI.initialize(config)
    lastInitKey = key
  }
  catch {
    // ignore init failures; mermaid may already be initialized in some environments
  }
}

export async function getMermaid(initConfig?: MermaidInitConfig): Promise<MermaidModule | null> {
  if (cachedMermaid) {
    ensureInitialized(cachedMermaid, initConfig)
    return cachedMermaid
  }
  if (pendingImport) {
    const instance = await pendingImport
    if (instance)
      ensureInitialized(instance, initConfig)
    return instance
  }
  if (importAttempted)
    return null
  try {
    importAttempted = true
    pendingImport = (async () => {
      try {
        const mod: any = await import('mermaid')
        const candidate: any = mod?.default || mod
        if (candidate?.default)
          cachedMermaid = candidate.default
        else if (candidate?.mermaidAPI)
          cachedMermaid = candidate
        else if (candidate?.mermaid)
          cachedMermaid = candidate.mermaid
        else
          cachedMermaid = candidate
        if (!cachedMermaid)
          throw new Error('Mermaid module did not export expected API')
        ensureInitialized(cachedMermaid, initConfig ?? { startOnLoad: false, securityLevel: 'strict', flowchart: { htmlLabels: false } })
        return cachedMermaid as MermaidModule
      }
      catch (err) {
        console.warn('[markstream-react] Failed to load mermaid:', err)
        return null
      }
      finally {
        pendingImport = null
      }
    })()
    const instance = await pendingImport
    if (instance)
      ensureInitialized(instance, initConfig)
    return instance
  }
  catch {
    return null
  }
}
