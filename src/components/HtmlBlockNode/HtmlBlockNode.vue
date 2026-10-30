<script setup lang="ts">
import type { HtmlPolicy } from 'stream-markdown-parser'
import type { NodeRendererProps } from '../../types/node-renderer-props'
import { getPlainTextContent } from 'markstream-core'
import { isHtmlTagBlocked, NON_STRUCTURING_HTML_TAGS, sanitizeHtmlContent, sanitizeHtmlTokenAttrs, tokenAttrsToRecord } from 'stream-markdown-parser'
import { computed, defineAsyncComponent, defineComponent, inject, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { DEFAULT_VIEWPORT_PRIORITY_ROOT_MARGIN, useOffscreenHeavyNodeDeferral, useViewportPriority, useViewportPriorityOptions } from '../../composables/viewportPriority'
import { resolveHtmlVNodes } from '../../utils/htmlRenderer'
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
function isStreamingHtml(loading: boolean | undefined, raw: unknown, content: unknown, tag: unknown) {
  // The parser synthesizes a closing tag in `content` while an HTML block is
  // still open. That distinction lets streamed blocks render immediately,
  // while preserving viewport deferral for complete history/restored nodes
  // that merely carry a loading flag.
  if (loading !== true)
    return false
  const rawText = String(raw ?? '')
  if (!rawText)
    return false
  if (rawText !== String(content ?? ''))
    return true
  const tagName = String(tag ?? '').trim()
  return !!tagName && rawText.toLowerCase().includes(`</${tagName.toLowerCase()}`) === false
}
const streamingObserved = ref(isStreamingHtml(props.node.loading, props.node.raw, props.node.content, props.node.tag))
const shouldRender = ref(typeof window === 'undefined' || streamingObserved.value)
const renderContent = ref(props.node.content)
const streamingMinHeight = ref(0)
const previousRaw = ref(String(props.node.raw ?? ''))
const structuredChildren = computed(() => Array.isArray(props.node.children) ? props.node.children : [])

watch(
  () => [props.node.loading, props.node.raw, props.node.content, props.node.tag] as const,
  ([loading, raw, content, tag]) => {
    const nextRaw = String(raw ?? '')
    const appendOnly = !previousRaw.value || nextRaw.startsWith(previousRaw.value)
    const streaming = isStreamingHtml(loading, raw, content, tag)
    if (!appendOnly) {
      streamingObserved.value = streaming
      streamingMinHeight.value = 0
    }
    else if (streaming) {
      streamingObserved.value = true
    }
    if (streaming)
      shouldRender.value = true

    previousRaw.value = nextRaw
  },
  { flush: 'sync' },
)
const structuredTag = computed(() => String(props.node.tag || 'div'))
const detailsSummaryNode = computed(() => {
  if (structuredTag.value.trim().toLowerCase() !== 'details')
    return null
  if (props.node.attrs?.some(([name]) => String(name).toLowerCase() === 'open'))
    return null

  const first = structuredChildren.value[0]
  return first?.type === 'html_block' && String(first.tag || '').toLowerCase() === 'summary'
    ? first
    : null
})
const detailsSummaryText = computed(() => getPlainTextContent(detailsSummaryNode.value?.children))
const detailsSummaryAttrs = computed(() => {
  const summary = detailsSummaryNode.value
  if (!summary)
    return undefined

  const attrs = sanitizeHtmlTokenAttrs(summary.attrs, resolvedHtmlPolicy.value, 'summary')
  if (!attrs)
    return undefined

  const record = tokenAttrsToRecord(attrs)
  return Object.keys(record).length > 0 ? record : undefined
})
const structuredRenderChildren = computed(() => {
  return detailsSummaryText.value == null
    ? structuredChildren.value
    : structuredChildren.value.slice(1)
})
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
  // the node is still in a loading mid-state to keep DOM stable. Once a block
  // has streamed, keep this path after loading settles as well; otherwise the
  // transition to v-html can briefly remove the complete HTML subtree.
  //
  // resolveHtmlVNodes tokenizes once and reuses the tokens for both the
  // custom-component check and the VNode build; the previous pair
  // (hasCustomComponents + parseHtmlToVNodes) tokenized the same content twice.
  const streaming = streamingObserved.value || props.node.loading === true
  const resolved = resolveHtmlVNodes(content, customComponents.value, resolvedHtmlPolicy.value, streaming)
  if (resolved.ok && (streaming || resolved.hasCustomComponents))
    return { mode: 'dynamic', nodes: resolved.nodes }

  if (streaming)
    return { mode: 'text', content: props.node.raw ?? content }

  return { mode: 'html', content: sanitizeHtmlContent(content, resolvedHtmlPolicy.value) }
})

