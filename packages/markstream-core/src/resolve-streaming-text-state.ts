import type {
  ResolveStreamingTextStateOptions,
  ResolveStreamingTextUpdateOptions,
  StreamingTextStateResult,
} from './types'

/**
 * Resolve the next streaming text state given previous content.
 * This is the basic variant used by all frameworks for simple
 * append-detection during streaming updates.
 */
export function resolveStreamingTextState({
  nextContent,
  previousContent,
  typewriterEnabled,
}: ResolveStreamingTextStateOptions): StreamingTextStateResult {
  if (!typewriterEnabled) {
    return {
      settledContent: nextContent,
      streamedDelta: '',
      appended: false,
    }
  }

  if (nextContent === previousContent) {
    return {
      settledContent: nextContent,
      streamedDelta: '',
      appended: false,
    }
  }

  if (previousContent && nextContent.startsWith(previousContent) && nextContent.length > previousContent.length) {
    return {
      settledContent: previousContent,
      streamedDelta: nextContent.slice(previousContent.length),
      appended: true,
    }
  }

  return {
    settledContent: nextContent,
    streamedDelta: '',
    appended: false,
  }
}

/**
 * Resolve the next streaming text state given the current render state
 * and an optional persisted content snapshot (e.g. from a shared stream
 * state map). This variant handles:
 * - React StrictMode replay (preserves active delta when rendered content
 *   matches but the stream render version has not changed)
 * - Stream version resets (settles the delta when the version changes)
 * - Fallback to the basic resolver for all other cases
 */
export function resolveStreamingTextUpdate({
  nextContent,
  persistedContent,
  currentState,
  typewriterEnabled,
  streamRenderVersionChanged = false,
}: ResolveStreamingTextUpdateOptions): StreamingTextStateResult {
  const renderedContent = `${currentState.settledContent}${currentState.streamedDelta}`

  if (!typewriterEnabled) {
    return {
      settledContent: nextContent,
      streamedDelta: '',
      appended: false,
    }
  }

  // Framework replay guards (e.g. React StrictMode) may replay effects with
  // the same props while the delta animation is still active. Preserve the
  // current delta instead of settling it immediately so the fade remains
  // visible in dev and playgrounds.
  if (currentState.streamedDelta && renderedContent === nextContent) {
    if (streamRenderVersionChanged) {
      return {
        settledContent: renderedContent,
        streamedDelta: '',
        appended: false,
      }
    }
    return {
      settledContent: currentState.settledContent,
      streamedDelta: currentState.streamedDelta,
      appended: false,
    }
  }

  return resolveStreamingTextState({
    nextContent,
    previousContent: persistedContent ?? renderedContent,
    typewriterEnabled,
  })
}
