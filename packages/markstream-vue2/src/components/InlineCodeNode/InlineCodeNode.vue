<script setup lang="ts">
import { computed, getCurrentInstance, inject, ref, watch } from 'vue-demi'

interface StreamSegment {
  id: number
  content: string
  fading: boolean
}

const props = defineProps<{
  node: {
    type: 'inline_code'
    code: string
    raw: string
  }
}>()

function settleAndMergeSegments(current: StreamSegment[], segmentId: number) {
  return current.reduce<StreamSegment[]>((result, segment) => {
    const nextSegment = segment.id === segmentId
      ? { ...segment, fading: false }
      : segment
    const previousSegment = result[result.length - 1]
    if (previousSegment && !previousSegment.fading && !nextSegment.fading) {
      result[result.length - 1] = {
        ...previousSegment,
        content: previousSegment.content + nextSegment.content,
      }
    }
    else {
      result.push(nextSegment)
    }
    return result
  }, [])
}

const instance = getCurrentInstance()
const attrs = computed<Record<string, unknown>>(() => ((instance?.proxy as any)?.$attrs ?? {}) as Record<string, unknown>)
const inheritedFade = inject<{ value?: boolean } | undefined>('markstreamFade', undefined)
const inheritedTextStreamState = inject<Map<string, string> | undefined>('markstreamTextStreamState', undefined)
const explicitFade = computed<boolean | undefined>(() => {
  const raw = attrs.value.fade
  if (raw === '' || raw === true || raw === 'true')
    return true
  if (raw === false || raw === 'false')
    return false
  return undefined
})
const fadeEnabled = computed(() => {
  if (typeof explicitFade.value === 'boolean')
    return explicitFade.value
  if (typeof inheritedFade?.value === 'boolean')
    return inheritedFade.value
  return true
})
const streamStateKey = computed(() => {
  const raw = attrs.value['index-key'] ?? attrs.value.indexKey
  if (raw == null || raw === '')
    return ''
  return String(raw)
})
const segments = ref<StreamSegment[]>(props.node.code
  ? [{ id: 0, content: props.node.code, fading: false }]
  : [])
const renderedCode = ref(props.node.code)
let nextSegmentId = 1

function setFullContent(next: string) {
  if (segments.value.length === 1 && !segments.value[0]?.fading && segments.value[0].content === next)
    return
  segments.value = next
    ? [{ id: nextSegmentId++, content: next, fading: false }]
    : []
}

function settleSegment(segmentId: number) {
  if (!segments.value.some(segment => segment.id === segmentId && segment.fading))
    return
  segments.value = settleAndMergeSegments(segments.value, segmentId)
}

function streamedDeltaClass(segment: StreamSegment) {
  return segment.id % 2 === 0
    ? 'inline-code-stream-delta--a'
    : 'inline-code-stream-delta--b'
}

watch(
  [() => props.node.code, streamStateKey, fadeEnabled],
  ([next]) => {
    const normalized = String(next ?? '')
    const key = streamStateKey.value
    const previousPersisted = key
      ? inheritedTextStreamState?.get(key)
      : undefined
    const previousContent = previousPersisted ?? renderedCode.value
    const resumeFromPersistedContent = previousPersisted !== undefined
      && previousPersisted !== renderedCode.value

    if (!fadeEnabled.value) {
      setFullContent(normalized)
    }
    else if (normalized !== previousContent) {
      if (previousContent && normalized.startsWith(previousContent)) {
        const appendedContent = normalized.slice(previousContent.length)
        const lastSegment = segments.value[segments.value.length - 1]
        if (resumeFromPersistedContent) {
          segments.value = [
            { id: nextSegmentId++, content: previousContent, fading: false },
            { id: nextSegmentId++, content: appendedContent, fading: true },
          ]
        }
        else if (lastSegment?.fading) {
          segments.value = [
            ...segments.value.slice(0, -1),
            { ...lastSegment, content: lastSegment.content + appendedContent },
          ]
        }
        else {
          segments.value = [
            ...segments.value,
            { id: nextSegmentId++, content: appendedContent, fading: true },
          ]
        }
      }
      else {
        setFullContent(normalized)
      }
    }

    renderedCode.value = normalized
    if (key)
      inheritedTextStreamState?.set(key, normalized)
  },
  { immediate: true },
)

watch(
  fadeEnabled,
  (enabled) => {
    if (enabled)
      return
    setFullContent(renderedCode.value)
  },
)
</script>

<template>
  <code
    class="inline text-[85%] px-1 py-0.5 rounded font-mono bg-[hsl(var(--secondary))] whitespace-normal break-words max-w-full before:content-[''] after:content-['']"
  >
    <span
      v-for="segment in segments"
      :key="segment.id"
      :class="segment.fading ? ['inline-code-stream-delta', streamedDeltaClass(segment)] : undefined"
      @animationend="segment.fading && settleSegment(segment.id)"
    >
      {{ segment.content }}
    </span>
  </code>
</template>

<style scoped>
.inline-code-stream-delta {
  animation-duration: var(--stream-update-fade-duration, var(--fade-duration, var(--typewriter-fade-duration, 280ms)));
  animation-timing-function: var(--stream-update-fade-ease, var(--fade-ease, var(--typewriter-fade-ease, cubic-bezier(0.33, 0, 0.67, 1))));
  animation-fill-mode: both;
}
.inline-code-stream-delta--a {
  animation-name: inline-code-stream-update-fade-a;
}
.inline-code-stream-delta--b {
  animation-name: inline-code-stream-update-fade-b;
}

@keyframes inline-code-stream-update-fade-a {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes inline-code-stream-update-fade-b {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .inline-code-stream-delta {
    animation: none !important;
  }
}
</style>
