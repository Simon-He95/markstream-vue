import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLocalTextStream } from '../src/shared/useStreamSimulator'

describe('solid playground stream simulator', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses raw random slices in pure-random mode', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const stream = createLocalTextStream('hello world', {
      chunkDelayMin: 5,
      chunkDelayMax: 5,
      chunkSizeMin: 3,
      chunkSizeMax: 3,
      control: { signal: controller.signal },
      random: () => 0,
      sliceMode: 'pure-random',
    })
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    const firstChunk = reader.read()

    await vi.advanceTimersByTimeAsync(5)

    const result = await firstChunk
    expect(result.done).toBe(false)
    expect(decoder.decode(result.value)).toBe('hel')

    controller.abort()
  })

  it('keeps boundary-aware mode snapped to token boundaries', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const stream = createLocalTextStream('hello world', {
      chunkDelayMin: 5,
      chunkDelayMax: 5,
      chunkSizeMin: 3,
      chunkSizeMax: 3,
      control: { signal: controller.signal },
      random: () => 0,
      sliceMode: 'boundary-aware',
    })
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    const firstChunk = reader.read()

    await vi.advanceTimersByTimeAsync(5)

    const result = await firstChunk
    expect(result.done).toBe(false)
    expect(decoder.decode(result.value)).toBe('hello ')

    controller.abort()
  })
})
