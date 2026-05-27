<script setup lang="ts">
import { resolveStreamingTextState } from 'markstream-core'
import { computed, getCurrentInstance, inject, ref, watch } from 'vue-demi'
import { useKatexReady } from '../../composables/useKatexReady'

const props = defineProps<{
  node: {
    type: 'text'
    content: string
    raw: string
    center?: boolean
  }
}>()
defineEmits(['copy'])
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
const settledContent = ref(props.node.content)
const streamedDelta = ref('')
const streamFadeVersion = ref(0)

function getRenderedContent() {
  return settledContent.value + streamedDelta.value
}

function setFullContent(next: string) {
  settledContent.value = next
  streamedDelta.value = ''
}

function settleStreamedDelta() {
  if (!streamedDelta.value)
    return
  settledContent.value = getRenderedContent()
  streamedDelta.value = ''
}

watch(
  [() => props.node.content, streamStateKey, fadeEnabled, () => inheritedStreamVersion?.value],
  ([next]) => {
    const normalized = String(next ?? '')
    const rendered = getRenderedContent()
    const key = streamStateKey.value
    const previousPersisted = key
      ? inheritedTextStreamState?.get(key)
      : undefined
    const previousContent = previousPersisted ?? rendered

    if (!fadeEnabled.value) {
      setFullContent(normalized)
      if (key)
        inheritedTextStreamState?.set(key, normalized)
      return
    }

    if (normalized === previousContent) {
      if (streamedDelta.value)
        settleStreamedDelta()
      else if (rendered !== normalized)
        setFullContent(normalized)
      if (key)
        inheritedTextStreamState?.set(key, normalized)
      return
    }

    const nextState = resolveStreamingTextState({
      nextContent: normalized,
      previousContent,
      typewriterEnabled: fadeEnabled.value,
    })

    settledContent.value = nextState.settledContent
    streamedDelta.value = nextState.streamedDelta
    if (nextState.appended)
      streamFadeVersion.value += 1
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
    setFullContent(getRenderedContent())
  },
)

const streamedDeltaClass = computed(() => (
  streamFadeVersion.value % 2 === 0
    ? 'text-node-stream-delta--a'
    : 'text-node-stream-delta--b'
))
</script>

<template>
  <span
    :class="[katexReady && node.center ? 'text-node-center' : '']"
    class="whitespace-pre-wrap break-words text-node"
  >
    <span v-if="settledContent">{{ settledContent }}</span>
    <span
      v-if="streamedDelta"
      class="text-node-stream-delta" :class="[streamedDeltaClass]"
      @animationend="settleStreamedDelta"
    >
      {{ streamedDelta }}
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
  will-change: opacity;
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
