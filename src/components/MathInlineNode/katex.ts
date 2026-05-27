export interface KatexModule {
  renderToString: (content: string, options?: Record<string, unknown>) => string
}

export type KatexLoader = () => Promise<unknown> | unknown

let katex: any = null
let importAttempted = false
let katexLoader: KatexLoader | null = defaultKatexLoader

function normalizeKatexModule(mod: any): KatexModule | null {
  const resolved = mod?.default ?? mod
  if (resolved && typeof resolved.renderToString === 'function')
    return resolved as KatexModule
  return null
}

function getGlobalKatex() {
  try {
    const g: any = globalThis as any
    return normalizeKatexModule(g?.katex)
  }
  catch {
    return null
  }
}

function defaultKatexLoader() {
  return (async () => {
    const globalKatex = getGlobalKatex()
    if (globalKatex)
      return globalKatex

    const mod = await import('katex')
    try {
      // Webpack 4 does not support `package.json#exports`, so `katex/contrib/mhchem`
      // resolves to a directory and fails. Use a real file path instead.
      await import('katex/dist/contrib/mhchem')
    }
    catch {
      // ignore missing optional contrib bundle
    }
    return normalizeKatexModule(mod)
  })()
}

function resetCache() {
  katex = null
  importAttempted = false
}

export function setKatexLoader(loader: KatexLoader | null) {
  katexLoader = loader
  resetCache()
}

export function enableKatex(loader?: KatexLoader) {
  setKatexLoader(loader ?? defaultKatexLoader)
}

export function disableKatex() {
  setKatexLoader(null)
}

export function isKatexEnabled() {
  return typeof katexLoader === 'function'
}

export function getKatexSync(): KatexModule | null {
  const globalKatex = getGlobalKatex()
  if (globalKatex) {
    katex = globalKatex
    return katex
  }

  if (katex)
    return katex

  const loader = katexLoader
  if (!loader || loader === defaultKatexLoader)
    return null

  try {
    const result = loader()
    if (!result || typeof (result as PromiseLike<any>)?.then === 'function')
      return null
    katex = normalizeKatexModule(result) ?? result
    return katex
  }
  catch {
    return null
  }
}

export async function getKatex(): Promise<KatexModule | null> {
  const globalKatex = getGlobalKatex()
  if (globalKatex) {
    katex = globalKatex
    return katex
  }

  if (katex)
    return katex
  if (importAttempted)
    return null
  const loader = katexLoader
  if (!loader) {
    importAttempted = true
    return null
  }
  try {
    const result = await loader()
    if (result) {
      katex = normalizeKatexModule(result) ?? result
      return katex
    }
  }
  catch {
    // Swallow errors here; callers handle lack of KaTeX support gracefully.
  }
  importAttempted = true
  return null
}