const registerVisibility = useViewportPriority()
const viewportPriorityOptions = useViewportPriorityOptions()
const offscreenHeavyNodeDeferral = useOffscreenHeavyNodeDeferral()
const visibilityHandle = shallowRef<ReturnType<typeof registerVisibility> | null>(null)
const isDeferred = !!props.node.loading
let streamingHeightObserver: ResizeObserver | null = null

if (typeof window !== 'undefined') {
  watch(
    [() => htmlRef.value, () => props.node.loading, streamingObserved],
    ([el, loading, streaming], _oldValue, onCleanup) => {
      streamingHeightObserver?.disconnect()
      streamingHeightObserver = null
      if (!el || !streaming || loading === false || typeof ResizeObserver === 'undefined')
        return

      const observer = new ResizeObserver((entries) => {
        if (!streamingObserved.value || props.node.loading === false)
          return
        const entry = entries[0]
        const borderBox = Array.isArray(entry?.borderBoxSize)
          ? entry.borderBoxSize[0]
          : entry?.borderBoxSize
        const height = borderBox?.blockSize ?? entry?.contentRect.height ?? 0
        if (height > streamingMinHeight.value)
          streamingMinHeight.value = height
      })
      streamingHeightObserver = observer
      observer.observe(el)
      onCleanup(() => observer.disconnect())
    },
    { immediate: true },
  )

  watch(
    () => props.node.loading,
    async (loading) => {
      if (loading !== false || !streamingObserved.value || streamingMinHeight.value <= 0)
        return
      await nextTick()
      requestAnimationFrame(() => {
        if (props.node.loading === false)
          streamingMinHeight.value = 0
      })
    },
  )

  watch(
    [
      () => htmlRef.value,
      () => viewportPriorityOptions?.value.heavyBlockMargin,
      () => viewportPriorityOptions?.value.rootMargin,
    ],
    ([el], _oldValue, onCleanup) => {
      visibilityHandle.value?.destroy?.()
      visibilityHandle.value = null
      if (!isDeferred) {
        shouldRender.value = true
        renderContent.value = props.node.content
        return
      }
      if (!el) {
        // A streamed block must not flash back to its placeholder while its
        // root element is being reattached during incremental parsing.
        if (!streamingObserved.value)
          shouldRender.value = false
        return
      }
      let active = true
      const rootMargin = viewportPriorityOptions?.value.heavyBlockMargin
        ?? viewportPriorityOptions?.value.rootMargin
        ?? DEFAULT_VIEWPORT_PRIORITY_ROOT_MARGIN
      const handle = registerVisibility(el, {
        rootMargin,
        allowIdle: !offscreenHeavyNodeDeferral.value,
      })
      visibilityHandle.value = handle
      // Latch render readiness once visible so observer reconfiguration does not hide rendered HTML.
      shouldRender.value = shouldRender.value || handle.isVisible.value
      handle.whenVisible.then(() => {
        if (active && visibilityHandle.value === handle)
          shouldRender.value = true
      })

      onCleanup(() => {
        active = false
        handle.destroy()

        if (visibilityHandle.value === handle)
          visibilityHandle.value = null
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
  streamingHeightObserver?.disconnect()
  streamingHeightObserver = null
  visibilityHandle.value?.destroy?.()
  visibilityHandle.value = null
})
</script>

<template>
  <component
    :is="isStructured ? structuredTag : 'div'"
    ref="htmlRef"
    class="html-block-node"
    :style="streamingMinHeight > 0 ? { boxSizing: 'border-box', minHeight: `${streamingMinHeight}px` } : undefined"
    :data-markstream-viewport-pending="offscreenHeavyNodeDeferral && !shouldRender ? 'true' : undefined"
    v-bind="isStructured ? structuredBoundAttrs : undefined"
  >
    <template v-if="shouldRender">
      <template v-if="renderMode.mode === 'structured'">
        <template v-if="detailsSummaryText !== null">
          <summary v-bind="detailsSummaryAttrs">
            {{ detailsSummaryText }}
          </summary>
          <StructuredNodeRenderer
            v-if="structuredRenderChildren.length"
            v-bind="nestedRendererProps"
            :nodes="structuredRenderChildren"
            :batch-rendering="false"
            :defer-nodes-until-visible="false"
            :render-as-fragment="true"
          />
        </template>
        <StructuredNodeRenderer
          v-else
          v-bind="nestedRendererProps"
          :nodes="structuredChildren"
          :batch-rendering="false"
          :defer-nodes-until-visible="false"
          :render-as-fragment="true"
        />
      </template>
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
}
</style>
