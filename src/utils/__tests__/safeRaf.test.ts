import { afterEach, describe, expect, it, vi } from 'vitest'
import { safeCancelRaf, safeRaf } from '../safeRaf'

const originalRaf = (globalThis as any).requestAnimationFrame
const originalCancelRaf = (globalThis as any).cancelAnimationFrame

afterEach(() => {
  ;(globalThis as any).requestAnimationFrame = originalRaf
  ;(globalThis as any).cancelAnimationFrame = originalCancelRaf
  vi.restoreAllMocks()
})

describe('safeRaf / safeCancelRaf', () => {
  it('cancels an animation-frame handle through cancelAnimationFrame', () => {
    const cancelRaf = vi.fn()
    ;(globalThis as any).requestAnimationFrame = vi.fn(() => 42)
    ;(globalThis as any).cancelAnimationFrame = cancelRaf

    const id = safeRaf(() => {})
    expect(id).toBe(42)

    safeCancelRaf(id)
    expect(cancelRaf).toHaveBeenCalledWith(42)
  })

  it('cancels with clearTimeout when the requestAnimationFrame call threw and the timeout fallback was used', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const cancelRaf = vi.fn()
    ;(globalThis as any).requestAnimationFrame = vi.fn(() => {
      throw new Error('raf unavailable')
    })
    ;(globalThis as any).cancelAnimationFrame = cancelRaf

    const id = safeRaf(() => {})

    safeCancelRaf(id)

    // The handle came from setTimeout, so cancelling it must not go through
    // cancelAnimationFrame — that call would leave the pending timer armed.
    expect(clearTimeoutSpy).toHaveBeenCalledWith(id)
    expect(cancelRaf).not.toHaveBeenCalled()
  })

  it('ignores null handles', () => {
    const cancelRaf = vi.fn()
    ;(globalThis as any).cancelAnimationFrame = cancelRaf

    expect(() => safeCancelRaf(null)).not.toThrow()
    expect(cancelRaf).not.toHaveBeenCalled()
  })
})
