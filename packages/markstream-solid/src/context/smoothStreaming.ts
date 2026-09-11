import { createContext } from 'solid-js'

export type SmoothStreamingContextValue = () => boolean
export const SMOOTH_STREAMING_CONTEXT = createContext<SmoothStreamingContextValue>()
