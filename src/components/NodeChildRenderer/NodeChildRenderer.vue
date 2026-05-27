<script setup lang="ts">
import type { HtmlPolicy } from 'stream-markdown-parser'
import type { Component } from 'vue'
import type { NodeRendererProps } from '../../types/node-renderer-props'
import { computed, defineAsyncComponent, inject } from 'vue'
import { getCustomNodeAttrs } from '../../utils/htmlRenderer'
import { isReservedNodeComponentKey, useCustomNodeComponents } from '../../utils/nodeComponents'

interface NodeChild {
  type: string
  raw?: string
  [key: string]: unknown
}

const props = withDefaults(defineProps<{
  node: NodeChild
  components: Record<string, Component | undefined>
  customId?: string
  indexKey?: number | string
  fallbackToText?: boolean
}>(), {
  fallbackToText: false,
})

const overrides = useCustomNodeComponents(() => props.customId)
const inheritedHtmlPolicy = inject<{ value?: HtmlPolicy } | undefined>('markstreamHtmlPolicy', undefined)
const inheritedNestedRendererProps = inject<{ value?: Partial<NodeRendererProps> } | undefined>('markstreamNestedRendererProps', undefined)
const resolvedHtmlPolicy = computed<HtmlPolicy>(() => inheritedHtmlPolicy?.value ?? 'safe')
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

const component = computed(() => props.components[String(props.node.type)])
const rendersCustomNode = computed(() => Boolean(
  component.value
  && (overrides.value as any)[props.node.type]
  && !isReservedNodeComponentKey(String(props.node.type)),
))
const customAttrs = computed(() => rendersCustomNode.value
  ? getCustomNodeAttrs(props.node as any, resolvedHtmlPolicy.value)
  : undefined)
const hasSlotChildren = computed(() => Array.isArray((props.node as any).children) && (props.node as any).children.length > 0)
const slotContent = computed(() => String((props.node as any).content ?? ''))
const fallbackText = computed(() => String((props.node as any).content ?? props.node.raw ?? ''))
</script>

<template>
  <component
    :is="component"
    v-if="component && rendersCustomNode"
    v-bind="customAttrs"
    :node="node"
    :loading="(node as any).loading"
    :index-key="indexKey"
    :custom-id="customId"
    :is-dark="nestedRendererProps.isDark"
  >
    <StructuredNodeRenderer
      v-if="hasSlotChildren"
      v-bind="nestedRendererProps"
      :nodes="(node as any).children"
      :index-key="indexKey"
      :batch-rendering="false"
      :defer-nodes-until-visible="false"
      :render-as-fragment="true"
    />
    <StructuredNodeRenderer
      v-else-if="slotContent"
      v-bind="nestedRendererProps"
      :content="slotContent"
      :final="!(node as any).loading"
      :index-key="`${indexKey || 'child'}-content`"
      :smooth-streaming="false"
      :batch-rendering="false"
      :defer-nodes-until-visible="false"
      :render-as-fragment="true"
    />
  </component>
  <component
    :is="component"
    v-else-if="component"
    :node="node"
    :custom-id="customId"
    :index-key="indexKey"
  />
  <span v-else-if="fallbackToText">{{ fallbackText }}</span>
</template>
