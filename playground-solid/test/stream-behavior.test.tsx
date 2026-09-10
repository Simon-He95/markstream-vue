/**
 * @vitest-environment jsdom
 */

import { createEffect, createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStreamSimulator } from '../src/shared/useStreamSimulator'

interface HarnessProps {
  chunkDelayMax: number
  chunkDelayMin: number
  chunkSizeMax: number
  chunkSizeMin: number
  onContent: (content: string) => void
}

function StreamHarness(props: HarnessProps) {
  const simulator = useStreamSimulator(() => ({
    source: 'abcdefghi',
    chunkDelayMax: props.chunkDelayMax,
    chunkDelayMin: props.chunkDelayMin,
    chunkSizeMax: props.chunkSizeMax,
    chunkSizeMin: props.chunkSizeMin,
    burstiness: 0,
    sliceMode: 'pure-random',
    transportMode: 'scheduler',
    random: () => 0,
  }))

  createEffect(() => {
    props.onContent(simulator.content())
  })

  createEffect(() => {
    simulator.start()
  })

  return <output data-stream-content>{simulator.content()}</output>
}

describe('solid playground stream behavior', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('keeps the current stream alive when settings change mid-stream', async () => {
    vi.useFakeTimers()
    let latestContent = ''
    const host = document.createElement('div')
    document.body.appendChild(host)
    const [chunkSize, setChunkSize] = createSignal(1)
    const dispose = render(() => (
      <StreamHarness
        chunkDelayMax={10}
        chunkDelayMin={10}
        chunkSizeMax={chunkSize()}
        chunkSizeMin={chunkSize()}
        onContent={(content) => {
          latestContent = content
        }}
      />
    ), host)

    await vi.advanceTimersByTimeAsync(20)
    expect(latestContent).toBe('ab')

    setChunkSize(2)
    await Promise.resolve()
    expect(latestContent).toBe('ab')

    await vi.advanceTimersByTimeAsync(10)
    expect(latestContent).toBe('abcd')

    dispose()
  })

  it('stop and reset cancel the previous run so old timers cannot write back', async () => {
    vi.useFakeTimers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    let start!: () => void
    let stop!: () => void
    let reset!: () => void
    let content = ''
    const Harness = () => {
      const simulator = useStreamSimulator(() => ({
        source: 'abcdefghi',
        chunkDelayMin: 10,
        chunkDelayMax: 10,
        chunkSizeMin: 1,
        chunkSizeMax: 1,
        burstiness: 0,
        sliceMode: 'pure-random',
        transportMode: 'scheduler',
        random: () => 0,
      }))
      start = simulator.start
      stop = simulator.stop
      reset = simulator.reset
      createEffect(() => {
        content = simulator.content()
      })
      return null
    }
    const dispose = render(() => <Harness />, host)
    start()
    await vi.advanceTimersByTimeAsync(10)
    expect(content).toBe('a')
    stop()
    await vi.advanceTimersByTimeAsync(50)
    expect(content).toBe('a')
    reset()
    expect(content).toBe('')
    await vi.advanceTimersByTimeAsync(50)
    expect(content).toBe('')
    dispose()
  })

  it('start() reads the latest source without waiting for the options effect', async () => {
    vi.useFakeTimers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    let start!: (reset?: boolean) => void
    let setSource!: (value: string) => void
    const Harness = () => {
      const [source, set] = createSignal('OLD_SAMPLE_TOKEN')
      setSource = set
      const simulator = useStreamSimulator(() => ({
        source: source(),
        chunkDelayMin: 5,
        chunkDelayMax: 5,
        chunkSizeMin: 40,
        chunkSizeMax: 40,
        burstiness: 0,
        sliceMode: 'pure-random',
        transportMode: 'readable-stream',
        random: () => 0,
      }))
      start = simulator.start
      return <output>{simulator.content()}</output>
    }
    const dispose = render(() => <Harness />, host)
    setSource('NEW_SAMPLE_TOKEN diagrams')
    start()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(20)
    await Promise.resolve()
    expect(host.textContent).toContain('NEW_SAMPLE_TOKEN')
    expect(host.textContent).not.toContain('OLD_SAMPLE_TOKEN')
    dispose()
  })
})
