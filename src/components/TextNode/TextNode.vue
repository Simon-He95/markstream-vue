<script setup lang="ts">
import { resolveStreamingTextUpdate } from 'markstream-core'
import { computed, inject, ref, useAttrs, watch } from 'vue'
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
const attrs = useAttrs()
const inheritedFade = inject<{ value?: boolean } | undefined>('markstreamFade', undefined)
const inheritedTextStreamState = inject<Map<string, string> | undefined>('markstreamTextStreamState', undefined)
const inheritedStreamVersion = inject<{ value?: number } | undefined>('markstreamStreamVersion', undefined)
const explicitFade = computed<boolean | undefined>(() => {
  const raw = attrs.fade
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
  const raw = attrs['index-key'] ?? attrs.indexKey
  if (raw == null || raw === '')
    return ''
  return String(raw)
})
const settledContent = ref(props.node.content)
const streamedDelta = ref('')
let lastStreamVersion: number | undefined = inheritedStreamVersion?.value
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
  ([next, _key, _fade, version]) => {
    const normalized = String(next ?? '')
    const key = streamStateKey.value
    const versionChanged = version !== lastStreamVersion
    lastStreamVersion = version

    const result = resolveStreamingTextUpdate({
      nextContent: normalized,
      persistedContent: key ? inheritedTextStreamState?.get(key) : undefined,
      currentState: { settledContent: settledContent.value, streamedDelta: streamedDelta.value },
      typewriterEnabled: fadeEnabled.value,
      streamRenderVersionChanged: versionChanged,
    })

    settledContent.value = result.settledContent
    streamedDelta.value = result.streamedDelta
    if (result.appended)
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
  animation-duration: var(--stream-update-fade-duration, var(--fade-duration, 280ms));
  animation-timing-function: var(--stream-update-fade-ease, var(--fade-ease, cubic-bezier(0.33, 0, 0.67, 1)));
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
