import type { ResolveStreamingTextStateOptions, ResolveStreamingTextUpdateOptions, StreamingTextStateResult } from './types';
/**
 * Resolve the next streaming text state given previous content.
 * This is the basic variant used by all frameworks for simple
 * append-detection during streaming updates.
 */
export declare function resolveStreamingTextState({ nextContent, previousContent, typewriterEnabled, }: ResolveStreamingTextStateOptions): StreamingTextStateResult;
/**
 * Resolve the next streaming text state given the current render state
 * and an optional persisted content snapshot (e.g. from a shared stream
 * state map). This variant handles:
 * - React StrictMode replay (preserves active delta when rendered content
 *   matches but the stream render version has not changed)
 * - Stream version resets (settles the delta when the version changes)
 * - Fallback to the basic resolver for all other cases
 */
export declare function resolveStreamingTextUpdate({ nextContent, persistedContent, currentState, typewriterEnabled, streamRenderVersionChanged, }: ResolveStreamingTextUpdateOptions): StreamingTextStateResult;
