/**
 * @vitest-environment node
 */

import type { NodeRendererProps } from '../src/types/node-renderer-props'
import { describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref } from 'vue'
import { useLiveRangeState } from '../src/components/NodeRenderer/composables/useLiveRangeState'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function createHarness(options: {
  total?: number
  virtualized?: boolean
  maxLiveNodes?: number
  liveNodeBuffer?: number
} = {}) {
  const props = reactive<Partial<NodeRendererProps>>({
    liveNodeBuffer: options.liveNodeBuffer,
  })

  const total = ref(options.total ?? 100)
  const virtualized = ref(options.virtualized ?? true)
  const maxLiveNodes = ref(options.maxLiveNodes ?? 20)

  const clampSpy = vi.fn(clamp)

  const state = useLiveRangeState(props as Readonly<NodeRendererProps>, {
    parsedNodeCount: computed(() => total.value),
    virtualizationEnabled: computed(() => virtualized.value),
    maxLiveNodesResolved: computed(() => maxLiveNodes.value),
    clamp: clampSpy,
  })

  return {
    props,
    total,
    virtualized,
    maxLiveNodes,
    clampSpy,
    ...state,
  }
}

describe('useLiveRangeState', () => {
  it('starts with focusIndex 0 and an empty live range', () => {
    const h = createHarness()

    expect(h.focusIndex.value).toBe(0)
    expect(h.liveRange.start).toBe(0)
    expect(h.liveRange.end).toBe(0)
  })

  it('uses the default live node buffer when prop is omitted', () => {
    const h = createHarness()

    expect(h.liveNodeBufferResolved.value).toBe(60)
  })

  it('clamps negative live node buffer to 0', () => {
    const h = createHarness({
      liveNodeBuffer: -10,
    })

    expect(h.liveNodeBufferResolved.value).toBe(0)
  })

  it('updates live node buffer when the prop changes', () => {
    const h = createHarness({
      liveNodeBuffer: 5,
    })

    expect(h.liveNodeBufferResolved.value).toBe(5)

    h.props.liveNodeBuffer = 12

    expect(h.liveNodeBufferResolved.value).toBe(12)

    h.props.liveNodeBuffer = -2

    expect(h.liveNodeBufferResolved.value).toBe(0)
  })

  it('uses the full range when virtualization is disabled', () => {
    const h = createHarness({
      total: 42,
      virtualized: false,
      maxLiveNodes: 10,
      liveNodeBuffer: 5,
    })

    h.focusIndex.value = 30
    h.updateLiveRange()

    expect(h.liveRange.start).toBe(0)
    expect(h.liveRange.end).toBe(42)
  })

  it('sets an empty range when there are no parsed nodes', () => {
    const h = createHarness({
      total: 0,
      virtualized: true,
      maxLiveNodes: 10,
      liveNodeBuffer: 5,
    })

    h.focusIndex.value = 5
    h.updateLiveRange()

    expect(h.liveRange.start).toBe(0)
    expect(h.liveRange.end).toBe(0)
  })

  it('starts at 0 when focusIndex is within the buffer', () => {
    const h = createHarness({
      total: 100,
      virtualized: true,
      maxLiveNodes: 20,
      liveNodeBuffer: 10,
    })

    h.focusIndex.value = 8
    h.updateLiveRange()

    expect(h.liveRange.start).toBe(0)
    expect(h.liveRange.end).toBe(20)
  })

  it('positions the live range from focusIndex minus buffer', () => {
    const h = createHarness({
      total: 100,
      virtualized: true,
      maxLiveNodes: 20,
      liveNodeBuffer: 5,
    })

    h.focusIndex.value = 30
    h.updateLiveRange()

    expect(h.liveRange.start).toBe(25)
    expect(h.liveRange.end).toBe(45)
  })

  it('clamps the start to total minus window size near the end', () => {
    const h = createHarness({
      total: 100,
      virtualized: true,
      maxLiveNodes: 20,
      liveNodeBuffer: 5,
    })

    h.focusIndex.value = 98
    h.updateLiveRange()

    expect(h.liveRange.start).toBe(80)
    expect(h.liveRange.end).toBe(100)
  })

  it('uses the full node count when maxLiveNodes is larger than total', () => {
    const h = createHarness({
      total: 12,
      virtualized: true,
      maxLiveNodes: 50,
      liveNodeBuffer: 5,
    })

    h.focusIndex.value = 10
    h.updateLiveRange()

    expect(h.liveRange.start).toBe(0)
    expect(h.liveRange.end).toBe(12)
  })

  it('uses zero buffer as an exact focus start when possible', () => {
    const h = createHarness({
      total: 100,
      virtualized: true,
      maxLiveNodes: 20,
      liveNodeBuffer: 0,
    })

    h.focusIndex.value = 30
    h.updateLiveRange()

    expect(h.liveRange.start).toBe(30)
    expect(h.liveRange.end).toBe(50)
  })

  it('reacts to parsed node count changes', () => {
    const h = createHarness({
      total: 100,
      virtualized: true,
      maxLiveNodes: 20,
      liveNodeBuffer: 5,
    })

    h.focusIndex.value = 90
    h.updateLiveRange()

    expect(h.liveRange.start).toBe(80)
    expect(h.liveRange.end).toBe(100)

    h.total.value = 30
    h.updateLiveRange()

    expect(h.liveRange.start).toBe(10)
    expect(h.liveRange.end).toBe(30)
  })

  it('reacts to max live node changes', () => {
    const h = createHarness({
      total: 100,
      virtualized: true,
      maxLiveNodes: 20,
      liveNodeBuffer: 5,
    })

    h.focusIndex.value = 40
    h.updateLiveRange()

    expect(h.liveRange.start).toBe(35)
    expect(h.liveRange.end).toBe(55)

    h.maxLiveNodes.value = 10
    h.updateLiveRange()

    expect(h.liveRange.start).toBe(35)
    expect(h.liveRange.end).toBe(45)
  })

  it('reacts to virtualization toggling', () => {
    const h = createHarness({
      total: 100,
      virtualized: true,
      maxLiveNodes: 20,
      liveNodeBuffer: 5,
    })

    h.focusIndex.value = 40
    h.updateLiveRange()

    expect(h.liveRange.start).toBe(35)
    expect(h.liveRange.end).toBe(55)

    h.virtualized.value = false
    h.updateLiveRange()

    expect(h.liveRange.start).toBe(0)
    expect(h.liveRange.end).toBe(100)

    h.virtualized.value = true
    h.updateLiveRange()

    expect(h.liveRange.start).toBe(35)
    expect(h.liveRange.end).toBe(55)
  })

  it('uses the injected clamp helper for virtualized ranges', () => {
    const h = createHarness({
      total: 100,
      virtualized: true,
      maxLiveNodes: 20,
      liveNodeBuffer: 5,
    })

    h.focusIndex.value = 40
    h.updateLiveRange()

    expect(h.clampSpy).toHaveBeenCalledWith(35, 0, 80)
  })
})
