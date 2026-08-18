import type { ComputedRef, Ref } from 'vue'
import type { NodeRendererProps } from '../../../types/node-renderer-props'
import { nextTick, watch } from 'vue'

export interface BatchRenderingSchedulerOptions {
  props: Readonly<NodeRendererProps>
  isClient: boolean
  isTestEnv: boolean

  parsedNodesIdentity: ComputedRef<unknown>
  parsedNodeCount: ComputedRef<number>
  desiredRenderedCount: ComputedRef<number>
  datasetKey: ComputedRef<unknown>

  batchingEnabled: ComputedRef<boolean>
  incrementalRenderingActive: ComputedRef<boolean>
  resolvedBatchSize: ComputedRef<number>
  resolvedInitialBatch: ComputedRef<number>

  renderedCount: Ref<number>
  adaptiveBatchSize: Ref<number>
  previousRenderContext: Ref<{
    key: unknown
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
    datasetKey,
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

  // Consolidated scheduling state
  let scheduleId: number | null = null
  let scheduleType: 'raf' | 'idle' | 'timeout' = 'raf'
  let pendingIncrement: number | null = null
  let commitMeasurementGeneration = 0
  let commitMeasurementPending = false
  let followupBatchRequested = false
  const commitMeasurementRafs = new Set<number>()
  const commitMeasurementTimeouts = new Set<number>()

  function cleanupBatchScheduler() {
    if (!isClient)
      return

    // Cancel current schedule
    if (scheduleId != null) {
      if (scheduleType === 'raf' && cancelFrame) {
        cancelFrame(scheduleId)
      }
      else if (scheduleType === 'idle' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(scheduleId)
      }
      else if (scheduleType === 'timeout') {
        window.clearTimeout(scheduleId)
      }
      scheduleId = null
    }

    // Cancel commit measurements
    commitMeasurementGeneration += 1
    for (const id of commitMeasurementRafs) {
      if (cancelFrame)
        cancelFrame(id)
    }
    for (const id of commitMeasurementTimeouts)
      window.clearTimeout(id)
    commitMeasurementRafs.clear()
    commitMeasurementTimeouts.clear()

    pendingIncrement = null
    commitMeasurementPending = false
    followupBatchRequested = false
  }

  function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now()
  }

  function finishCommitMeasurement(measuredCost: number) {
    adjustAdaptiveBatchSize(measuredCost)
    commitMeasurementPending = false

    const shouldContinue = followupBatchRequested || renderedCount.value < desiredRenderedCount.value
    followupBatchRequested = false

    if (shouldContinue)
      queueNextBatchNow()
  }

  function measureBatchPostFlushCost(start: number, syncElapsed: number) {
    if (!isClient) {
      finishCommitMeasurement(syncElapsed)
      return
    }

    commitMeasurementPending = true
    const generation = ++commitMeasurementGeneration

    void nextTick().then(() => {
      if (generation !== commitMeasurementGeneration)
        return

      const afterFlush = now()
      const measuredCost = Math.max(syncElapsed, afterFlush - start)

      const finish = () => {
        if (generation !== commitMeasurementGeneration)
          return
        finishCommitMeasurement(measuredCost)
      }

      // Single frame boundary without nested RAF
      if (requestFrame) {
        let frameId: number | null = null
        let timeoutId: number | null = null
        let finished = false

        const finishOnce = () => {
          if (finished)
            return
          finished = true

          if (frameId !== null) {
            commitMeasurementRafs.delete(frameId)
            frameId = null
          }
          if (timeoutId !== null) {
            commitMeasurementTimeouts.delete(timeoutId)
            window.clearTimeout(timeoutId)
            timeoutId = null
          }
          finish()
        }

        frameId = requestFrame(() => {
          finishOnce()
        })
        commitMeasurementRafs.add(frameId)

        // Fallback timeout in case RAF is blocked
        timeoutId = window.setTimeout(() => {
          if (frameId !== null && cancelFrame)
            cancelFrame(frameId)
          finishOnce()
        }, Math.max(32, props.renderBatchIdleTimeoutMs ?? 120)) as any
        commitMeasurementTimeouts.add(timeoutId)
        return
      }

      const timeoutId = window.setTimeout(() => {
        commitMeasurementTimeouts.delete(timeoutId as any)
        finish()
      }, 0) as any
      commitMeasurementTimeouts.add(timeoutId)
    })
  }

