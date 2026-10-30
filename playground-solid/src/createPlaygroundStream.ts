import type { Accessor } from 'solid-js'
import type { BurstState } from '../../playground-shared/stream-scheduler'
import type { StreamSliceMode } from '../../playground/src/composables/createLocalTextStream'
import { batch, createMemo, createSignal, onCleanup } from 'solid-js'
import { normalizeStreamRange, sampleChunkSizeFromRange, sampleDelayMsFromRange } from '../../playground-shared/stream-scheduler'
import { createLocalTextStream } from '../../playground/src/composables/createLocalTextStream'

export interface StreamSettings {
  mode: 'tps' | 'chunks'
  targetTps: number
  chunkSizeMin: number
  chunkSizeMax: number
  chunkDelayMin: number
  chunkDelayMax: number
  burstiness: number
  transport: 'readable-stream' | 'scheduler'
  sliceMode: StreamSliceMode
}

export function createPlaygroundStream(source: Accessor<string>, settings: Accessor<StreamSettings>) {
  const [content, setContent] = createSignal(source())
  const [final, setFinal] = createSignal(true)
  const [running, setRunning] = createSignal(false)
  const [paused, setPaused] = createSignal(false)
  const [elapsed, setElapsed] = createSignal(0)
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let started = 0
  let activeMs = 0
  let runSource = ''
  let runChars: string[] = []
  let sent = 0
  let runSettings = settings()
  const burst: BurstState = { quickChunksRemaining: 0, fastCadenceChunkPending: false }
  const totalTokens = createMemo(() => Array.from(source()).length / 4)
  const progress = createMemo(() => source().length ? content().length / source().length * 100 : 0)
  const actualTps = createMemo(() => elapsed() > 0 ? Array.from(content()).length / 4 / (elapsed() / 1000) : 0)
  function stop() {
    clearTimeout(timer)
    controller?.abort()
    controller = undefined
    setRunning(false)
    setPaused(false)
  }
  function updateElapsed() {
    setElapsed(activeMs + performance.now() - started)
  }
  function complete() {
    updateElapsed()
    setContent(runSource)
    stop()
    setFinal(true)
  }
  function pump() {
    if (!running() || paused())
      return
    updateElapsed()
    if (runSettings.mode === 'tps') {
      const end = Math.min(runChars.length, Math.floor(elapsed() * runSettings.targetTps * 4 / 1000))
      setContent(previous => previous + runChars.slice(sent, end).join(''))
      sent = end
      if (sent >= runChars.length) {
        complete()
        return
      }
      timer = setTimeout(pump, 20)
      return
    }
    const size = normalizeStreamRange(runSettings.chunkSizeMin, runSettings.chunkSizeMax, 1, 24, 2, 7)
    const count = sampleChunkSizeFromRange(runSource, content().length, size.min, size.max, burst, runSettings.sliceMode, Math.random)
    setContent(runSource.slice(0, content().length + count))
    if (burst.fastCadenceChunkPending) {
      burst.fastCadenceChunkPending = false
      burst.quickChunksRemaining = Math.max(0, burst.quickChunksRemaining - 1)
    }
    if (content().length >= runSource.length) {
      complete()
      return
    }
    schedule()
  }
  function schedule() {
    const delay = normalizeStreamRange(runSettings.chunkDelayMin, runSettings.chunkDelayMax, 8, 240, 14, 34)
    timer = setTimeout(pump, sampleDelayMsFromRange(delay.min, delay.max, runSettings.burstiness / 100, burst, content().length === 0, runSettings.sliceMode === 'pure-random', Math.random))
  }
  async function readStream(signal: AbortSignal) {
    const size = normalizeStreamRange(runSettings.chunkSizeMin, runSettings.chunkSizeMax, 1, 24, 2, 7)
    const delay = normalizeStreamRange(runSettings.chunkDelayMin, runSettings.chunkDelayMax, 8, 240, 14, 34)
    const reader = createLocalTextStream(runSource, {
      chunkSizeMin: size.min,
      chunkSizeMax: size.max,
      chunkDelayMin: delay.min,
      chunkDelayMax: delay.max,
      sliceMode: runSettings.sliceMode,
      control: { signal, shouldPause: paused },
    }).getReader()
    const decoder = new TextDecoder()
    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read()
        if (signal.aborted)
          return
        if (done) {
          complete()
          return
        }
        batch(() => {
          updateElapsed()
          setContent(previous => previous + decoder.decode(value, { stream: true }))
        })
      }
    }
    finally {
      reader.releaseLock()
    }
  }
  function start() {
    stop()
    runSettings = { ...settings() }
    runSource = source()
    runChars = Array.from(runSource)
    sent = 0
    activeMs = 0
    started = performance.now()
    burst.quickChunksRemaining = 0
    burst.fastCadenceChunkPending = false
    batch(() => {
      setContent('')
      setElapsed(0)
      setFinal(!runSource.length)
      setRunning(!!runSource.length)
    })
    if (!runSource.length)
      return
    if (runSettings.mode === 'tps') {
      pump()
    }
    else if (runSettings.transport === 'readable-stream') {
      controller = new AbortController()
      void readStream(controller.signal)
    }
    else {
      schedule()
    }
  }
  function pause() {
    if (!running() || paused())
      return
    clearTimeout(timer)
    activeMs += performance.now() - started
    setElapsed(activeMs)
    setPaused(true)
  }
  function resume() {
    if (!running() || !paused())
      return
    started = performance.now()
    setPaused(false)
    if (runSettings.mode === 'tps')
      pump()
    else if (runSettings.transport === 'scheduler')
      schedule()
  }
  function restore(next = source()) {
    stop()
    batch(() => {
      setContent(next)
      setFinal(true)
      setElapsed(0)
    })
  }
  onCleanup(stop)
  return { content, final, running, paused, elapsed, actualTps, totalTokens, progress, start, stop, pause, resume, restore }
}
