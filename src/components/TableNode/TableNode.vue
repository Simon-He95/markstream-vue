<script setup lang="ts">
import { computed } from 'vue'
import NodeRenderer from '../NodeRenderer'

// 定义单元格节点
interface TableCellNode {
  type: 'table_cell'
  header: boolean
  children: {
    type: string
    raw: string
  }[]
  raw: string
  align?: 'left' | 'right' | 'center'
}

// 定义行节点
interface TableRowNode {
  type: 'table_row'
  cells: TableCellNode[]
  raw: string
}

// 定义表格节点
interface TableNode {
  type: 'table'
  header: TableRowNode
  rows: TableRowNode[]
  raw: string
  loading: boolean
}

// 接收props
const props = defineProps<{
  node: TableNode
  indexKey: string | number
  isDark?: boolean
  typewriter?: boolean
  customId?: string
}>()

// 定义事件
defineEmits(['copy'])

// 计算列宽，平均分配。如果需要更复杂的策略，可以在此扩展
const colCount = computed(() => props.node?.header?.cells?.length ?? 0)
const colWidths = computed(() => {
  const n = colCount.value || 1
  const base = Math.floor(100 / n)
  // 为了保证总和为100%，最后一个列占剩余的百分比
  return Array.from({ length: n }).map((_, i) =>
    i === n - 1 ? `${100 - base * (n - 1)}%` : `${base}%`,
  )
})

const isLoading = computed(() => props.node.loading ?? false)
const bodyRows = computed(() => props.node.rows ?? [])
</script>

<template>
  <div class="table-node-wrapper">
    <table
      class="w-full my-8 text-sm table-fixed table-node"
      :class="{ 'table-node--loading': isLoading }"
      :aria-busy="isLoading"
    >
      <colgroup>
        <col v-for="(w, i) in colWidths" :key="`col-${i}`" :style="{ width: w }">
      </colgroup>
      <thead class="border-[var(--table-border,#cbd5e1)]">
        <tr class="border-b">
          <th
            v-for="(cell, index) in node.header.cells"
            :key="`header-${index}`"
            dir="auto"
            class="font-semibold p-[calc(4/7*1em)] overflow-x-auto"
            :class="[
              cell.align === 'right'
                ? 'text-right'
                : cell.align === 'center'
                  ? 'text-center'
                  : 'text-left',
            ]"
          >
            <NodeRenderer
              :nodes="cell.children"
              :index-key="`table-th-${props.indexKey}`"
              :custom-id="props.customId"
              :typewriter="props.typewriter"
              @copy="$emit('copy', $event)"
            />
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, rowIndex) in bodyRows"
          :key="`row-${rowIndex}`"
          class="border-[var(--table-border,#cbd5e1)]"
          :class="[rowIndex < bodyRows.length - 1 ? 'border-b' : '']"
        >
          <td
            v-for="(cell, cellIndex) in row.cells"
            :key="`cell-${rowIndex}-${cellIndex}`"
            class="p-[calc(4/7*1em)] overflow-x-auto"
            :class="[
              cell.align === 'right'
                ? 'text-right'
                : cell.align === 'center'
                  ? 'text-center'
                  : 'text-left',
            ]"
            dir="auto"
          >
            <NodeRenderer
              :nodes="cell.children"
              :index-key="`table-td-${props.indexKey}`"
              :custom-id="props.customId"
              :typewriter="props.typewriter"
              @copy="$emit('copy', $event)"
            />
          </td>
        </tr>
      </tbody>
    </table>
    <transition name="table-node-fade">
      <div v-if="isLoading" class="table-node__loading" role="status" aria-live="polite">
        <slot name="loading" :is-loading="isLoading">
          <span class="table-node__spinner animate-spin" aria-hidden="true" />
          <span class="sr-only">Loading</span>
        </slot>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.table-node-wrapper {
  position: relative;
}

.table-node--loading tbody td {
  position: relative;
  overflow: hidden;
}

.table-node--loading tbody td > * {
  visibility: hidden;
}

.table-node--loading tbody td::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 0.25rem;
  background: linear-gradient(
    90deg,
    rgba(148, 163, 184, 0.16) 25%,
    rgba(148, 163, 184, 0.28) 50%,
    rgba(148, 163, 184, 0.16) 75%
  );
  background-size: 200% 100%;
  animation: table-node-shimmer 1.2s linear infinite;
  will-change: background-position;
}

.table-node__loading {
  position: relative;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.table-node__spinner {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 9999px;
  border: 2px solid rgba(94, 104, 121, 0.25);
  border-top-color: rgba(94, 104, 121, 0.8);
  will-change: transform;
}

.table-node-fade-enter-active,
.table-node-fade-leave-active {
  transition: opacity 0.18s ease;
}

.table-node-fade-enter-from,
.table-node-fade-leave-to {
  opacity: 0;
}

/* 表格单元格内的 NodeRenderer 禁用 content-visibility 的占位行为，避免“高但空”的问题 */
:deep(.table-node .markdown-renderer) {
  /* Make the NodeRenderer wrapper behave as if it's not there so
     table cells keep their expected inline/flow layout. */
  display: contents;
  content-visibility: visible;
  contain: content;
  contain-intrinsic-size: 0px 0px;
}

/* Also make internal NodeRenderer wrapper elements layout-transparent
   so they don't introduce block-level boxes inside table cells. */
:deep(.table-node .markdown-renderer .node-slot),
:deep(.table-node .markdown-renderer .node-content),
:deep(.table-node .markdown-renderer .node-space)
{
  display: contents;
}

@keyframes table-node-shimmer {
  0% {
    background-position: 0% 0%;
  }
  50% {
    background-position: 100% 0%;
  }
  100% {
    background-position: 200% 0%;
  }
}

.hr + .table-node-wrapper {
  margin-top: 0;
}

.hr + .table-node-wrapper .table-node {
  margin-top: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
