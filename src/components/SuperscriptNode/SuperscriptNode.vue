<script setup lang="ts">
import { computed } from 'vue'
import { useCustomNodeComponents } from '../../utils/nodeComponents'
import EmojiNode from '../EmojiNode'
import EmphasisNode from '../EmphasisNode'
import FootnoteReferenceNode from '../FootnoteReferenceNode'
import HighlightNode from '../HighlightNode'
import HtmlInlineNode from '../HtmlInlineNode'
import InlineCodeNode from '../InlineCodeNode'
import InsertNode from '../InsertNode'
import LinkNode from '../LinkNode'
import NodeChildRenderer from '../NodeChildRenderer'
import { MathInlineNodeAsync } from '../NodeRenderer/asyncComponent'
import ReferenceNode from '../ReferenceNode'
import StrikethroughNode from '../StrikethroughNode'
import StrongNode from '../StrongNode'
import SubscriptNode from '../SubscriptNode'
import TextNode from '../TextNode'

interface NodeChild {
  type: string
  raw: string
  [key: string]: unknown
}

const props = defineProps<{
  node: {
    type: 'superscript'
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
  footnote_reference: FootnoteReferenceNode,
  strikethrough: StrikethroughNode,
  highlight: HighlightNode,
  insert: InsertNode,
  subscript: SubscriptNode,
  emoji: EmojiNode,
  math_inline: MathInlineNodeAsync,
  reference: ReferenceNode,
  ...overrides.value,
}))
</script>

<template>
  <sup class="superscript-node">
    <template v-for="(child, index) in node.children" :key="`${indexKey || 'superscript'}-${index}`">
      <NodeChildRenderer
        :components="nodeComponents"
        :node="child"
        :custom-id="props.customId"
        :index-key="`${indexKey || 'superscript'}-${index}`"
        fallback-to-text
      />
    </template>
  </sup>
</template>

<style scoped>
.superscript-node {
  font-size: 0.8em;
  vertical-align: super;
}
</style>
