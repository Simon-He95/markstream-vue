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
import SuperscriptNode from '../SuperscriptNode'
import TextNode from '../TextNode'

interface NodeChild {
  type: string
  raw: string
  [key: string]: unknown
}

const props = defineProps<{
  node: {
    type: 'subscript'
    children: NodeChild[]
    raw: string
  }
  customId?: string
  indexKey?: number | string
}>()

const overrides = useCustomNodeComponents(() => props.customId)

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
  superscript: SuperscriptNode,
  emoji: EmojiNode,
  math_inline: MathInlineNodeAsync,
  reference: ReferenceNode,
  ...overrides.value,
}))
</script>

<template>
  <sub class="subscript-node">
    <template v-for="(child, index) in node.children" :key="`${indexKey || 'subscript'}-${index}`">
      <NodeChildRenderer
        :components="nodeComponents"
        :node="child"
        :custom-id="props.customId"
        :index-key="`${indexKey || 'subscript'}-${index}`"
        fallback-to-text
      />
    </template>
  </sub>
</template>

<style scoped>
.subscript-node {
  font-size: 0.8em;
  vertical-align: sub;
}
</style>
