<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, ref, version, watch } from 'vue-demi'
import { isLegacyVue26Version } from '../../utils/vue26'
import NodeRenderer from '../NodeRenderer'
import LegacyNodesRenderer from '../NodeRenderer/LegacyNodesRenderer.vue'

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
const emit = defineEmits(['copy'])

function handleCopy(payload: unknown) {
  emit('copy', payload)
}

const isLoading = computed(() => props.node.loading ?? false)
const bodyRows = computed(() => props.node.rows ?? [])
const tableRef = ref<HTMLTableElement | null>(null)
const columnWidths = ref<number[]>([])
const nestedRenderer = markRaw(isLegacyVue26Version(version) ? LegacyNodesRenderer : NodeRenderer)

const MIN_COLUMN_WIDTH = 48

let resizeState: {
  index: number
  startX: number
  startWidth: number
  nextStartWidth: number
  widths: number[]
} | null = null

const columnStyles = computed(() =>
  columnWidths.value.map(width => width > 0 ? { width: `${width}px` } : undefined),
)
const hasColumnWidths = computed(() => columnWidths.value.length > 0)

function measureHeaderWidths() {
  const cells = tableRef.value?.querySelectorAll('thead th')
  return Array.from(cells ?? [], cell => Math.round(cell.getBoundingClientRect().width))
}

function onColumnResizeMove(event: PointerEvent) {
  if (!resizeState)
    return

  event.preventDefault()

  const pairWidth = resizeState.startWidth + resizeState.nextStartWidth
  const minWidth = Math.min(MIN_COLUMN_WIDTH, Math.floor(pairWidth / 2))
  const width = Math.max(
    minWidth,
    Math.min(pairWidth - minWidth, Math.round(resizeState.startWidth + event.clientX - resizeState.startX)),
  )
  const nextWidths = [...resizeState.widths]
  nextWidths[resizeState.index] = width
  nextWidths[resizeState.index + 1] = pairWidth - width
  columnWidths.value = nextWidths
}

function stopColumnResize() {
  if (!resizeState)
    return

  window.removeEventListener('pointermove', onColumnResizeMove)
  window.removeEventListener('pointerup', stopColumnResize)
  window.removeEventListener('pointercancel', stopColumnResize)
  resizeState = null
}

function startColumnResize(index: number, event: PointerEvent) {
  if (event.button !== 0)
    return

  const widths = measureHeaderWidths()
  const startWidth = widths[index]
  const nextStartWidth = widths[index + 1]
  if (!startWidth || !nextStartWidth)
    return

  event.preventDefault()

  resizeState = {
    index,
    startX: event.clientX,
    startWidth,
    nextStartWidth,
    widths,
  }
  columnWidths.value = widths

  window.addEventListener('pointermove', onColumnResizeMove)
  window.addEventListener('pointerup', stopColumnResize)
  window.addEventListener('pointercancel', stopColumnResize)
}

watch(
  () => props.node.header.cells.length,
  () => {
    stopColumnResize()
    columnWidths.value = []
  },
)

onBeforeUnmount(stopColumnResize)
</script>

<template>
  <div class="table-node-wrapper">
    <table
      ref="tableRef"
      class="my-8 text-sm table-node"
      :class="{ 'table-node--loading': isLoading }"
      :aria-busy="isLoading"
    >
      <colgroup v-if="hasColumnWidths">
        <col
          v-for="(_, index) in node.header.cells"
          :key="`col-${index}`"
          :style="columnStyles[index]"
        >
      </colgroup>
      <thead class="border-[var(--table-border,#cbd5e1)] border-solid">
        <tr class="border-b border-solid">
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
            <component
              :is="nestedRenderer"
              :nodes="cell.children"
              :index-key="`table-th-${props.indexKey}`"
              :custom-id="props.customId"
              :typewriter="props.typewriter"
              @copy="handleCopy"
            />
            <button
              v-if="index < node.header.cells.length - 1"
              type="button"
              class="table-node__resize-handle"
              :aria-label="`Resize columns ${index + 1} and ${index + 2}`"
              @pointerdown="startColumnResize(index, $event)"
            />
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, rowIndex) in bodyRows"
          :key="`row-${rowIndex}`"
          class="border-[var(--table-border,#cbd5e1)] border-solid"
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
            <component
              :is="nestedRenderer"
              :nodes="cell.children"
              :index-key="`table-td-${props.indexKey}`"
              :custom-id="props.customId"
              :typewriter="props.typewriter"
              @copy="handleCopy"
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
  width: 100%;
  border-collapse: collapse;
}

.table-node ::v-deep th,
.table-node ::v-deep td {
  white-space: normal;
  overflow-wrap: break-word;
  word-break: normal;
}

.table-node ::v-deep thead th {
  position: relative;
}

.table-node__resize-handle {
  position: absolute;
  top: 0;
  right: -4px;
  bottom: 0;
  z-index: 1;
  width: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: col-resize;
  touch-action: none;
}

.table-node__resize-handle::after {
  content: '';
  position: absolute;
  top: 0.35em;
  bottom: 0.35em;
  left: 50%;
  width: 2px;
  border-radius: 9999px;
  background: rgba(94, 104, 121, 0.55);
  opacity: 0;
  transform: translateX(-50%);
  transition: opacity 0.12s ease;
}

.table-node__resize-handle:hover::after,
.table-node__resize-handle:focus-visible::after {
  opacity: 1;
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
.table-node ::v-deep .markdown-renderer {
  /* Make the NodeRenderer wrapper behave as if it's not there so
     table cells keep their expected inline/flow layout. */
  display: contents;
  content-visibility: visible;
  contain: content;
  contain-intrinsic-size: 0px 0px;
}

/* Also make internal NodeRenderer wrapper elements layout-transparent
   so they don't introduce block-level boxes inside table cells. */
.table-node ::v-deep .markdown-renderer .node-slot,
.table-node ::v-deep .markdown-renderer .node-content,
.table-node ::v-deep .markdown-renderer .node-space
{
  display: contents;
}

/* Override the default `break-words` / pre-wrap text styles inside tables so
   dense tables don't turn into vertical glyph stacks. */
.table-node ::v-deep .text-node,
.table-node ::v-deep code {
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
