<script setup lang="ts">
import type { HtmlPolicy } from 'stream-markdown-parser'
import type { NodeRendererProps } from '../../types/node-renderer-props'
import { isHtmlTagBlocked, NON_STRUCTURING_HTML_TAGS, sanitizeHtmlContent, sanitizeHtmlTokenAttrs, tokenAttrsToRecord } from 'stream-markdown-parser'
import { computed, defineAsyncComponent, defineComponent, inject, onBeforeUnmount, ref, watch } from 'vue'
import { useViewportPriority } from '../../composables/viewportPriority'
import { hasCustomComponents, parseHtmlToVNodes } from '../../utils/htmlRenderer'
import { useCustomNodeComponents } from '../../utils/nodeComponents'

const props = defineProps<{
  node: {
    content: string
    raw?: string
    tag?: string
    attrs?: [string, string][] | null
    children?: any[]
    loading?: boolean
  }
  customId?: string
  htmlPolicy?: HtmlPolicy
}>()

const inheritedHtmlPolicy = inject<{ value?: HtmlPolicy } | undefined>('markstreamHtmlPolicy', undefined)
const inheritedNestedRendererProps = inject<{ value?: Partial<NodeRendererProps> } | undefined>('markstreamNestedRendererProps', undefined)
const resolvedHtmlPolicy = computed<HtmlPolicy>(() => props.htmlPolicy ?? inheritedHtmlPolicy?.value ?? 'safe')
const nestedRendererProps = computed<Partial<NodeRendererProps>>(() => {
  const inherited = inheritedNestedRendererProps?.value ?? {}
  return {
    ...inherited,
    customId: props.customId ?? inherited.customId,
    htmlPolicy: resolvedHtmlPolicy.value,
  }
})

const StructuredNodeRenderer = defineAsyncComponent({
  loader: () => import('../NodeRenderer'),
  suspensible: false,
})

const boundAttrs = computed(() => {
  const sanitizedAttrs = sanitizeHtmlTokenAttrs(props.node.attrs, resolvedHtmlPolicy.value)
  if (!sanitizedAttrs)
    return undefined
  const record = tokenAttrsToRecord(sanitizedAttrs)
  return Object.keys(record).length > 0 ? record : undefined
})
const structuredBoundAttrs = computed(() => {
  const tagName = String(props.node.tag || '').trim()
  const sanitizedAttrs = sanitizeHtmlTokenAttrs(props.node.attrs, resolvedHtmlPolicy.value, tagName)
  if (!sanitizedAttrs)
    return undefined
  const record = tokenAttrsToRecord(sanitizedAttrs)
  return Object.keys(record).length > 0 ? record : undefined
})

const customComponents = useCustomNodeComponents(() => props.customId)

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
const structuredChildren = computed(() => Array.isArray(props.node.children) ? props.node.children : [])
const structuredTag = computed(() => String(props.node.tag || 'div'))
const isBlockedStructuredTag = computed(() => {
  const tag = structuredTag.value.trim().toLowerCase()
  return NON_STRUCTURING_HTML_TAGS.has(tag) || isHtmlTagBlocked(tag, resolvedHtmlPolicy.value)
})
const isStructured = computed(() => structuredChildren.value.length > 0 && !!props.node.tag && !isBlockedStructuredTag.value)

// Computed property to determine render mode and content
const renderMode = computed(() => {
  if (isStructured.value)
    return { mode: 'structured' as const }

  // Avoid parsing until the node is actually going to render (deferred rendering path).
  if (!shouldRender.value)
    return { mode: 'html', content: renderContent.value ?? '' }

  const content = renderContent.value ?? props.node.content
  if (!content)
    return { mode: 'html', content: '' }

  if (resolvedHtmlPolicy.value === 'escape')
    return { mode: 'html', content: sanitizeHtmlContent(content, resolvedHtmlPolicy.value) }

  // Streaming HTML blocks are expensive to re-render via `innerHTML` because it
  // replaces the whole subtree on every tick. Prefer the VNode parser while
  // the node is still in a loading mid-state to keep DOM stable.
  if (props.node.loading) {
    const nodes = parseHtmlToVNodes(content, customComponents.value, resolvedHtmlPolicy.value)
    if (nodes === null)
      return { mode: 'text', content: props.node.raw ?? content }
    return { mode: 'dynamic', nodes }
  }

  // Check if content contains custom components
  if (!hasCustomComponents(content, customComponents.value))
    return { mode: 'html', content: sanitizeHtmlContent(content, resolvedHtmlPolicy.value) }

  // Parse and build VNode tree
  const nodes = parseHtmlToVNodes(content, customComponents.value, resolvedHtmlPolicy.value)
  if (nodes === null)
    return { mode: 'html', content: sanitizeHtmlContent(content, resolvedHtmlPolicy.value) } // Fallback to sanitized HTML if parsing fails

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
  <component
    :is="isStructured ? structuredTag : 'div'"
    ref="htmlRef"
    class="html-block-node"
    v-bind="isStructured ? structuredBoundAttrs : undefined"
  >
    <template v-if="shouldRender">
      <StructuredNodeRenderer
        v-if="renderMode.mode === 'structured'"
        v-bind="nestedRendererProps"
        :nodes="structuredChildren"
        :batch-rendering="false"
        :defer-nodes-until-visible="false"
        :render-as-fragment="true"
      />
      <!-- Use dynamic rendering for custom components -->
      <DynamicRenderer v-else-if="renderMode.mode === 'dynamic'" :nodes="renderMode.nodes" />
      <pre v-else-if="renderMode.mode === 'text'" class="html-block-node__raw">{{ renderMode.content }}</pre>
      <!-- Fallback to v-html for standard HTML -->
      <div v-else v-bind="boundAttrs" v-html="renderMode.content" />
    </template>
    <div v-else class="html-block-node__placeholder">
      <slot name="placeholder" :node="node">
        <span class="html-block-node__placeholder-bar" />
        <span class="html-block-node__placeholder-bar w-4/5" />
        <span class="html-block-node__placeholder-bar w-2/3" />
      </slot>
    </div>
  </component>
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
