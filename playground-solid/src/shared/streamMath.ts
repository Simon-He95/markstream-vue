export interface ChunkInfo {
  content: string
  delay: number
  index: number
}

export interface LocalStreamControl {
  shouldPause?: () => boolean
  signal?: AbortSignal
}

export type StreamSliceMode = 'pure-random' | 'boundary-aware'
export type StreamTransportMode = 'scheduler' | 'readable-stream'

export interface StreamSimulatorOptions {
  source: string
  chunkSizeMin: number
  chunkSizeMax: number
  chunkDelayMin: number
  chunkDelayMax: number
  burstiness: number
  sliceMode?: StreamSliceMode
  transportMode?: StreamTransportMode
  random?: () => number
}

export interface CreateLocalTextStreamOptions {
  chunkSizeMin: number
  chunkSizeMax: number
  chunkDelayMin: number
  chunkDelayMax: number
  onChunk?: (chunk: ChunkInfo) => void
  control?: LocalStreamControl
  random?: () => number
  sliceMode?: StreamSliceMode
}

const WORD_BOUNDARY = /[\s,.;:!?()[\]{}"'`<>/\-\\]/

export interface BurstState {
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

function isBoundaryChar(char: string | undefined) {
  return char ? WORD_BOUNDARY.test(char) : false
}

export function snapChunkToBoundary(source: string, start: number, desiredChunk: number) {
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

export function sampleChunkSizeFromRange(
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
  if (remaining > 6 && random() < 0.72)
    chunkSize = Math.min(remaining, snapChunkToBoundary(source, start, chunkSize))

  return Math.max(1, chunkSize)
}

export function sampleDelayMsFromRange(
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

export function createLocalTextStream(content: string, options: CreateLocalTextStreamOptions) {
  const encoder = new TextEncoder()
  const random = options.random ?? Math.random
  const control = options.control ?? {}
  let currentPosition = 0
  let chunkIndex = 0

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  const waitIfPaused = async () => {
    while (control.shouldPause?.()) {
      if (control.signal?.aborted)
        return
      await sleep(50)
    }
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      while (currentPosition < content.length) {
        if (control.signal?.aborted)
          break

        await waitIfPaused()
        if (control.signal?.aborted)
          break

        const rawChunkSize = randomInt(options.chunkSizeMin, options.chunkSizeMax, random)
        const chunkSize = options.sliceMode === 'boundary-aware'
          ? snapChunkToBoundary(content, currentPosition, rawChunkSize)
          : rawChunkSize
        const delay = randomInt(options.chunkDelayMin, options.chunkDelayMax, random)
        const chunkContent = content.slice(currentPosition, currentPosition + chunkSize)

        await sleep(delay)
        if (control.signal?.aborted)
          break

        await waitIfPaused()
        if (control.signal?.aborted)
          break

        controller.enqueue(encoder.encode(chunkContent))
        options.onChunk?.({
          index: chunkIndex++,
          content: chunkContent,
          delay,
        })

        currentPosition += chunkSize
      }

      try {
        controller.close()
      }
      catch {
        // The consumer may have already canceled the stream.
      }
    },
  })
}

export { normalizeRatio }
