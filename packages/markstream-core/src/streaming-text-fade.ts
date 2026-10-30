export interface FadeSegment {
  id: number
  content: string
  startedAt: number
  finished: boolean
}

const BATCH_WINDOW_MS = 50
const MAX_SEGMENTS = 4

export function createStreamingTextFade(initialContent: string) {
  let settledContent = initialContent
  let segments: FadeSegment[] = []
  let renderedContent = initialContent
  let nextId = 0

  function update(content: string, persistedContent: string | undefined, enabled: boolean) {
    if (enabled && content === renderedContent && (!persistedContent || persistedContent === content || segments.length > 0))
      return

    const previous = persistedContent ?? renderedContent
    if (enabled && previous && content.length > previous.length && content.startsWith(previous)) {
      if (previous !== renderedContent) {
        settledContent = previous
        segments = []
      }
      const delta = content.slice(previous.length)
      const now = performance.now()
      const last = segments.at(-1)
      // Reuse a short batch without restarting its animation. The cap also
      // bounds DOM growth when callers supply a much longer CSS duration.
      if (last && (now - last.startedAt < BATCH_WINDOW_MS || segments.length >= MAX_SEGMENTS)) {
        segments = [...segments.slice(0, -1), { ...last, content: last.content + delta }]
      }
      else {
        segments = [...segments, { id: nextId++, content: delta, startedAt: now, finished: false }]
      }
    }
    else {
      settledContent = content
      segments = []
    }
    renderedContent = content
  }

  function settleFinished() {
    let count = 0
    let appended = ''
    for (const segment of segments) {
      if (!segment.finished)
        break
      appended += segment.content
      count++
    }
    if (count) {
      settledContent += appended
      segments = segments.slice(count)
    }
  }

  function finish(id: number, defer = false) {
    const segment = segments.find(segment => segment.id === id)
    if (!segment)
      return
    segment.finished = true
    if (!defer)
      settleFinished()
  }

  return { getSnapshot: () => ({ settledContent, segments }), update, finish, settleFinished }
}
