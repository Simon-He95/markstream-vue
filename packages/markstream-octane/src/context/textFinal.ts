import type { StreamingTextScope } from 'markstream-core'
import { createContext } from 'octane'

export const TextFinalContext = createContext<StreamingTextScope | undefined>(undefined)
