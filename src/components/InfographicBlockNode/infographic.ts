export interface InfographicInstance {
  render: (source: string) => unknown
  destroy?: () => unknown
  on?: (event: string, handler: (payload: unknown) => void) => unknown
}

export interface InfographicConstructor {
  new (options: { container: HTMLElement, width?: string | number, height?: string | number }): InfographicInstance
}

export type InfographicLoader = () => Promise<unknown> | unknown

const defaultInfographicLoader: InfographicLoader = () => import('@antv/infographic')

let cachedInfographic: any = null
let infographicLoader: InfographicLoader | null = defaultInfographicLoader

function resetCachedInfographic() {
  cachedInfographic = null
}

export function setInfographicLoader(loader: InfographicLoader | null) {
  infographicLoader = loader
  resetCachedInfographic()
}

export function isInfographicEnabled() {
  return infographicLoader !== null
}

export async function getInfographic(): Promise<InfographicConstructor | null> {
  if (cachedInfographic)
    return cachedInfographic

  const loader = infographicLoader
  if (!loader)
    return null
  let mod: any
  try {
    mod = await loader()
  }
  catch (err) {
    if (loader === defaultInfographicLoader) {
      throw new Error('Optional dependency "@antv/infographic" is not installed. Please install it to enable infographic diagrams.')
    }
    throw err
  }
  if (!mod)
    return null

  // Normalize module
  // Handle ESM default export or named export
  const defaultExport = (mod && (mod as any).default) ? (mod as any).default : mod

  // If default export is the class itself
  if (typeof defaultExport === 'function' && defaultExport.prototype && defaultExport.prototype.render) {
    cachedInfographic = defaultExport
  }
  // If it's a named export { Infographic }
  else if (mod.Infographic) {
    cachedInfographic = mod.Infographic
  }
  else if (defaultExport && defaultExport.Infographic) {
    cachedInfographic = defaultExport.Infographic
  }
  else {
    // Fallback
    cachedInfographic = defaultExport
  }

  return cachedInfographic as InfographicConstructor
}
