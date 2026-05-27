import type {
  SmoothMarkdownStreamController,
  SmoothMarkdownStreamOptions,
  SmoothMarkdownStreamSnapshot,
  SmoothStreamNotify,
} from './types'

interface GraphemeSlice {
  text: string
  graphemeCount: number
}

interface GraphemeSegment {
  segment: string
}

interface GraphemeSegmenter {
  segment: (input: string) => Iterable<GraphemeSegment>
}

function toPositiveFiniteNumber(value: unknown, fallback: number, min = 1) {
  const normalized = Number(value)
  return Number.isFinite(normalized)
    ? Math.max(min, normalized)
    : fallback
}

function toNonNegativeFiniteNumber(value: unknown, fallback: number) {
  const normalized = Number(value)
  return Number.isFinite(normalized)
    ? Math.max(0, normalized)
    : fallback
}

class SmoothMarkdownStreamControllerImpl {
  source: string = ''
  visible: string = ''
  done: boolean = false
  paused: boolean = false

  private readonly minCharsPerSecond: number
  private readonly maxCharsPerSecond: number
  private readonly normalizedTargetLatencyMs: number
  private readonly normalizedCatchUpLatencyMs: number
  private readonly normalizedCatchUpThreshold: number
  private readonly normalizedStartDelayMs: number
  private readonly maxCommitFps: number
  private readonly maxCharsPerCommit: number
  private readonly flushOnFinish: boolean
  private readonly segmenter: GraphemeSegmenter | null
  private readonly listeners = new Set<SmoothStreamNotify>()

  private rafId = 0
  private startedAt = 0
  private lastTick = 0
  private charBudget = 0
  private currentCps: number
  private hasStarted = false
  private destroyed = false

  constructor(options: SmoothMarkdownStreamOptions = {}, notify?: SmoothStreamNotify) {
    const {
      minCharsPerSecond: rawMinCps = 40,
      maxCharsPerSecond: rawMaxCps = 1000,
      targetLatencyMs: rawTargetLatencyMs = 900,
      catchUpLatencyMs: rawCatchUpLatencyMs = 350,
      catchUpThreshold: rawCatchUpThreshold = 600,
      maxCommitFps: rawMaxFps = 30,
      startDelayMs: rawStartDelayMs = 80,
      maxCharsPerCommit: rawMaxChars = 80,
      flushOnFinish = false,
    } = options

    this.minCharsPerSecond = toPositiveFiniteNumber(rawMinCps, 40, 1)
    this.maxCharsPerSecond = Math.max(
      this.minCharsPerSecond,
      toPositiveFiniteNumber(rawMaxCps, 1000, 1),
    )
    this.normalizedTargetLatencyMs = toPositiveFiniteNumber(rawTargetLatencyMs, 900, 1)
    this.normalizedCatchUpLatencyMs = toPositiveFiniteNumber(rawCatchUpLatencyMs, 350, 1)
    this.normalizedCatchUpThreshold = toNonNegativeFiniteNumber(rawCatchUpThreshold, 600)
    this.normalizedStartDelayMs = toNonNegativeFiniteNumber(rawStartDelayMs, 80)
    this.maxCommitFps = Math.trunc(toPositiveFiniteNumber(rawMaxFps, 30, 1))
    this.maxCharsPerCommit = Math.trunc(toPositiveFiniteNumber(rawMaxChars, 80, 1))
    this.flushOnFinish = flushOnFinish
    this.segmenter = createGraphemeSegmenter()
    if (notify)
      this.listeners.add(notify)
    this.currentCps = this.minCharsPerSecond
  }

  get pendingChars(): number {
    return Math.max(0, this.source.length - this.visible.length)
  }

  get caughtUp(): boolean {
    return this.pendingChars === 0
  }

  get final(): boolean {
    return this.done && this.caughtUp
  }

  getSnapshot = (): SmoothMarkdownStreamSnapshot => ({
    source: this.source,
    visible: this.visible,
    done: this.done,
    paused: this.paused,
    pendingChars: this.pendingChars,
    caughtUp: this.caughtUp,
    final: this.final,
  })

