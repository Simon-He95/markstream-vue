import type { Ref } from 'vue'
import type { VisibilityHandle } from '../../../composables/viewportPriority'
import { ref } from 'vue'

export interface NodeVisibilityStateOptions {
  isClient: boolean
  shouldTrackVisibleNodeIndices?: () => boolean
  shouldCleanupNodeVisibility?: () => boolean
  onNodeMarkedVisible?: (index: number) => void
  onNodeVisibilityCleaned?: (index: number) => void
}

export interface NodeVisibilityState {
  visibleNodeIndices: Ref<Set<number>>
  nodeVisibilityHandles: Map<number, VisibilityHandle>
  nodeVisibilityWatchStops: Map<number, () => void>
  nodeVisibilityFallbackTimers: Map<number, number>

  clearVisibilityFallback: (index: number) => void
  clearAllVisibilityFallbacks: () => void
  markNodeVisible: (index: number, visible?: boolean) => void
  resetNodeVisibleState: () => void
  cleanupNodeVisibility: (maxIndex: number) => void
  destroyNodeVisibilityState: () => void
}

export function useNodeVisibilityState(
  options: NodeVisibilityStateOptions,
): NodeVisibilityState {
  const { isClient } = options

  const visibleNodeIndices = ref<Set<number>>(new Set())
  const nodeVisibilityHandles = new Map<number, VisibilityHandle>()
  const nodeVisibilityWatchStops = new Map<number, () => void>()
  const nodeVisibilityFallbackTimers = new Map<number, number>()

  function shouldTrackVisibleNodeIndices() {
    return options.shouldTrackVisibleNodeIndices?.() ?? true
  }

  function clearVisibilityFallback(index: number) {
    if (!isClient)
      return

    const timer = nodeVisibilityFallbackTimers.get(index)

    if (timer == null)
      return

    window.clearTimeout(timer)
    nodeVisibilityFallbackTimers.delete(index)
  }

  function clearAllVisibilityFallbacks() {
    if (isClient) {
      for (const timer of nodeVisibilityFallbackTimers.values())
        window.clearTimeout(timer)
    }

    nodeVisibilityFallbackTimers.clear()
  }

  function setNodeVisibleState(index: number, visible: boolean) {
    if (!shouldTrackVisibleNodeIndices())
      return

    const current = visibleNodeIndices.value
    const hasIndex = current.has(index)

    if (visible) {
      if (hasIndex)
        return

      const next = new Set(current)
      next.add(index)
      visibleNodeIndices.value = next
      return
    }

    if (!hasIndex)
      return

    const next = new Set(current)
    next.delete(index)
    visibleNodeIndices.value = next
  }

  function markNodeVisible(index: number, visible = true) {
    if (visible)
      clearVisibilityFallback(index)

    setNodeVisibleState(index, visible)

    if (visible)
      options.onNodeMarkedVisible?.(index)
  }

  function resetNodeVisibleState() {
    visibleNodeIndices.value = new Set()
  }

  function cleanupNodeVisibility(maxIndex: number) {
    if (options.shouldCleanupNodeVisibility && !options.shouldCleanupNodeVisibility())
      return

    for (const [index, stop] of nodeVisibilityWatchStops.entries()) {
      if (index < maxIndex)
        continue

      stop()
      nodeVisibilityWatchStops.delete(index)
    }

    for (const [index, handle] of nodeVisibilityHandles.entries()) {
      if (index < maxIndex)
        continue

      handle.destroy()
      nodeVisibilityHandles.delete(index)
      clearVisibilityFallback(index)
      options.onNodeVisibilityCleaned?.(index)
    }

    for (const index of Array.from(nodeVisibilityFallbackTimers.keys())) {
      if (index < maxIndex)
        continue

      clearVisibilityFallback(index)
    }

    if (!visibleNodeIndices.value.size)
      return

    const next = new Set<number>()

    for (const index of visibleNodeIndices.value) {
      if (index < maxIndex)
        next.add(index)
    }

    visibleNodeIndices.value = next
  }

  function destroyNodeVisibilityState() {
    resetNodeVisibleState()

    for (const stop of nodeVisibilityWatchStops.values())
      stop()

    nodeVisibilityWatchStops.clear()

    for (const handle of nodeVisibilityHandles.values())
      handle.destroy()

    nodeVisibilityHandles.clear()

    clearAllVisibilityFallbacks()
  }

  return {
    visibleNodeIndices,
    nodeVisibilityHandles,
    nodeVisibilityWatchStops,
    nodeVisibilityFallbackTimers,

    clearVisibilityFallback,
    clearAllVisibilityFallbacks,
    markNodeVisible,
    resetNodeVisibleState,
    cleanupNodeVisibility,
    destroyNodeVisibilityState,
  }
}
