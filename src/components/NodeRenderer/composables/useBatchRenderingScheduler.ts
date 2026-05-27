import type { ComputedRef, Ref } from 'vue'
import type { NodeRendererProps } from '../../../types/node-renderer-props'
import { watch } from 'vue'

export interface IdleDeadlineLike {
  timeRemaining?: () => number
}

export interface BatchRenderingSchedulerOptions {
  props: Readonly<NodeRendererProps>
  isClient: boolean
  isTestEnv: boolean

  parsedNodesIdentity: ComputedRef<unknown>
  parsedNodeCount: ComputedRef<number>
  desiredRenderedCount: ComputedRef<number>

  batchingEnabled: ComputedRef<boolean>
  incrementalRenderingActive: ComputedRef<boolean>
  resolvedBatchSize: ComputedRef<number>
  resolvedInitialBatch: ComputedRef<number>

  renderedCount: Ref<number>
  adaptiveBatchSize: Ref<number>
  previousRenderContext: Ref<{
    key: NodeRendererProps['indexKey']
    total: number
  }>
  previousBatchConfig: Ref<{
    batchSize: number
    initial: number
    delay: number
    enabled: boolean
  }>

  requestFrame: typeof window.requestAnimationFrame | null
  cancelFrame: typeof window.cancelAnimationFrame | null
  hasIdleCallback: boolean

  cleanupNodeVisibility: (maxIndex: number) => void
  onDatasetKeyChanged: (total: number) => void
  onDatasetChanged: () => void
}

export interface BatchRenderingScheduler {
  cleanupBatchScheduler: () => void
}

