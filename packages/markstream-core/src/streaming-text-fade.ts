export interface FadeSegment {
  id: number
  content: string
  startedAt: number
  finished: boolean
}

interface WordSegmenter {
  segment: (input: string) => Iterable<{ segment: string, isWordLike?: boolean }>
}

const Segmenter = (Intl as unknown as {
  Segmenter?: new (locale?: string, options?: { granularity: 'word' }) => WordSegmenter
}).Segmenter
const wordSegmenter = Segmenter ? new Segmenter(undefined, { granularity: 'word' }) : null
const MAX_WORDS_PER_UPDATE = 64

function splitWords(text: string): string[] {
  const words: string[] = []
  let ascii = true
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) > 127) {
      ascii = false
      break
    }
  }
  const parts = ascii || !wordSegmenter
    ? Array.from(text.matchAll(/[a-z0-9]+|[^a-z0-9]+/gi), ([segment]) => ({ segment, isWordLike: /^[a-z0-9]/i.test(segment) }))
    : wordSegmenter.segment(text)
  for (const { segment, isWordLike } of parts) {
    if (isWordLike || !words.length)
      words.push(segment)
    else
      words[words.length - 1] += segment
  }
  return words
}

export function createStreamingTextFade(initialContent: string) {
  let settledContent = initialContent
  let segments: FadeSegment[] = []
  let renderedContent = initialContent
  let nextId = 0
  let lastWord: FadeSegment | undefined

  function update(content: string, persistedContent: string | undefined, enabled: boolean) {
    if (!enabled && content === renderedContent && segments.length === 0)
      return
    if (enabled && content === renderedContent && (!persistedContent || persistedContent === content || segments.length > 0))
      return

    const previous = persistedContent ?? renderedContent
    if (enabled && previous && content.length > previous.length && content.startsWith(previous)) {
      if (previous !== renderedContent) {
        settledContent = previous
        segments = []
        lastWord = undefined
      }
      const delta = content.slice(previous.length)
      let words = splitWords((lastWord?.content ?? '') + delta)
      if (lastWord && words[0]?.startsWith(lastWord.content)) {
        const extended = words.shift()!
        const index = segments.findIndex(segment => segment.id === lastWord!.id)
        if (index < 0) {
          settledContent += extended.slice(lastWord.content.length)
        }
        else {
          segments = [...segments]
          segments[index] = { ...lastWord, content: extended }
        }
        lastWord = { ...lastWord, content: extended }
      }
      else if (lastWord) {
        // A dictionary can revise the last CJK word as more text arrives.
        // Keep already displayed boundaries stable instead of replaying them.
        words = splitWords(delta)
      }
      if (!segments.length && words.length && /^\s+$/.test(words[0]))
        settledContent += words.shift()

      // Words born in the same update have identical opacity. Compact large
      // chunks together, retaining the final word for later continuation.
      if (words.length > MAX_WORDS_PER_UPDATE)
        words = [words.slice(0, -1).join(''), words[words.length - 1]]

      if (words.length) {
        const startedAt = performance.now()
        const appended = words.map(content => ({ id: nextId++, content, startedAt, finished: false }))
        segments = [...segments, ...appended]
        lastWord = appended[appended.length - 1]
      }
    }
    else {
      settledContent = content
      segments = []
      lastWord = undefined
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
    if (lastWord?.id === id)
      lastWord = segment
    if (!defer)
      settleFinished()
  }

  function finishAll(defer = false) {
    for (const segment of segments)
      segment.finished = true
    if (segments.length)
      lastWord = segments[segments.length - 1]
    if (!defer)
      settleFinished()
  }

  return { getSnapshot: () => ({ settledContent, segments }), update, finish, finishAll, settleFinished }
}
