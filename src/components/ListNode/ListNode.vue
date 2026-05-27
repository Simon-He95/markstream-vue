<script setup lang="ts">
import { computed } from 'vue'
import { useCustomNodeComponents } from '../../utils/nodeComponents'
import ListItemNode from '../ListItemNode'

// 节点子元素类型
interface NodeChild {
  type: string
  raw: string
  [key: string]: unknown
}

// 列表项类型
interface ListItem {
  type: 'list_item'
  children: NodeChild[]
  raw: string
}

const { node, customId, indexKey, typewriter, fade, showTooltips } = defineProps<{
  node: {
    type: 'list'
    ordered: boolean
    start?: number
    items: ListItem[]
    raw: string
  }
  customId?: string
  indexKey?: number | string
  typewriter?: boolean
  fade?: boolean
  showTooltips?: boolean
}>()

defineEmits(['copy'])

const customComponents = useCustomNodeComponents(() => customId)
const listItemComponent = computed(() => {
  return (customComponents.value as any).list_item || ListItemNode
})
</script>

<template>
  <component
    :is="node.ordered ? 'ol' : 'ul'"
    class="list-node"
    :class="{ 'list-decimal': node.ordered, 'list-disc': !node.ordered }"
  >
    <component
      :is="listItemComponent"
      v-for="(item, index) in node.items"
      :key="`${indexKey || 'list'}-${index}`"
      v-bind="{ showTooltips }"
      :node="item"
      :custom-id="customId"
      :index-key="`${indexKey || 'list'}-${index}`"
      :typewriter="typewriter"
      :fade="fade"
      :value="node.ordered ? (node.start ?? 1) + index : undefined"
      @copy="$emit('copy', $event)"
    />
  </component>
</template>

<style scoped>
.list-node {
  margin-top: var(--ms-flow-list-y);
  margin-bottom: var(--ms-flow-list-y);
  padding-left: var(--ms-flow-list-indent);
}
.list-decimal {
  list-style-type: decimal;
}
.list-disc {
  list-style-type: disc;
}
@media (max-width: 1023px) {
  .list-disc {
    margin-top: calc(4/3*1em);
    margin-bottom: calc(4/3*1em);
    padding-left: var(--ms-flow-list-indent-mobile);
  }
}
</style>
