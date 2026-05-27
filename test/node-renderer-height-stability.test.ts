import { describe, expect, it } from 'vitest'
import { useHeightMeasurements } from '../src/components/NodeRenderer/composables/useHeightMeasurements'

describe('node renderer height stability', () => {
  it('ignores 1px jitter and prevents loading nodes from shrinking', () => {
    const measurements = useHeightMeasurements()

    measurements.recordNodeHeight(0, 100)
    measurements.recordNodeHeight(0, 100.5)
    expect(measurements.nodeHeights[0]).toBe(100)

    measurements.recordNodeHeight(0, 80, { allowShrink: false })
    expect(measurements.nodeHeights[0]).toBe(100)

    measurements.recordNodeHeight(0, 120, { allowShrink: false })
    expect(measurements.nodeHeights[0]).toBe(120)

    measurements.recordNodeHeight(0, 90)
    expect(measurements.nodeHeights[0]).toBe(90)
  })
})
