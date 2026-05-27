/**
 * @vitest-environment node
 */

import { describe, expect, it, vi } from 'vitest'
import { useHeightMeasurements } from '../src/components/NodeRenderer/composables/useHeightMeasurements'

describe('useHeightMeasurements', () => {
  it('starts with empty measurements and default average height', () => {
    const h = useHeightMeasurements()

    expect(Object.keys(h.nodeHeights)).toHaveLength(0)
    expect(h.heightStats.total).toBe(0)
    expect(h.heightStats.count).toBe(0)
    expect(h.heightTreeSize.value).toBe(0)
    expect(h.heightSumTree.value).toEqual([])
    expect(h.heightKnownTree.value).toEqual([])
    expect(h.averageNodeHeight.value).toBe(32)
  })

  it('records valid node heights and updates stats and average height', () => {
    const onHeightRecorded = vi.fn()
    const h = useHeightMeasurements({ onHeightRecorded })

    h.recordNodeHeight(0, 20)
    h.recordNodeHeight(1, 40)

    expect(h.nodeHeights[0]).toBe(20)
    expect(h.nodeHeights[1]).toBe(40)
    expect(h.heightStats.total).toBe(60)
    expect(h.heightStats.count).toBe(2)
    expect(h.averageNodeHeight.value).toBe(30)
    expect(onHeightRecorded).toHaveBeenCalledTimes(2)
  })

  it('uses a minimum average height of 12px', () => {
    const h = useHeightMeasurements()

    h.recordNodeHeight(0, 4)
    h.recordNodeHeight(1, 8)

    expect(h.heightStats.total).toBe(12)
    expect(h.heightStats.count).toBe(2)
    expect(h.averageNodeHeight.value).toBe(12)
  })

  it('replacing an existing height adjusts total without increasing count', () => {
    const onHeightRecorded = vi.fn()
    const h = useHeightMeasurements({ onHeightRecorded })

    h.recordNodeHeight(0, 20)
    h.recordNodeHeight(1, 40)
    h.recordNodeHeight(0, 50)

    expect(h.nodeHeights[0]).toBe(50)
    expect(h.nodeHeights[1]).toBe(40)
    expect(h.heightStats.total).toBe(90)
    expect(h.heightStats.count).toBe(2)
    expect(h.averageNodeHeight.value).toBe(45)
    expect(onHeightRecorded).toHaveBeenCalledTimes(3)
  })

  it('ignores invalid heights and does not fire the callback', () => {
    const onHeightRecorded = vi.fn()
    const h = useHeightMeasurements({ onHeightRecorded })

    h.recordNodeHeight(0, 0)
    h.recordNodeHeight(1, -1)
    h.recordNodeHeight(2, Number.NaN)
    h.recordNodeHeight(3, Number.POSITIVE_INFINITY)

    expect(Object.keys(h.nodeHeights)).toHaveLength(0)
    expect(h.heightStats.total).toBe(0)
    expect(h.heightStats.count).toBe(0)
    expect(h.averageNodeHeight.value).toBe(32)
    expect(onHeightRecorded).not.toHaveBeenCalled()
  })

  it('prunes out-of-range and invalid measurements while recomputing stats', () => {
    const h = useHeightMeasurements()

    h.recordNodeHeight(0, 20)
    h.recordNodeHeight(1, 30)
    h.recordNodeHeight(2, 40)
    h.recordNodeHeight(3, 50)

    // Simulate a stale/corrupted measurement that may exist after external mutation.
    h.nodeHeights[4] = -10

    h.pruneHeightMeasurements(2)

    expect(h.nodeHeights[0]).toBe(20)
    expect(h.nodeHeights[1]).toBe(30)
    expect(h.nodeHeights[2]).toBeUndefined()
    expect(h.nodeHeights[3]).toBeUndefined()
    expect(h.nodeHeights[4]).toBeUndefined()
    expect(h.heightStats.total).toBe(50)
    expect(h.heightStats.count).toBe(2)
    expect(h.averageNodeHeight.value).toBe(25)
  })

  it('pruning with a non-positive size resets all measurements and trees', () => {
    const h = useHeightMeasurements()

    h.recordNodeHeight(0, 20)
    h.recordNodeHeight(1, 30)
    h.rebuildHeightTrees(2)

    expect(h.heightTreeSize.value).toBe(2)
    expect(h.heightSumTree.value.length).toBeGreaterThan(0)
    expect(h.heightKnownTree.value.length).toBeGreaterThan(0)

    h.pruneHeightMeasurements(0)

    expect(Object.keys(h.nodeHeights)).toHaveLength(0)
    expect(h.heightStats.total).toBe(0)
    expect(h.heightStats.count).toBe(0)
    expect(h.heightTreeSize.value).toBe(0)
    expect(h.heightSumTree.value).toEqual([])
    expect(h.heightKnownTree.value).toEqual([])
    expect(h.averageNodeHeight.value).toBe(32)
  })

  it('rebuilds Fenwick trees and supports range sums', () => {
    const h = useHeightMeasurements()

    h.recordNodeHeight(0, 10)
    h.recordNodeHeight(2, 30)
    h.recordNodeHeight(4, 50)
    h.rebuildHeightTrees(5)

    expect(h.heightTreeSize.value).toBe(5)

    expect(h.fenwickRangeSum(h.heightSumTree.value, 0, 5)).toBe(90)
    expect(h.fenwickRangeSum(h.heightSumTree.value, 1, 4)).toBe(30)
    expect(h.fenwickRangeSum(h.heightSumTree.value, 0, 1)).toBe(10)
    expect(h.fenwickRangeSum(h.heightSumTree.value, 4, 5)).toBe(50)

    expect(h.fenwickRangeSum(h.heightKnownTree.value, 0, 5)).toBe(3)
    expect(h.fenwickRangeSum(h.heightKnownTree.value, 1, 4)).toBe(1)
    expect(h.fenwickRangeSum(h.heightKnownTree.value, 0, 0)).toBe(0)
  })

  it('updates Fenwick trees when recording after a rebuild', () => {
    const h = useHeightMeasurements()

    h.recordNodeHeight(0, 10)
    h.recordNodeHeight(2, 30)
    h.rebuildHeightTrees(4)

    expect(h.fenwickRangeSum(h.heightSumTree.value, 0, 4)).toBe(40)
    expect(h.fenwickRangeSum(h.heightKnownTree.value, 0, 4)).toBe(2)

    h.recordNodeHeight(1, 20)

    expect(h.fenwickRangeSum(h.heightSumTree.value, 0, 4)).toBe(60)
    expect(h.fenwickRangeSum(h.heightKnownTree.value, 0, 4)).toBe(3)

    h.recordNodeHeight(2, 50)

    expect(h.fenwickRangeSum(h.heightSumTree.value, 0, 4)).toBe(80)
    expect(h.fenwickRangeSum(h.heightKnownTree.value, 0, 4)).toBe(3)
  })

  it('ignores Fenwick updates for indexes outside the current tree size', () => {
    const h = useHeightMeasurements()

    h.rebuildHeightTrees(2)
    h.recordNodeHeight(3, 100)

    expect(h.nodeHeights[3]).toBe(100)
    expect(h.heightStats.total).toBe(100)
    expect(h.heightStats.count).toBe(1)

    expect(h.fenwickRangeSum(h.heightSumTree.value, 0, 2)).toBe(0)
    expect(h.fenwickRangeSum(h.heightKnownTree.value, 0, 2)).toBe(0)
  })

  it('resetHeightMeasurements clears all state', () => {
    const h = useHeightMeasurements()

    h.recordNodeHeight(0, 20)
    h.recordNodeHeight(1, 30)
    h.rebuildHeightTrees(2)

    h.resetHeightMeasurements()

    expect(Object.keys(h.nodeHeights)).toHaveLength(0)
    expect(h.heightStats.total).toBe(0)
    expect(h.heightStats.count).toBe(0)
    expect(h.heightTreeSize.value).toBe(0)
    expect(h.heightSumTree.value).toEqual([])
    expect(h.heightKnownTree.value).toEqual([])
    expect(h.averageNodeHeight.value).toBe(32)
  })
})
