import type { ComputedRef } from 'vue'
import type { NodeRendererProps } from '../../../types/node-renderer-props'
import { computed, ref } from 'vue'

export interface BatchRenderingStateOptions {
  isClient: boolean
  isTestEnv: boolean
  renderAsFragment: ComputedRef<boolean>
}

export interface BatchRenderingState {
  resolvedBatchSize: ComputedRef<number>
  resolvedInitialBatch: ComputedRef<number>
  batchingEnabled: ComputedRef<boolean>
  incrementalRenderingActive: ComputedRef<boolean>
  renderedCount: ReturnType<typeof ref<number>>
  previousRenderContext: ReturnType<typeof ref<{
    key: NodeRendererProps['indexKey']
    total: number
  }>>
  adaptiveBatchSize: ReturnType<typeof ref<number>>
  previousBatchConfig: ReturnType<typeof ref<{
    batchSize: number
    initial: number
    delay: number
    enabled: boolean
  }>>
}

export function useBatchRenderingState(
  props: Readonly<NodeRendererProps>,
  options: BatchRenderingStateOptions,
): BatchRenderingState {
  const resolvedBatchSize = computed(() => {
    const size = Math.trunc(props.renderBatchSize ?? 80)
    return Number.isFinite(size) ? Math.max(0, size) : 0
  })

  const resolvedInitialBatch = computed(() => {
    const initial = Math.trunc(
      props.initialRenderBatchSize ?? resolvedBatchSize.value,
    )

    if (!Number.isFinite(initial))
      return resolvedBatchSize.value

    return Math.max(0, initial)
  })

  const batchingEnabled = computed(() => {
    return !options.renderAsFragment.value
      && props.batchRendering !== false
      && resolvedBatchSize.value > 0
      && options.isClient
      && !options.isTestEnv
  })

  const renderedCount = ref(0)

  const previousRenderContext = ref<{
    key: NodeRendererProps['indexKey']
    total: number
  }>({
    key: props.indexKey,
    total: 0,
  })

  const adaptiveBatchSize = ref(
    Math.max(1, resolvedBatchSize.value || 1),
  )

  const incrementalRenderingActive = computed(() => {
    return batchingEnabled.value && (props.maxLiveNodes ?? 0) <= 0
  })

  const previousBatchConfig = ref({
    batchSize: resolvedBatchSize.value,
    initial: resolvedInitialBatch.value,
    delay: props.renderBatchDelay ?? 16,
    enabled: incrementalRenderingActive.value,
  })

  return {
    resolvedBatchSize,
    resolvedInitialBatch,
    batchingEnabled,
    incrementalRenderingActive,
    renderedCount,
    previousRenderContext,
    adaptiveBatchSize,
    previousBatchConfig,
  }
}
