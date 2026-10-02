import type { SmoothMarkdownStreamOptions } from '../src/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSmoothMarkdownStream } from '../src/smooth-stream-controller'

function hasUnpairedSurrogate(input: string) {
  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index)
    const isHigh = code >= 0xD800 && code <= 0xDBFF
    const isLow = code >= 0xDC00 && code <= 0xDFFF
    if (isHigh) {
      const next = input.charCodeAt(index + 1)
      if (!(next >= 0xDC00 && next <= 0xDFFF))
        return true
      index += 1
      continue
    }
    if (isLow)
      return true
  }
  return false
}

function createController(options: SmoothMarkdownStreamOptions = {}) {
  return createSmoothMarkdownStream(options)
}

function createRafHarness() {
  let nextId = 1
  const callbacks = new Map<number, FrameRequestCallback>()

  vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
    const id = nextId++
    callbacks.set(id, callback)
    return id
  }) as typeof requestAnimationFrame)
  vi.stubGlobal('cancelAnimationFrame', ((id: number) => {
    callbacks.delete(id)
  }) as typeof cancelAnimationFrame)

  return {
    get pendingFrames() {
      return callbacks.size
    },
    step(timestamp: number) {
      const pending = [...callbacks.values()]
      callbacks.clear()
      for (const callback of pending)
        callback(timestamp)
    },
  }
}

const FAST_ATOMIC_TEST_OPTIONS: SmoothMarkdownStreamOptions = {
  minCharsPerSecond: 1000,
  maxCharsPerSecond: 1000,
  maxCharsPerCommit: 1,
  maxCommitFps: 60,
  startDelayMs: 0,
}