  subscribe = (listener: SmoothStreamNotify): (() => void) => {
    if (this.destroyed)
      return () => {}

    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  enqueue = (chunk: string): void => {
    if (this.destroyed || !chunk)
      return

    if (this.done) {
      this.done = false
    }

    const hadSource = this.source.length > 0
    const wasIdle = this.pendingChars <= 0
    this.source += chunk

    if (wasIdle) {
      const t = now()
      // Only apply startDelay for the very first batch of a new stream.
      // If the stream already had content and wasn't finished, skip the delay
      // so subsequent appends resume smoothly without an artificial pause.
      this.startedAt = hadSource && this.hasStarted
        ? t - this.normalizedStartDelayMs
        : t
      this.lastTick = t
      this.charBudget = 0
    }

    this.hasStarted = true
    this.emit()
    this.ensureLoop()
  }

  finish = (finishOptions: { flush?: boolean } = {}): void => {
    if (this.destroyed)
      return

    this.done = true

    if (finishOptions.flush ?? this.flushOnFinish) {
      this.visible = this.source
      this.charBudget = 0
      this.currentCps = this.minCharsPerSecond
      this.cancelLoop()
      this.emit()
      return
    }

    this.emit()
    this.ensureLoop()
  }

  flush = (): void => {
    if (this.destroyed)
      return

    this.visible = this.source
    this.charBudget = 0
    this.currentCps = this.minCharsPerSecond
    this.cancelLoop()
    this.emit()
  }

  reset = (initialMarkdown = ''): void => {
    if (this.destroyed)
      return

    this.cancelLoop()

    this.source = initialMarkdown
    this.visible = initialMarkdown
    this.done = false
    this.paused = false
    this.hasStarted = false

    this.startedAt = 0
    this.lastTick = 0
    this.charBudget = 0
    this.currentCps = this.minCharsPerSecond

    this.emit()
  }

  pause = (): void => {
    if (this.destroyed)
      return

    if (this.paused)
      return

    this.paused = true
    this.cancelLoop()
    this.emit()
  }

  resume = (): void => {
    if (this.destroyed)
      return

    if (!this.paused)
      return

    this.paused = false
    const t = now()
    this.lastTick = t
    this.startedAt ||= t
    this.emit()
    this.ensureLoop()
  }

  destroy = (): void => {
    if (this.destroyed)
      return

    this.destroyed = true
    this.cancelLoop()
    this.listeners.clear()
  }

  dispose = (): void => {
    this.destroy()
  }

  private ensureLoop(): void {
    if (this.destroyed || this.rafId || this.paused || this.pendingChars <= 0)
      return

    if (typeof requestAnimationFrame !== 'function') {
      this.flush()
      return
    }

    this.rafId = requestAnimationFrame(this.tick)
  }

  private tick = (timestamp: number): void => {
    this.rafId = 0

    if (this.destroyed)
      return

    if (this.paused)
      return

    if (this.pendingChars <= 0) {
      this.startedAt = 0
      this.lastTick = 0
      this.charBudget = 0
      this.currentCps = this.minCharsPerSecond
      return
    }

    if (timestamp - this.startedAt < this.normalizedStartDelayMs) {
      this.rafId = requestAnimationFrame(this.tick)
      return
    }

    const minFrameMs = 1000 / Math.max(1, this.maxCommitFps)
    const dt = Math.min(100, Math.max(0, timestamp - this.lastTick))

    if (dt < minFrameMs) {
      this.rafId = requestAnimationFrame(this.tick)
      return
    }

    this.lastTick = timestamp
    const pending = this.pendingChars
    const latencyMs = pending > this.normalizedCatchUpThreshold ? this.normalizedCatchUpLatencyMs : this.normalizedTargetLatencyMs

    const targetCps = clamp(
      pending / Math.max(0.001, latencyMs / 1000),
      this.minCharsPerSecond,
      this.maxCharsPerSecond,
    )

    this.currentCps += (targetCps - this.currentCps) * 0.2
    this.charBudget += this.currentCps * (dt / 1000)

    if (this.charBudget < 1) {
      this.ensureLoop()
      return
    }

    const desiredCount = Math.min(Math.floor(this.charBudget), this.maxCharsPerCommit)
    const rest = this.source.slice(this.visible.length)
    const nextSlice = takeGraphemes(rest, desiredCount, this.segmenter)

    if (nextSlice.text) {
      this.visible += nextSlice.text
      this.charBudget = Math.max(0, this.charBudget - nextSlice.graphemeCount)
      this.emit()
    }

    this.ensureLoop()
  }

  private cancelLoop(): void {
    if (!this.rafId)
      return

    if (typeof cancelAnimationFrame === 'function')
      cancelAnimationFrame(this.rafId)

    this.rafId = 0
  }

  private emit(): void {
    if (this.destroyed)
      return

    for (const listener of this.listeners)
      listener()
  }
}

export function createSmoothMarkdownStream(
  options: SmoothMarkdownStreamOptions = {},
  notify?: SmoothStreamNotify,
): SmoothMarkdownStreamController {
  const controller = new SmoothMarkdownStreamControllerImpl(options, notify)
  return {
    getSnapshot: controller.getSnapshot,
    subscribe: controller.subscribe,
    enqueue: controller.enqueue,
    finish: controller.finish,
    flush: controller.flush,
    reset: controller.reset,
    pause: controller.pause,
    resume: controller.resume,
    destroy: controller.destroy,
    dispose: controller.dispose,
  }
}

function createGraphemeSegmenter(): GraphemeSegmenter | null {
  if (typeof Intl === 'undefined')
    return null

  const SegmenterCtor = (Intl as unknown as {
    Segmenter?: new (locale?: string, options?: { granularity?: 'grapheme' }) => GraphemeSegmenter
  }).Segmenter

  if (!SegmenterCtor)
    return null

  return new SegmenterCtor(undefined, { granularity: 'grapheme' })
}

function takeGraphemes(input: string, count: number, segmenter: GraphemeSegmenter | null): GraphemeSlice {
  if (!input || count <= 0)
    return { text: '', graphemeCount: 0 }

  if (!segmenter) {
    const parts = Array.from(input).slice(0, count)
    return {
      text: parts.join(''),
      graphemeCount: parts.length,
    }
  }

  let output = ''
  let used = 0

  for (const part of segmenter.segment(input)) {
    if (used >= count)
      break
    output += part.segment
    used++
  }

  return {
    text: output,
    graphemeCount: used,
  }
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
