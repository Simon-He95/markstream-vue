import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSmoothMarkdownStream } from '../packages/markstream-core/src/smooth-stream-controller'

function firstCommit(arrivalInterval: number) {
  let now = 0
  let tick: FrameRequestCallback | undefined
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    tick = callback
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    tick = undefined
  })
  const controller = createSmoothMarkdownStream({ minCharsPerSecond: 1, maxCharsPerSecond: 2000, startDelayMs: 0, maxCommitFps: 20, maxCharsPerCommit: 160 })
  controller.pause()
  controller.enqueue('a'.repeat(100))
  now = arrivalInterval
  controller.enqueue('b'.repeat(100))
  controller.resume()
  now += 50
  tick!(now)
  const length = controller.getSnapshot().visible.length
  controller.destroy()
  return length
}

describe('arrival-aware smooth streaming', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses arrival cadence as well as backlog when choosing the reveal rate', () => {
    const dense = firstCommit(20)
    const sparse = firstCommit(500)
    expect(dense).toBeGreaterThan(sparse)
    expect(dense).toBeLessThan(160)
    expect(sparse).toBeGreaterThan(0)
  })
})
