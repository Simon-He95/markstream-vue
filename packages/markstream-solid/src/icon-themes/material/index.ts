import type { IconTheme } from '../types'
import { materialCoreMap } from './core'
import FallbackIcon from './svg/_fallback.svg?raw'

export const materialIconTheme: IconTheme = {
  id: 'material',
  core: materialCoreMap,
  fallback: FallbackIcon,
  loadExtended: () => import('./extended').then(m => m.materialExtendedMap),
}
