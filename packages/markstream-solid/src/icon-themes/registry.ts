import type { IconTheme, LanguageIconMap } from './types'

const themes = new Map<string, IconTheme>()
let activeThemeId = 'material'

// Per-theme extended icon cache
const extendedCache = new Map<string, LanguageIconMap | null>()
const extendedPromises = new Map<string, Promise<LanguageIconMap | null>>()

// Imported lazily to avoid circular deps — set by languageIcon.ts on init
let _bumpRevision: (() => void) | null = null
export function _setRevisionBumper(fn: () => void) {
  _bumpRevision = fn
}

export function registerIconTheme(theme: IconTheme): void {
  themes.set(theme.id, theme)
}

export function setIconTheme(id: string): void {
  if (!themes.has(id))
    throw new Error(`[markstream-vue] Unknown icon theme: "${id}". Registered: ${[...themes.keys()].join(', ')}`)
  activeThemeId = id
  _bumpRevision?.()
  // Eagerly start loading extended icons for the new theme
  const theme = themes.get(id)!
  if (theme.loadExtended && !extendedCache.has(id))
    void loadThemeExtended(theme)
}

export function getActiveTheme(): IconTheme | undefined {
  return themes.get(activeThemeId)
}

export function getRegisteredThemes(): string[] {
  return [...themes.keys()]
}

export function resolveFromTheme(normalized: string): string | undefined {
  const theme = themes.get(activeThemeId)
  if (!theme)
    return undefined

  // Core map (sync)
  const coreHit = theme.core[normalized]
  if (coreHit)
    return coreHit

  // Extended map (cached async)
  const ext = extendedCache.get(theme.id)
  if (ext) {
    const extHit = ext[normalized]
    if (extHit)
      return extHit
  }

  // Trigger lazy load if available
  if (theme.loadExtended && !extendedCache.has(theme.id))
    void loadThemeExtended(theme)

  return undefined
}

export function getThemeFallback(): string {
  return themes.get(activeThemeId)?.fallback ?? ''
}

async function loadThemeExtended(theme: IconTheme): Promise<LanguageIconMap | null> {
  if (extendedCache.has(theme.id))
    return extendedCache.get(theme.id) ?? null

  let promise = extendedPromises.get(theme.id)
  if (!promise) {
    promise = (theme.loadExtended?.() ?? Promise.resolve(null))
      .then((map) => {
        extendedCache.set(theme.id, map)
        _bumpRevision?.()
        return map
      })
      .catch(() => {
        extendedCache.set(theme.id, null)
        return null
      })
    extendedPromises.set(theme.id, promise)
  }
  return promise
}

export async function preloadActiveThemeExtended(): Promise<void> {
  const theme = themes.get(activeThemeId)
  if (theme?.loadExtended)
    await loadThemeExtended(theme)
}
