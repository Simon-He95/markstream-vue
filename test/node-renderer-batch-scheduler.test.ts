/**
 * @vitest-environment jsdom
 */

import type { NodeRendererProps } from '../src/types/node-renderer-props'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, nextTick, reactive, ref } from 'vue'
import { useBatchRenderingScheduler } from '../src/components/NodeRenderer/composables/useBatchRenderingScheduler'

type SchedulerProps = Pick<
  NodeRendererProps,
  'indexKey' | 'renderBatchDelay' | 'renderBatchIdleTimeoutMs' | 'renderBatchBudgetMs'
>

function makeNodes(count: number) {
  return Array.from({ length: count }, (_, index) => ({ index }))
}

const cleanupFns: Array<() => void> = []

function createHarness(options: {
  total?: number
  initialBatch?: number
  batchSize?: number
  delay?: number
  incremental?: boolean
} = {}) {
  const props = reactive<SchedulerProps>({
    indexKey: 'message-1',
    renderBatchDelay: options.delay ?? 10,
    renderBatchIdleTimeoutMs: 120,
    renderBatchBudgetMs: 6,
  })

  const parsedNodes = ref(makeNodes(options.total ?? 8))
  const parsedNodesIdentity = computed(() => parsedNodes.value)
  const parsedNodeCount = computed(() => parsedNodes.value.length)
  const desiredRenderedCount = computed(() => parsedNodeCount.value)

  const batchingEnabled = computed(() => true)
  const incremental = ref(options.incremental ?? true)
  const incrementalRenderingActive = computed(() => incremental.value)

  const resolvedBatchSize = computed(() => options.batchSize ?? 2)
  const resolvedInitialBatch = computed(() => options.initialBatch ?? 2)

  const renderedCount = ref(0)
  const adaptiveBatchSize = ref(Math.max(1, resolvedBatchSize.value || 1))

  const previousRenderContext = ref<{
    key: NodeRendererProps['indexKey']
    total: number
  }>({
    key: props.indexKey,
    total: 0,
  })

  const previousBatchConfig = ref({
    batchSize: resolvedBatchSize.value,
    initial: resolvedInitialBatch.value,
    delay: props.renderBatchDelay ?? 16,
    enabled: incrementalRenderingActive.value,
  })

  const cleanupNodeVisibility = vi.fn()
  const onDatasetKeyChanged = vi.fn()
  const onDatasetChanged = vi.fn()

  const scope = effectScope()
  let scheduler: ReturnType<typeof useBatchRenderingScheduler> | undefined

  scope.run(() => {
    scheduler = useBatchRenderingScheduler({
      props: props as Readonly<NodeRendererProps>,
      isClient: true,
      isTestEnv: false,

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

      requestFrame: null,
      cancelFrame: null,
      hasIdleCallback: false,

      cleanupNodeVisibility,
      onDatasetKeyChanged,
      onDatasetChanged,
    })
  })

  cleanupFns.push(() => {
    scheduler?.cleanupBatchScheduler()
    scope.stop()
  })

  return {
    props,
    parsedNodes,
    incremental,
    renderedCount,
    adaptiveBatchSize,
    cleanupNodeVisibility,
    onDatasetKeyChanged,
    onDatasetChanged,
  }
}

describe('useBatchRenderingScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    for (const cleanup of cleanupFns.splice(0))
      cleanup()

    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('advances renderedCount in configured batches', async () => {
    const h = createHarness({
      total: 8,
      initialBatch: 2,
      batchSize: 2,
      delay: 10,
    })

    expect(h.renderedCount.value).toBe(2)

    vi.advanceTimersByTime(10)
    await nextTick()
    expect(h.renderedCount.value).toBe(4)

    vi.advanceTimersByTime(10)
    await nextTick()
    expect(h.renderedCount.value).toBe(6)

    vi.advanceTimersByTime(10)
    await nextTick()
    expect(h.renderedCount.value).toBe(8)

    expect(h.cleanupNodeVisibility).toHaveBeenLastCalledWith(8)
  })

  it('continues scheduling when desired rendered count grows', async () => {
    const h = createHarness({
      total: 4,
      initialBatch: 2,
      batchSize: 2,
      delay: 10,
    })

    expect(h.renderedCount.value).toBe(2)

    vi.advanceTimersByTime(10)
    await nextTick()
    expect(h.renderedCount.value).toBe(4)

    h.parsedNodes.value = makeNodes(7)
    await nextTick()

    vi.advanceTimersByTime(10)
    await nextTick()
    expect(h.renderedCount.value).toBe(6)

    vi.advanceTimersByTime(10)
    await nextTick()
    expect(h.renderedCount.value).toBe(7)

    expect(h.cleanupNodeVisibility).toHaveBeenLastCalledWith(7)
  })

  it('resets batch state when the dataset key changes', async () => {
    const h = createHarness({
      total: 8,
      initialBatch: 2,
      batchSize: 2,
      delay: 10,
    })

    vi.advanceTimersByTime(10)
    await nextTick()
    expect(h.renderedCount.value).toBe(4)

    h.props.indexKey = 'message-2'
    await nextTick()

    expect(h.onDatasetKeyChanged).toHaveBeenCalledWith(8)
    expect(h.onDatasetChanged).toHaveBeenCalled()
    expect(h.renderedCount.value).toBe(2)

    vi.advanceTimersByTime(10)
    await nextTick()
    expect(h.renderedCount.value).toBe(4)
  })

  it('renders everything immediately when incremental rendering is disabled', async () => {
    const h = createHarness({
      total: 6,
      incremental: false,
    })

    await nextTick()

    expect(h.renderedCount.value).toBe(6)
    expect(h.cleanupNodeVisibility).toHaveBeenLastCalledWith(6)
  })
})
