import type { ComputedRef, Ref } from 'vue'
import type { MarkstreamInternalHeightCache } from '../../../types/node-renderer-props'
import { computed, reactive, ref } from 'vue'

export interface HeightMeasurementsOptions {
  onHeightRecorded?: () => void
}

export interface HeightMeasurements {
  nodeHeights: Record<number, number>
  heightStats: {
    total: number
    count: number
  }
  heightTreeSize: Ref<number>
  heightSumTree: Ref<number[]>
  heightKnownTree: Ref<number[]>
  averageNodeHeight: ComputedRef<number>

  resetHeightMeasurements: () => void
  pruneHeightMeasurements: (size: number) => void
  rebuildHeightTrees: (size: number) => void
  syncHeightTreeSize: (size: number) => void
  recordNodeHeight: (index: number, height: number, options?: { allowShrink?: boolean }) => void
  removeNodeHeight: (index: number, options?: { notify?: boolean }) => boolean
  removeNodeHeights: (indices: Iterable<number>, options?: { notify?: boolean }) => number
  exportHeightCache: () => MarkstreamInternalHeightCache
  importHeightCache: (cache: MarkstreamInternalHeightCache, options?: { mode?: 'replace' | 'merge' }) => void

  fenwickRangeSum: (tree: number[], start: number, end: number) => number
}

