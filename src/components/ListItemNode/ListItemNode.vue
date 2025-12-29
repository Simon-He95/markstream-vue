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
  item: ListItem
  indexKey?: number | string
  value?: number
  customId?: string
  /** Forwarded flag to enable/disable non-code node enter transition */
  typewriter?: boolean
}>()

defineEmits<{
  copy: [text: string]
}>()

const liValueAttr = computed(() =>
  props.value == null ? {} : { value: props.value },
)
</script>

<template>
  <li class="list-item pl-1.5 my-2" dir="auto" v-bind="liValueAttr">
    <NodeRenderer
      v-memo="[props.item.children]"
      :index-key="`list-item-${props.indexKey}`"
      :nodes="props.item.children"
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

/* 大列表滚动到视口时，嵌套 NodeRenderer 需要立即绘制内容，避免空白 */
.list-item :deep(.markdown-renderer) {
  content-visibility: visible;
  contain-intrinsic-size: 0px 0px;
  contain: none;
}
</style>
