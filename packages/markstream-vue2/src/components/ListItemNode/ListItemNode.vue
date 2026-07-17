<script setup lang="ts">
import { computed, markRaw, version } from 'vue-demi'
import { isLegacyVue26Version } from '../../utils/vue26'
import NodeRenderer from '../NodeRenderer'
import LegacyNodesRenderer from '../NodeRenderer/LegacyNodesRenderer.vue'

interface NodeChild {
  type: string
  raw: string
  [key: string]: unknown
}

interface ListItem {
  type: 'list_item'
  children: NodeChild[]
  raw: string
}

const props = defineProps<{
  node?: ListItem
  item?: ListItem
  indexKey?: number | string
  value?: number
  customId?: string
  typewriter?: boolean
  showTooltips?: boolean
}>()

defineEmits<{
  copy: [text: string]
}>()

const itemNode = computed(() => props.node ?? props.item)
const liValueAttr = computed(() => (props.value == null ? {} : { value: props.value }))
const nestedRenderer = markRaw(isLegacyVue26Version(version) ? LegacyNodesRenderer : NodeRenderer)
</script>

<template>
  <li class="list-item pl-1.5 my-2" dir="auto" v-bind="liValueAttr">
    <component
      :is="nestedRenderer"
      v-bind="{ showTooltips: props.showTooltips }"
      :index-key="`list-item-${props.indexKey}`"
      :nodes="itemNode?.children ?? []"
      :custom-id="props.customId"
      :typewriter="props.typewriter"
      :batch-rendering="false"
      @copy="$emit('copy', $event)"
    />
  </li>
</template>

<style scoped>
ol > .list-item::marker{
  color: var(--list-item-counter-marker,#64748b);
  line-height: 1.6;
}
ul > .list-item::marker{
  color: var(--list-item-marker,#cbd5e1)
}

.list-item ::v-deep .markdown-renderer {
  content-visibility: visible;
  contain-intrinsic-size: 0px 0px;
  contain: none;
}
</style>