export function useHeightMeasurements(
  options: HeightMeasurementsOptions = {},
): HeightMeasurements {
  const nodeHeights = reactive<Record<number, number>>({})
  const heightStats = reactive({ total: 0, count: 0 })
  const heightTreeSize = ref(0)
  const heightSumTree = ref<number[]>([])
  const heightKnownTree = ref<number[]>([])

  function resetHeightMeasurements() {
    for (const key of Object.keys(nodeHeights))
      delete nodeHeights[Number(key)]

    heightStats.total = 0
    heightStats.count = 0
    heightTreeSize.value = 0
    heightSumTree.value = []
    heightKnownTree.value = []
  }

  function pruneHeightMeasurements(size: number) {
    if (size <= 0) {
      resetHeightMeasurements()
      return
    }

    let total = 0
    let count = 0

    for (const [rawIndex, rawHeight] of Object.entries(nodeHeights)) {
      const index = Number(rawIndex)
      const height = Number(rawHeight)

      if (
        !Number.isFinite(index)
        || index < 0
        || index >= size
        || !Number.isFinite(height)
        || height <= 0
      ) {
        delete nodeHeights[index]
        continue
      }

      total += height
      count++
    }

    heightStats.total = total
    heightStats.count = count
  }

  function fenwickUpdate(tree: number[], index: number, delta: number) {
    for (let i = index + 1; i < tree.length; i += i & -i)
      tree[i] += delta
  }

  function fenwickQuery(tree: number[], index: number) {
    let sum = 0

    for (let i = index + 1; i > 0; i -= i & -i)
      sum += tree[i]

    return sum
  }

  function fenwickRangeSum(tree: number[], start: number, end: number) {
    if (end <= start)
      return 0

    const endSum = fenwickQuery(tree, end - 1)

    if (start <= 0)
      return endSum

    return endSum - fenwickQuery(tree, start - 1)
  }

  function rebuildHeightTrees(size: number) {
    heightTreeSize.value = size

    const sumTree = new Array(size + 1).fill(0)
    const countTree = new Array(size + 1).fill(0)

    for (const [rawIndex, rawHeight] of Object.entries(nodeHeights)) {
      const index = Number(rawIndex)
      const height = Number(rawHeight)

      if (!Number.isFinite(index) || index < 0 || index >= size)
        continue

      if (!Number.isFinite(height) || height <= 0)
        continue

      fenwickUpdate(sumTree, index, height)
      fenwickUpdate(countTree, index, 1)
    }

    heightSumTree.value = sumTree
    heightKnownTree.value = countTree
  }

  /**
   * Bring the Fenwick trees in sync with a new total node count.
   *
   * Growing the dataset (streaming append) extends the trees in place: Fenwick
   * entries are indexed by node position, so existing prefix sums stay valid
   * and only the new slots need zeroing. This avoids the O(measured)-per-commit
   * full rebuild that previously ran on every append. Shrinks and the first
   * build still do a full rebuild (rare paths).
   */
  function syncHeightTreeSize(size: number) {
    const prevSize = heightTreeSize.value
    if (size === prevSize)
      return

    if (size < prevSize || prevSize === 0) {
      rebuildHeightTrees(size)
      return
    }

    const sumTree = heightSumTree.value
    const countTree = heightKnownTree.value

    sumTree.length = size + 1
    countTree.length = size + 1
    for (let i = prevSize + 1; i <= size; i++) {
      sumTree[i] = 0
      countTree[i] = 0
    }

    // A Fenwick update path that previously stopped at the old array boundary
    // now extends into the newly added slots. Re-apply the tail of every
    // measured node's update path so range sums over the grown portion (and
    // queries that land on the new boundary slots) see the full values.
    const oldBound = prevSize + 1
    for (const [rawIndex, rawHeight] of Object.entries(nodeHeights)) {
      const index = Number(rawIndex)
      const height = Number(rawHeight)

      if (!Number.isFinite(index) || index < 0 || index >= size)
        continue

      if (!Number.isFinite(height) || height <= 0)
        continue

      let i = index + 1
      while (i < oldBound)
        i += i & -i
      for (; i <= size; i += i & -i) {
        sumTree[i] += height
        countTree[i] += 1
      }
    }

    heightTreeSize.value = size
  }

  function recomputeHeightStats() {
    let total = 0
    let count = 0
    const boundedSize = heightTreeSize.value

    for (const [rawIndex, rawHeight] of Object.entries(nodeHeights)) {
      const index = Number(rawIndex)
      const height = Number(rawHeight)

      if (
        !Number.isFinite(index)
        || index < 0
        || (boundedSize > 0 && index >= boundedSize)
        || !Number.isFinite(height)
        || height <= 0
      ) {
        delete nodeHeights[index]
        continue
      }

      total += height
      count++
    }

    heightStats.total = total
    heightStats.count = count
  }

  function recordNodeHeightInternal(
    index: number,
    height: number,
    recordOptions: {
      allowShrink?: boolean
      notify?: boolean
    } = {},
  ) {
    if (!Number.isFinite(height) || height <= 0)
      return false

    const previous = nodeHeights[index]
    if (previous) {
      if (recordOptions.allowShrink === false && height < previous)
        return false

      if (Math.abs(height - previous) <= 1)
        return false
    }

    nodeHeights[index] = height

    if (previous) {
      heightStats.total += height - previous
    }
    else {
      heightStats.total += height
      heightStats.count++
    }

    if (heightTreeSize.value > index) {
      const sumTree = heightSumTree.value
      const countTree = heightKnownTree.value

      if (sumTree.length && countTree.length) {
        if (previous) {
          const delta = height - previous

          if (delta !== 0)
            fenwickUpdate(sumTree, index, delta)
        }
        else {
          fenwickUpdate(sumTree, index, height)
          fenwickUpdate(countTree, index, 1)
        }
      }
    }

    if (recordOptions.notify !== false)
      options.onHeightRecorded?.()

    return true
  }

  function recordNodeHeight(index: number, height: number, recordOptions: { allowShrink?: boolean } = {}) {
    recordNodeHeightInternal(index, height, {
      ...recordOptions,
      notify: true,
    })
  }

  function removeNodeHeightInternal(index: number) {
    if (!Number.isInteger(index) || index < 0)
      return false

    const previous = nodeHeights[index]
    if (!Number.isFinite(previous) || previous <= 0)
      return false

    delete nodeHeights[index]
    heightStats.total = Math.max(0, heightStats.total - previous)
    heightStats.count = Math.max(0, heightStats.count - 1)

    if (heightTreeSize.value > index) {
      const sumTree = heightSumTree.value
      const countTree = heightKnownTree.value

      if (sumTree.length && countTree.length) {
        fenwickUpdate(sumTree, index, -previous)
        fenwickUpdate(countTree, index, -1)
      }
    }

    return true
  }

  function removeNodeHeight(index: number, removeOptions: { notify?: boolean } = {}) {
    const changed = removeNodeHeightInternal(index)
    if (changed && removeOptions.notify !== false)
      options.onHeightRecorded?.()
    return changed
  }

  function removeNodeHeights(indices: Iterable<number>, removeOptions: { notify?: boolean } = {}) {
    let removed = 0

    for (const rawIndex of indices) {
      const index = Number(rawIndex)
      if (removeNodeHeightInternal(index))
        removed++
    }

    if (removed > 0 && removeOptions.notify !== false)
      options.onHeightRecorded?.()

    return removed
  }

  function exportHeightCache(): MarkstreamInternalHeightCache {
    return Object.entries(nodeHeights)
      .map(([rawIndex, rawHeight]) => ({
        index: Number(rawIndex),
        height: Number(rawHeight),
      }))
      .filter(entry => Number.isFinite(entry.index) && entry.index >= 0 && Number.isFinite(entry.height) && entry.height > 0)
      .sort((a, b) => a.index - b.index)
  }

  function importHeightCache(cache: MarkstreamInternalHeightCache, importOptions: { mode?: 'replace' | 'merge' } = {}) {
    if (!Array.isArray(cache))
      return

    const targetTreeSize = heightTreeSize.value
    let changed = false

    if (importOptions.mode !== 'merge') {
      const existingKeys = Object.keys(nodeHeights)
      if (existingKeys.length > 0) {
        for (const key of existingKeys)
          delete nodeHeights[Number(key)]
        changed = true
      }
    }

    for (const entry of cache) {
      const index = Number(entry.index)
      const height = Number(entry.height)

      if (!Number.isInteger(index) || index < 0)
        continue

      if (targetTreeSize > 0 && index >= targetTreeSize)
        continue

      if (!Number.isFinite(height) || height <= 0)
        continue

      const previous = nodeHeights[index]
      if (previous && Math.abs(previous - height) <= 1)
        continue

      nodeHeights[index] = height
      changed = true
    }

    if (!changed)
      return

    recomputeHeightStats()

    if (targetTreeSize > 0)
      rebuildHeightTrees(targetTreeSize)

    options.onHeightRecorded?.()
  }

  const averageNodeHeight = computed(() => {
    return heightStats.count > 0
      ? Math.max(12, heightStats.total / heightStats.count)
      : 32
  })

  return {
    nodeHeights,
    heightStats,
    heightTreeSize,
    heightSumTree,
    heightKnownTree,
    averageNodeHeight,

    resetHeightMeasurements,
    pruneHeightMeasurements,
    rebuildHeightTrees,
    syncHeightTreeSize,
    recordNodeHeight,
    removeNodeHeight,
    removeNodeHeights,
    exportHeightCache,
    importHeightCache,

    fenwickRangeSum,
  }
}
