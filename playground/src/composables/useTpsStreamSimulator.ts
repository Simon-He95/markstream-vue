import type { MaybeRefOrGetter } from 'vue'
import { computed, onBeforeUnmount, ref, toValue } from 'vue'

// A repeatable visual approximation, independent of any model tokenizer.
export const ESTIMATED_CHARS_PER_TOKEN = 4

export function useTpsStreamSimulator(options: {
  source: MaybeRefOrGetter<string>
  targetTps: MaybeRefOrGetter<number>
}) {
  const content = ref('')
  const isStreaming = ref(false)
  const isPaused = ref(false)
  const elapsedMs = ref(0)
  const sentChars = ref(0)
  const sourceChars = computed(() => Array.from(toValue(options.source)))
  const totalTokens = computed(() => sourceChars.value.length / ESTIMATED_CHARS_PER_TOKEN)
  const actualTps = computed(() => elapsedMs.value > 0
    ? sentChars.value / ESTIMATED_CHARS_PER_TOKEN / (elapsedMs.value / 1000)
    : 0)
  const progress = computed(() => sourceChars.value.length
    ? sentChars.value / sourceChars.value.length * 100
    : 0)

  let timer: ReturnType<typeof setTimeout> | undefined
  let startedAt = 0
  let activeElapsedMs = 0
  let charsPerSecond = 0
  let runChars: string[] = []

  function clearTimer() {
    clearTimeout(timer)
    timer = undefined
  }

  function stop() {
    clearTimer()
    isStreaming.value = false
    isPaused.value = false
  }

  function tick() {
    elapsedMs.value = activeElapsedMs + performance.now() - startedAt
    const end = Math.min(runChars.length, Math.floor(elapsedMs.value * charsPerSecond / 1000))
    if (end > sentChars.value) {
      content.value += runChars.slice(sentChars.value, end).join('')
      sentChars.value = end
    }

    if (end >= runChars.length) {
      stop()
      return
    }

    // Budget against elapsed time so delayed callbacks do not lower the target rate.
    const remainingMs = runChars.length / charsPerSecond * 1000 - elapsedMs.value
    timer = setTimeout(tick, Math.max(1, Math.min(20, Math.ceil(remainingMs))))
  }

  function start() {
    stop()
    content.value = ''
    elapsedMs.value = 0
    sentChars.value = 0
    activeElapsedMs = 0
    runChars = sourceChars.value
    const requested = Number(toValue(options.targetTps))
    charsPerSecond = Math.min(2000, Math.max(1, Number.isFinite(requested) ? requested : 300)) * ESTIMATED_CHARS_PER_TOKEN
    if (!runChars.length)
      return

    startedAt = performance.now()
    isStreaming.value = true
    tick()
  }

  function pause() {
    if (!isStreaming.value || isPaused.value)
      return

    clearTimer()
    activeElapsedMs += performance.now() - startedAt
    elapsedMs.value = activeElapsedMs
    isPaused.value = true
  }

  function resume() {
    if (!isStreaming.value || !isPaused.value)
      return

    startedAt = performance.now()
    isPaused.value = false
    tick()
  }

  function togglePause() {
    if (isPaused.value)
      resume()
    else
      pause()
  }

  onBeforeUnmount(stop)

  return { content, isStreaming, isPaused, elapsedMs, actualTps, progress, totalTokens, start, stop, pause, resume, togglePause }
}
