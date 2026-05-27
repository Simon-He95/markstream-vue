/**
 * Context key and types for Svelte smooth streaming parent suppression.
 *
 * When a parent NodeRenderer is already pacing content via smooth streaming,
 * nested renderers (e.g. thinking blocks, custom tag content) should suppress
 * their own smooth streaming to avoid double-pacing.
 *
 * Usage:
 *   const parentSmoothStreaming = getContext<SmoothStreamingContextValue | undefined>(
 *     SMOOTH_STREAMING_CONTEXT,
 *   )
 *   setContext(SMOOTH_STREAMING_CONTEXT, () => smoothStreamingEnabled)
 */

export const SMOOTH_STREAMING_CONTEXT = 'markstreamSmoothStreaming'

export type SmoothStreamingContextValue = () => boolean
