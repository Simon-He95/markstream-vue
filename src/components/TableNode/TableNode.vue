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

const isLoading = computed(() => props.node.loading ?? false)
const bodyRows = computed(() => props.node.rows ?? [])
</script>

<template>
  <div class="table-node-wrapper">
    <table
      class="my-8 text-sm table-node"
      :class="{ 'table-node--loading': isLoading }"
      :aria-busy="isLoading"
    >
      <thead class="border-[var(--table-border)]">
        <tr class="border-b">
          <th
            v-for="(cell, index) in node.header.cells"
            :key="`header-${index}`"
            dir="auto"
            class="font-semibold p-[calc(4/7*1em)]"
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
          class="border-[var(--table-border)]"
          :class="[rowIndex < bodyRows.length - 1 ? 'border-b' : '']"
        >
          <td
            v-for="(cell, cellIndex) in row.cells"
            :key="`cell-${rowIndex}-${cellIndex}`"
            class="p-[calc(4/7*1em)]"
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
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  overscroll-behavior-y: auto;
  scrollbar-gutter: stable;
}

.table-node {
  /* Use a stable layout to prevent column reflow jitter during streaming/typewriter updates. */
  table-layout: fixed;
  width: 100%;
  border-collapse: collapse;
}

.table-node :deep(th),
.table-node :deep(td) {
  white-space: normal;
  overflow-wrap: break-word;
  word-break: normal;
}

.table-node--loading {
  /* Loading state keeps the skeleton shimmer; layout is already fixed above. */
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
    var(--loading-shimmer) 25%,
    var(--loading-shimmer) 50%,
    var(--loading-shimmer) 75%
  );
  background-size: 200% 100%;
  animation: table-node-shimmer 1.2s linear infinite;
  will-change: background-position;
}

.table-node__loading {
  position: absolute;
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
  border: 2px solid color-mix(in srgb, var(--loading-spinner) 25%, transparent);
  border-top-color: color-mix(in srgb, var(--loading-spinner) 80%, transparent);
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

/* Override the default `break-words` / pre-wrap text styles inside tables so
   dense tables don't turn into vertical glyph stacks. */
:deep(.table-node .text-node),
:deep(.table-node code) {
  white-space: inherit;
  overflow-wrap: inherit;
  word-break: inherit;
  max-width: none;
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
