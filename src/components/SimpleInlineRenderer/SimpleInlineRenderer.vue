<script setup lang="ts">
import type { SimpleInlineNode } from 'markstream-core'
import type { Component } from 'vue'
import { computed, markRaw } from 'vue'
import { useCustomNodeComponents } from '../../utils/nodeComponents'
import CheckboxNode from '../CheckboxNode'
import EmojiNode from '../EmojiNode'
import EmphasisNode from '../EmphasisNode'
import HardBreakNode from '../HardBreakNode'
import HighlightNode from '../HighlightNode'
import InlineCodeNode from '../InlineCodeNode'
import InsertNode from '../InsertNode'
import LinkNode from '../LinkNode'
import NodeChildRenderer from '../NodeChildRenderer'
import ReferenceNode from '../ReferenceNode'
import StrikethroughNode from '../StrikethroughNode'
import StrongNode from '../StrongNode'
import SubscriptNode from '../SubscriptNode'
import SuperscriptNode from '../SuperscriptNode'
import TextNode from '../TextNode'

const props = defineProps<{
  nodes: SimpleInlineNode[]
  customId?: string
  indexKey?: number | string
}>()

const DEFAULT_SIMPLE_INLINE_COMPONENTS = markRaw<Record<string, Component>>({
  checkbox: CheckboxNode,
  checkbox_input: CheckboxNode,
  emoji: EmojiNode,
  emphasis: EmphasisNode,
  hardbreak: HardBreakNode,
  highlight: HighlightNode,
  inline_code: InlineCodeNode,
  insert: InsertNode,
  link: LinkNode,
  reference: ReferenceNode,
  strikethrough: StrikethroughNode,
  strong: StrongNode,
  subscript: SubscriptNode,
  superscript: SuperscriptNode,
  text: TextNode,
})

const overrides = useCustomNodeComponents(() => props.customId)

const nodeComponents = computed<Record<string, Component | undefined>>(() => {
  const custom = overrides.value as Record<string, Component | undefined>
  return Object.keys(custom).length > 0
    ? {
        ...DEFAULT_SIMPLE_INLINE_COMPONENTS,
        ...custom,
      }
    : DEFAULT_SIMPLE_INLINE_COMPONENTS
})
</script>

<template>
  <NodeChildRenderer
    v-for="(node, index) in nodes"
    :key="index"
    :components="nodeComponents"
    :node="node"
    :custom-id="props.customId"
    :index-key="`${indexKey || 'inline'}-${index}`"
  />
</template>
