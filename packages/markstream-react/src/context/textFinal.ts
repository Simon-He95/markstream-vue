import type { StreamingTextScope } from 'markstream-core'
import { createContext } from 'react'

export const TextFinalContext = createContext<StreamingTextScope | undefined>(undefined)
