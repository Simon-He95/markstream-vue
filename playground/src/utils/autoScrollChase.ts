export interface AutoScrollChaseControllerOptions {
  getRoot: () => HTMLElement
  getShouldStick: () => boolean
  setShouldStick: (value: boolean) => void
  requestFrame?: (callback: FrameRequestCallback) => number
  cancelFrame?: (id: number) => void
  now?: () => number
  chaseDurationMs?: number
  bottomThreshold?: number
}

export function createAutoScrollChaseController(options: AutoScrollChaseControllerOptions) {
  const requestFrame = options.requestFrame ?? requestAnimationFrame
  const cancelFrame = options.cancelFrame ?? cancelAnimationFrame
  const now = options.now ?? (() => performance.now())
  const chaseDurationMs = options.chaseDurationMs ?? 240
  const bottomThreshold = options.bottomThreshold ?? 24

  let rafId: number | null = null
  let continuousScrollMode = false
  let autoScrollChaseUntil = 0
  let lastObservedScrollTop = 0
  let userDetached = false
  let programmaticScrollTop: number | null = null

  function isAtBottom(root = options.getRoot(), threshold = bottomThreshold) {
    return root.scrollHeight - root.scrollTop - root.clientHeight <= threshold
  }

  function scrollToBottom() {
    const root = options.getRoot()
    programmaticScrollTop = Math.max(0, root.scrollHeight - root.clientHeight)
    root.scrollTop = root.scrollHeight
    programmaticScrollTop = root.scrollTop
    lastObservedScrollTop = root.scrollTop
    userDetached = false
  }

  function stopChase() {
    rafId = null
    continuousScrollMode = false
  }

  function schedule() {
    if (!options.getShouldStick())
      return

    autoScrollChaseUntil = now() + chaseDurationMs

    if (continuousScrollMode)
      return

    continuousScrollMode = true
    let stableFrames = 0
    let lastHeight = 0

    const chase = () => {
      if (!options.getShouldStick()) {
        stopChase()
        return
      }

      const root = options.getRoot()
      scrollToBottom()

      const currentHeight = root.scrollHeight
      if (currentHeight === lastHeight) {
        stableFrames++
      }
      else {
        stableFrames = 0
        lastHeight = currentHeight
      }

      if (stableFrames >= 3 && now() >= autoScrollChaseUntil) {
        stopChase()
        return
      }

      if (options.getShouldStick()) {
        rafId = requestFrame(chase)
      }
      else {
        stopChase()
      }
    }

    rafId = requestFrame(chase)
  }

  function handleScroll() {
    const root = options.getRoot()
    const currentScrollTop = root.scrollTop

    // A scroll event caused by our own scrollTop write must not be interpreted
    // as a user gesture. This is especially important when streaming at high
    // TPS, where programmatic writes and layout updates can interleave.
    if (programmaticScrollTop != null && currentScrollTop === programmaticScrollTop) {
      programmaticScrollTop = null
      lastObservedScrollTop = currentScrollTop

      // The event may arrive after layout has already added more content. It
      // is still ours, but the recorded position is no longer the bottom.
      // Re-arm the chase instead of swallowing the only signal that can catch
      // up to the new height.
      if (!isAtBottom(root))
        schedule()
      return
    }
    programmaticScrollTop = null
    const previousScrollTop = lastObservedScrollTop
    const atExactBottom = isAtBottom(root, 1)
    const scrolledUp = currentScrollTop < previousScrollTop - 2
    const returnedToBottom = currentScrollTop > previousScrollTop && atExactBottom
    lastObservedScrollTop = currentScrollTop

    // A layout reflow can reduce scrollTop while keeping the viewport exactly
    // at the bottom. Treat that as programmatic/layout movement, not as an
    // upward gesture. A real upward gesture is still handled before the wider
    // near-bottom threshold below.
    if (atExactBottom) {
      if (userDetached && !returnedToBottom) {
        options.setShouldStick(false)
        return
      }
      userDetached = false
      options.setShouldStick(true)
      schedule()
      return
    }

    // Check user scroll direction before the wider bottom threshold. A small
    // upward scroll can still be within bottomThreshold; treating it as pinned
    // would immediately start the chase and take the scrollbar from the user.
    if (scrolledUp) {
      userDetached = true
      options.setShouldStick(false)
      cancel()
      return
    }

    if (isAtBottom(root)) {
      if (userDetached && !returnedToBottom) {
        options.setShouldStick(false)
        return
      }
      userDetached = false
      options.setShouldStick(true)
      schedule()
      return
    }

    if (options.getShouldStick()) {
      schedule()
      return
    }

    options.setShouldStick(false)
  }

  function handleWheel(deltaY: number) {
    if (deltaY < 0) {
      userDetached = true
      lastObservedScrollTop = options.getRoot().scrollTop
      options.setShouldStick(false)
      cancel()
    }
  }

  function handleTouchMove() {
    userDetached = true
    lastObservedScrollTop = options.getRoot().scrollTop
    options.setShouldStick(false)
    cancel()
  }

  function handleTouchEnd() {
    if (isAtBottom() && !userDetached) {
      options.setShouldStick(true)
      schedule()
    }
  }

  function cancel() {
    if (rafId !== null) {
      cancelFrame(rafId)
      rafId = null
    }
    continuousScrollMode = false
  }

  return {
    cancel,
    handleScroll,
    handleTouchEnd,
    handleTouchMove,
    handleWheel,
    isAtBottom,
    schedule,
    scrollToBottom,
  }
}
