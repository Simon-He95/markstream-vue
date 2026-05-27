/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { useScrollRestore } from '../src/components/NodeRenderer/composables/useScrollRestore'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function createHarness(options: {
  count?: number
  isClient?: boolean
  viewportRoot?: boolean
  requestFrame?: ((callback: FrameRequestCallback) => number) | null
  cancelFrame?: ((id: number) => void) | null
} = {}) {
  const root = document.createElement('div')
  const container = document.createElement('div')

  document.body.appendChild(root)
  root.appendChild(container)

  const count = ref(options.count ?? 5)
  const containerRef = ref<HTMLElement | undefined>(container)

  const offsetTop = 100
  const itemHeight = 100

  root.scrollTop = 0

  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: -150,
    left: 0,
    right: 320,
    bottom: 450,
    width: 320,
    height: 600,
    toJSON: () => ({}),
  } as DOMRect)

  const resolveScrollContainer = vi.fn(() => {
    if (options.viewportRoot)
      return document.documentElement

    return root
  })

  const getNormalizedScrollTop = vi.fn((node: HTMLElement) => node.scrollTop)
  const getOffsetTopWithinRoot = vi.fn(() => offsetTop)
  const estimateIndexForOffset = vi.fn((offsetPx: number) => Math.floor(offsetPx / itemHeight))
  const estimateHeightRange = vi.fn((start: number, end: number) => Math.max(0, end - start) * itemHeight)
  const getFallbackNodeHeight = vi.fn(() => itemHeight)

  const requestFrame = options.requestFrame ?? null
  const cancelFrame = options.cancelFrame ?? null

  const restore = useScrollRestore({
    isClient: options.isClient ?? true,
    containerRef,
    parsedNodeCount: computed(() => count.value),

    requestFrame,
    cancelFrame,

    resolveScrollContainer,
    getNormalizedScrollTop,
    getOffsetTopWithinRoot,

    estimateIndexForOffset,
    estimateHeightRange,
    getFallbackNodeHeight,
    clamp,
  })

  return {
    root,
    container,
    count,
    containerRef,
    restore,
    offsetTop,
    itemHeight,
    resolveScrollContainer,
    getNormalizedScrollTop,
    getOffsetTopWithinRoot,
    estimateIndexForOffset,
    estimateHeightRange,
    getFallbackNodeHeight,
  }
}

