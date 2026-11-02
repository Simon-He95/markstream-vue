export interface SmoothMarkdownStreamOptions {
  minCharsPerSecond?: number
  maxCharsPerSecond?: number
  targetLatencyMs?: number
  catchUpLatencyMs?: number
  catchUpThreshold?: number
  maxCommitFps?: number
  startDelayMs?: number
  maxCharsPerCommit?: number
  flushOnFinish?: boolean
  /**
   * When true, a single content block of at least `burstRevealThresholdChars`
   * is revealed up to the fence-safe boundary in one commit instead of being
   * paced per-character. Keeps streaming-correctness (unclosed fences are
   * still withheld) while large one-shot documents render immediately.
   * Typewriter callers should keep this off. Defaults to false.
   */
  burstInitialContent?: boolean
  /** Minimum pending chars for `burstInitialContent` to apply. Defaults to 2048. */
  burstRevealThresholdChars?: number
}

export interface SmoothMarkdownStreamSnapshot {
  source: string
  visible: string
  done: boolean
  paused: boolean
  pendingChars: number
  caughtUp: boolean
  final: boolean
}

export type SmoothStreamNotify = () => void

export interface SmoothMarkdownStreamController {
  getSnapshot: () => SmoothMarkdownStreamSnapshot
  subscribe: (listener: SmoothStreamNotify) => () => void
  enqueue: (chunk: string) => void
  finish: (options?: { flush?: boolean }) => void
  flush: (options?: { maxChars?: number }) => void
  reset: (initialMarkdown?: string, options?: { prefixKnown?: boolean }) => void
  pause: () => void
  resume: () => void
  destroy: () => void
  dispose: () => void
}

export interface ResolveStreamingTextStateOptions {
  nextContent: string
  previousContent: string
  typewriterEnabled: boolean
}

export interface StreamingTextStateResult {
  settledContent: string
  streamedDelta: string
  appended: boolean
}

export interface StreamingRenderState {
  settledContent: string
  streamedDelta: string
}

export interface ResolveStreamingTextUpdateOptions {
  nextContent: string
  persistedContent?: string
  currentState: StreamingRenderState
  typewriterEnabled: boolean
  streamRenderVersionChanged?: boolean
}
