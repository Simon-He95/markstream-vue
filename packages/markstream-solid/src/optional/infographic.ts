export interface InfographicInstance {
  render: (source: string) => unknown
  destroy?: () => unknown
  on?: (event: string, handler: (payload: unknown) => void) => unknown
}

export interface InfographicConstructor {
  new (options: { container: HTMLElement, width?: string | number, height?: string | number }): InfographicInstance
}

export type InfographicModuleLike
  = InfographicConstructor
    | {
      default?: InfographicModuleLike
      Infographic?: InfographicConstructor
    }
    | null
    | undefined

export type InfographicLoader = () => Promise<InfographicModuleLike> | InfographicModuleLike

let cachedInfographic: InfographicConstructor | null = null
let infographicLoader: InfographicLoader | null = null
let pendingInfographic: Promise<InfographicConstructor | null> | null = null
let loaderVersion = 0

function normalizeInfographicModule(mod: unknown): InfographicConstructor | null {
  if (!mod)
    return null

  const defaultExport = (mod as any).default ?? mod
  const candidate = typeof defaultExport === 'function' && typeof defaultExport.prototype?.render === 'function'
    ? defaultExport
    : ((mod as any).Infographic ?? defaultExport?.Infographic)

  return typeof candidate === 'function' ? candidate : null
}

/**
 * Configure the optional infographic loader before `app.mount()` or before the
 * first infographic block renders. Runtime toggles do not retroactively update
 * already-mounted infographic blocks.
 */
export function setInfographicLoader(loader?: InfographicLoader | null) {
  infographicLoader = loader ?? null
  cachedInfographic = null
  pendingInfographic = null
  loaderVersion++
}

/**
 * Enable infographic rendering before `app.mount()` or before the first
 * infographic block renders.
 */
export function enableInfographic(loader: InfographicLoader) {
  if (typeof loader !== 'function')
    throw new TypeError('enableInfographic requires a loader function')
  setInfographicLoader(loader)
}

export function disableInfographic() {
  setInfographicLoader()
}

export function isInfographicEnabled() {
  return typeof infographicLoader === 'function'
}

export async function getInfographic(): Promise<InfographicConstructor | null> {
  if (cachedInfographic)
    return cachedInfographic

  const loader = infographicLoader
  const version = loaderVersion
  if (!loader)
    return null

  if (pendingInfographic)
    return pendingInfographic

  pendingInfographic = (async () => {
    const mod: any = await loader()
    if (version !== loaderVersion || loader !== infographicLoader)
      return null
    const resolved = normalizeInfographicModule(mod)
    if (version !== loaderVersion || loader !== infographicLoader)
      return null
    if (!resolved)
      return null

    cachedInfographic = resolved
    return cachedInfographic
  })().finally(() => {
    if (version === loaderVersion && loader === infographicLoader)
      pendingInfographic = null
  })

  return pendingInfographic
}
