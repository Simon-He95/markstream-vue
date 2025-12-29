export type KatexLoader = () => Promise<any> | any

let katex: any = null
let importAttempted = false
let katexLoader: KatexLoader | null = defaultKatexLoader

function normalizeKatexModule(mod: any) {
  const resolved = mod?.default ?? mod
  if (resolved && typeof resolved.renderToString === 'function')
    return resolved
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
      await import('katex/contrib/mhchem')
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

export async function getKatex() {
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
