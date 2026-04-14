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
 * Each useMonaco() instance captures its own `themes` list in its setTheme
 * closure, so we must call every registered instance — only the one whose
 * themes list contains the target theme will succeed at registration.
 * monaco.editor.setTheme() itself is global (affects all editors).
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
    if (theme == null || registry.size === 0)
      return

    // Notify all registered instances — each has its own themes context.
    // stream-monaco internally deduplicates via globalAppliedThemeName,
    // so only the first successful call does real work; the rest are no-ops.
    const results = await Promise.allSettled(
      [...registry].map(fn => fn(theme)),
    )

    // Mark as applied if at least one succeeded
    if (results.some(r => r.status === 'fulfilled'))
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
 */
export function invalidateThemeCache() {
  lastAppliedKey = null
}