export function useBatchRenderingScheduler(
  options: BatchRenderingSchedulerOptions,
): BatchRenderingScheduler {
  const {
    props,
    isClient,
    isTestEnv,
    parsedNodesIdentity,
    parsedNodeCount,
    desiredRenderedCount,
    batchingEnabled,
    incrementalRenderingActive,
    resolvedBatchSize,
    resolvedInitialBatch,
    renderedCount,
    adaptiveBatchSize,
    previousRenderContext,
    previousBatchConfig,
    requestFrame,
    cancelFrame,
    hasIdleCallback,
    cleanupNodeVisibility,
    onDatasetKeyChanged,
    onDatasetChanged,
  } = options

  let batchRaf: number | null = null
  let batchTimeout: number | null = null
  let batchPending = false
  let pendingIncrement: number | null = null
  let batchIdle: number | null = null

  function cleanupBatchScheduler() {
    if (!isClient)
      return
    if (batchRaf != null) {
      cancelFrame?.(batchRaf)
      batchRaf = null
    }
    if (batchTimeout != null) {
      window.clearTimeout(batchTimeout)
      batchTimeout = null
    }
    if (batchIdle != null && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(batchIdle)
      batchIdle = null
    }
    batchPending = false
    pendingIncrement = null
  }

  function scheduleBatch(increment: number, opts: { immediate?: boolean } = {}) {
    if (!incrementalRenderingActive.value)
      return
    const target = desiredRenderedCount.value
    if (renderedCount.value >= target)
      return

    const amount = Math.max(1, increment)
    const run = (deadline?: IdleDeadlineLike) => {
      batchRaf = null
      batchTimeout = null
      batchIdle = null
      batchPending = false
      const applied = pendingIncrement != null ? pendingIncrement : amount
      pendingIncrement = null
      const budgetMs = Math.max(2, props.renderBatchBudgetMs ?? 6)

      const applyAndMeasure = (size: number) => {
        const start = typeof performance !== 'undefined' ? performance.now() : Date.now()
        renderedCount.value = Math.min(target, renderedCount.value + Math.max(1, size))
        cleanupNodeVisibility(renderedCount.value)
        const end = typeof performance !== 'undefined' ? performance.now() : Date.now()
        const elapsed = end - start
        adjustAdaptiveBatchSize(elapsed)
        return elapsed
      }

      let nextSize = applied
      while (true) {
        applyAndMeasure(nextSize)
        if (renderedCount.value >= target)
          break
        if (!deadline)
          break
        const remaining = typeof deadline.timeRemaining === 'function'
          ? deadline.timeRemaining()
          : 0
        if (remaining <= budgetMs * 0.5)
          break
        nextSize = Math.max(1, Math.round(adaptiveBatchSize.value))
      }

      if (renderedCount.value < target)
        queueNextBatch()
    }

    if (!isClient || opts.immediate) {
      run()
      return
    }

    const delay = Math.max(0, props.renderBatchDelay ?? 16)
    pendingIncrement = pendingIncrement != null ? Math.max(pendingIncrement, amount) : amount
    if (batchPending)
      return
    batchPending = true

    if (!isTestEnv && hasIdleCallback && window.requestIdleCallback) {
      const timeout = Math.max(0, props.renderBatchIdleTimeoutMs ?? 120)
      batchIdle = window.requestIdleCallback((deadline) => {
        run(deadline)
      }, { timeout })
      return
    }

    if (!requestFrame || isTestEnv) {
      batchTimeout = window.setTimeout(() => run(), delay)
      return
    }
    batchRaf = requestFrame(() => {
      if (delay === 0) {
        run()
        return
      }
      batchTimeout = window.setTimeout(() => run(), delay)
    })
  }

  function queueNextBatch() {
    if (!incrementalRenderingActive.value)
      return
    const dynamicSize = batchingEnabled.value
      ? Math.max(1, Math.round(adaptiveBatchSize.value))
      : Math.max(1, resolvedBatchSize.value)
    scheduleBatch(dynamicSize)
  }

  function adjustAdaptiveBatchSize(elapsed: number) {
    if (!incrementalRenderingActive.value)
      return
    const budget = Math.max(2, props.renderBatchBudgetMs ?? 6)
    const maxSize = Math.max(1, resolvedBatchSize.value || 1)
    const minSize = Math.max(1, Math.floor(maxSize / 4))
    if (elapsed > budget * 1.2) {
      adaptiveBatchSize.value = Math.max(minSize, Math.floor(adaptiveBatchSize.value * 0.7))
    }
    else if (elapsed < budget * 0.5 && adaptiveBatchSize.value < maxSize) {
      adaptiveBatchSize.value = Math.min(maxSize, Math.ceil(adaptiveBatchSize.value * 1.2))
    }
  }

  watch(
    [
      parsedNodesIdentity,
      parsedNodeCount,
      incrementalRenderingActive,
      resolvedBatchSize,
      resolvedInitialBatch,
      () => props.renderBatchDelay,
      () => props.indexKey,
    ],
    () => {
      const total = parsedNodeCount.value
      const prevCtx = previousRenderContext.value
      const datasetKey = props.indexKey
      const datasetKeyChanged = datasetKey !== undefined && datasetKey !== prevCtx.key
      const lengthChanged = total !== prevCtx.total
      const datasetChanged = datasetKeyChanged || lengthChanged
      previousRenderContext.value = { key: datasetKey, total }

      const prevBatch = previousBatchConfig.value
      const currentDelay = props.renderBatchDelay ?? 16
      const batchConfigChanged
        = prevBatch.batchSize !== resolvedBatchSize.value
          || prevBatch.initial !== resolvedInitialBatch.value
          || prevBatch.delay !== currentDelay
          || prevBatch.enabled !== incrementalRenderingActive.value

      previousBatchConfig.value = {
        batchSize: resolvedBatchSize.value,
        initial: resolvedInitialBatch.value,
        delay: currentDelay,
        enabled: incrementalRenderingActive.value,
      }

      if (datasetKeyChanged)
        onDatasetKeyChanged(total)
      if (datasetChanged || batchConfigChanged || !incrementalRenderingActive.value)
        cleanupBatchScheduler()
      if (datasetChanged || batchConfigChanged)
        adaptiveBatchSize.value = Math.max(1, resolvedBatchSize.value || 1)
      if (datasetChanged)
        onDatasetChanged()

      const targetCount = desiredRenderedCount.value

      if (!total) {
        renderedCount.value = 0
        cleanupNodeVisibility(0)
        return
      }

      if (!incrementalRenderingActive.value) {
        renderedCount.value = targetCount
        cleanupNodeVisibility(renderedCount.value)
        return
      }

      const shouldResetRenderedCount = datasetKeyChanged || prevCtx.total === 0

      if (shouldResetRenderedCount || batchConfigChanged)
        renderedCount.value = Math.min(targetCount, resolvedInitialBatch.value)
      else
        renderedCount.value = Math.min(renderedCount.value, targetCount)

      const baseInitial = Math.max(1, resolvedInitialBatch.value || resolvedBatchSize.value || total)
      if (renderedCount.value < targetCount)
        scheduleBatch(baseInitial, { immediate: !isClient })
      else
        cleanupNodeVisibility(renderedCount.value)
    },
    { immediate: true },
  )

  watch(
    desiredRenderedCount,
    (target, prev) => {
      if (!incrementalRenderingActive.value)
        return
      if (typeof prev === 'number' && target <= prev)
        return
      if (target > renderedCount.value)
        queueNextBatch()
    },
  )

  return {
    cleanupBatchScheduler,
  }
}
