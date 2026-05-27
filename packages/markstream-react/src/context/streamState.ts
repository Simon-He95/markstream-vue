import { createContext, useContext } from 'react'

/**
 * Holds mutable streaming state that updates on every streaming chunk
 * without triggering React re-renders. TextNode and InlineCodeNode read
 * from this ref inside effects / callbacks rather than from renderCtx props,
 * so that the renderCtx object can stay referentially stable during streaming.
 */
export interface StreamStateRef {
  /** Map from node key to last-settled text content (shared across renders). */
  textStreamState: Map<string, string>
  /** Returns the current stream render version counter. */
  getStreamRenderVersion: () => number
}

/**
 * React Context that carries a stable StreamStateRef.
 * The context value itself never changes (same ref object for the lifetime
 * of the NodeRenderer), so subscribing components do NOT re-render when
 * the stream version increments.  Consumers read the latest value inside
 * effects or callbacks via `ref.getStreamRenderVersion()`.
 */
export const StreamStateRefContext = createContext<StreamStateRef | null>(null)

/**
 * Hook that returns the nearest StreamStateRef, or null if none is provided.
 */
export function useStreamStateRef(): StreamStateRef | null {
  return useContext(StreamStateRefContext)
}
