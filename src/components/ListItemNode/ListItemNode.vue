<script setup lang="ts">
import { computed } from 'vue'
import NodeRenderer from '../NodeRenderer'

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

const props = defineProps<{
  /**
   * Preferred prop name for consistency with other node components.
   * `item` is kept for backward compatibility.
   */
  node?: ListItem
  item?: ListItem
  indexKey?: number | string
  value?: number
  customId?: string
  /** Forwarded flag to enable/disable non-code node enter transition */
  typewriter?: boolean
  showTooltips?: boolean
}>()

defineEmits<{
  copy: [text: string]
}>()

const itemNode = computed(() => props.node ?? props.item)

const liValueAttr = computed(() =>
  props.value == null ? {} : { value: props.value },
)
</script>

<template>
  <li class="list-item pl-1.5 my-2" dir="auto" v-bind="liValueAttr">
    <NodeRenderer
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
  color: var(--list-counter-marker);
  line-height: 1.6;
}
ul > .list-item::marker{
  color: var(--list-marker)
}

/* 大列表滚动到视口时，嵌套 NodeRenderer 需要立即绘制内容，避免空白 */
.list-item :deep(.markdown-renderer) {
  content-visibility: visible;
  contain-intrinsic-size: 0px 0px;
  contain: none;
}
</style>
