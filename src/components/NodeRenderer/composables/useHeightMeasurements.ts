import type { ComputedRef, Ref } from 'vue'
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
  recordNodeHeight: (index: number, height: number, options?: { allowShrink?: boolean }) => void

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

  function recordNodeHeight(index: number, height: number, recordOptions: { allowShrink?: boolean } = {}) {
    if (!Number.isFinite(height) || height <= 0)
      return

    const previous = nodeHeights[index]
    if (previous) {
      if (recordOptions.allowShrink === false && height < previous)
        return

      if (Math.abs(height - previous) <= 1)
        return
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
    recordNodeHeight,

    fenwickRangeSum,
  }
}
