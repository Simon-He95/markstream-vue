import type { InjectionKey } from 'vue'
import type { LanguageIconResolver } from './languageIcon'
import { getLanguageIcon } from './languageIcon'

export const MARKSTREAM_LANGUAGE_ICON_RESOLVER_KEY: InjectionKey<LanguageIconResolver> = Symbol('markstreamLanguageIconResolver')

export function resolveLanguageIcon(lang: string, appResolver?: LanguageIconResolver | null): string {
  if (appResolver) {
    const hit = appResolver(lang)
    if (hit != null && hit !== '')
      return hit
  }

  return getLanguageIcon(lang)
}
