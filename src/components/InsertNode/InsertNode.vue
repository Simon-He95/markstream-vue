<script setup lang="ts">
import { computed } from 'vue'
import { useCustomNodeComponents } from '../../utils/nodeComponents'
import EmojiNode from '../EmojiNode'
import EmphasisNode from '../EmphasisNode'
import FootnoteReferenceNode from '../FootnoteReferenceNode'
import HighlightNode from '../HighlightNode'
import HtmlInlineNode from '../HtmlInlineNode'
import InlineCodeNode from '../InlineCodeNode'
import LinkNode from '../LinkNode'
import NodeChildRenderer from '../NodeChildRenderer'
import { MathInlineNodeAsync } from '../NodeRenderer/asyncComponent'
import ReferenceNode from '../ReferenceNode'
import StrikethroughNode from '../StrikethroughNode'
import StrongNode from '../StrongNode'
import SubscriptNode from '../SubscriptNode'
import SuperscriptNode from '../SuperscriptNode'
import TextNode from '../TextNode'

interface NodeChild {
  type: string
  raw: string
  [key: string]: unknown
}

const props = defineProps<{
  node: {
    type: 'insert'
    children: NodeChild[]
    raw: string
  }
  customId?: string
  indexKey?: number | string
}>()

const overrides = useCustomNodeComponents(() => props.customId)

// Available node components for child rendering; prefer custom overrides
const nodeComponents = computed(() => ({
  text: TextNode,
  inline_code: InlineCodeNode,
  link: LinkNode,
  html_inline: HtmlInlineNode,
  strong: StrongNode,
  emphasis: EmphasisNode,
  strikethrough: StrikethroughNode,
  highlight: HighlightNode,
  subscript: SubscriptNode,
  superscript: SuperscriptNode,
  emoji: EmojiNode,
  footnote_reference: FootnoteReferenceNode,
  math_inline: MathInlineNodeAsync,
  reference: ReferenceNode,
  ...overrides.value,
}))
</script>

<template>
  <ins class="insert-node">
    <NodeChildRenderer
      v-for="(child, index) in node.children"
      :key="`${indexKey || 'insert'}-${index}`"
      :components="nodeComponents"
      :node="child"
      :custom-id="props.customId"
      :index-key="`${indexKey || 'insert'}-${index}`"
    />
  </ins>
</template>

<style scoped>
.insert-node {
  text-decoration: underline;
}
</style>
