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

function randomInt(min: number, max: number, random: () => number) {
  return Math.floor((random() * ((max - min) + 1))) + min
}

function isBoundaryChar(char: string | undefined) {
  return char ? WORD_BOUNDARY.test(char) : false
}

function snapChunkToBoundary(content: string, start: number, chunkSize: number) {
  const preferredEnd = Math.min(content.length, start + chunkSize)
  if (preferredEnd >= content.length)
    return content.length - start

  if (isBoundaryChar(content[preferredEnd - 1]) || isBoundaryChar(content[preferredEnd]))
    return preferredEnd - start

  const lookaheadEnd = Math.min(content.length, preferredEnd + 12)
  for (let index = preferredEnd; index < lookaheadEnd; index++) {
    if (isBoundaryChar(content[index]))
      return (index + 1) - start
  }

  return preferredEnd - start
}

export function createLocalTextStream(
  content: string,
  options: CreateLocalTextStreamOptions,
) {
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
        let end = Math.min(content.length, currentPosition + chunkSize)
        const last = content.charCodeAt(end - 1)
        const next = content.charCodeAt(end)
        if (last >= 0xD800 && last <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF)
          end++
        const chunkContent = content.slice(currentPosition, end)

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

        currentPosition = end
      }

      try {
        controller.close()
      }
      catch {
        // The consumer may have already canceled the stream.
      }
    },
    cancel() {
      // No extra cleanup is required for the local simulation stream.
    },
  })
}
