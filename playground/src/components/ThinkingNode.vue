<script setup lang="ts">
import { computed, inject } from 'vue'
import MarkdownRender from '../../../src/components/NodeRenderer'

const props = defineProps<{
  node: {
    type: 'thinking'
    content: string
    children: any[]
    loading?: boolean
  }
  isDark?: boolean
  customId?: string
  customHtmlTags?: readonly string[]
  indexKey?: string | number
  typewriter?: unknown
}>()

const inheritedTypewriter = inject<{ value?: boolean } | undefined>('markstreamTypewriter', undefined)
const inheritedSmoothStreaming = inject<{ value?: boolean } | undefined>('markstreamSmoothStreaming', undefined)
const resolvedContent = computed(() => String(props.node.content ?? ''))
const resolvedCustomHtmlTags = computed(() => props.customHtmlTags?.length ? props.customHtmlTags : ['thinking', 'think'])
const resolvedFinal = computed(() => typeof props.node.loading === 'boolean' ? !props.node.loading : undefined)
const nestedIndexKey = computed(() => props.indexKey != null ? `${props.indexKey}-thinking` : 'thinking')

function toOptionalBoolean(value: unknown) {
  if (value === '' || value === true || value === 'true')
    return true
  if (value === false || value === 'false')
    return false
  return undefined
}

const resolvedTypewriter = computed(() => toOptionalBoolean(props.typewriter) ?? inheritedTypewriter?.value ?? true)
const resolvedSmoothStreaming = computed<boolean | 'auto' | undefined>(() => {
  if (inheritedSmoothStreaming?.value === true)
    return 'auto'

  if (inheritedSmoothStreaming?.value === false)
    return false

  return undefined
})
</script>

<template>
  <div class="thinking-node">
    <MarkdownRender
      :content="resolvedContent"
      :custom-html-tags="resolvedCustomHtmlTags"
      :custom-id="customId"
      :final="resolvedFinal"
      :index-key="nestedIndexKey"
      :is-dark="isDark"
      :typewriter="resolvedTypewriter"
      :smooth-streaming="resolvedSmoothStreaming"
      :viewport-priority="false"
      :defer-nodes-until-visible="false"
      :batch-rendering="false"
      :max-live-nodes="0"
      class="thinking-node__content"
    />
  </div>
</template>

<style scoped>
.thinking-node {
  margin: 1em 0;
  padding: 0.75em 1em;
  font-size: 0.8125rem;
  color: hsl(var(--ms-muted-foreground));
  border-left: 2px solid hsl(var(--ms-border));
}

.thinking-node__content {
  min-height: 1.25em;
}

.thinking-node :deep(.markdown-renderer) {
  content-visibility: visible;
  contain: content;
  contain-intrinsic-size: 0 0;
}

.thinking-node :deep(.node-slot),
.thinking-node :deep(.node-content) {
  display: contents;
}

.thinking-node :deep(.paragraph-node) {
  margin: 0;
}
</style>
