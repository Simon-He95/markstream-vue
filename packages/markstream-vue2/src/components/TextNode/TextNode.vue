<script setup lang="ts">
import type { StreamingTextScope } from 'markstream-core'
import { createStreamingTextDom } from 'markstream-core'
import { computed, getCurrentInstance, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue-demi'
import { useKatexReady } from '../../composables/useKatexReady'

const props = defineProps<{ node: { type: 'text', content: string, raw: string, center?: boolean } }>()

const katexReady = useKatexReady()
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
const initial = props.node.content
let binding: ReturnType<typeof createStreamingTextDom> | undefined
function update() {
  const content = props.node.content
  const key = streamStateKey.value
  binding?.update(content, fadeEnabled.value, key ? inheritedTextStreamState?.get(key) : undefined)
  if (key)
    inheritedTextStreamState?.set(key, content)
}
onMounted(() => {
  binding = createStreamingTextDom(host.value!, initial, scope)
  update()
})
watch([() => props.node.content, streamStateKey, fadeEnabled], update)
onBeforeUnmount(() => binding?.dispose())
</script>

<template>
  <span ref="host" class="whitespace-pre-wrap break-words text-node" :class="katexReady && node.center ? 'text-node-center' : ''"><span>{{ initial }}</span></span>
</template>

<style scoped>
.text-node { display: inline; font-weight: inherit; vertical-align: baseline; }
.text-node-center { display: inline-flex; justify-content: center; width: 100%; }
</style>
