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

interface AtomicRevealRange {
  start: number
  end: number
}

type FenceLineState = 'candidate' | 'normal' | 'opening' | 'closing'

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

/**
 * Default minimum pending chars before `burstInitialContent` reveals
 * everything fence-safely in one commit (~2 KB of source, well above typical
 * streaming chunk sizes).
 */
const BURST_REVEAL_THRESHOLD_CHARS = 2048

/**
 * Animation frames never run in hidden tabs, so the reveal loop falls back to
 * this timer cadence while the document is hidden. Browsers clamp background
 * timers (typically to 1s), but the stream keeps rendering instead of freezing
 * until the tab becomes visible again.
 */
const HIDDEN_TICK_MS = 200

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
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
  private readonly burstInitialContent: boolean
  private readonly burstRevealThresholdChars: number
  private readonly segmenter: GraphemeSegmenter | null
  private readonly listeners = new Set<SmoothStreamNotify>()

  private rafId = 0
  private timerId: ReturnType<typeof setTimeout> | null = null
  private visibilityListener: (() => void) | null = null
  private startedAt = 0
  private lastTick = 0
  private charBudget = 0
  private currentCps: number
  private hasStarted = false
  private destroyed = false

  // Fence scanning is append-only and each source code unit is visited once.
  // Opening fence lines are withheld until their line ending arrives, then the
  // marker, info string, and newline are committed as one atomic unit.
  private fenceScanOffset = 0
  private fenceLineStart = 0
  private fenceLineState: FenceLineState = 'candidate'
  private fenceIndent = 0
  private fenceMarker: '`' | '~' | '' = ''
  private fenceMarkerLength = 0
  private activeFenceMarker: '`' | '~' | '' = ''
  private activeFenceLength = 0
  private blockedRevealEnd = 0
  private readonly atomicRevealRanges: AtomicRevealRange[] = []
  private atomicRevealRangeIndex = 0

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
      burstInitialContent = false,
      burstRevealThresholdChars = BURST_REVEAL_THRESHOLD_CHARS,
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
    this.burstInitialContent = burstInitialContent === true
    this.burstRevealThresholdChars = Math.max(
      1,
      Math.trunc(toPositiveFiniteNumber(burstRevealThresholdChars, BURST_REVEAL_THRESHOLD_CHARS, 1)),
    )
    this.segmenter = createGraphemeSegmenter()
    if (notify)
      this.listeners.add(notify)
    this.currentCps = this.minCharsPerSecond
  }

  private attachVisibilityListener(): void {
    if (this.visibilityListener || typeof document === 'undefined' || typeof document.addEventListener !== 'function')
      return
    this.visibilityListener = this.handleVisibilityChange
    document.addEventListener('visibilitychange', this.visibilityListener)
  }

  private detachVisibilityListener(): void {
    if (!this.visibilityListener || typeof document === 'undefined' || typeof document.removeEventListener !== 'function')
      return
    document.removeEventListener('visibilitychange', this.visibilityListener)
    this.visibilityListener = null
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
    const wasRevealBlocked = this.isRevealBlocked()
    this.source += chunk
    this.scanAppendedSource()

    if (wasIdle || (wasRevealBlocked && !this.isRevealBlocked())) {
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
    this.releaseTrailingFenceCandidate()

    if (finishOptions.flush ?? this.flushOnFinish) {
      this.visible = this.source
      this.discardConsumedAtomicRanges()
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

    this.releaseTrailingFenceCandidate()
    this.visible = this.source
    this.discardConsumedAtomicRanges()
    this.charBudget = 0
    this.currentCps = this.minCharsPerSecond
    this.cancelLoop()
    this.emit()
  }

  reset = (initialMarkdown = '', options?: { prefixKnown?: boolean }): void => {
    if (this.destroyed)
      return

    this.cancelLoop()

    if (options?.prefixKnown) {
      // The caller (e.g. useSmoothStreamingBridge) has already verified that
      // initialMarkdown extends this.source, so skip the redundant O(n)
      // startsWith re-check the append branch would otherwise perform. Streaming
      // appends hit this path on every chunk, so this avoids a second full
      // string comparison of the whole accumulated source per commit.
      this.source = initialMarkdown
      this.scanAppendedSource()
    }
    else if (initialMarkdown.startsWith(this.source)) {
      this.source = initialMarkdown
      this.scanAppendedSource()
    }
    else {
      this.resetFenceScanner()
      this.source = initialMarkdown
      this.scanAppendedSource()
    }
    const revealableEnd = this.getRevealableEnd()
    this.visible = revealableEnd >= this.source.length ? this.source : this.source.slice(0, revealableEnd)
    this.discardConsumedAtomicRanges()
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
    this.detachVisibilityListener()
    this.listeners.clear()
  }

  dispose = (): void => {
    this.destroy()
  }

  private resetFenceScanner(): void {
    this.fenceScanOffset = 0
    this.fenceLineStart = 0
    this.fenceLineState = 'candidate'
    this.fenceIndent = 0
    this.fenceMarker = ''
    this.fenceMarkerLength = 0
    this.activeFenceMarker = ''
    this.activeFenceLength = 0
    this.blockedRevealEnd = 0
    this.atomicRevealRanges.length = 0
    this.atomicRevealRangeIndex = 0
  }

  private scanAppendedSource(terminal = false): void {
    while (this.fenceScanOffset < this.source.length) {
      const character = this.source[this.fenceScanOffset]

      if (character === '\r') {
        if (this.fenceScanOffset + 1 >= this.source.length && !terminal)
          break

        if (this.source[this.fenceScanOffset + 1] === '\n') {
          const lineEnd = this.fenceScanOffset + 2
          this.completeFenceLine(lineEnd)
          this.fenceScanOffset = lineEnd
          continue
        }
      }

      if (character === '\n') {
        const lineEnd = this.fenceScanOffset + 1
        this.completeFenceLine(lineEnd)
        this.fenceScanOffset = lineEnd
        continue
      }

      this.consumeFenceCharacter(character)
      this.fenceScanOffset++
    }

    this.updateFenceRevealBlock()
  }

  private consumeFenceCharacter(character: string): void {
    if (this.fenceLineState === 'normal')
      return

    if (this.fenceLineState === 'opening') {
      // CommonMark forbids backticks in the info string of a backtick fence.
      // Tilde fence info strings do not have this restriction.
      if (this.fenceMarker === '`' && character === '`')
        this.fenceLineState = 'normal'
      return
    }

    if (this.fenceLineState === 'closing') {
      if (character !== ' ' && character !== '\t')
        this.fenceLineState = 'normal'
      return
    }

    if (!this.fenceMarker) {
      if (character === ' ' && this.fenceIndent < 3) {
        this.fenceIndent++
        return
      }

      if (character === '`' || character === '~') {
        this.fenceMarker = character
        this.fenceMarkerLength = 1
        return
      }

      this.fenceLineState = 'normal'
      return
    }

    if (character === this.fenceMarker) {
      this.fenceMarkerLength++
      return
    }

    if (this.activeFenceMarker) {
      const isClosingMarker = this.fenceMarker === this.activeFenceMarker
        && this.fenceMarkerLength >= this.activeFenceLength
      this.fenceLineState = isClosingMarker && (character === ' ' || character === '\t')
        ? 'closing'
        : 'normal'
      return
    }

    this.fenceLineState = this.fenceMarkerLength >= 3 ? 'opening' : 'normal'
  }

  private completeFenceLine(lineEnd: number): void {
    const markerOnlyLine = this.fenceLineState === 'candidate' && this.fenceMarkerLength >= 3

    if (!this.activeFenceMarker && (this.fenceLineState === 'opening' || markerOnlyLine)) {
      this.atomicRevealRanges.push({
        start: this.fenceLineStart,
        end: lineEnd,
      })
      this.activeFenceMarker = this.fenceMarker
      this.activeFenceLength = this.fenceMarkerLength
    }
    else if (this.activeFenceMarker) {
      const closesActiveFence = this.fenceMarker === this.activeFenceMarker
        && this.fenceMarkerLength >= this.activeFenceLength
        && (this.fenceLineState === 'closing' || markerOnlyLine)
      if (closesActiveFence) {
        this.activeFenceMarker = ''
        this.activeFenceLength = 0
      }
    }

    this.fenceLineStart = lineEnd
    this.fenceLineState = 'candidate'
    this.fenceIndent = 0
    this.fenceMarker = ''
    this.fenceMarkerLength = 0
    this.blockedRevealEnd = 0
  }

  private updateFenceRevealBlock(): void {
    const isOpeningCandidate = !this.activeFenceMarker
      && (this.fenceLineState === 'opening'
        || (this.fenceLineState === 'candidate' && (this.fenceIndent > 0 || this.fenceMarkerLength > 0)))

    // Encode the blocked line start as start + 1 so zero remains the fast-path
    // sentinel for "not blocked", including a fence at source offset zero.
    this.blockedRevealEnd = isOpeningCandidate ? this.fenceLineStart + 1 : 0
  }

  private releaseTrailingFenceCandidate(): void {
    this.scanAppendedSource(true)
    if (!this.blockedRevealEnd)
      return

    const isUnterminatedOpeningFence = this.fenceLineState === 'opening'
      || (this.fenceLineState === 'candidate' && this.fenceMarkerLength >= 3)
    if (isUnterminatedOpeningFence && this.source.length > this.fenceLineStart) {
      this.atomicRevealRanges.push({
        start: this.fenceLineStart,
        end: this.source.length,
      })
    }

    // finish()/flush() are terminal fallbacks. A trailing candidate may not be
    // parser-complete, but it must be released so final can become true.
    this.fenceLineState = 'normal'
    this.blockedRevealEnd = 0
  }

  private isRevealBlocked(): boolean {
    return this.blockedRevealEnd !== 0
  }

  private getRevealableEnd(): number {
    return this.blockedRevealEnd
      ? Math.min(this.source.length, this.blockedRevealEnd - 1)
      : this.source.length
  }

  private hasRevealableChars(): boolean {
    return this.visible.length < this.getRevealableEnd()
  }

  private takeNextRevealSlice(desiredCount: number): GraphemeSlice {
    this.discardConsumedAtomicRanges()
    const revealableEnd = this.getRevealableEnd()
    if (this.visible.length >= revealableEnd)
      return { text: '', graphemeCount: 0 }

    const atomicRange = this.atomicRevealRanges[this.atomicRevealRangeIndex]
    if (atomicRange && this.visible.length >= atomicRange.start && this.visible.length < atomicRange.end) {
      return takeGraphemes(
        this.source,
        this.visible.length,
        atomicRange.end - this.visible.length,
        this.segmenter,
        Math.min(atomicRange.end, revealableEnd),
      )
    }

    const sliceEnd = atomicRange && atomicRange.start > this.visible.length
      ? Math.min(atomicRange.start, revealableEnd)
      : revealableEnd
    return takeGraphemes(this.source, this.visible.length, desiredCount, this.segmenter, sliceEnd)
  }

  private discardConsumedAtomicRanges(): void {
    while (
      this.atomicRevealRangeIndex < this.atomicRevealRanges.length
      && this.atomicRevealRanges[this.atomicRevealRangeIndex].end <= this.visible.length
    ) {
      this.atomicRevealRangeIndex++
    }

    if (
      this.atomicRevealRangeIndex >= 64
      && this.atomicRevealRangeIndex * 2 >= this.atomicRevealRanges.length
    ) {
      this.atomicRevealRanges.splice(0, this.atomicRevealRangeIndex)
      this.atomicRevealRangeIndex = 0
    }
  }

  private isDocumentHidden(): boolean {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden'
  }

  private ensureLoop(): void {
    if (this.destroyed || this.rafId || this.timerId != null || this.paused || !this.hasRevealableChars())
      return

    if (typeof requestAnimationFrame !== 'function') {
      this.flush()
      return
    }

    // The listener only lives while a loop is pending, so a controller that is
    // paused without being destroyed (the React/Octane hooks release theirs
    // with `pause()` and rely on collection) is not pinned by a document-level
    // listener.
    this.attachVisibilityListener()

    // Hidden tabs never run animation frames: keep revealing on a timer so a
    // stream that continues in the background keeps rendering instead of
    // freezing at the last visible position until the tab is shown again.
    if (this.isDocumentHidden() && typeof setTimeout === 'function') {
      this.timerId = setTimeout(() => {
        this.timerId = null
        this.tick(now())
      }, HIDDEN_TICK_MS)
      return
    }

    this.rafId = requestAnimationFrame(this.tick)
  }

  private tick = (timestamp: number): void => {
    this.rafId = 0
    this.timerId = null

    if (this.destroyed)
      return

    if (this.paused)
      return

    if (!this.hasRevealableChars()) {
      this.startedAt = 0
      this.lastTick = 0
      this.charBudget = 0
      this.currentCps = this.minCharsPerSecond
      return
    }

    if (timestamp - this.startedAt < this.normalizedStartDelayMs) {
      this.ensureLoop()
      return
    }

    // One-shot large content (initial document, fully buffered response) does
    // not benefit from per-character pacing: reveal up to the fence-safe
    // boundary in a single commit. Unclosed fences are still withheld, so
    // streaming correctness is preserved; the next chunk that closes the
    // fence re-enters this branch via the pending threshold.
    const burstPending = this.pendingChars
    if (this.burstInitialContent && burstPending >= this.burstRevealThresholdChars) {
      const revealableEnd = this.getRevealableEnd()
      if (this.visible.length < revealableEnd) {
        // Reference the source string directly when the full content is
        // revealable, avoiding an O(n) copy of the whole document per commit.
        this.visible = revealableEnd >= this.source.length ? this.source : this.source.slice(0, revealableEnd)
        this.charBudget = 0
        this.currentCps = this.minCharsPerSecond
        this.emit()
      }
      this.ensureLoop()
      return
    }

    const minFrameMs = 1000 / Math.max(1, this.maxCommitFps)
    const dt = Math.min(100, Math.max(0, timestamp - this.lastTick))

    if (dt < minFrameMs) {
      this.ensureLoop()
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
    const nextSlice = this.takeNextRevealSlice(desiredCount)

    if (nextSlice.text) {
      this.visible += nextSlice.text
      this.charBudget = Math.max(0, this.charBudget - nextSlice.graphemeCount)
      this.emit()
    }

    this.ensureLoop()
  }

  private cancelLoop(): void {
    if (this.rafId) {
      if (typeof cancelAnimationFrame === 'function')
        cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }

    if (this.timerId != null) {
      clearTimeout(this.timerId)
      this.timerId = null
    }

    this.detachVisibilityListener()
  }

  private handleVisibilityChange = (): void => {
    if (this.destroyed)
      return

    if (this.isDocumentHidden()) {
      // A pending animation frame will never fire while hidden; move the
      // reveal loop onto the timer path.
      this.cancelLoop()
      this.ensureLoop()
      return
    }

    // Visible again: swap a pending timer for an animation frame so the
    // reveal resumes at full cadence, and restart the loop if it had
    // nothing scheduled.
    if (this.timerId != null || !this.rafId) {
      this.cancelLoop()
      this.ensureLoop()
    }
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

function takeGraphemes(
  input: string,
  start: number,
  count: number,
  segmenter: GraphemeSegmenter | null,
  endLimit = input.length,
): GraphemeSlice {
  const normalizedEnd = Math.min(input.length, Math.max(start, endLimit))
  if (start >= normalizedEnd || count <= 0)
    return { text: '', graphemeCount: 0 }

  if (!segmenter) {
    let end = start
    let used = 0
    while (end < normalizedEnd && used < count) {
      const code = input.charCodeAt(end)
      const next = input.charCodeAt(end + 1)
      const codeUnitLength = code >= 0xD800 && code <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF ? 2 : 1
      end = Math.min(normalizedEnd, end + codeUnitLength)
      used++
    }
    return {
      text: input.slice(start, end),
      graphemeCount: used,
    }
  }

  // Fast path: advance by code point through the window and commit the slice
  // directly when every code point is a guaranteed single grapheme (ASCII or a
  // whitelisted CJK/JP/KR code point) AND the code point right after the slice
  // cannot attach to its last char. Otherwise Intl.Segmenter (plus its
  // per-commit window slicing + ICU iteration) is used. The scan is bounded by
  // `count` code points, so mixed content pays only a cheap code-point scan
  // over the simple head before falling through to the segmenter.
  let sliceEnd = start
  let used = 0
  let fastPathSafe = true
  while (used < count && sliceEnd < normalizedEnd) {
    const codePoint = input.codePointAt(sliceEnd)!
    const codePointLength = codePoint > 0xFFFF ? 2 : 1
    if (
      sliceEnd + codePointLength > normalizedEnd
      || !isGraphemeFastPathCodePoint(codePoint)
    ) {
      fastPathSafe = false
      break
    }
    sliceEnd += codePointLength
    used++
  }

  if (fastPathSafe && sliceEnd > start) {
    // CRLF (U+000D U+000A) is a single grapheme per UAX #29; taking exactly
    // `count` code points here would split the pair and leak a lone `\r` to
    // consumers. Fall through to the segmenter when the boundary lands between
    // the two code units.
    const splitsCrLf = sliceEnd < normalizedEnd
      && input.charCodeAt(sliceEnd - 1) === 0x0D
      && input.charCodeAt(sliceEnd) === 0x0A
    if (!splitsCrLf) {
      const boundaryCodePoint = input.codePointAt(sliceEnd)
      const boundaryCodePointLength = boundaryCodePoint != null && boundaryCodePoint > 0xFFFF ? 2 : 1
      const hasSimpleBoundary = boundaryCodePoint != null
        && sliceEnd + boundaryCodePointLength <= normalizedEnd
        && isGraphemeFastPathCodePoint(boundaryCodePoint)
      if (sliceEnd >= normalizedEnd || hasSimpleBoundary) {
        return {
          text: input.slice(start, sliceEnd),
          graphemeCount: used,
        }
      }
    }
  }

  const pendingLength = normalizedEnd - start
  let windowLength = Math.min(pendingLength, Math.max(64, count * 2))

  while (true) {
    const reachesEnd = windowLength >= pendingLength
    const window = input.slice(start, start + windowLength)
    let outputLength = 0
    let used = 0

    for (const part of segmenter.segment(window)) {
      if (used >= count) {
        return {
          text: input.slice(start, start + outputLength),
          graphemeCount: used,
        }
      }
      outputLength += part.segment.length
      used++
    }

    if (reachesEnd) {
      return {
        text: input.slice(start, start + outputLength),
        graphemeCount: used,
      }
    }

    windowLength = Math.min(pendingLength, windowLength * 2)
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

// Code points that are safe to reveal as one grapheme in the mainstream
// CJK/Japanese/Korean scripts. Windows made only of these
// (plus ASCII) can be sliced by code point without Intl.Segmenter. Everything
// outside this whitelist — combining marks, emoji sequences, Indic/SE-Asian
// scripts — falls through to the segmenter, so this fast path is a strict
// superset of the old pure-ASCII check: it can only skip work, never change
// the split.
function isGraphemeSimpleCodePoint(codePoint: number) {
  return (codePoint >= 0x2E80 && codePoint <= 0x3029) // CJK radicals .. Hangzhou numerals
    || (codePoint >= 0x3030 && codePoint <= 0x303F) // CJK symbols/punctuation
    || (codePoint >= 0x3040 && codePoint <= 0x3098) // hiragana
    || (codePoint >= 0x309B && codePoint <= 0x30FF) // kana spacing marks / katakana
    || (codePoint >= 0x3100 && codePoint <= 0x31FF) // bopomofo / compatibility jamo / CJK strokes / katakana ext
    || (codePoint >= 0x3200 && codePoint <= 0x33FF) // enclosed CJK / CJK compatibility
    || (codePoint >= 0x3400 && codePoint <= 0x4DBF) // CJK ext A
    || (codePoint >= 0x4E00 && codePoint <= 0x9FFF) // CJK unified
    || (codePoint >= 0xAC00 && codePoint <= 0xD7A3) // Hangul syllables (LV/LVT are single graphemes)
    || (codePoint >= 0xF900 && codePoint <= 0xFAFF) // CJK compat ideographs
    || (codePoint >= 0xFE30 && codePoint <= 0xFE4F) // CJK compat forms
    || (codePoint >= 0xFF00 && codePoint <= 0xFF9D) // fullwidth forms / halfwidth kana
    || (codePoint >= 0xFFA0 && codePoint <= 0xFFEF) // halfwidth hangul / symbols
    || (codePoint >= 0x1F200 && codePoint <= 0x1F2FF) // enclosed ideographic supplement
    || (codePoint >= 0x20000 && codePoint <= 0x2FFFF) // CJK ext B+ (astral, single grapheme)
}

function isGraphemeFastPathCodePoint(codePoint: number) {
  return codePoint <= 0x7F || isGraphemeSimpleCodePoint(codePoint)
}