describe('smoothMarkdownStreamController', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('does not reveal a large chunk all at once', async () => {
    vi.useFakeTimers()
    const controller = createController()

    controller.enqueue('a'.repeat(1800))

    expect(controller.getSnapshot().visible.length).toBeLessThan(controller.getSnapshot().source.length)

    await vi.advanceTimersByTimeAsync(400)

    expect(controller.getSnapshot().visible.length).toBeLessThan(controller.getSnapshot().source.length)
    controller.destroy()
  })

  it('accelerates output when backlog is larger', async () => {
    vi.useFakeTimers()
    const fastController = createController({
      minCharsPerSecond: 30,
      maxCharsPerSecond: 2000,
      targetLatencyMs: 900,
      catchUpLatencyMs: 260,
      catchUpThreshold: 500,
      maxCharsPerCommit: 120,
    })
    const slowController = createController({
      minCharsPerSecond: 30,
      maxCharsPerSecond: 2000,
      targetLatencyMs: 900,
      catchUpLatencyMs: 260,
      catchUpThreshold: 500,
      maxCharsPerCommit: 120,
    })

    fastController.enqueue('x'.repeat(2400))
    slowController.enqueue('x'.repeat(320))

    await vi.advanceTimersByTimeAsync(700)

    expect(fastController.getSnapshot().visible.length).toBeGreaterThan(slowController.getSnapshot().visible.length)
    fastController.destroy()
    slowController.destroy()
  })

  it('sets final only after visible catches up', async () => {
    vi.useFakeTimers()
    const controller = createController()

    controller.enqueue('x'.repeat(1400))
    controller.finish()

    expect(controller.getSnapshot().done).toBe(true)
    expect(controller.getSnapshot().final).toBe(false)

    controller.flush()

    expect(controller.getSnapshot().final).toBe(true)
    controller.destroy()
  })

  it('keeps surrogate pairs intact while streaming emoji text', async () => {
    vi.useFakeTimers()
    const controller = createController({ maxCharsPerCommit: 1, maxCommitFps: 60, startDelayMs: 0 })
    const emojiText = '👨‍👩‍👧‍👦 hello 👋🌍'

    controller.enqueue(emojiText)
    await vi.advanceTimersByTimeAsync(600)

    expect(hasUnpairedSurrogate(controller.getSnapshot().visible)).toBe(false)
    controller.destroy()
  })

  it('keeps CJK text and fullwidth punctuation intact while streaming', async () => {
    vi.useFakeTimers()
    const controller = createController({ maxCharsPerCommit: 1, maxCommitFps: 60, startDelayMs: 0 })
    const cjkText = '这是一个中文测试段落，包含中文标点「引号」和 English 混排。还有𠀀𠀁扩展汉字。'

    controller.enqueue(cjkText)
    await vi.advanceTimersByTimeAsync(4000)

    expect(controller.getSnapshot().visible).toBe(cjkText)
    expect(hasUnpairedSurrogate(controller.getSnapshot().visible)).toBe(false)
    controller.destroy()
  })

  it('does not split decomposed kana graphemes on the CJK fast path', () => {
    const raf = createRafHarness()
    const controller = createController(FAST_ATOMIC_TEST_OPTIONS)

    controller.enqueue('\u304B\u3099x')
    raf.step(performance.now() + 40)

    expect(controller.getSnapshot().visible).toBe('\u304B\u3099')
    controller.destroy()
  })

  it.each([
    ['CJK tone mark', '\u4E2D\u302A'],
    ['halfwidth voiced mark', '\uFF76\uFF9E'],
  ])('counts a %s cluster as one reveal unit', (_name, cluster) => {
    const raf = createRafHarness()
    const controller = createController({
      ...FAST_ATOMIC_TEST_OPTIONS,
      maxCharsPerCommit: 2,
    })

    controller.enqueue(`${cluster}x`)
    raf.step(performance.now() + 40)

    expect(controller.getSnapshot().visible).toBe(`${cluster}x`)
    controller.destroy()
  })

  it('counts astral CJK characters as one reveal unit', () => {
    const raf = createRafHarness()
    const controller = createController({
      ...FAST_ATOMIC_TEST_OPTIONS,
      maxCharsPerCommit: 2,
    })

    controller.enqueue('\uD840\uDC00\u4E2Dx')
    raf.step(performance.now() + 40)

    expect(controller.getSnapshot().visible).toBe('\uD840\uDC00\u4E2D')
    controller.destroy()
  })

  it('keeps a grapheme intact when it spans appended chunks', async () => {
    vi.useFakeTimers()
    const controller = createController({
      minCharsPerSecond: 1000,
      maxCharsPerSecond: 1000,
      maxCharsPerCommit: 1,
      maxCommitFps: 60,
      startDelayMs: 0,
    })

    controller.enqueue('👨‍')
    controller.enqueue('👩‍👧‍')
    controller.enqueue('👦!')
    await vi.advanceTimersByTimeAsync(40)

    expect(controller.getSnapshot().visible).toBe('👨‍👩‍👧‍👦')
    controller.destroy()
  })

  it('does not split a grapheme that is longer than the segmentation window', async () => {
    vi.useFakeTimers()
    const controller = createController({
      minCharsPerSecond: 1000,
      maxCharsPerSecond: 1000,
      maxCharsPerCommit: 1,
      maxCommitFps: 60,
      startDelayMs: 0,
    })
    const grapheme = `e${'\u0301'.repeat(300)}`

    controller.enqueue(`${grapheme}!`)
    await vi.advanceTimersByTimeAsync(40)

    expect(controller.getSnapshot().visible).toBe(grapheme)
    controller.destroy()
  })

  it('does not split a CRLF pair while streaming', async () => {
    vi.useFakeTimers()
    const controller = createController({
      minCharsPerSecond: 1000,
      maxCharsPerSecond: 1000,
      maxCharsPerCommit: 1,
      maxCommitFps: 60,
      startDelayMs: 0,
    })

    controller.enqueue('a\r\nb')
    const seen = new Set<string>()
    // One commit per frame (~16.7ms); collect every intermediate reveal state.
    for (let frame = 0; frame < 20; frame++) {
      await vi.advanceTimersByTimeAsync(20)
      seen.add(controller.getSnapshot().visible)
    }

    // CRLF (U+000D U+000A) is a single grapheme: the lone `\r` must never leak.
    expect(seen.has('a\r')).toBe(false)
    expect(controller.getSnapshot().visible).toBe('a\r\nb')
    controller.destroy()
  })

  it('segments a bounded prefix instead of the entire pending source', async () => {
    vi.useFakeTimers()
    const segmentInputLengths: number[] = []
    class InstrumentedSegmenter {
      segment(input: string) {
        segmentInputLengths.push(input.length)
        return {
          * [Symbol.iterator]() {
            for (let index = 0; index < input.length; index++)
              yield { index, segment: input[index] }
          },
        }
      }
    }
    vi.stubGlobal('Intl', { Segmenter: InstrumentedSegmenter })
    const controller = createController({
      minCharsPerSecond: 100_000,
      maxCharsPerSecond: 100_000,
      maxCharsPerCommit: 80,
      maxCommitFps: 60,
      startDelayMs: 0,
    })

    controller.enqueue('a'.repeat(200_000))
    await vi.advanceTimersByTimeAsync(40)

    expect(controller.getSnapshot().visible).toHaveLength(80)
    expect(Math.max(...segmentInputLengths)).toBeLessThanOrEqual(1024)
    controller.destroy()
  })

  it('keeps code points intact without Intl.Segmenter', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('Intl', {})
    const controller = createController({
      minCharsPerSecond: 1000,
      maxCharsPerSecond: 1000,
      maxCharsPerCommit: 1,
      maxCommitFps: 60,
      startDelayMs: 0,
    })

    controller.enqueue('👋!')
    await vi.advanceTimersByTimeAsync(40)

    expect(controller.getSnapshot().visible).toBe('👋')
    expect(hasUnpairedSurrogate(controller.getSnapshot().visible)).toBe(false)
    controller.destroy()
  })

  it('reset clears state and keeps pending at zero', async () => {
    vi.useFakeTimers()
    const controller = createController()

    controller.enqueue('x'.repeat(1000))
    await vi.advanceTimersByTimeAsync(120)
    controller.reset()
    await vi.advanceTimersByTimeAsync(200)

    expect(controller.getSnapshot().source).toBe('')
    expect(controller.getSnapshot().visible).toBe('')
    expect(controller.getSnapshot().pendingChars).toBe(0)
    controller.destroy()
  })

  it('reset with prefixKnown extends the source without re-checking the prefix', () => {
    const controller = createController()

    controller.enqueue('hello')
    // prefixKnown is only valid when the new content extends the source; the
    // caller (e.g. useSmoothStreamingBridge) performs the full check.
    controller.reset('hello world', { prefixKnown: true })

    expect(controller.getSnapshot().source).toBe('hello world')
    controller.destroy()
  })

  it('reset with prefixKnown matches the append branch of a plain reset', () => {
    const withCheck = createController()
    const known = createController()

    withCheck.enqueue('abc')
    known.enqueue('abc')

    withCheck.reset('abcdef')
    known.reset('abcdef', { prefixKnown: true })

    expect(known.getSnapshot().source).toBe(withCheck.getSnapshot().source)
    expect(known.getSnapshot().visible).toBe(withCheck.getSnapshot().visible)
    expect(known.getSnapshot().pendingChars).toBe(withCheck.getSnapshot().pendingChars)
    withCheck.destroy()
    known.destroy()
  })

  it('reopens the stream when enqueue is called after finish', () => {
    const controller = createController()

    controller.enqueue('hello')
    controller.finish({ flush: true })
    expect(controller.getSnapshot().final).toBe(true)

    controller.enqueue(' world')
    expect(controller.getSnapshot().done).toBe(false)
    expect(controller.getSnapshot().final).toBe(false)
    controller.destroy()
  })

  it('normalizes extreme option values', () => {
    const controller = createController({
      maxCharsPerCommit: 0,
      maxCommitFps: 0,
      minCharsPerSecond: 0,
      maxCharsPerSecond: -10,
    })

    // Should not throw and should still function
    controller.enqueue('test')
    controller.flush()
    expect(controller.getSnapshot().visible).toBe('test')
    controller.destroy()
  })

  it('normalizes NaN and infinite numeric options', () => {
    const controller = createController({
      minCharsPerSecond: Number.NaN,
      maxCharsPerSecond: Number.POSITIVE_INFINITY,
      targetLatencyMs: Number.NaN,
      catchUpLatencyMs: Number.NaN,
      catchUpThreshold: Number.NaN,
      startDelayMs: Number.NaN,
      maxCommitFps: Number.NaN,
      maxCharsPerCommit: Number.NaN,
    })

    controller.enqueue('hello')
    controller.flush()

    expect(controller.getSnapshot().visible).toBe('hello')
    controller.destroy()
  })

  it('respects low chars-per-second values instead of emitting once per frame', async () => {
    vi.useFakeTimers()
    const controller = createController({
      minCharsPerSecond: 1,
      maxCharsPerSecond: 1,
      maxCommitFps: 60,
      startDelayMs: 0,
    })

    controller.enqueue('abcdefghij')

    // After 100ms at 1 char/s, at most 1 character should be visible.
    await vi.advanceTimersByTimeAsync(100)

    expect(controller.getSnapshot().visible.length).toBeLessThanOrEqual(1)

    controller.destroy()
  })

  it('calls notify callback on state changes', () => {
    const events: number[] = []
    const controller = createSmoothMarkdownStream({}, () => {
      events.push(1)
    })

    controller.enqueue('hello')
    expect(events.length).toBeGreaterThan(0)

    controller.flush()
    expect(events.length).toBeGreaterThan(1)

    controller.finish()
    expect(events.length).toBeGreaterThan(2)

    controller.destroy()
  })

  it('exposes subscribe and getSnapshot API', () => {
    const controller = createSmoothMarkdownStream()
    const snapshots = new Array<string>()
    const unsubscribe = controller.subscribe(() => {
      snapshots.push(controller.getSnapshot().visible)
    })

    controller.enqueue('hello')
    controller.flush()
    const snapshot = controller.getSnapshot()

    expect(snapshot.source).toBe('hello')
    expect(snapshot.visible).toBe('hello')
    expect(snapshot.final).toBe(false)
    expect(snapshots.length).toBeGreaterThan(0)

    unsubscribe()
    controller.destroy()
  })

  it('pause and resume work correctly', async () => {
    vi.useFakeTimers()
    const controller = createController({ startDelayMs: 0 })

    controller.enqueue('x'.repeat(500))
    await vi.advanceTimersByTimeAsync(100)
    const beforePause = controller.getSnapshot().visible.length

    controller.pause()
    await vi.advanceTimersByTimeAsync(500)
    expect(controller.getSnapshot().visible.length).toBe(beforePause)

    controller.resume()
    await vi.advanceTimersByTimeAsync(500)
    expect(controller.getSnapshot().visible.length).toBeGreaterThan(beforePause)

    controller.destroy()
  })

  it('destroy cancels the RAF loop', async () => {
    vi.useFakeTimers()
    const controller = createController()

    controller.enqueue('x'.repeat(2000))
    await vi.advanceTimersByTimeAsync(50)
    const beforeDestroy = controller.getSnapshot().visible.length

    controller.destroy()
    await vi.advanceTimersByTimeAsync(500)
    expect(controller.getSnapshot().visible.length).toBe(beforeDestroy)
  })

  it('does not mutate state after destroy', () => {
    const controller = createController()
    controller.destroy()

    controller.enqueue('hello')
    controller.finish()
    controller.flush()
    controller.reset('ignored')
    controller.pause()
    controller.resume()

    expect(controller.getSnapshot()).toEqual({
      source: '',
      visible: '',
      done: false,
      paused: false,
      pendingChars: 0,
      caughtUp: true,
      final: false,
    })
  })

  describe('atomic opening fence lines', () => {
    it('reveals the marker, info string, and newline in one commit', () => {
      const raf = createRafHarness()
      const controller = createController(FAST_ATOMIC_TEST_OPTIONS)
      const visibleSnapshots: string[] = []
      controller.subscribe(() => visibleSnapshots.push(controller.getSnapshot().visible))

      controller.enqueue('```typescript\nbody')
      expect(controller.getSnapshot().visible).toBe('')

      raf.step(performance.now() + 40)

      expect(controller.getSnapshot().visible).toBe('```typescript\n')
      expect(visibleSnapshots).not.toContain('```')
      expect(visibleSnapshots).not.toContain('```type')
      controller.destroy()
    })

    it('keeps an info line blocked across chunks without an idle RAF loop', () => {
      const raf = createRafHarness()
      const controller = createController(FAST_ATOMIC_TEST_OPTIONS)

      controller.enqueue('```')
      expect(controller.getSnapshot().visible).toBe('')
      expect(raf.pendingFrames).toBe(0)

      controller.enqueue('typescript')
      expect(controller.getSnapshot().visible).toBe('')
      expect(raf.pendingFrames).toBe(0)

      controller.enqueue('\nbody')
      expect(raf.pendingFrames).toBe(1)
      raf.step(performance.now() + 40)
      expect(controller.getSnapshot().visible).toBe('```typescript\n')
      controller.destroy()
    })

    it.each([
      ['backticks', '```ts\n'],
      ['long backticks', '`````ts\n'],
      ['tildes', '~~~ts\n'],
      ['long tildes', '~~~~~ts\n'],
      ['marker only', '```\n'],
    ])('supports %s opening fences', (_label, openingLine) => {
      const raf = createRafHarness()
      const controller = createController(FAST_ATOMIC_TEST_OPTIONS)

      controller.enqueue(`${openingLine}x`)
      raf.step(performance.now() + 40)

      expect(controller.getSnapshot().visible).toBe(openingLine)
      controller.destroy()
    })

    it.each([0, 1, 2, 3])('supports a %i-space opening indent', (indent) => {
      const raf = createRafHarness()
      const controller = createController(FAST_ATOMIC_TEST_OPTIONS)
      const openingLine = `${' '.repeat(indent)}\`\`\`ts\n`

      controller.enqueue(`${openingLine}x`)
      raf.step(performance.now() + 40)

      expect(controller.getSnapshot().visible).toBe(openingLine)
      controller.destroy()
    })

    it('does not block mid-line backticks', () => {
      const raf = createRafHarness()
      const controller = createController(FAST_ATOMIC_TEST_OPTIONS)

      controller.enqueue('hello ```typescript')
      expect(raf.pendingFrames).toBe(1)
      raf.step(performance.now() + 40)

      expect(controller.getSnapshot().visible).toBe('h')
      controller.destroy()
    })

    it('does not treat a four-space-indented marker as a fence', () => {
      const raf = createRafHarness()
      const controller = createController(FAST_ATOMIC_TEST_OPTIONS)

      controller.enqueue('    ```typescript')
      expect(raf.pendingFrames).toBe(1)
      raf.step(performance.now() + 40)

      expect(controller.getSnapshot().visible).toBe(' ')
      controller.destroy()
    })

    it('holds a possible indent until the rest of the opening line arrives', () => {
      const raf = createRafHarness()
      const controller = createController(FAST_ATOMIC_TEST_OPTIONS)

      controller.enqueue('  ')
      expect(controller.getSnapshot().visible).toBe('')
      expect(raf.pendingFrames).toBe(0)

      controller.enqueue('```ts\nbody')
      raf.step(performance.now() + 40)
      expect(controller.getSnapshot().visible).toBe('  ```ts\n')
      controller.destroy()
    })

    it('keeps an invalid backtick info string on the smooth body path', () => {
      const raf = createRafHarness()
      const controller = createController(FAST_ATOMIC_TEST_OPTIONS)

      controller.enqueue('```foo`bar\ntext')
      raf.step(performance.now() + 40)

      expect(controller.getSnapshot().visible).toBe('`')
      controller.destroy()
    })

    it('holds a marker split one backtick at a time', () => {
      const raf = createRafHarness()
      const controller = createController(FAST_ATOMIC_TEST_OPTIONS)

      controller.enqueue('`')
      controller.enqueue('`')
      controller.enqueue('`')
      expect(controller.getSnapshot().visible).toBe('')
      expect(raf.pendingFrames).toBe(0)

      controller.enqueue('ts\nbody')
      raf.step(performance.now() + 40)
      expect(controller.getSnapshot().visible).toBe('```ts\n')
      controller.destroy()
    })

    it('first reveals a full opening line when the source is enqueued once', () => {
      const raf = createRafHarness()
      const controller = createController(FAST_ATOMIC_TEST_OPTIONS)
      const source = 'intro\n```typescript\nconst answer = 42\n```'
      const snapshots: string[] = []
      controller.subscribe(() => snapshots.push(controller.getSnapshot().visible))

      controller.enqueue(source)
      const baseline = performance.now()
      for (let step = 1; step <= 20; step++)
        raf.step(baseline + step * 40)

      const firstFenceSnapshot = snapshots.find(snapshot => snapshot.includes('```'))
      expect(firstFenceSnapshot).toContain('```typescript\n')
      controller.destroy()
    })

    it('releases an unterminated trailing opening line when finish is called', () => {
      const raf = createRafHarness()
      const controller = createController(FAST_ATOMIC_TEST_OPTIONS)

      controller.enqueue('```typescript')
      expect(controller.getSnapshot().visible).toBe('')
      controller.finish()
      expect(raf.pendingFrames).toBe(1)
      raf.step(performance.now() + 40)

      expect(controller.getSnapshot().visible).toBe('```typescript')
      expect(controller.getSnapshot().final).toBe(true)
      controller.destroy()
    })

    it('continues revealing the body smoothly after the atomic opening line', () => {
      const raf = createRafHarness()
      const controller = createController(FAST_ATOMIC_TEST_OPTIONS)

      controller.enqueue('```ts\nabc')
      const baseline = performance.now()
      raf.step(baseline + 40)
      expect(controller.getSnapshot().visible).toBe('```ts\n')

      raf.step(baseline + 80)
      expect(controller.getSnapshot().visible).toBe('```ts\na')
      raf.step(baseline + 120)
      expect(controller.getSnapshot().visible).toBe('```ts\nab')
      controller.destroy()
    })

    it('reveals CRLF as part of the same atomic opening line', () => {
      const raf = createRafHarness()
      const controller = createController(FAST_ATOMIC_TEST_OPTIONS)

      controller.enqueue('```ts\r')
      expect(controller.getSnapshot().visible).toBe('')
      expect(raf.pendingFrames).toBe(0)

      controller.enqueue('\nbody')
      raf.step(performance.now() + 40)
      expect(controller.getSnapshot().visible).toBe('```ts\r\n')
      controller.destroy()
    })

    it('keeps reset-based append optimization fence-safe', () => {
      const controller = createController(FAST_ATOMIC_TEST_OPTIONS)

      controller.reset('```')
      expect(controller.getSnapshot().visible).toBe('')
      controller.reset('```type')
      expect(controller.getSnapshot().visible).toBe('')
      controller.reset('```typescript\nbody')
      expect(controller.getSnapshot().visible).toBe('```typescript\nbody')
      controller.destroy()
    })
  })

  describe('burst initial content', () => {
    const BURST_OPTIONS: SmoothMarkdownStreamOptions = {
      minCharsPerSecond: 100,
      maxCharsPerSecond: 100,
      maxCharsPerCommit: 10,
      maxCommitFps: 60,
      startDelayMs: 0,
      burstInitialContent: true,
    }

    it('reveals a large one-shot block in a single commit', () => {
      const raf = createRafHarness()
      const controller = createController(BURST_OPTIONS)
      const text = 'x'.repeat(5000)

      controller.enqueue(text)
      expect(controller.getSnapshot().visible).toBe('')
      raf.step(performance.now() + 20)

      // Whole 5000 chars revealed in one tick despite maxCharsPerCommit=10
      expect(controller.getSnapshot().visible).toBe(text)
      expect(controller.getSnapshot().caughtUp).toBe(true)
      controller.destroy()
    })

    it('withholds an incomplete fence opening line even during burst', () => {
      const raf = createRafHarness()
      const controller = createController(BURST_OPTIONS)

      // The opening marker line never ends: the burst reveals everything up
      // to the fence line but not the marker itself.
      controller.enqueue(`${'a'.repeat(3000)}\n\`\`\`ts`)
      raf.step(performance.now() + 20)

      const snapshot = controller.getSnapshot()
      // The newline belongs to the withheld fence line; the marker is not revealed.
      expect(snapshot.visible).toBe(`${'a'.repeat(3000)}\n`)
      expect(snapshot.visible).not.toContain('```')
      expect(snapshot.caughtUp).toBe(false)
      controller.destroy()
    })

    it('reveals the opening line atomically once its line ending arrives', () => {
      const raf = createRafHarness()
      const controller = createController(BURST_OPTIONS)

      controller.enqueue(`${'a'.repeat(3000)}\n\`\`\`ts`)
      raf.step(performance.now() + 20)
      expect(controller.getSnapshot().visible).toBe(`${'a'.repeat(3000)}\n`)

      controller.enqueue('\nbody')
      raf.step(performance.now() + 40)

      const snapshot = controller.getSnapshot()
      // Opening line is committed atomically with burst; remaining body
      // continues pacing below the threshold.
      expect(snapshot.visible.startsWith(`${'a'.repeat(3000)}\n\`\`\`ts`)).toBe(true)
      expect(snapshot.visible.length).toBeLessThan(snapshot.source.length)
      controller.destroy()
    })

    it('still paces below the burst threshold', () => {
      const raf = createRafHarness()
      const controller = createController(BURST_OPTIONS)
      const text = 'x'.repeat(1000)

      controller.enqueue(text)
      raf.step(performance.now() + 20)
      // 1000 chars is below the 2048 default threshold: paced reveal applies.
      expect(controller.getSnapshot().visible.length).toBeLessThan(text.length)
      controller.destroy()
    })
  })

  describe('hidden document fallback', () => {
    const setHidden = (hidden: boolean) => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: hidden ? 'hidden' : 'visible',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    }

    afterEach(() => {
      Reflect.deleteProperty(document, 'visibilityState')
    })

    it('keeps revealing on a timer while the document is hidden', async () => {
      vi.useFakeTimers()
      const controller = createController({
        minCharsPerSecond: 1000,
        maxCharsPerSecond: 1000,
        maxCharsPerCommit: 40,
        maxCommitFps: 60,
        startDelayMs: 0,
      })

      setHidden(true)
      controller.enqueue('a'.repeat(400))

      // Animation frames never run in hidden tabs; the timer fallback keeps
      // the reveal moving instead of freezing at the last visible position.
      await vi.advanceTimersByTimeAsync(1200)

      const visibleLength = controller.getSnapshot().visible.length
      expect(visibleLength).toBeGreaterThan(0)
      expect(visibleLength).toBeLessThan(controller.getSnapshot().source.length)

      controller.destroy()
      setHidden(false)
    })

    it('returns to animation frames when the document becomes visible again', async () => {
      vi.useFakeTimers()
      const raf = createRafHarness()
      const controller = createController(FAST_ATOMIC_TEST_OPTIONS)

      setHidden(true)
      controller.enqueue('a'.repeat(400))

      await vi.advanceTimersByTimeAsync(600)
      expect(raf.pendingFrames).toBe(0)
      expect(controller.getSnapshot().visible.length).toBeGreaterThan(0)

      setHidden(false)
      // The pending timer is swapped for an animation frame so the reveal
      // resumes at full cadence.
      expect(raf.pendingFrames).toBe(1)

      controller.destroy()
      setHidden(false)
    })

    it('releases the visibilitychange listener when the loop is cancelled', () => {
      const add = vi.spyOn(document, 'addEventListener')
      const remove = vi.spyOn(document, 'removeEventListener')

      try {
        const controller = createController(FAST_ATOMIC_TEST_OPTIONS)
        controller.enqueue('a'.repeat(400))

        const attached = add.mock.calls.find(([type]) => type === 'visibilitychange')
        expect(attached).toBeTruthy()

        // React/Octane release the controller with pause() instead of destroy(),
        // so a document-level listener left behind would pin it forever.
        controller.pause()
        expect(remove.mock.calls.some(([type, handler]) => type === 'visibilitychange' && handler === attached?.[1])).toBe(true)

        controller.destroy()
        setHidden(false)
      }
      finally {
        add.mockRestore()
        remove.mockRestore()
      }
    })
  })
})
