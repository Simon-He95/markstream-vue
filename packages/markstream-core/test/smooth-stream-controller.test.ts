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
})
