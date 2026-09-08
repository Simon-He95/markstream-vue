import type { StreamSliceMode } from '../playground/src/composables/createLocalTextStream'
import type { StreamTransportMode } from '../playground/src/composables/useStreamSimulator'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref, watch } from 'vue'
import { useStreamSimulator } from '../playground/src/composables/useStreamSimulator'

function mountSimulator(options: {
  source: string
  chunkDelayMin: number
  chunkDelayMax: number
  chunkSizeMin: number
  chunkSizeMax: number
  burstiness: number
  random?: () => number
  sliceMode?: StreamSliceMode
  transportMode?: StreamTransportMode
}) {
  return mount(defineComponent({
    setup() {
      const source = ref(options.source)
      const history = ref<Array<{ delay: number, chunk: number }>>([])
      const simulator = useStreamSimulator({
        source,
        chunkDelayMin: options.chunkDelayMin,
        chunkDelayMax: options.chunkDelayMax,
        chunkSizeMin: options.chunkSizeMin,
        chunkSizeMax: options.chunkSizeMax,
        burstiness: options.burstiness,
        random: options.random,
        sliceMode: options.sliceMode ?? 'boundary-aware',
        transportMode: options.transportMode ?? 'scheduler',
      })

      watch(() => simulator.content.value, () => {
        if (simulator.lastChunkSize.value > 0) {
          history.value.push({
            delay: simulator.lastDelayMs.value,
            chunk: simulator.lastChunkSize.value,
          })
        }
      })

      simulator.start()

      return {
        history,
        ...simulator,
      }
    },
    template: '<div />',
  }))
}

describe('playground stream simulator', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps a replay running when switching from a reader to the scheduler', async () => {
    vi.useFakeTimers()
    const transportMode = ref<StreamTransportMode>('readable-stream')
    const wrapper = mount(defineComponent({
      setup: () => useStreamSimulator({
        source: 'a'.repeat(1000),
        chunkSizeMin: 2,
        chunkSizeMax: 2,
        chunkDelayMin: 10,
        chunkDelayMax: 10,
        burstiness: 0,
        transportMode,
      }),
      template: '<div />',
    }))
    wrapper.vm.start()
    await vi.advanceTimersByTimeAsync(10)
    wrapper.vm.stop()
    transportMode.value = 'scheduler'
    wrapper.vm.start()
    await vi.advanceTimersByTimeAsync(30)
    expect(wrapper.vm.isStreaming).toBe(true)
    expect(wrapper.vm.content).toHaveLength(6)
    wrapper.unmount()
  })

  it('uses exact delay and chunk sizes when min and max are identical', async () => {
    vi.useFakeTimers()
    const wrapper = mountSimulator({
      source: 'abcdefghijkl',
      chunkDelayMin: 10,
      chunkDelayMax: 10,
      chunkSizeMin: 2,
      chunkSizeMax: 2,
      burstiness: 0,
      random: () => 0.5,
    })

    await vi.advanceTimersByTimeAsync(10)
    await nextTick()

    expect((wrapper.vm as any).content).toHaveLength(2)
    expect((wrapper.vm as any).lastDelayMs).toBe(10)
    expect((wrapper.vm as any).lastChunkSize).toBe(2)

    await vi.advanceTimersByTimeAsync(10)
    await nextTick()

    expect((wrapper.vm as any).content).toHaveLength(4)
    expect((wrapper.vm as any).history).toEqual([
      { delay: 10, chunk: 2 },
      { delay: 10, chunk: 2 },
    ])

    wrapper.unmount()
  })

  it('uses exact delay and chunk sizes in readable-stream mode', async () => {
    vi.useFakeTimers()
    const wrapper = mountSimulator({
      source: 'abcdefghijkl',
      chunkDelayMin: 10,
      chunkDelayMax: 10,
      chunkSizeMin: 2,
      chunkSizeMax: 2,
      burstiness: 0,
      random: () => 0.5,
      sliceMode: 'pure-random',
      transportMode: 'readable-stream',
    })

    await vi.advanceTimersByTimeAsync(10)
    await nextTick()

    expect((wrapper.vm as any).content).toHaveLength(2)
    expect((wrapper.vm as any).lastDelayMs).toBe(10)
    expect((wrapper.vm as any).lastChunkSize).toBe(2)

    await vi.advanceTimersByTimeAsync(10)
    await nextTick()

    expect((wrapper.vm as any).content).toHaveLength(4)
    expect((wrapper.vm as any).history).toEqual([
      { delay: 10, chunk: 2 },
      { delay: 10, chunk: 2 },
    ])

    wrapper.unmount()
  })

  it('keeps sampled delays and chunk sizes inside explicit min-max windows', async () => {
    vi.useFakeTimers()
    const values = [0.92, 0.14, 0.81, 0.32, 0.67, 0.25, 0.58, 0.44, 0.73, 0.19]
    let index = 0
    const wrapper = mountSimulator({
      source: 'abcdefghijklmnop',
      chunkDelayMin: 12,
      chunkDelayMax: 28,
      chunkSizeMin: 1,
      chunkSizeMax: 3,
      burstiness: 0.8,
      random: () => {
        const value = values[index % values.length]
        index += 1
        return value
      },
    })

    await vi.advanceTimersByTimeAsync(1000)
    await nextTick()

    const history = (wrapper.vm as any).history as Array<{ delay: number, chunk: number }>
    expect(history.length).toBeGreaterThan(0)
    expect((wrapper.vm as any).content).toBe('abcdefghijklmnop')

    history.forEach(({ delay, chunk }) => {
      expect(delay).toBeGreaterThanOrEqual(12)
      expect(delay).toBeLessThanOrEqual(28)
      expect(chunk).toBeGreaterThanOrEqual(1)
      expect(chunk).toBeLessThanOrEqual(3)
    })

    wrapper.unmount()
  })

  it('keeps scheduler pure-random mode on raw slice boundaries', async () => {
    vi.useFakeTimers()
    const wrapper = mountSimulator({
      source: 'hello world',
      chunkDelayMin: 10,
      chunkDelayMax: 10,
      chunkSizeMin: 3,
      chunkSizeMax: 3,
      burstiness: 0,
      random: () => 0,
      sliceMode: 'pure-random',
      transportMode: 'scheduler',
    })

    await vi.advanceTimersByTimeAsync(10)
    await nextTick()

    expect((wrapper.vm as any).content).toBe('hel')

    wrapper.unmount()
  })
})
