<script setup lang="ts">
import type { StreamingTextScope } from 'markstream-core'
import { createStreamingTextDom } from 'markstream-core'
import { computed, getCurrentInstance, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue-demi'

const props = defineProps<{ node: { type: 'inline_code', code: string, raw: string } }>()

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

const scope = inject<StreamingTextScope | undefined>('markstreamTextScope', undefined)
const host = ref<HTMLElement>()
const initial = props.node.code
let binding: ReturnType<typeof createStreamingTextDom> | undefined
function update() {
  const content = props.node.code
  const key = streamStateKey.value
  binding?.update(content, fadeEnabled.value, key ? inheritedTextStreamState?.get(key) : undefined)
  if (key)
    inheritedTextStreamState?.set(key, content)
}
onMounted(() => {
  binding = createStreamingTextDom(host.value!, initial, scope)
  update()
})
watch([() => props.node.code, streamStateKey, fadeEnabled], update)
onBeforeUnmount(() => binding?.dispose())
</script>

<template>
  <code ref="host" class="inline text-[85%] px-1 py-0.5 rounded font-mono bg-[hsl(var(--secondary))] whitespace-normal break-words max-w-full before:content-[''] after:content-['']"><span>{{ initial }}</span></code>
</template>
