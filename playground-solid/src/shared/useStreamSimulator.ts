import type { BurstState, ChunkInfo, StreamSimulatorOptions } from './streamMath'
import { createEffect, createSignal, onCleanup, untrack } from 'solid-js'
import { clearTrackedTimeout, trackedTimeout } from './resourceTracker'
import { createLocalTextStream, normalizeRatio, normalizeStreamRange, sampleChunkSizeFromRange, sampleDelayMsFromRange } from './streamMath'

export type { ChunkInfo, StreamSimulatorOptions } from './streamMath'
export { clampStreamControl, createLocalTextStream, normalizeStreamRange } from './streamMath'
export type { StreamSliceMode, StreamTransportMode } from './streamMath'

export function useStreamSimulator(getOptions: () => StreamSimulatorOptions) {
  const [contentState, setContentState] = createSignal('')
  const [chunksState, setChunksState] = createSignal<ChunkInfo[]>([])
  const [isStreamingState, setIsStreamingState] = createSignal(false)
  const [isPausedState, setIsPausedState] = createSignal(false)
  const [lastDelayMsState, setLastDelayMsState] = createSignal(0)
  const [lastChunkSizeState, setLastChunkSizeState] = createSignal(0)
  const [chunkCountState, setChunkCountState] = createSignal(0)

  let contentValue = ''
  let chunksValue: ChunkInfo[] = []
  let isStreamingValue = false
  let isPausedValue = false
  let lastDelayMsValue = 0
  let chunkCountValue = 0
  let optionsValue = getOptions()
  const burstState: BurstState = {
    quickChunksRemaining: 0,
    fastCadenceChunkPending: false,
  }
  let timer: number | null = null
  let abortController: AbortController | null = null
  let runToken = 0

  const refreshOptions = () => {
    optionsValue = untrack(() => getOptions())
    return optionsValue
  }

  createEffect(() => {
    refreshOptions()
  })

  const setContent = (value: string) => {
    contentValue = value
    setContentState(value)
  }
  const setChunks = (value: ChunkInfo[]) => {
    chunksValue = value
    setChunksState(value)
  }
  const setIsStreaming = (value: boolean) => {
    isStreamingValue = value
    setIsStreamingState(value)
  }
  const setIsPaused = (value: boolean) => {
    isPausedValue = value
    setIsPausedState(value)
  }
  const setLastDelayMs = (value: number) => {
    lastDelayMsValue = value
    setLastDelayMsState(value)
  }
  const setLastChunkSize = (value: number) => {
    setLastChunkSizeState(value)
  }
  const setChunkCount = (value: number) => {
    chunkCountValue = value
    setChunkCountState(value)
  }

  const clearTimer = () => {
    if (timer !== null) {
      clearTrackedTimeout(timer)
      timer = null
    }
  }

  const stop = () => {
    clearTimer()
    abortController?.abort()
    abortController = null
    runToken += 1
    setIsStreaming(false)
    setIsPaused(false)
  }

  const scheduleNext = (isFirstChunk = false) => {
    const source = optionsValue.source || ''
    if (!isStreamingValue || isPausedValue)
      return

    if (contentValue.length >= source.length) {
      stop()
      return
    }

    const burstiness = normalizeRatio(Number(optionsValue.burstiness), 0.35)
    const pureRandom = (optionsValue.sliceMode ?? 'boundary-aware') === 'pure-random'
    const { min, max } = normalizeStreamRange(
      Number(optionsValue.chunkDelayMin),
      Number(optionsValue.chunkDelayMax),
      8,
      1800,
      16,
      40,
    )
    const delayMs = sampleDelayMsFromRange(
      min,
      max,
      burstiness,
      burstState,
      isFirstChunk,
      pureRandom,
      optionsValue.random ?? Math.random,
    )

    setLastDelayMs(delayMs)
    const token = runToken
    timer = trackedTimeout(() => {
      timer = null
      if (token !== runToken)
        return
      refreshOptions()
      const sourceValue = optionsValue.source || ''
      if (!isStreamingValue || isPausedValue)
        return

      if (!sourceValue.length) {
        stop()
        return
      }

      const start = contentValue.length
      if (start >= sourceValue.length) {
        stop()
        return
      }

      const { min: chunkSizeMin, max: chunkSizeMax } = normalizeStreamRange(
        Number(optionsValue.chunkSizeMin),
        Number(optionsValue.chunkSizeMax),
        1,
        160,
        2,
        6,
      )
      const nextChunkSize = sampleChunkSizeFromRange(
        sourceValue,
        start,
        chunkSizeMin,
        chunkSizeMax,
        burstState,
        optionsValue.sliceMode ?? 'boundary-aware',
        optionsValue.random ?? Math.random,
      )

      const nextChunk = sourceValue.slice(start, start + nextChunkSize)
      const nextCount = chunkCountValue + 1

      setLastChunkSize(nextChunkSize)
      setChunkCount(nextCount)
      setContent(sourceValue.slice(0, start + nextChunkSize))
      setChunks([
        ...chunksValue,
        {
          index: nextCount - 1,
          content: nextChunk,
          delay: lastDelayMsValue,
        },
      ])

      if (burstState.fastCadenceChunkPending) {
        burstState.fastCadenceChunkPending = false
        burstState.quickChunksRemaining = Math.max(0, burstState.quickChunksRemaining - 1)
      }

      if (contentValue.length >= sourceValue.length) {
        stop()
        return
      }

      scheduleNext()
    }, delayMs)
  }

  const startReadableStream = async (reset = true) => {
    refreshOptions()
    clearTimer()
    abortController?.abort()
    const controller = new AbortController()
    abortController = controller
    const token = ++runToken
    burstState.quickChunksRemaining = 0
    burstState.fastCadenceChunkPending = false

    if (reset)
      setContent('')

    setChunks([])
    setLastChunkSize(0)
    setLastDelayMs(0)
    setChunkCount(0)
    setIsPaused(false)

    const source = optionsValue.source || ''
    if (!source.length) {
      abortController = null
      setIsStreaming(false)
      return
    }

    const { min: chunkSizeMin, max: chunkSizeMax } = normalizeStreamRange(
      Number(optionsValue.chunkSizeMin),
      Number(optionsValue.chunkSizeMax),
      1,
      160,
      2,
      6,
    )
    const { min: chunkDelayMin, max: chunkDelayMax } = normalizeStreamRange(
      Number(optionsValue.chunkDelayMin),
      Number(optionsValue.chunkDelayMax),
      8,
      1800,
      16,
      40,
    )

    setIsStreaming(true)

    try {
      const stream = createLocalTextStream(source, {
        chunkDelayMax,
        chunkDelayMin,
        chunkSizeMax,
        chunkSizeMin,
        random: optionsValue.random,
        sliceMode: optionsValue.sliceMode ?? 'boundary-aware',
        control: {
          shouldPause: () => isPausedValue,
          signal: controller.signal,
        },
        onChunk: (chunk) => {
          if (token !== runToken)
            return
          const nextCount = chunkCountValue + 1
          setLastDelayMs(chunk.delay)
          setLastChunkSize(chunk.content.length)
          setChunkCount(nextCount)
          setChunks([...chunksValue, chunk])
        },
      })

      const reader = stream.getReader()
      const decoder = new TextDecoder()
      let accumulated = reset ? '' : contentValue

      while (!controller.signal.aborted) {
        if (token !== runToken)
          break
        const { done, value } = await reader.read()
        if (done)
          break

        accumulated += decoder.decode(value, { stream: true })
        if (token !== runToken)
          break
        setContent(accumulated)
      }
    }
    finally {
      if (abortController === controller)
        abortController = null

      if (token === runToken) {
        setIsStreaming(false)
        setIsPaused(false)
      }
    }
  }

  const start = (reset = true) => {
    refreshOptions()
    const source = optionsValue.source || ''
    if (!source.length) {
      setLastChunkSize(0)
      setLastDelayMs(0)
      setIsStreaming(false)
      setIsPaused(false)
      return
    }

    const transportMode = optionsValue.transportMode ?? 'scheduler'
    if (transportMode === 'readable-stream') {
      void startReadableStream(reset)
      return
    }

    clearTimer()
    abortController?.abort()
    abortController = null
    runToken += 1
    burstState.quickChunksRemaining = 0
    burstState.fastCadenceChunkPending = false

    if (reset)
      setContent('')

    setChunks([])
    setLastChunkSize(0)
    setLastDelayMs(0)
    setChunkCount(0)
    setIsStreaming(true)
    setIsPaused(false)
    scheduleNext(true)
  }

  const pause = () => {
    if (!isStreamingValue)
      return
    setIsPaused(true)
    clearTimer()
  }

  const resume = () => {
    if (!isStreamingValue || !isPausedValue)
      return
    setIsPaused(false)
    if ((optionsValue.transportMode ?? 'scheduler') === 'scheduler')
      scheduleNext()
  }

  const togglePause = () => {
    if (isPausedValue)
      resume()
    else
      pause()
  }

  const reset = () => {
    stop()
    setContent('')
    setChunks([])
    setChunkCount(0)
    setLastChunkSize(0)
    setLastDelayMs(0)
    burstState.quickChunksRemaining = 0
    burstState.fastCadenceChunkPending = false
  }

  onCleanup(() => {
    stop()
  })

  return {
    chunkCount: chunkCountState,
    chunks: chunksState,
    content: contentState,
    isPaused: isPausedState,
    isStreaming: isStreamingState,
    lastChunkSize: lastChunkSizeState,
    lastDelayMs: lastDelayMsState,
    pause,
    reset,
    resume,
    start,
    stop,
    togglePause,
  }
}
