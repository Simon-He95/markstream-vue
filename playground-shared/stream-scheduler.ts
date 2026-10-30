import type { StreamSliceMode } from '../playground/src/composables/createLocalTextStream'

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

export function normalizeRatio(value: number, fallback: number) {
  return clampStreamControl(value, 0, 1, fallback)
}

export function randomBetween(min: number, max: number, random: () => number) {
  return min + ((max - min) * random())
}

export function randomInt(min: number, max: number, random: () => number) {
  return Math.floor(randomBetween(min, max + 1, random))
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

export function sampleChunkSize(
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

export function sampleDelayMs(
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
