export type InfographicLoader = () => Promise<unknown> | unknown

const defaultInfographicLoader: InfographicLoader = () => import('@antv/infographic')

let infographicPromise: Promise<InfographicConstructor | null> | null = null
let infographicInstance: InfographicConstructor | null = null
let infographicLoader: InfographicLoader | null = defaultInfographicLoader

export interface InfographicInstance {
  render: (source: string) => unknown
  destroy?: () => unknown
  on?: (event: string, handler: (payload: unknown) => void) => unknown
}

export interface InfographicConstructor {
  new (options: { container: HTMLElement, width?: string | number, height?: string | number }): InfographicInstance
}

function normalizeInfographicModule(mod: any): InfographicConstructor | null {
  if (!mod)
    return null

  const defaultExport = mod.default ?? mod
  if (typeof defaultExport === 'function' && defaultExport.prototype?.render)
    return defaultExport as InfographicConstructor
  if (typeof mod.Infographic === 'function')
    return mod.Infographic as InfographicConstructor
  if (typeof defaultExport?.Infographic === 'function')
    return defaultExport.Infographic as InfographicConstructor
  return null
}

function resetInfographicCache() {
  infographicPromise = null
  infographicInstance = null
}

export function setInfographicLoader(loader: InfographicLoader | null) {
  infographicLoader = loader
  resetInfographicCache()
}

export function enableInfographic(loader?: InfographicLoader) {
  setInfographicLoader(loader ?? defaultInfographicLoader)
}

export function disableInfographic() {
  setInfographicLoader(null)
}

export function isInfographicEnabled() {
  return typeof infographicLoader === 'function'
}

export async function getInfographic(): Promise<InfographicConstructor | null> {
  if (infographicInstance)
    return infographicInstance
  if (infographicPromise)
    return await infographicPromise

  const loader = infographicLoader
  if (!loader)
    return null

  infographicPromise = Promise.resolve()
    .then(() => loader())
    .then(normalizeInfographicModule)
    .then((resolved) => {
      infographicInstance = resolved
      return resolved
    })
    .catch(() => null)

  try {
    return await infographicPromise
  }
  finally {
    infographicPromise = null
  }
}
