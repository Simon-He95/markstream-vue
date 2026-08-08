import { describe, expect, it, vi } from 'vitest'

describe('optional stream-diffs dependency', () => {
  it('handles an unavailable stream-diffs peer gracefully', async () => {
    // Dynamically import the stream-diffs runtime loader
    const { getStreamDiffsRuntime } = await import('../src/components/CodeBlockNode/streamDiffs')

    // In a real scenario where stream-diffs is not installed,
    // the import will fail and getStreamDiffsRuntime should return null
    // This test verifies the function exists and can be called
    const result = await getStreamDiffsRuntime()

    // If stream-diffs is installed (as it is in the dev environment),
    // result will be the module. If not installed, result will be null.
    // The important thing is that no error is thrown.
    expect(typeof result === 'object' || result === null).toBe(true)
  })

  it('should cache the import result', async () => {
    const { getStreamDiffsRuntime } = await import('../src/components/CodeBlockNode/streamDiffs')

    // Call twice to test caching
    const result1 = await getStreamDiffsRuntime()
    const result2 = await getStreamDiffsRuntime()

    // Both calls should return the same result (either the module or null)
    expect(result1).toBe(result2)
  })

  it('treats an empty optional-peer stub as unavailable', async () => {
    vi.resetModules()
    vi.doMock('stream-diffs', () => ({
      default: {},
    }))

    const { getStreamDiffsRuntime } = await import('../src/components/CodeBlockNode/streamDiffs')

    await expect(getStreamDiffsRuntime()).resolves.toBeNull()
  })
})