  function scheduleBatch(increment: number, opts: { immediate?: boolean } = {}) {
    if (!incrementalRenderingActive.value)
      return
    const target = desiredRenderedCount.value
    if (renderedCount.value >= target)
      return

    const amount = Math.max(1, increment)
    const run = () => {
      const runStart = now()
      scheduleId = null

      const applied = pendingIncrement != null ? pendingIncrement : amount
      pendingIncrement = null

      const start = now()
      renderedCount.value = Math.min(target, renderedCount.value + applied)
      cleanupNodeVisibility(renderedCount.value)
      const syncElapsed = now() - start

      measureBatchPostFlushCost(runStart, syncElapsed)
    }

    if (!isClient || opts.immediate) {
      run()
      return
    }

    const delay = Math.max(0, props.renderBatchDelay ?? 16)
    pendingIncrement = pendingIncrement != null ? Math.max(pendingIncrement, amount) : amount

    if (scheduleId != null)
      return // Already scheduled

    // Prioritize idle callback for smooth UX
    if (!isTestEnv && hasIdleCallback && window.requestIdleCallback) {
      const timeout = Math.max(0, props.renderBatchIdleTimeoutMs ?? 120)
      scheduleType = 'idle'
      scheduleId = window.requestIdleCallback(() => run(), { timeout })
      return
    }

    // Use RAF with optional delay - preserve frame alignment like original
    if (requestFrame && !isTestEnv) {
      scheduleType = 'raf'
      scheduleId = requestFrame(() => {
        if (delay === 0) {
          run()
        }
        else {
          // RAF first for frame alignment, then timeout for delay
          scheduleType = 'timeout'
          scheduleId = window.setTimeout(() => run(), delay) as any
        }
      })
      return
    }

    // Fallback to setTimeout
    scheduleType = 'timeout'
    scheduleId = window.setTimeout(() => run(), delay) as any
  }

  function requestNextBatch(
    increment?: number,
    opts: { immediate?: boolean } = {},
  ) {
    if (commitMeasurementPending) {
      followupBatchRequested = true
      return
    }

    if (increment != null) {
      scheduleBatch(increment, opts)
      return
    }

    queueNextBatchNow()
  }

  function queueNextBatchNow() {
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

    if (elapsed > budget * 1.5) {
      adaptiveBatchSize.value = Math.max(minSize, Math.floor(adaptiveBatchSize.value * 0.8))
    }
    else if (elapsed < budget * 0.6 && adaptiveBatchSize.value < maxSize) {
      adaptiveBatchSize.value = Math.min(maxSize, Math.ceil(adaptiveBatchSize.value * 1.2))
    }
  }

  watch(
    [
      parsedNodesIdentity,
      parsedNodeCount,
      datasetKey,
      incrementalRenderingActive,
      resolvedBatchSize,
      resolvedInitialBatch,
      () => props.renderBatchDelay,
    ],
    () => {
      const total = parsedNodeCount.value
      const prevCtx = previousRenderContext.value
      const currentDatasetKey = datasetKey.value
      const datasetKeyChanged = !Object.is(currentDatasetKey, prevCtx.key)
      const lengthChanged = total !== prevCtx.total
      // Streaming append growth (same content identity, node count grew from a
      // non-empty dataset) is NOT a dataset replacement: the adaptive batch
      // size should keep adapting instead of being reset every commit.
      const isPureAppendGrowth
        = lengthChanged && total > prevCtx.total && prevCtx.total > 0 && !datasetKeyChanged
      const datasetChanged = datasetKeyChanged || lengthChanged
      previousRenderContext.value = { key: currentDatasetKey, total }

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
      // NOTE: keep the per-dataset-change cleanup (including pure append
      // growth). Cancelling + rescheduling the in-flight batch also keeps a
      // fresh batch RAF in the queue; removing it measurably changes streaming
      // reveal pacing under interleaved frame queues, so the reschedule cost is
      // intentional.
      if (datasetChanged || batchConfigChanged || !incrementalRenderingActive.value)
        cleanupBatchScheduler()
      // Pure append growth is not a dataset replacement: keep the adaptive
      // batch size adapting (it was previously reset to max on every commit,
      // which made adjustAdaptiveBatchSize dead code) and skip the dataset
      // focus-sync callback.
      if ((datasetChanged && !isPureAppendGrowth) || batchConfigChanged)
        adaptiveBatchSize.value = Math.max(1, resolvedBatchSize.value || 1)
      if (datasetChanged && !isPureAppendGrowth)
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
        requestNextBatch(baseInitial, { immediate: !isClient })
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
        requestNextBatch()
    },
  )

  return {
    cleanupBatchScheduler,
  }
}
