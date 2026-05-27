import type { ComputedRef, Ref } from 'vue'
import { ref } from 'vue'

export interface RestoreAnchor {
  nodeIndex: number
  offsetWithinNodePx: number
}

export interface ScrollRestoreOptions {
  isClient: boolean

  containerRef: Ref<HTMLElement | undefined>
  parsedNodeCount: ComputedRef<number>

  requestFrame: typeof window.requestAnimationFrame | null
  cancelFrame: typeof window.cancelAnimationFrame | null

  resolveScrollContainer: (node?: HTMLElement | null) => HTMLElement | null
  getNormalizedScrollTop: (
    root: HTMLElement,
    doc: Document,
    isViewportRoot: boolean,
  ) => number
  getOffsetTopWithinRoot: (node: HTMLElement, root: HTMLElement) => number

  estimateIndexForOffset: (offsetPx: number) => number
  estimateHeightRange: (start: number, end: number) => number
  getFallbackNodeHeight: (index: number) => number
  clamp: (value: number, min: number, max: number) => number
}

export interface ScrollRestore {
  activeRestoreAnchor: Ref<RestoreAnchor | null>
  getRelativeScrollTopWithinContainer: () => number | null
  setRelativeScrollTopWithinContainer: (target: number) => void
  resolveAnchorOffset: (anchor: RestoreAnchor) => number
  clearRestoreReconcile: () => void
  applyRestoreAnchor: (anchor: RestoreAnchor) => void
  scheduleRestoreReconcile: () => void
  captureRestoreAnchor: () => RestoreAnchor | null
  restoreAnchor: (anchor: RestoreAnchor) => void
  getAnchorDrift: (anchor: RestoreAnchor) => number | null
}

export function useScrollRestore(options: ScrollRestoreOptions): ScrollRestore {
  const {
    isClient,
    containerRef,
    parsedNodeCount,
    requestFrame,
    cancelFrame,
    resolveScrollContainer,
    getNormalizedScrollTop,
    getOffsetTopWithinRoot,
    estimateIndexForOffset,
    estimateHeightRange,
    getFallbackNodeHeight,
    clamp,
  } = options

  const activeRestoreAnchor = ref<RestoreAnchor | null>(null)
  const RESTORE_DRIFT_DEADBAND_PX = 2

  let restoreReconcileRaf: number | null = null
  let restoreReconcileTimers: number[] = []

  function getRelativeScrollTopWithinContainer() {
    const root = resolveScrollContainer()
    const container = containerRef.value

    if (!root || !container)
      return null

    const doc = root.ownerDocument || container.ownerDocument || document
    const isViewportRoot = root === doc.documentElement
      || root === doc.body
      || root === doc.scrollingElement

    if (isViewportRoot) {
      const containerRect = container.getBoundingClientRect()
      return Math.max(0, -containerRect.top)
    }

    return Math.max(
      0,
      getNormalizedScrollTop(root, doc, false)
      - getOffsetTopWithinRoot(container, root),
    )
  }

  function setRelativeScrollTopWithinContainer(target: number) {
    const root = resolveScrollContainer()
    const container = containerRef.value

    if (!root || !container)
      return

    const next = Math.max(0, target)
    const doc = root.ownerDocument || container.ownerDocument || document
    const view = doc.defaultView || (typeof window !== 'undefined' ? window : null)
    const isViewportRoot = root === doc.documentElement
      || root === doc.body
      || root === doc.scrollingElement

    if (isViewportRoot) {
      const current = getNormalizedScrollTop(root, doc, true)
      const containerDocTop = current + container.getBoundingClientRect().top
      view?.scrollTo?.(0, Math.max(0, containerDocTop + next))
      return
    }

    root.scrollTop = getOffsetTopWithinRoot(container, root) + next
  }

  function resolveAnchorOffset(anchor: RestoreAnchor) {
    const total = parsedNodeCount.value
    const boundedIndex = clamp(anchor.nodeIndex, 0, Math.max(0, total - 1))

    return estimateHeightRange(0, boundedIndex)
      + Math.max(0, anchor.offsetWithinNodePx)
  }

  function clearRestoreReconcile() {
    if (restoreReconcileRaf != null) {
      cancelFrame?.(restoreReconcileRaf)
      restoreReconcileRaf = null
    }

    if (isClient) {
      for (const timer of restoreReconcileTimers)
        window.clearTimeout(timer)
    }

    restoreReconcileTimers = []
  }

  function applyRestoreAnchor(anchor: RestoreAnchor) {
    const target = resolveAnchorOffset(anchor)
    const current = getRelativeScrollTopWithinContainer()

    if (current != null && Math.abs(current - target) <= RESTORE_DRIFT_DEADBAND_PX)
      return

    setRelativeScrollTopWithinContainer(target)
  }

  function scheduleRestoreReconcile() {
    if (!activeRestoreAnchor.value || !isClient)
      return

    if (restoreReconcileRaf != null)
      return

    restoreReconcileRaf = requestFrame
      ? requestFrame(() => {
          restoreReconcileRaf = null

          if (activeRestoreAnchor.value)
            applyRestoreAnchor(activeRestoreAnchor.value)
        })
      : null

    if (restoreReconcileRaf == null && activeRestoreAnchor.value)
      applyRestoreAnchor(activeRestoreAnchor.value)
  }

  function captureRestoreAnchor() {
    const relativeScrollTop = getRelativeScrollTopWithinContainer()
    const total = parsedNodeCount.value

    if (relativeScrollTop == null || total <= 0)
      return null

    const nodeIndex = clamp(
      estimateIndexForOffset(relativeScrollTop + 1),
      0,
      total - 1,
    )
    const nodeStart = estimateHeightRange(0, nodeIndex)
    const nodeHeight = getFallbackNodeHeight(nodeIndex)

    return {
      nodeIndex,
      offsetWithinNodePx: clamp(
        relativeScrollTop - nodeStart,
        0,
        Math.max(0, nodeHeight - 1),
      ),
    }
  }

  function restoreAnchor(anchor: RestoreAnchor) {
    const total = parsedNodeCount.value

    activeRestoreAnchor.value = {
      nodeIndex: clamp(anchor.nodeIndex, 0, Math.max(0, total - 1)),
      offsetWithinNodePx: Math.max(0, anchor.offsetWithinNodePx),
    }

    clearRestoreReconcile()
    applyRestoreAnchor(activeRestoreAnchor.value)

    if (!isClient)
      return

    for (const delay of [0, 120, 280, 480]) {
      restoreReconcileTimers.push(window.setTimeout(() => {
        if (activeRestoreAnchor.value)
          applyRestoreAnchor(activeRestoreAnchor.value)
      }, delay))
    }
  }

  function getAnchorDrift(anchor: RestoreAnchor) {
    const relativeScrollTop = getRelativeScrollTopWithinContainer()

    if (relativeScrollTop == null)
      return null

    return relativeScrollTop - resolveAnchorOffset(anchor)
  }

  return {
    activeRestoreAnchor,
    getRelativeScrollTopWithinContainer,
    setRelativeScrollTopWithinContainer,
    resolveAnchorOffset,
    clearRestoreReconcile,
    applyRestoreAnchor,
    scheduleRestoreReconcile,
    captureRestoreAnchor,
    restoreAnchor,
    getAnchorDrift,
  }
}
