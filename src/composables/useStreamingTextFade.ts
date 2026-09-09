import { ref, shallowRef } from 'vue'

interface FadeSegment {
  id: number
  content: string
  startedAt: number
  finished: boolean
}

const BATCH_WINDOW_MS = 50
const MAX_SEGMENTS = 4

export function useStreamingTextFade(initialContent: string) {
  const settledContent = ref(initialContent)
  const segments = shallowRef<FadeSegment[]>([])
  let renderedContent = initialContent
  let nextId = 0

  function update(content: string, persistedContent: string | undefined, enabled: boolean) {
    if (enabled && content === renderedContent && (!persistedContent || persistedContent === content || segments.value.length > 0))
      return

    const previous = persistedContent ?? renderedContent
    if (enabled && previous && content.length > previous.length && content.startsWith(previous)) {
      if (previous !== renderedContent) {
        settledContent.value = previous
        segments.value = []
      }
      const delta = content.slice(previous.length)
      const now = performance.now()
      const last = segments.value.at(-1)
      // Reuse a short batch without restarting its animation. The cap also
      // bounds DOM growth when callers supply a much longer CSS duration.
      if (last && (now - last.startedAt < BATCH_WINDOW_MS || segments.value.length >= MAX_SEGMENTS)) {
        segments.value = [...segments.value.slice(0, -1), { ...last, content: last.content + delta }]
      }
      else {
        segments.value = [...segments.value, { id: nextId++, content: delta, startedAt: now, finished: false }]
      }
    }
    else {
      settledContent.value = content
      segments.value = []
    }
    renderedContent = content
  }

  function settleFinished() {
    let count = 0
    let appended = ''
    for (const segment of segments.value) {
      if (!segment.finished)
        break
      appended += segment.content
      count++
    }
    if (count) {
      settledContent.value += appended
      segments.value = segments.value.slice(count)
    }
  }

  function finish(id: number, defer = false) {
    const segment = segments.value.find(segment => segment.id === id)
    if (!segment)
      return
    segment.finished = true
    if (!defer)
      settleFinished()
  }

  return { settledContent, segments, update, finish, settleFinished }
}
