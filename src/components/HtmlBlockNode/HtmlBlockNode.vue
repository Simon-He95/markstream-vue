<script setup lang="ts">
import { computed, defineComponent, onBeforeUnmount, ref, watch } from 'vue'
import { useViewportPriority } from '../../composables/viewportPriority'
import { hasCustomComponents, parseHtmlToVNodes } from '../../utils/htmlRenderer'
import { customComponentsRevision, getCustomNodeComponents } from '../../utils/nodeComponents'

const props = defineProps<{
  node: {
    content: string
    raw?: string
    tag?: string
    attrs?: [string, string][] | null
    loading?: boolean
  }
  customId?: string
}>()

// The parser produces attrs as an array of [key, value] tuples.
// Vue's `v-bind` expects an object (or array of objects). Convert safely.
const boundAttrs = computed(() => {
  const a = props.node.attrs
  if (!a)
    return undefined
  if (Array.isArray(a)) {
    // Convert tuple array to object; guard against malformed entries.
    const obj: Record<string, string> = {}
    for (const tuple of a) {
      if (!tuple || tuple.length < 2)
        continue
      const [k, v] = tuple
      if (k != null)
        obj[String(k)] = v == null ? '' : String(v)
    }
    return obj
  }
  return a
})

// Get custom components from global registry
const customComponents = computed(() => {
  // Track revision so we re-parse when mappings change.
  void customComponentsRevision.value
  return getCustomNodeComponents(props.customId)
})

// Dynamic wrapper component for rendering VNodes
const DynamicRenderer = defineComponent({
  name: 'DynamicRenderer',
  props: {
    nodes: {
      type: Array as () => any[],
      required: true,
    },
  },
  render() {
    return this.nodes
  },
})

const htmlRef = ref<HTMLElement | null>(null)
const shouldRender = ref(typeof window === 'undefined')
const renderContent = ref(props.node.content)

// Computed property to determine render mode and content
const renderMode = computed(() => {
  // Avoid parsing until the node is actually going to render (deferred rendering path).
  if (!shouldRender.value)
    return { mode: 'html', content: renderContent.value ?? '' }

  const content = renderContent.value ?? props.node.content
  if (!content)
    return { mode: 'html', content: '' }

  // Streaming HTML blocks are expensive to re-render via `innerHTML` because it
  // replaces the whole subtree on every tick. Prefer the VNode parser while
  // the node is still in a loading mid-state to keep DOM stable.
  if (props.node.loading) {
    const nodes = parseHtmlToVNodes(content, customComponents.value)
    if (nodes === null)
      return { mode: 'text', content: props.node.raw ?? content }
    return { mode: 'dynamic', nodes }
  }

  // Check if content contains custom components
  if (!hasCustomComponents(content, customComponents.value))
    return { mode: 'html', content }

  // Parse and build VNode tree
  const nodes = parseHtmlToVNodes(content, customComponents.value)
  if (nodes === null)
    return { mode: 'html', content } // Fallback to v-html if parsing fails

  return { mode: 'dynamic', nodes }
})

const registerVisibility = useViewportPriority()
const visibilityHandle = ref<ReturnType<typeof registerVisibility> | null>(null)
const isDeferred = !!props.node.loading

if (typeof window !== 'undefined') {
  watch(
    htmlRef,
    (el) => {
      visibilityHandle.value?.destroy?.()
      visibilityHandle.value = null
      if (!isDeferred) {
        shouldRender.value = true
        renderContent.value = props.node.content
        return
      }
      if (!el) {
        shouldRender.value = false
        return
      }
      const handle = registerVisibility(el, { rootMargin: '400px' })
      visibilityHandle.value = handle
      shouldRender.value = handle.isVisible.value
      handle.whenVisible.then(() => {
        shouldRender.value = true
      })
    },
    { immediate: true },
  )

  watch(
    () => props.node.content,
    (val) => {
      if (!isDeferred || shouldRender.value) {
        renderContent.value = val
      }
    },
  )
}
else {
  shouldRender.value = true
}

onBeforeUnmount(() => {
  visibilityHandle.value?.destroy?.()
  visibilityHandle.value = null
})
</script>

<template>
  <div ref="htmlRef" class="html-block-node" v-bind="boundAttrs">
    <template v-if="shouldRender">
      <!-- Use dynamic rendering for custom components -->
      <DynamicRenderer v-if="renderMode.mode === 'dynamic'" :nodes="renderMode.nodes" />
      <pre v-else-if="renderMode.mode === 'text'" class="html-block-node__raw">{{ renderMode.content }}</pre>
      <!-- Fallback to v-html for standard HTML -->
      <div v-else v-html="renderContent" />
    </template>
    <div v-else class="html-block-node__placeholder">
      <slot name="placeholder" :node="node">
        <span class="html-block-node__placeholder-bar" />
        <span class="html-block-node__placeholder-bar w-4/5" />
        <span class="html-block-node__placeholder-bar w-2/3" />
      </slot>
    </div>
  </div>
</template>

<style scoped>
.html-block-node__raw {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  opacity: 0.85;
}

.html-block-node__placeholder {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.5rem 0;
}
.html-block-node__placeholder-bar {
  display: block;
  height: 0.8rem;
  border-radius: 9999px;
  background-image: linear-gradient(90deg, var(--loading-shimmer), transparent, var(--loading-shimmer));
  background-size: 200% 100%;
  animation: html-block-node-shimmer 1.2s ease infinite;
}

@keyframes html-block-node-shimmer {
  0% {
    background-position: 0% 0%;
  }
  100% {
    background-position: 200% 0%;
  }
}
</style>
