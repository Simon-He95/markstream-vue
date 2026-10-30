import type { Accessor } from 'solid-js'
import { createContext } from 'solid-js'

export const MathHeightCacheContext = createContext<{
  scope: Accessor<string>
  cache: Map<string, number>
}>()
