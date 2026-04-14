import type { CodeBlockMonacoTheme } from '../../types/component-props'

type SetThemeFn = (theme: CodeBlockMonacoTheme | undefined) => Promise<void> | void

// ── Registry: all mounted components register their setTheme here ──
const registry = new Set<SetThemeFn>()

export function registerSetTheme(fn: SetThemeFn): () => void {
  registry.add(fn)
  return () => { registry.delete(fn) }
}

// ── Deduplication state ──
let lastAppliedKey: string | null = null
let applyPromise: Promise<void> | null = null

const themeKeyCache = new WeakMap<object, string>()
let themeKeySeq = 0

function getThemeKey(theme: CodeBlockMonacoTheme | null | undefined): string | null {
  if (theme == null)
    return null
  if (typeof theme === 'string')
    return theme
  if (typeof theme === 'object' && 'name' in theme)
    return String(theme.name)
  if (typeof theme === 'object') {
    const cached = themeKeyCache.get(theme)
    if (cached)
      return cached
    try {
      const str = JSON.stringify(theme)
      if (str) {
        themeKeyCache.set(theme, str)
        return str
      }
    }
    catch {}
    const id = `__theme_${++themeKeySeq}`
    themeKeyCache.set(theme, id)
    return id
  }
  return String(theme)
}

/**
 * Request a global Monaco theme change.
 * Picks any available setTheme from the registry, deduplicates by theme key.
 */
export function requestThemeChange(theme: CodeBlockMonacoTheme | null | undefined): Promise<void> {
  const key = getThemeKey(theme)
  if (!key)
    return Promise.resolve()

  // Already applied and nothing in-flight — skip
  if (!applyPromise && lastAppliedKey === key)
    return Promise.resolve()

  // If something is in-flight, chain after it
  if (applyPromise) {
    applyPromise = applyPromise.then(() => applyTheme(key, theme))
    return applyPromise
  }

  applyPromise = applyTheme(key, theme)
  return applyPromise
}

async function applyTheme(key: string, theme: CodeBlockMonacoTheme | null | undefined): Promise<void> {
  try {
    if (lastAppliedKey === key)
      return

    // Pick any registered setTheme — they all call the same global Monaco API
    const setTheme = registry.values().next().value
    if (!setTheme || theme == null)
      return

    await setTheme(theme)
    lastAppliedKey = key
  }
  catch (error) {
    if (import.meta.env?.DEV)
      console.warn('[markstream-vue] Failed to apply Monaco theme:', error)
  }
  finally {
    applyPromise = null
  }
}

/**
 * Reset the cached lastAppliedKey so the next requestThemeChange always applies.
 * Useful when forcing a re-apply after component recreation.
 */
export function invalidateThemeCache() {
  lastAppliedKey = null
}