describe('useScrollRestore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns null when there is no scroll container, container, or parsed nodes', () => {
    const h = createHarness({ count: 0 })

    h.containerRef.value = undefined
    expect(h.restore.getRelativeScrollTopWithinContainer()).toBeNull()
    expect(h.restore.captureRestoreAnchor()).toBeNull()

    h.containerRef.value = h.container
    h.count.value = 0
    expect(h.restore.captureRestoreAnchor()).toBeNull()
  })

  it('computes relative scroll top within a non-viewport scroll container', () => {
    const h = createHarness()

    h.root.scrollTop = 250

    expect(h.restore.getRelativeScrollTopWithinContainer()).toBe(150)
    expect(h.getNormalizedScrollTop).toHaveBeenCalledWith(h.root, document, false)
    expect(h.getOffsetTopWithinRoot).toHaveBeenCalledWith(h.container, h.root)
  })

  it('computes relative scroll top for viewport scrolling from container rect', () => {
    const h = createHarness({ viewportRoot: true })

    expect(h.restore.getRelativeScrollTopWithinContainer()).toBe(150)
  })

  it('sets relative scroll top within a non-viewport scroll container', () => {
    const h = createHarness()

    h.restore.setRelativeScrollTopWithinContainer(240)

    expect(h.root.scrollTop).toBe(340)
  })

  it('sets viewport scroll position using window.scrollTo when viewport root is used', () => {
    const h = createHarness({ viewportRoot: true })
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    Object.defineProperty(document.documentElement, 'scrollTop', {
      value: 50,
      writable: true,
      configurable: true,
    })

    h.restore.setRelativeScrollTopWithinContainer(240)

    expect(scrollTo).toHaveBeenCalledWith(0, 140)
  })

  it('captures a bounded restore anchor from current relative scroll position', () => {
    const h = createHarness()

    h.root.scrollTop = 250

    const anchor = h.restore.captureRestoreAnchor()

    expect(anchor).toEqual({
      nodeIndex: 1,
      offsetWithinNodePx: 50,
    })

    expect(h.estimateIndexForOffset).toHaveBeenCalledWith(151)
    expect(h.estimateHeightRange).toHaveBeenCalledWith(0, 1)
    expect(h.getFallbackNodeHeight).toHaveBeenCalledWith(1)
  })

  it('clamps captured node index and offset', () => {
    const h = createHarness({ count: 2 })

    h.root.scrollTop = 10_000

    const anchor = h.restore.captureRestoreAnchor()

    expect(anchor).toEqual({
      nodeIndex: 1,
      offsetWithinNodePx: 99,
    })
  })

  it('restores an anchor, clamps input, and schedules delayed reconciliations', () => {
    const h = createHarness({ count: 3 })

    h.restore.restoreAnchor({
      nodeIndex: 99,
      offsetWithinNodePx: -20,
    })

    expect(h.restore.activeRestoreAnchor.value).toEqual({
      nodeIndex: 2,
      offsetWithinNodePx: 0,
    })

    expect(h.root.scrollTop).toBe(300)

    h.root.scrollTop = 0
    vi.advanceTimersByTime(480)

    expect(h.root.scrollTop).toBe(300)
  })

  it('scheduleRestoreReconcile uses requestAnimationFrame when available', () => {
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

    h.restore.restoreAnchor({
      nodeIndex: 1,
      offsetWithinNodePx: 25,
    })

    // Clear timers from restoreAnchor so this test isolates rAF reconcile.
    h.restore.clearRestoreReconcile()

    h.root.scrollTop = 0
    h.restore.activeRestoreAnchor.value = {
      nodeIndex: 1,
      offsetWithinNodePx: 25,
    }

    h.restore.scheduleRestoreReconcile()

    expect(requestFrame).toHaveBeenCalledTimes(1)
    expect(frameCallback).toBeTypeOf('function')
    expect(h.root.scrollTop).toBe(0)

    frameCallback?.(0)

    expect(h.root.scrollTop).toBe(225)
  })

  it('scheduleRestoreReconcile applies immediately without requestAnimationFrame', () => {
    const h = createHarness()

    h.restore.activeRestoreAnchor.value = {
      nodeIndex: 2,
      offsetWithinNodePx: 10,
    }

    h.restore.scheduleRestoreReconcile()

    expect(h.root.scrollTop).toBe(310)
  })

  it('does not schedule restore reconcile without an active anchor or client environment', () => {
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })

    const h = createHarness({ requestFrame })

    h.restore.scheduleRestoreReconcile()
    expect(requestFrame).not.toHaveBeenCalled()

    const serverHarness = createHarness({
      isClient: false,
      requestFrame,
    })

    serverHarness.restore.activeRestoreAnchor.value = {
      nodeIndex: 1,
      offsetWithinNodePx: 0,
    }
    serverHarness.restore.scheduleRestoreReconcile()

    expect(requestFrame).not.toHaveBeenCalled()
  })

  it('clearRestoreReconcile cancels pending rAF and delayed timers', () => {
    const requestFrame = vi.fn(() => 7)
    const cancelFrame = vi.fn()

    const h = createHarness({
      requestFrame,
      cancelFrame,
    })

    h.restore.restoreAnchor({
      nodeIndex: 1,
      offsetWithinNodePx: 25,
    })

    h.restore.scheduleRestoreReconcile()
    h.restore.clearRestoreReconcile()

    expect(cancelFrame).toHaveBeenCalledWith(7)

    h.root.scrollTop = 0
    vi.advanceTimersByTime(480)

    expect(h.root.scrollTop).toBe(0)
  })

  it('getAnchorDrift returns current relative scroll drift from anchor offset', () => {
    const h = createHarness()

    h.root.scrollTop = 250

    expect(h.restore.getAnchorDrift({
      nodeIndex: 1,
      offsetWithinNodePx: 25,
    })).toBe(25)
  })

  it('getAnchorDrift returns null when relative scroll top is unavailable', () => {
    const h = createHarness()

    h.containerRef.value = undefined

    expect(h.restore.getAnchorDrift({
      nodeIndex: 1,
      offsetWithinNodePx: 25,
    })).toBeNull()
  })
})
