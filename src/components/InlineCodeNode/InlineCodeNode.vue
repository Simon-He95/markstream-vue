<script setup lang="ts">
import { computed, inject, useAttrs, watch } from 'vue'
import { useStreamingTextFade } from '../../composables/useStreamingTextFade'

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
const codeContent = computed(() => String(props.node.code ?? ''))
const canRenderStaticCode = computed(() => !fadeEnabled.value)
const streamStateKey = computed(() => {
  const raw = attrs['index-key'] ?? attrs.indexKey
  if (raw == null || raw === '')
    return ''
  return String(raw)
})
const { settledContent: settledCode, segments, update, finish } = useStreamingTextFade(props.node.code)

watch(
  [() => props.node.code, streamStateKey, fadeEnabled],
  ([next]) => {
    const normalized = String(next ?? '')
    const key = streamStateKey.value
    update(normalized, key ? inheritedTextStreamState?.get(key) : undefined, fadeEnabled.value)
    if (key)
      inheritedTextStreamState?.set(key, normalized)
  },
  { immediate: true },
)
</script>

<template>
  <code
    class="inline-code"
  >
    <template v-if="canRenderStaticCode">{{ codeContent }}</template>
    <template v-else>
      <span v-if="settledCode">{{ settledCode }}</span>
      <span
        v-for="segment in segments"
        :key="segment.id"
        class="inline-code-stream-delta"
        @animationend="finish(segment.id)"
      >
        {{ segment.content }}
      </span>
    </template>
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
  animation: inline-code-stream-update-fade var(--stream-update-fade-duration, var(--fade-duration, 200ms))
    var(--stream-update-fade-ease, var(--fade-ease, cubic-bezier(0.2, 0, 0.4, 1))) both;
}

@keyframes inline-code-stream-update-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .inline-code-stream-delta {
    animation-duration: 0s !important;
  }
}
</style>
