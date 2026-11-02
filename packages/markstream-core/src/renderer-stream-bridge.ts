import type { SmoothMarkdownStreamController } from './types'

export const RENDERER_STREAM_DEFAULTS = {
  maxCharsPerSecond: 3000,
  maxCommitFps: 20,
  startDelayMs: 0,
  flushOnFinish: true,
  maxCharsPerCommit: 160,
  catchUpLatencyMs: 220,
  catchUpThreshold: 400,
}

type Stream = Pick<SmoothMarkdownStreamController, 'enqueue' | 'finish' | 'flush' | 'reset' | 'pause' | 'resume'> & {
  getSnapshot: () => { source: string, pendingChars: number, caughtUp: boolean }
}

export function createRendererStreamBridge(stream: Stream, options: {
  flushOnFinish?: boolean
  commit: (work: () => void) => void | Promise<void>
  measure?: () => void
  onReady: (ready: boolean) => void
}) {
  let ready = false
  let finishing = false
  let frame = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let epoch = 0
  let batchSize = 256
  let lastCost = 0
  let observedOpenStream = false
  let smallAppends = 0
  let continuous = false
  let disposed = false
  const cleanups: Array<() => void> = []
  const client = typeof document !== 'undefined' && typeof requestAnimationFrame === 'function'
  const setReady = (value: boolean) => {
    ready = value
    options.onReady(value)
  }
  function cancelSchedule() {
    if (frame)
      cancelAnimationFrame(frame)
    if (timer != null)
      clearTimeout(timer)
    frame = 0
    timer = undefined
  }
  function stop(resume = true) {
    cancelSchedule()
    epoch++
    if (finishing) {
      document.removeEventListener('visibilitychange', visibilityChanged)
      finishing = false
      if (resume)
        stream.resume()
    }
    if (cleanups.length && !disposed)
      schedule()
  }
  function schedule() {
    if (disposed || frame || timer != null)
      return
    if (document.visibilityState === 'hidden') {
      timer = setTimeout(drain, 200)
    }
    else {
      frame = requestAnimationFrame(() => {
        frame = 0
        const start = performance.now()
        options.measure?.()
        const cost = Math.max(1, lastCost + performance.now() - start)
        batchSize = Math.max(256, Math.min(1024, Math.floor(batchSize * Math.max(0.25, Math.min(1.5, 12 / cost)))))
        // Paint the previous commit before starting another parse / DOM update.
        timer = setTimeout(drain, 0)
      })
    }
  }
  function visibilityChanged() {
    cancelSchedule()
    schedule()
  }
  async function drain() {
    frame = 0
    timer = undefined
    const currentEpoch = epoch
    const start = performance.now()
    while (cleanups.length) {
      await options.commit(cleanups.shift()!)
      if (currentEpoch !== epoch || disposed)
        return
      if (performance.now() - start >= 12) {
        lastCost = performance.now() - start
        schedule()
        return
      }
    }
    if (!finishing)
      return
    if (!stream.getSnapshot().pendingChars) {
      stop()
      await options.commit(() => setReady(true))
      return
    }
    await options.commit(() => stream.flush({ maxChars: batchSize }))
    if (currentEpoch !== epoch || disposed)
      return
    lastCost = performance.now() - start
    schedule()
  }
  function finish() {
    const flush = options.flushOnFinish !== false
    if (!flush || !client || stream.getSnapshot().source.length <= 1024) {
      stream.finish({ flush })
      setReady(true)
      return
    }
    stream.pause()
    finishing = true
    stream.finish({ flush: false })
    batchSize = 256
    lastCost = 12
    if (stream.getSnapshot().pendingChars <= 1024)
      stream.flush()
    document.addEventListener('visibilitychange', visibilityChanged)
    schedule()
  }
  return {
    update(content: string, hasNodes: boolean, enabled: boolean, final: boolean | undefined, fade = true) {
      disposed = false
      if (!hasNodes && final !== true)
        observedOpenStream = true
      if (!observedOpenStream && !hasNodes && final === true) {
        stop()
        stream.reset(content)
        stream.finish({ flush: true })
        setReady(true)
        return
      }
      const snapshot = stream.getSnapshot()
      if (!hasNodes && final === true && ready && content === snapshot.source && snapshot.caughtUp)
        return
      setReady(false)
      stop()
      if (hasNodes || !enabled) {
        smallAppends = 0
        continuous = false
        stream.reset(hasNodes ? '' : content)
        if (!hasNodes && final)
          stream.finish({ flush: true })
        setReady(!hasNodes && final === true)
        return
      }
      let replaced = false
      if (!content || !content.startsWith(snapshot.source)) {
        smallAppends = 0
        continuous = false
        stream.reset(content)
        replaced = !!content
      }
      else if (content !== snapshot.source) {
        const appended = content.slice(snapshot.source.length)
        if (!fade && appended.length <= 8) {
          smallAppends++
          if (continuous || (smallAppends >= 2 && snapshot.pendingChars <= 8)) {
            continuous = true
            stream.reset(content, { prefixKnown: true })
          }
          else {
            stream.enqueue(appended)
          }
        }
        else {
          smallAppends = 0
          continuous = false
          stream.enqueue(appended)
        }
      }
      if (final) {
        if (replaced) {
          stream.finish({ flush: true })
          setReady(true)
        }
        else {
          finish()
        }
      }
    },
    scheduleCleanup(work: () => void) {
      if (disposed)
        return
      if (!client) {
        work()
        return
      }
      cleanups.push(work)
      schedule()
    },
    dispose() {
      disposed = true
      cleanups.length = 0
      stop(false)
    },
  }
}
