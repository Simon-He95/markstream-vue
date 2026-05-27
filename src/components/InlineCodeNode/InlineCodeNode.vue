<script setup lang="ts">
import { resolveStreamingTextUpdate } from 'markstream-core'
import { computed, inject, ref, useAttrs, watch } from 'vue'

const props = defineProps<{
  node: {
    type: 'inline_code'
    code: string
    raw: string
  }
}>()

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
const settledCode = ref(props.node.code)
const streamedDelta = ref('')
let lastStreamVersion: number | undefined = inheritedStreamVersion?.value
const streamFadeVersion = ref(0)

function getRenderedContent() {
  return settledCode.value + streamedDelta.value
}

function setFullContent(next: string) {
  settledCode.value = next
  streamedDelta.value = ''
}

function settleStreamedDelta() {
  if (!streamedDelta.value)
    return
  settledCode.value = getRenderedContent()
  streamedDelta.value = ''
}

watch(
  [() => props.node.code, streamStateKey, fadeEnabled, () => inheritedStreamVersion?.value],
  ([next, _key, _fade, version]) => {
    const normalized = String(next ?? '')
    const key = streamStateKey.value
    const versionChanged = version !== lastStreamVersion
    lastStreamVersion = version

    const result = resolveStreamingTextUpdate({
      nextContent: normalized,
      persistedContent: key ? inheritedTextStreamState?.get(key) : undefined,
      currentState: { settledContent: settledCode.value, streamedDelta: streamedDelta.value },
      typewriterEnabled: fadeEnabled.value,
      streamRenderVersionChanged: versionChanged,
    })

    settledCode.value = result.settledContent
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
    ? 'inline-code-stream-delta--a'
    : 'inline-code-stream-delta--b'
))
</script>

<template>
  <code
    class="inline-code"
  >
    <span v-if="settledCode">{{ settledCode }}</span>
    <span
      v-if="streamedDelta"
      class="inline-code-stream-delta" :class="[streamedDeltaClass]"
      @animationend="settleStreamedDelta"
    >
      {{ streamedDelta }}
    </span>
  </code>
</template>

<style scoped>
.inline-code {
  display: inline;
  font-family: var(--ms-font-mono);
  font-size: 0.8125em;
  line-height: inherit;
  color: var(--inline-code-fg);
  background-color: var(--inline-code-bg);
  padding: 0.15em 0.35em;
  border-radius: 0.25em;
  white-space: normal;
  word-break: break-word;
  max-width: 100%;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}

.inline-code-stream-delta {
  animation-duration: var(--stream-update-fade-duration, var(--fade-duration, 280ms));
  animation-timing-function: var(--stream-update-fade-ease, var(--fade-ease, cubic-bezier(0.33, 0, 0.67, 1)));
  animation-fill-mode: both;
  will-change: opacity;
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
