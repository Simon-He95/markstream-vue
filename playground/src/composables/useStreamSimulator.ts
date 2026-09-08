import type { MaybeRefOrGetter } from 'vue'
import type { ChunkInfo, StreamSliceMode } from './createLocalTextStream'
import { computed, onBeforeUnmount, ref, toValue } from 'vue'
import { createLocalTextStream } from './createLocalTextStream'

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

const WORD_BOUNDARY = /[\s,.;:!?()[\]{}"'`<>/\-\\]/

interface BurstState {
  quickChunksRemaining: number
  fastCadenceChunkPending: boolean
}

export function clampStreamControl(value: number, min: number, max: number, fallback: number) {
  const normalized = Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, normalized))
}

export function normalizeStreamRange(
  minValue: number,
  maxValue: number,
  lowerBound: number,
  upperBound: number,
  fallbackMin: number,
  fallbackMax: number,
) {
  const normalizedMin = Math.round(clampStreamControl(minValue, lowerBound, upperBound, fallbackMin))
  const normalizedMax = Math.round(clampStreamControl(maxValue, lowerBound, upperBound, fallbackMax))

  if (normalizedMin <= normalizedMax)
    return { min: normalizedMin, max: normalizedMax }

  return { min: normalizedMax, max: normalizedMin }
}

function normalizeRatio(value: number, fallback: number) {
  return clampStreamControl(value, 0, 1, fallback)
}

function randomBetween(min: number, max: number, random: () => number) {
  return min + ((max - min) * random())
}

function randomInt(min: number, max: number, random: () => number) {
  return Math.floor(randomBetween(min, max + 1, random))
}

function hasExplicitRange(minRef: MaybeRefOrGetter<number> | undefined, maxRef: MaybeRefOrGetter<number> | undefined) {
  return minRef !== undefined || maxRef !== undefined
}

function inferJitterFromRange(min: number, max: number) {
  if (max <= min)
    return 0

  return normalizeRatio((max - min) / Math.max(1, max), 0)
}

function resolveSliceMode(sliceMode: MaybeRefOrGetter<StreamSliceMode> | undefined) {
  return (sliceMode ? toValue(sliceMode) : 'boundary-aware') as StreamSliceMode
}

function isBoundaryChar(char: string | undefined) {
  return char ? WORD_BOUNDARY.test(char) : false
}

function snapChunkToBoundary(source: string, start: number, desiredChunk: number) {
  const preferredEnd = Math.min(source.length, start + desiredChunk)
  if (preferredEnd >= source.length)
    return source.length - start

  if (isBoundaryChar(source[preferredEnd - 1]) || isBoundaryChar(source[preferredEnd]))
    return preferredEnd - start

  const lookaheadEnd = Math.min(source.length, preferredEnd + 12)
  for (let index = preferredEnd; index < lookaheadEnd; index++) {
    if (isBoundaryChar(source[index]))
      return (index + 1) - start
  }

  return preferredEnd - start
}

function sampleChunkSize(
  source: string,
  start: number,
  baseChunkSize: number,
  jitter: number,
  burstiness: number,
  burstState: BurstState,
  sliceMode: StreamSliceMode,
  random: () => number,
) {
  const remaining = source.length - start
  if (remaining <= 0)
    return 0

  const useBurstChunkBias = burstState.fastCadenceChunkPending || burstState.quickChunksRemaining > 0
  const smallChunkBias = jitter > 0.08 && random() < (jitter * 0.4)
  const stableMin = Math.max(0.35, 1 - (jitter * 0.55))
  const stableMax = 1 + (jitter * 1.45)
  const sizeFactor = smallChunkBias
    ? randomBetween(Math.max(0.18, 1 - (jitter * 1.35)), Math.max(0.32, 0.78 - (jitter * 0.08)), random)
    : randomBetween(stableMin, stableMax, random)

  let chunkSize = Math.max(1, Math.round(baseChunkSize * sizeFactor))

  if (useBurstChunkBias) {
    const burstExtra = Math.max(1, Math.round(baseChunkSize * randomBetween(0.75, 2.2 + burstiness, random)))
    chunkSize += burstExtra
  }
  else if (burstiness > 0.05 && random() < (burstiness * 0.22)) {
    const burstExtra = Math.max(1, Math.round(baseChunkSize * randomBetween(1.2, 3.2 + (burstiness * 2), random)))
    chunkSize += burstExtra
  }

  chunkSize = Math.min(remaining, chunkSize)

  if (sliceMode === 'boundary-aware' && remaining > 6 && random() < 0.72)
    chunkSize = Math.min(remaining, snapChunkToBoundary(source, start, chunkSize))

  return Math.max(1, chunkSize)
}

