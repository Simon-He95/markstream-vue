import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNodeVisibilityState } from '../src/components/NodeRenderer/composables/useNodeVisibilityState'

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('useNodeVisibilityState', () => {
  it('does not clear fallback timer when marking a node invisible', () => {
    vi.useFakeTimers()

    const state = useNodeVisibilityState({
      isClient: true,
      shouldTrackVisibleNodeIndices: () => true,
    })

    const timer = window.setTimeout(() => {}, 1000)
    state.nodeVisibilityFallbackTimers.set(1, timer)

    state.markNodeVisible(1, false)

    expect(state.nodeVisibilityFallbackTimers.has(1)).toBe(true)

    state.clearVisibilityFallback(1)

    expect(state.nodeVisibilityFallbackTimers.has(1)).toBe(false)
  })
})
