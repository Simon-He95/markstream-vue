<script setup lang="ts">
import type { HtmlPolicy } from 'stream-markdown-parser'
import { isHtmlTagBlocked, NON_STRUCTURING_HTML_TAGS, sanitizeHtmlContent, sanitizeHtmlTokenAttrs, tokenAttrsToRecord } from 'stream-markdown-parser'
import { computed, defineComponent, inject, onBeforeUnmount, ref, watch } from 'vue-demi'
import { useViewportPriority } from '../../composables/viewportPriority'
import { hasCustomComponents, parseHtmlToVNodes } from '../../utils/htmlRenderer'
import { renderMarkdownNodesToHtml } from '../../utils/nestedHtml'
import { getCustomNodeComponents } from '../../utils/nodeComponents'

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
const resolvedHtmlPolicy = computed<HtmlPolicy>(() => props.htmlPolicy ?? inheritedHtmlPolicy?.value ?? 'safe')

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

// Get custom components from global registry
const customComponents = computed(() => {
  return getCustomNodeComponents(props.customId)
})

// Dynamic wrapper component for rendering VNodes
const DynamicRenderer = defineComponent({
  name: 'DynamicRenderer',
  props: {
    content: {
      type: String,
      required: true,
    },
    customComponents: {
      type: Object as () => Record<string, any>,
      required: true,
    },
    htmlPolicy: {
      type: String as () => HtmlPolicy,
      default: 'safe',
    },
  },
  render() {
    const nodes = parseHtmlToVNodes(this.content, this.customComponents, undefined, this.htmlPolicy)
    return (nodes || []) as any
  },
})

const structuredChildren = computed(() => Array.isArray(props.node.children) ? props.node.children : [])
const structuredTag = computed(() => String(props.node.tag || 'div'))
const isBlockedStructuredTag = computed(() => {
  const tag = structuredTag.value.trim().toLowerCase()
  return NON_STRUCTURING_HTML_TAGS.has(tag) || isHtmlTagBlocked(tag, resolvedHtmlPolicy.value)
})
const structuredHtml = computed(() => {
  if (structuredChildren.value.length === 0 || !props.node.tag || isBlockedStructuredTag.value)
    return ''
  return renderMarkdownNodesToHtml(structuredChildren.value as any, { htmlPolicy: resolvedHtmlPolicy.value })
})

// Computed property to determine render mode and content
const renderMode = computed(() => {
  if (structuredChildren.value.length > 0 && !!props.node.tag && !isBlockedStructuredTag.value)
    return { mode: 'structured' as const }

  const content = props.node.content
  if (!content)
    return { mode: 'html', content: '' }

  if (resolvedHtmlPolicy.value === 'escape')
    return { mode: 'html', content: sanitizeHtmlContent(content, resolvedHtmlPolicy.value) }

  // Check if content contains custom components
  if (!hasCustomComponents(content, customComponents.value))
    return { mode: 'html', content: sanitizeHtmlContent(content, resolvedHtmlPolicy.value) }

  return { mode: 'dynamic', content }
})

const htmlRef = ref<HTMLElement | null>(null)
const shouldRender = ref(typeof window === 'undefined')
const renderContent = ref(props.node.content)
const registerVisibility = useViewportPriority()
let visibilityHandle: ReturnType<typeof registerVisibility> | null = null
const isDeferred = !!props.node.loading

if (typeof window !== 'undefined') {
  watch(
    htmlRef,
    (el) => {
      visibilityHandle?.destroy?.()
      visibilityHandle = null
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
      visibilityHandle = handle
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
  visibilityHandle?.destroy?.()
  visibilityHandle = null
})
</script>

<template>
  <!-- eslint-disable vue/no-v-text-v-html-on-component -->
  <component
    :is="structuredTag"
    v-if="renderMode.mode === 'structured' && shouldRender"
    ref="htmlRef"
    class="html-block-node"
    v-bind="structuredBoundAttrs"
    v-html="structuredHtml"
  />
  <!-- eslint-enable vue/no-v-text-v-html-on-component -->
  <component
    :is="structuredTag"
    v-else-if="renderMode.mode === 'structured'"
    ref="htmlRef"
    class="html-block-node"
    v-bind="structuredBoundAttrs"
  >
    <div class="html-block-node__placeholder">
      <slot name="placeholder" :node="node">
        <span class="html-block-node__placeholder-bar" />
        <span class="html-block-node__placeholder-bar w-4/5" />
        <span class="html-block-node__placeholder-bar w-2/3" />
      </slot>
    </div>
  </component>
  <div
    v-else
    ref="htmlRef"
    class="html-block-node"
  >
    <template v-if="shouldRender">
      <!-- Use dynamic rendering for custom components -->
      <DynamicRenderer v-if="renderMode.mode === 'dynamic'" :content="renderMode.content" :custom-components="customComponents" :html-policy="resolvedHtmlPolicy" />
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
  </div>
</template>

<style scoped>
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
  background-image: linear-gradient(90deg, rgba(148, 163, 184, 0.35), rgba(148, 163, 184, 0.1), rgba(148, 163, 184, 0.35));
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
