import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLocalTextStream } from '../playground/src/composables/createLocalTextStream'

describe('playground local text stream', () => {
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

  it('preserves Unicode characters when a one-unit chunk crosses a surrogate pair', async () => {
    vi.useFakeTimers()
    const source = 'a🚀中文😀z'
    const stream = createLocalTextStream(source, {
      chunkDelayMin: 1,
      chunkDelayMax: 1,
      chunkSizeMin: 1,
      chunkSizeMax: 1,
      sliceMode: 'pure-random',
    })
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    const output = (async () => {
      let text = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done)
          return text + decoder.decode()
        text += decoder.decode(value, { stream: true })
      }
    })()
    await vi.runAllTimersAsync()
    expect(await output).toBe(source)
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
