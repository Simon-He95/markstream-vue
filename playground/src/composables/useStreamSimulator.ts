import type { MaybeRefOrGetter } from 'vue'
import type { BurstState } from '../../../playground-shared/stream-scheduler'
import type { ChunkInfo, StreamSliceMode } from './createLocalTextStream'
import { computed, onBeforeUnmount, ref, toValue } from 'vue'
import { clampStreamControl, normalizeRatio, normalizeStreamRange, sampleChunkSize, sampleChunkSizeFromRange, sampleDelayMs, sampleDelayMsFromRange } from '../../../playground-shared/stream-scheduler'
import { createLocalTextStream } from './createLocalTextStream'

export { clampStreamControl, normalizeStreamRange } from '../../../playground-shared/stream-scheduler'

export type StreamTransportMode = 'scheduler' | 'readable-stream'

export interface StreamSimulatorOptions {
  source: MaybeRefOrGetter<string>
  baseChunkSize?: MaybeRefOrGetter<number>
  baseDelayMs?: MaybeRefOrGetter<number>
  chunkSizeMin?: MaybeRefOrGetter<number>
  chunkSizeMax?: MaybeRefOrGetter<number>
  chunkDelayMin?: MaybeRefOrGetter<number>
  chunkDelayMax?: MaybeRefOrGetter<number>
  jitter?: MaybeRefOrGetter<number>
  burstiness: MaybeRefOrGetter<number>
  sliceMode?: MaybeRefOrGetter<StreamSliceMode>
  transportMode?: MaybeRefOrGetter<StreamTransportMode>
  random?: () => number
}

function hasExplicitRange(minRef: MaybeRefOrGetter<number> | undefined, maxRef: MaybeRefOrGetter<number> | undefined) {
  return minRef !== undefined || maxRef !== undefined
}

function inferJitterFromRange(min: number, max: number) {
  return max <= min ? 0 : normalizeRatio((max - min) / Math.max(1, max), 0)
}

function resolveSliceMode(sliceMode: MaybeRefOrGetter<StreamSliceMode> | undefined) {
  return (sliceMode ? toValue(sliceMode) : 'boundary-aware') as StreamSliceMode
}