function sampleChunkSizeFromRange(
  source: string,
  start: number,
  chunkSizeMin: number,
  chunkSizeMax: number,
  burstState: BurstState,
  sliceMode: StreamSliceMode,
  random: () => number,
) {
  const remaining = source.length - start
  if (remaining <= 0)
    return 0

  const range = Math.max(0, chunkSizeMax - chunkSizeMin)
  if (range === 0 && sliceMode === 'pure-random')
    return Math.min(remaining, chunkSizeMin)

  if (sliceMode === 'pure-random') {
    const chunkSize = range === 0
      ? chunkSizeMin
      : randomInt(chunkSizeMin, chunkSizeMax, random)
    return Math.max(1, Math.min(remaining, chunkSize))
  }

  if (range === 0)
    return Math.min(remaining, chunkSizeMin)

  const useBurstChunkBias = burstState.fastCadenceChunkPending || burstState.quickChunksRemaining > 0
  const useLowWindow = !useBurstChunkBias && random() < 0.22
  let chunkSize = chunkSizeMax

  if (useBurstChunkBias) {
    const burstMin = Math.max(chunkSizeMin, chunkSizeMax - Math.max(1, Math.floor(range * 0.35)))
    chunkSize = randomInt(burstMin, chunkSizeMax, random)
  }
  else if (useLowWindow) {
    const lowMax = Math.min(chunkSizeMax, chunkSizeMin + Math.max(1, Math.floor(range * 0.4)))
    chunkSize = randomInt(chunkSizeMin, lowMax, random)
  }
  else {
    chunkSize = randomInt(chunkSizeMin, chunkSizeMax, random)
  }

  chunkSize = Math.min(remaining, chunkSize)
  if (sliceMode === 'boundary-aware' && remaining > 6 && random() < 0.72)
    chunkSize = Math.min(remaining, snapChunkToBoundary(source, start, chunkSize))

  return Math.max(1, chunkSize)
}

function sampleDelayMs(
  baseDelayMs: number,
  jitter: number,
  burstiness: number,
  burstState: BurstState,
  isFirstChunk: boolean,
  random: () => number,
) {
  const fastCadence = burstState.quickChunksRemaining > 0
  let delayMs = baseDelayMs * randomBetween(
    fastCadence ? 0.16 : Math.max(0.55, 1 - (jitter * 0.42)),
    fastCadence ? 0.7 : 1 + (jitter * 2.05),
    random,
  )

  if (isFirstChunk && (jitter > 0.05 || burstiness > 0.05))
    delayMs += baseDelayMs * randomBetween(0.35, 1.8 + (jitter * 4.6), random)

  if (!fastCadence && burstiness > 0.05 && random() < (burstiness * 0.24))
    delayMs += baseDelayMs * randomBetween(2.5, 8 + (jitter * 6), random)

  if (!fastCadence && burstiness > 0.08 && random() < (burstiness * 0.2))
    burstState.quickChunksRemaining = randomInt(1, 2 + Math.round(burstiness * 4), random)

  if (fastCadence)
    burstState.fastCadenceChunkPending = true

  return Math.round(clampStreamControl(delayMs, 8, 1800, baseDelayMs))
}

function sampleDelayMsFromRange(
  chunkDelayMin: number,
  chunkDelayMax: number,
  burstiness: number,
  burstState: BurstState,
  isFirstChunk: boolean,
  pureRandom: boolean,
  random: () => number,
) {
  const range = Math.max(0, chunkDelayMax - chunkDelayMin)
  if (range === 0)
    return chunkDelayMin

  if (pureRandom)
    return randomInt(chunkDelayMin, chunkDelayMax, random)

  const fastCadence = burstState.quickChunksRemaining > 0
  if (fastCadence) {
    const quickMax = Math.min(chunkDelayMax, chunkDelayMin + Math.max(1, Math.floor(range * 0.3)))
    burstState.fastCadenceChunkPending = true
    return randomInt(chunkDelayMin, quickMax, random)
  }

  const shouldStall = burstiness > 0.05 && random() < (burstiness * 0.24)
  const shouldBurst = burstiness > 0.08 && random() < (burstiness * 0.18)

  let delayMs: number
  if (isFirstChunk) {
    const warmupMin = Math.min(chunkDelayMax, chunkDelayMin + Math.max(1, Math.floor(range * 0.45)))
    delayMs = randomInt(warmupMin, chunkDelayMax, random)
  }
  else if (shouldStall) {
    const stallMin = Math.max(chunkDelayMin, chunkDelayMax - Math.max(1, Math.floor(range * 0.35)))
    delayMs = randomInt(stallMin, chunkDelayMax, random)
    burstState.quickChunksRemaining = randomInt(1, 2 + Math.round(burstiness * 4), random)
  }
  else {
    delayMs = randomInt(chunkDelayMin, chunkDelayMax, random)
    if (shouldBurst)
      burstState.quickChunksRemaining = randomInt(1, 2 + Math.round(burstiness * 4), random)
  }

  return delayMs
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
