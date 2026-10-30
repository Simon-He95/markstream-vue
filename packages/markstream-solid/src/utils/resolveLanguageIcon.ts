import type { LanguageIconResolver } from './languageIcon'
import { getThemeFallback, resolveFromTheme } from '../icon-themes/registry'
import { getLanguageIcon, normalizeLanguageIdentifier } from './languageIcon'

export function resolveLanguageIcon(lang: string, appScopedResolver?: LanguageIconResolver | null): string {
  if (appScopedResolver === undefined)
    return getLanguageIcon(lang)

  if (appScopedResolver) {
    const hit = appScopedResolver(lang)
    if (hit != null && hit !== '')
      return hit
  }

  const normalized = normalizeLanguageIdentifier(lang)
  const themeHit = resolveFromTheme(normalized)
  if (themeHit)
    return themeHit

  return getThemeFallback()
}