export function useStreamSimulator(options: StreamSimulatorOptions) {
  const content = ref('')
  const isStreaming = ref(false)
  const isPaused = ref(false)
  const lastDelayMs = ref(0)
  const lastChunkSize = ref(0)
  const chunkCount = ref(0)
  const chunks = ref<ChunkInfo[]>([])
  const burstState: BurstState = {
    quickChunksRemaining: 0,
    fastCadenceChunkPending: false,
  }

  const progress = computed(() => {
    const source = toValue(options.source) || ''
    if (!source.length)
      return 0
    return Math.min(100, Math.round((content.value.length / source.length) * 100))
  })

  const random = options.random ?? Math.random
  let abortController: AbortController | null = null
  let timer: ReturnType<typeof window.setTimeout> | null = null

  function clearTimer() {
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
  }

  function stop() {
    clearTimer()
    abortController?.abort()
    abortController = null
    isStreaming.value = false
    isPaused.value = false
  }

  function scheduleNext(isFirstChunk = false) {
    const source = toValue(options.source) || ''
    if (!isStreaming.value || isPaused.value)
      return

    if (content.value.length >= source.length) {
      stop()
      return
    }

    const burstiness = normalizeRatio(Number(toValue(options.burstiness)), 0.35)
    const hasExplicitDelayRange = hasExplicitRange(options.chunkDelayMin, options.chunkDelayMax)
    const pureRandom = resolveSliceMode(options.sliceMode) === 'pure-random'
    const delayMs = hasExplicitDelayRange
      ? (() => {
          const { min, max } = normalizeStreamRange(
            Number(toValue(options.chunkDelayMin)),
            Number(toValue(options.chunkDelayMax)),
            8,
            1800,
            16,
            40,
          )
          return sampleDelayMsFromRange(min, max, burstiness, burstState, isFirstChunk, pureRandom, random)
        })()
      : (() => {
          const baseDelayMs = clampStreamControl(Number(toValue(options.baseDelayMs)), 8, 400, 24)
          const jitter = normalizeRatio(Number(toValue(options.jitter)), 0.45)
          return sampleDelayMs(baseDelayMs, jitter, burstiness, burstState, isFirstChunk, random)
        })()

    lastDelayMs.value = delayMs
    timer = window.setTimeout(() => {
      timer = null
      pushNextChunk()
    }, delayMs)
  }

  function pushNextChunk() {
    const source = toValue(options.source) || ''
    if (!isStreaming.value || isPaused.value)
      return

    if (!source.length) {
      stop()
      return
    }

    const start = content.value.length
    if (start >= source.length) {
      stop()
      return
    }

    const burstiness = normalizeRatio(Number(toValue(options.burstiness)), 0.35)
    const hasExplicitChunkRange = hasExplicitRange(options.chunkSizeMin, options.chunkSizeMax)
    const sliceMode = resolveSliceMode(options.sliceMode)
    const chunkSize = hasExplicitChunkRange
      ? (() => {
          const { min, max } = normalizeStreamRange(
            Number(toValue(options.chunkSizeMin)),
            Number(toValue(options.chunkSizeMax)),
            1,
            160,
            2,
            6,
          )
          return sampleChunkSizeFromRange(source, start, min, max, burstState, sliceMode, random)
        })()
      : (() => {
          const baseChunkSize = clampStreamControl(Number(toValue(options.baseChunkSize)), 1, 160, 4)
          const hasExplicitDelayRange = hasExplicitRange(options.chunkDelayMin, options.chunkDelayMax)
          const jitter = hasExplicitDelayRange
            ? (() => {
                const { min, max } = normalizeStreamRange(
                  Number(toValue(options.chunkDelayMin)),
                  Number(toValue(options.chunkDelayMax)),
                  8,
                  1800,
                  16,
                  40,
                )
                return inferJitterFromRange(min, max)
              })()
            : normalizeRatio(Number(toValue(options.jitter)), 0.45)
          return sampleChunkSize(source, start, baseChunkSize, jitter, burstiness, burstState, sliceMode, random)
        })()

    lastChunkSize.value = chunkSize
    chunkCount.value += 1
    const nextChunk = source.slice(start, start + chunkSize)
    content.value = source.slice(0, start + chunkSize)
    chunks.value.push({
      index: chunkCount.value - 1,
      content: nextChunk,
      delay: lastDelayMs.value,
    })
    if (burstState.fastCadenceChunkPending) {
      burstState.fastCadenceChunkPending = false
      burstState.quickChunksRemaining = Math.max(0, burstState.quickChunksRemaining - 1)
    }

    if (content.value.length >= source.length) {
      stop()
      return
    }

    scheduleNext()
  }

  async function startReadableStream(reset = true) {
    clearTimer()
    abortController?.abort()
    const controller = new AbortController()
    abortController = controller
    burstState.quickChunksRemaining = 0
    burstState.fastCadenceChunkPending = false

    if (reset)
      content.value = ''

    chunks.value = []
    lastChunkSize.value = 0
    lastDelayMs.value = 0
    chunkCount.value = 0
    isPaused.value = false

    const source = toValue(options.source) || ''
    if (!source.length) {
      abortController = null
      isStreaming.value = false
      return
    }

    const { min: chunkSizeMin, max: chunkSizeMax } = normalizeStreamRange(
      Number(toValue(options.chunkSizeMin)),
      Number(toValue(options.chunkSizeMax)),
      1,
      160,
      2,
      6,
    )
    const { min: chunkDelayMin, max: chunkDelayMax } = normalizeStreamRange(
      Number(toValue(options.chunkDelayMin)),
      Number(toValue(options.chunkDelayMax)),
      8,
      1800,
      16,
      40,
    )
    const sliceMode = (toValue(options.sliceMode) ?? 'boundary-aware') as StreamSliceMode

    isStreaming.value = true

    try {
      const stream = createLocalTextStream(source, {
        chunkDelayMax,
        chunkDelayMin,
        chunkSizeMax,
        chunkSizeMin,
        random,
        sliceMode,
        control: {
          shouldPause: () => isPaused.value,
          signal: controller.signal,
        },
        onChunk: (chunk) => {
          lastDelayMs.value = chunk.delay
          lastChunkSize.value = chunk.content.length
          chunkCount.value += 1
          chunks.value.push(chunk)
        },
      })
      const reader = stream.getReader()
      const decoder = new TextDecoder()
      let accumulated = reset ? '' : content.value

      while (!controller.signal.aborted) {
        const { done, value } = await reader.read()
        if (done)
          break

        accumulated += decoder.decode(value, { stream: true })
        content.value = accumulated
      }
    }
    finally {
      if (abortController === controller) {
        abortController = null
        isStreaming.value = false
        isPaused.value = false
      }
    }
  }

  function start(reset = true) {
    const transportMode = (toValue(options.transportMode) ?? 'scheduler') as StreamTransportMode
    if (transportMode === 'readable-stream') {
      void startReadableStream(reset)
      return
    }

    const source = toValue(options.source) || ''
    if (!source.length) {
      lastChunkSize.value = 0
      lastDelayMs.value = 0
      isStreaming.value = false
      isPaused.value = false
      return
    }

    clearTimer()
    abortController?.abort()
    abortController = null
    burstState.quickChunksRemaining = 0
    burstState.fastCadenceChunkPending = false
    if (reset)
      content.value = ''

    chunks.value = []
    lastChunkSize.value = 0
    lastDelayMs.value = 0
    chunkCount.value = 0
    isStreaming.value = true
    isPaused.value = false
    scheduleNext(true)
  }

  function pause() {
    if (!isStreaming.value)
      return

    isPaused.value = true
    clearTimer()
  }

  function resume() {
    if (!isStreaming.value || !isPaused.value)
      return

    isPaused.value = false
    const transportMode = (toValue(options.transportMode) ?? 'scheduler') as StreamTransportMode
    if (transportMode === 'scheduler')
      scheduleNext()
  }

  function togglePause() {
    if (isPaused.value)
      resume()
    else
      pause()
  }

  function reset() {
    stop()
    content.value = ''
    chunks.value = []
    chunkCount.value = 0
    lastChunkSize.value = 0
    lastDelayMs.value = 0
    burstState.quickChunksRemaining = 0
    burstState.fastCadenceChunkPending = false
  }

  onBeforeUnmount(() => {
    stop()
  })

  return {
    chunkCount,
    content,
    chunks,
    isStreaming,
    isPaused,
    lastChunkSize,
    lastDelayMs,
    pause,
    progress,
    reset,
    resume,
    start,
    stop,
    togglePause,
  }
}
