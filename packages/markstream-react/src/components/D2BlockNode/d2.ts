export interface D2Instance {
  D2?: D2Constructor
  compile?: (source: string, options?: Record<string, unknown>) => Promise<unknown> | unknown
  render?: (input: unknown, options?: Record<string, unknown>) => Promise<unknown> | unknown
}

export interface D2Constructor {
  new (): D2Instance
  D2?: D2Constructor
  compile?: D2Instance['compile']
}

export type D2Module = D2Constructor | D2Instance
export type D2Loader = () => Promise<unknown> | unknown

const defaultD2Loader: D2Loader = () => import('@terrastruct/d2')

let cachedD2: any = null
let d2Loader: D2Loader | null = defaultD2Loader

function resetCachedD2() {
  cachedD2 = null
}

function normalizeD2Module(mod: any) {
  if (!mod)
    return mod
  if (mod.D2 && typeof mod.D2 === 'function')
    return mod.D2
  if (mod.default && mod.default.D2 && typeof mod.default.D2 === 'function')
    return mod.default.D2
  const candidate = mod.default ?? mod
  if (typeof candidate === 'function')
    return candidate
  if (candidate?.D2 && typeof candidate.D2 === 'function')
    return candidate.D2
  return candidate
}

export function setD2Loader(loader: D2Loader | null) {
  d2Loader = loader
  resetCachedD2()
}

export function enableD2(loader?: D2Loader) {
  setD2Loader(loader ?? defaultD2Loader)
}

export function disableD2() {
  setD2Loader(null)
}

export function isD2Enabled() {
  return typeof d2Loader === 'function'
}

export async function getD2(): Promise<D2Module | null> {
  if (cachedD2)
    return cachedD2

  const loader = d2Loader
  if (!loader)
    return null

  let mod: any
  try {
    mod = await loader()
  }
  catch (err) {
    if (loader === defaultD2Loader) {
      throw new Error('Optional dependency "@terrastruct/d2" is not installed. Please install it to enable D2 diagrams.')
    }
    throw err
  }
  if (!mod)
    return null

  cachedD2 = normalizeD2Module(mod)
  return cachedD2
}
