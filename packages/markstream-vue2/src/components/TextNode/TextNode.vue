<script setup lang="ts">
import { computed, getCurrentInstance, inject, ref, watch } from 'vue-demi'
import { useKatexReady } from '../../composables/useKatexReady'

interface StreamSegment {
  id: number
  content: string
  fading: boolean
}

const props = defineProps<{
  node: {
    type: 'text'
    content: string
    raw: string
    center?: boolean
  }
}>()
defineEmits(['copy'])

function settleAndMergeSegments(current: StreamSegment[], segmentId?: number) {
  return current.reduce<StreamSegment[]>((result, segment) => {
    const nextSegment = segmentId == null || segment.id === segmentId
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

const katexReady = useKatexReady()
const instance = getCurrentInstance()
const attrs = computed<Record<string, unknown>>(() => ((instance?.proxy as any)?.$attrs ?? {}) as Record<string, unknown>)
const inheritedFade = inject<{ value?: boolean } | undefined>('markstreamFade', undefined)
const inheritedTextStreamState = inject<Map<string, string> | undefined>('markstreamTextStreamState', undefined)
const inheritedStreamVersion = inject<{ value?: number } | undefined>('markstreamStreamVersion', undefined)
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
const segments = ref<StreamSegment[]>(props.node.content
  ? [{ id: 0, content: props.node.content, fading: false }]
  : [])
const renderedContent = ref(props.node.content)
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

function settleFadingSegments() {
  if (!segments.value.some(segment => segment.fading))
    return
  segments.value = settleAndMergeSegments(segments.value)
}

function streamedDeltaClass(segment: StreamSegment) {
  return segment.id % 2 === 0
    ? 'text-node-stream-delta--a'
    : 'text-node-stream-delta--b'
}

watch(
  [() => props.node.content, streamStateKey, fadeEnabled, () => inheritedStreamVersion?.value],
  ([next]) => {
    const normalized = String(next ?? '')
    const key = streamStateKey.value
    const previousPersisted = key
      ? inheritedTextStreamState?.get(key)
      : undefined
    const previousContent = previousPersisted ?? renderedContent.value
    const resumeFromPersistedContent = previousPersisted !== undefined
      && previousPersisted !== renderedContent.value

    if (!fadeEnabled.value) {
      setFullContent(normalized)
      renderedContent.value = normalized
      if (key)
        inheritedTextStreamState?.set(key, normalized)
      return
    }

    if (normalized === previousContent) {
      if (segments.value.some(segment => segment.fading))
        settleFadingSegments()
      else if (renderedContent.value !== normalized)
        setFullContent(normalized)
      if (key)
        inheritedTextStreamState?.set(key, normalized)
      renderedContent.value = normalized
      return
    }

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

    renderedContent.value = normalized
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
    setFullContent(renderedContent.value)
  },
)
</script>

<template>
  <span
    :class="[katexReady && node.center ? 'text-node-center' : '']"
    class="whitespace-pre-wrap break-words text-node"
  >
    <span
      v-for="segment in segments"
      :key="segment.id"
      :class="segment.fading ? ['text-node-stream-delta', streamedDeltaClass(segment)] : undefined"
      @animationend="segment.fading && settleSegment(segment.id)"
    >
      {{ segment.content }}
    </span>
  </span>
</template>

<style scoped>
.text-node {
  display: inline;
  font-weight: inherit;
  vertical-align: baseline;
}
.text-node-center {
  display: inline-flex;
  justify-content: center;
  width: 100%;
}
.text-node-stream-delta {
  animation-duration: var(--stream-update-fade-duration, var(--fade-duration, var(--typewriter-fade-duration, 280ms)));
  animation-timing-function: var(--stream-update-fade-ease, var(--fade-ease, var(--typewriter-fade-ease, cubic-bezier(0.33, 0, 0.67, 1))));
  animation-fill-mode: both;
}
.text-node-stream-delta--a {
  animation-name: text-node-stream-update-fade-a;
}
.text-node-stream-delta--b {
  animation-name: text-node-stream-update-fade-b;
}

@keyframes text-node-stream-update-fade-a {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes text-node-stream-update-fade-b {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .text-node-stream-delta {
    animation: none !important;
  }
}
</style>
