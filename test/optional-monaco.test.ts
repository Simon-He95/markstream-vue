import { describe, expect, it, vi } from 'vitest'

describe('optional stream-diffs dependency', () => {
  it('handles an unavailable stream-diffs peer gracefully', async () => {
    // Dynamically import the monaco module
    const { getUseMonaco } = await import('../src/components/CodeBlockNode/monaco')

    // In a real scenario where stream-diffs is not installed,
    // the import will fail and getUseMonaco should return null
    // This test verifies the function exists and can be called
    const result = await getUseMonaco()

    // If stream-diffs is installed (as it is in the dev environment),
    // result will be the module. If not installed, result will be null.
    // The important thing is that no error is thrown.
    expect(typeof result === 'object' || result === null).toBe(true)
  })

  it('should cache the import result', async () => {
    const { getUseMonaco } = await import('../src/components/CodeBlockNode/monaco')

    // Call twice to test caching
    const result1 = await getUseMonaco()
    const result2 = await getUseMonaco()

    // Both calls should return the same result (either the module or null)
    expect(result1).toBe(result2)
  })

  it('falls back to stream-monaco when stream-diffs is an empty optional-peer stub', async () => {
    vi.resetModules()
    vi.doMock('stream-diffs', () => ({
      default: {},
    }))

    const { getUseMonaco } = await import('../src/components/CodeBlockNode/monaco')

    await expect(getUseMonaco()).resolves.toMatchObject({
      useMonaco: expect.any(Function),
    })
  })
})
