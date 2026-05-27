import type { ComputedRef, Ref } from 'vue'
import type { NodeRendererProps } from '../../../types/node-renderer-props'
import { computed, reactive, ref } from 'vue'

export interface LiveRange {
  start: number
  end: number
}

export interface LiveRangeStateOptions {
  parsedNodeCount: ComputedRef<number>
  virtualizationEnabled: ComputedRef<boolean>
  maxLiveNodesResolved: ComputedRef<number>
  clamp: (value: number, min: number, max: number) => number
}

export interface LiveRangeState {
  liveNodeBufferResolved: ComputedRef<number>
  focusIndex: Ref<number>
  liveRange: LiveRange
  updateLiveRange: () => void
}

export function useLiveRangeState(
  props: Readonly<NodeRendererProps>,
  options: LiveRangeStateOptions,
): LiveRangeState {
  const {
    parsedNodeCount,
    virtualizationEnabled,
    maxLiveNodesResolved,
    clamp,
  } = options

  const liveNodeBufferResolved = computed(() => {
    return Math.max(0, props.liveNodeBuffer ?? 60)
  })

  const focusIndex = ref(0)

  const liveRange = reactive<LiveRange>({
    start: 0,
    end: 0,
  })

  function updateLiveRange() {
    const total = parsedNodeCount.value

    if (!virtualizationEnabled.value || total === 0) {
      liveRange.start = 0
      liveRange.end = total
      return
    }

    const windowSize = Math.min(maxLiveNodesResolved.value, total)
    const buffer = liveNodeBufferResolved.value
    const desiredStart = clamp(
      focusIndex.value - buffer,
      0,
      Math.max(0, total - windowSize),
    )

    liveRange.start = desiredStart
    liveRange.end = Math.min(total, desiredStart + windowSize)
  }

  return {
    liveNodeBufferResolved,
    focusIndex,
    liveRange,
    updateLiveRange,
  }
}
