import type { Accessor } from 'solid-js'
import type { CustomComponentMap } from './customComponents'
import type { LanguageIconResolver } from './utils/languageIcon'
import { createContext } from 'solid-js'

export interface MarkstreamSolidOptions {
  components?: CustomComponentMap
  defaultI18nMap?: Partial<Record<string, string>>
  languageIconResolver?: LanguageIconResolver | null
}

export const MarkstreamConfigContext = createContext<Accessor<MarkstreamSolidOptions>>(() => ({}))
