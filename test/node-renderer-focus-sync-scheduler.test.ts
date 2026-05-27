/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { useFocusSyncScheduler } from '../src/components/NodeRenderer/composables/useFocusSyncScheduler'

function createHarness(options: {
  isClient?: boolean
  virtualized?: boolean
  requestFrame?: ((callback: FrameRequestCallback) => number) | null
  cancelFrame?: ((id: number) => void) | null
  withContainer?: boolean
} = {}) {
  const container = options.withContainer === false
    ? undefined
    : document.createElement('div')

  if (container)
    document.body.appendChild(container)

  const containerRef = ref<HTMLElement | undefined>(container)
  const virtualized = ref(options.virtualized ?? true)
  const syncFocusToScroll = vi.fn()

  const requestFrame = options.requestFrame ?? null
  const cancelFrame = options.cancelFrame ?? null

  const scheduler = useFocusSyncScheduler({
    isClient: options.isClient ?? true,
    containerRef,
    virtualizationEnabled: computed(() => virtualized.value),
    requestFrame,
    cancelFrame,
    syncFocusToScroll,
  })

  return {
    container,
    containerRef,
    virtualized,
    syncFocusToScroll,
    requestFrame,
    cancelFrame,
    scheduler,
  }
}

describe('useFocusSyncScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does nothing when virtualization is disabled', () => {
    const requestFrame = vi.fn(() => 1)
    const h = createHarness({
      virtualized: false,
      requestFrame,
    })

    h.scheduler.scheduleFocusSync()

    expect(requestFrame).not.toHaveBeenCalled()
    expect(h.syncFocusToScroll).not.toHaveBeenCalled()
  })

  it('runs syncFocusToScroll(true) immediately in non-client mode', () => {
    const h = createHarness({
      isClient: false,
    })

    h.scheduler.scheduleFocusSync()

    expect(h.syncFocusToScroll).toHaveBeenCalledTimes(1)
    expect(h.syncFocusToScroll).toHaveBeenCalledWith(true)
  })

  it('runs syncFocusToScroll(true) immediately for immediate scheduling', () => {
    const h = createHarness()

    h.scheduler.scheduleFocusSync({ immediate: true })

    expect(h.syncFocusToScroll).toHaveBeenCalledTimes(1)
    expect(h.syncFocusToScroll).toHaveBeenCalledWith(true)
  })

  it('uses requestAnimationFrame when available', () => {
    let frameCallback: FrameRequestCallback | null = null
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frameCallback = callback
      return 42
    })
    const cancelFrame = vi.fn()

    const h = createHarness({
      requestFrame,
      cancelFrame,
    })

    h.scheduler.scheduleFocusSync()

    expect(requestFrame).toHaveBeenCalledTimes(1)
    expect(frameCallback).toBeTypeOf('function')
    expect(h.syncFocusToScroll).not.toHaveBeenCalled()

    frameCallback?.(0)

    expect(h.syncFocusToScroll).toHaveBeenCalledTimes(1)
    expect(h.syncFocusToScroll).toHaveBeenCalledWith()
  })

  it('dedupes repeated schedule calls while a rAF request is pending', () => {
    let frameCallback: FrameRequestCallback | null = null
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frameCallback = callback
      return 7
    })

    const h = createHarness({
      requestFrame,
    })

    h.scheduler.scheduleFocusSync()
    h.scheduler.scheduleFocusSync()
    h.scheduler.scheduleFocusSync()

    expect(requestFrame).toHaveBeenCalledTimes(1)
    expect(h.syncFocusToScroll).not.toHaveBeenCalled()

    frameCallback?.(0)

    expect(h.syncFocusToScroll).toHaveBeenCalledTimes(1)
  })

  it('allows scheduling again after the pending rAF callback runs', () => {
    const callbacks: FrameRequestCallback[] = []
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    })

    const h = createHarness({
      requestFrame,
    })

    h.scheduler.scheduleFocusSync()
    callbacks[0]?.(0)

    h.scheduler.scheduleFocusSync()
    callbacks[1]?.(0)

    expect(requestFrame).toHaveBeenCalledTimes(2)
    expect(h.syncFocusToScroll).toHaveBeenCalledTimes(2)
  })

  it('cancels a pending requestAnimationFrame sync', () => {
    const requestFrame = vi.fn(() => 42)
    const cancelFrame = vi.fn()

    const h = createHarness({
      requestFrame,
      cancelFrame,
    })

    h.scheduler.scheduleFocusSync()
    h.scheduler.cancelScheduledFocusSync()

    expect(cancelFrame).toHaveBeenCalledWith(42)

    h.scheduler.cancelScheduledFocusSync()

    expect(cancelFrame).toHaveBeenCalledTimes(1)
    expect(h.syncFocusToScroll).not.toHaveBeenCalled()
  })

  it('uses a timeout fallback when requestAnimationFrame is unavailable', () => {
    const h = createHarness({
      requestFrame: null,
    })

    h.scheduler.scheduleFocusSync()

    expect(h.syncFocusToScroll).not.toHaveBeenCalled()

    vi.advanceTimersByTime(15)
    expect(h.syncFocusToScroll).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(h.syncFocusToScroll).toHaveBeenCalledTimes(1)
    expect(h.syncFocusToScroll).toHaveBeenCalledWith()
  })

  it('dedupes repeated timeout fallback schedules while pending', () => {
    const h = createHarness({
      requestFrame: null,
    })

    h.scheduler.scheduleFocusSync()
    h.scheduler.scheduleFocusSync()
    h.scheduler.scheduleFocusSync()

    vi.advanceTimersByTime(16)

    expect(h.syncFocusToScroll).toHaveBeenCalledTimes(1)
  })

  it('allows scheduling again after timeout fallback runs', () => {
    const h = createHarness({
      requestFrame: null,
    })

    h.scheduler.scheduleFocusSync()
    vi.advanceTimersByTime(16)

    h.scheduler.scheduleFocusSync()
    vi.advanceTimersByTime(16)

    expect(h.syncFocusToScroll).toHaveBeenCalledTimes(2)
  })

  it('cancels a pending timeout fallback sync', () => {
    const h = createHarness({
      requestFrame: null,
    })

    h.scheduler.scheduleFocusSync()
    h.scheduler.cancelScheduledFocusSync()

    vi.advanceTimersByTime(16)

    expect(h.syncFocusToScroll).not.toHaveBeenCalled()
  })

  it('immediate scheduling cancels a pending rAF before forcing sync', () => {
    const requestFrame = vi.fn(() => 13)
    const cancelFrame = vi.fn()

    const h = createHarness({
      requestFrame,
      cancelFrame,
    })

    h.scheduler.scheduleFocusSync()
    h.scheduler.scheduleFocusSync({ immediate: true })

    expect(cancelFrame).toHaveBeenCalledWith(13)
    expect(h.syncFocusToScroll).toHaveBeenCalledTimes(1)
    expect(h.syncFocusToScroll).toHaveBeenCalledWith(true)
  })

  it('immediate scheduling cancels a pending timeout before forcing sync', () => {
    const h = createHarness({
      requestFrame: null,
    })

    h.scheduler.scheduleFocusSync()
    h.scheduler.scheduleFocusSync({ immediate: true })

    vi.advanceTimersByTime(16)

    expect(h.syncFocusToScroll).toHaveBeenCalledTimes(1)
    expect(h.syncFocusToScroll).toHaveBeenCalledWith(true)
  })

  it('falls back to global timers when there is no container window', () => {
    const h = createHarness({
      requestFrame: null,
      withContainer: false,
    })

    h.scheduler.scheduleFocusSync()

    vi.advanceTimersByTime(16)

    expect(h.syncFocusToScroll).toHaveBeenCalledTimes(1)
  })
})
