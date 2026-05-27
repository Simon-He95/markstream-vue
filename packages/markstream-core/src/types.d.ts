export interface SmoothMarkdownStreamOptions {
    minCharsPerSecond?: number;
    maxCharsPerSecond?: number;
    targetLatencyMs?: number;
    catchUpLatencyMs?: number;
    catchUpThreshold?: number;
    maxCommitFps?: number;
    startDelayMs?: number;
    maxCharsPerCommit?: number;
    flushOnFinish?: boolean;
}
export interface SmoothMarkdownStreamSnapshot {
    source: string;
    visible: string;
    done: boolean;
    paused: boolean;
    pendingChars: number;
    caughtUp: boolean;
    final: boolean;
}
export type SmoothStreamNotify = () => void;
export interface SmoothMarkdownStreamController {
    getSnapshot: () => SmoothMarkdownStreamSnapshot;
    subscribe: (listener: SmoothStreamNotify) => () => void;
    enqueue: (chunk: string) => void;
    finish: (options?: {
        flush?: boolean;
    }) => void;
    flush: () => void;
    reset: (initialMarkdown?: string) => void;
    pause: () => void;
    resume: () => void;
    destroy: () => void;
    dispose: () => void;
}
export interface ResolveStreamingTextStateOptions {
    nextContent: string;
    previousContent: string;
    typewriterEnabled: boolean;
}
export interface StreamingTextStateResult {
    settledContent: string;
    streamedDelta: string;
    appended: boolean;
}
export interface StreamingRenderState {
    settledContent: string;
    streamedDelta: string;
}
export interface ResolveStreamingTextUpdateOptions {
    nextContent: string;
    persistedContent?: string;
    currentState: StreamingRenderState;
    typewriterEnabled: boolean;
    streamRenderVersionChanged?: boolean;
}
