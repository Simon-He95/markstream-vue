<script setup lang="ts">
import { computed, markRaw, version } from 'vue-demi'
import { isLegacyVue26Version } from '../../utils/vue26'
import NodeRenderer from '../NodeRenderer'
import LegacyNodesRenderer from '../NodeRenderer/LegacyNodesRenderer.vue'

interface DefinitionItemNode {
  type: 'definition_item'
  term: { type: string, raw: string }[]
  definition: { type: string, raw: string }[]
  raw: string
}

interface DefinitionListNode {
  type: 'definition_list'
  items: DefinitionItemNode[]
  raw: string
}

const props = defineProps<{
  node: DefinitionListNode
  indexKey: string | number
  typewriter?: boolean
  customId?: string
}>()

defineEmits(['copy'])

const nestedRenderer = markRaw(isLegacyVue26Version(version) ? LegacyNodesRenderer : NodeRenderer)

const definitionEntries = computed(() => {
  return props.node.items.flatMap((item, index) => ([
    {
      key: `definition-term-${props.indexKey}-${index}`,
      tag: 'dt',
      className: 'definition-term',
      nodes: item.term,
    },
    {
      key: `definition-desc-${props.indexKey}-${index}`,
      tag: 'dd',
      className: 'definition-desc',
      nodes: item.definition,
    },
  ]))
})
</script>

<template>
  <dl class="definition-list">
    <component
      :is="entry.tag"
      v-for="entry in definitionEntries"
      :key="entry.key"
      :class="entry.className"
    >
      <component
        :is="nestedRenderer"
        :index-key="entry.key"
        :nodes="entry.nodes"
        :custom-id="props.customId"
        :typewriter="props.typewriter"
        @copy="$emit('copy', $event)"
      />
    </component>
  </dl>
</template>

<style scoped>
.definition-list {
  margin: 0 0 1rem;
}

.definition-term {
  font-weight: 600;
  margin-top: 0.5rem;
}

.definition-desc {
  margin-left: 1rem;
  margin-bottom: 0.5rem;
}

.definition-list ::v-deep .markdown-renderer {
  content-visibility: visible;
  contain: content;
  contain-intrinsic-size: 0px 0px;
}
</style>
