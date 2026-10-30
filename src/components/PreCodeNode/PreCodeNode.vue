<script setup lang="ts">
import type { DiffLineMetric } from 'markstream-core'
import type { PreCodeNodeProps } from '../../types/component-props'
import { buildDiffPreviewPanes, createDiffMatchCache, measurePreCodeDiffLines } from 'markstream-core'

import { computed, normalizeClass, normalizeStyle, onBeforeUnmount, ref, useAttrs, watch } from 'vue'

const props = defineProps<PreCodeNodeProps>()
const attrs = useAttrs()

/**
 * Cross-frame LCS cache so append-only streaming frames reuse the previous
 * match result and only diff the appended tail (see `computeMatches`).
 */
const diffMatchCache = createDiffMatchCache()

function getDisplayCode(code: unknown, loading?: boolean) {
  const value = String(code ?? '')
  return loading ? value : value.replace(/\r\n$|\n$|\r$/, '')
}

// Normalize language to a safe, lowercase token (fallback to 'plaintext')
const normalizedLanguage = computed(() => {
  const raw = String(props.node?.language ?? '')
  const head = String(String(raw).split(/\s+/g)[0] ?? '').toLowerCase()
  const safe = head.replace(/[^\w-]/g, '')
  return safe || 'plaintext'
})

const languageClass = computed(() => `language-${normalizedLanguage.value}`)
const isLoading = computed(() => props.loading === true || props.node?.loading === true)
const displayCode = computed(() => getDisplayCode(props.node?.code, isLoading.value))

let countedCode = ''
let countedLines = 1
function countCodeLines(code: string) {
  let start = 0
  let count = 1

  if (code.startsWith(countedCode)) {
    start = countedCode.length
    count = countedLines
    if (start > 0 && code[start - 1] === '\r' && code[start] === '\n')
      start++
  }

  for (let index = start; index < code.length; index++) {
    if (code[index] === '\n') {
      count++
    }
    else if (code[index] === '\r') {
      count++
      if (code[index + 1] === '\n')
        index++
    }
  }

  countedCode = code
  countedLines = count
  return count
}

const codeLineCount = computed(() => countCodeLines(displayCode.value))

let logicalPrevCode = ''
let logicalPrevLines: string[] = []
let logicalStableLineCount = 0
let logicalTailStart = 0
const LOGICAL_LINE_SPLIT_RE = /(?<=\n)|(?<=\r)(?!\n)/

function getLogicalCodeLines(code: string): string[] {
  const isPureAppend = code.length > logicalPrevCode.length && code.startsWith(logicalPrevCode)
  const lines = isPureAppend ? logicalPrevLines : []
  const segmentStart = isPureAppend ? logicalTailStart : 0
  if (isPureAppend)
    lines.length = logicalStableLineCount

  for (const line of code.slice(segmentStart).split(LOGICAL_LINE_SPLIT_RE))
    lines.push(line)

  const lastChar = code[code.length - 1]
  if (lastChar === '\n') {
    logicalStableLineCount = lines.length
    logicalTailStart = code.length
    lines.push('')
  }
  else {
    logicalStableLineCount = lines.length - 1
    logicalTailStart = code.length - lines[lines.length - 1]!.length
    if (lastChar === '\r')
      lines.push('')
  }
  logicalPrevCode = code
  logicalPrevLines = lines
  return lines
}

const logicalCodeLines = computed(() => getLogicalCodeLines(displayCode.value))

const isDiffPreview = computed(() => props.showLineNumbers === true && props.node?.diff === true)

const wrapsCodeLines = computed(() => {
  if (normalizeClass(attrs.class).split(/\s+/).includes('is-wrap'))
    return true

  const style = normalizeStyle(attrs.style)
  if (typeof style === 'string')
    return /(?:^|;)\s*white-space\s*:\s*(?:pre-wrap|break-spaces)(?:\s*!important)?\s*(?:;|$)/i.test(style)

  return ['pre-wrap', 'break-spaces'].includes(String(style?.whiteSpace ?? style?.['white-space']))
})

function wrapsPlainCodeLines() {
  return props.showLineNumbers === true && props.node?.diff !== true && wrapsCodeLines.value
}

const wrapsDiffPreviewLines = computed(() => {
  return isDiffPreview.value && wrapsCodeLines.value
})

let lineNumbersTextCount = 0
let lineNumbersTextCache = ''
const lineNumbersText = computed(() => {
  const count = codeLineCount.value
  if (count < lineNumbersTextCount) {
    lineNumbersTextCount = 0
    lineNumbersTextCache = ''
  }
  for (let line = lineNumbersTextCount + 1; line <= count; line++)
    lineNumbersTextCache += `${lineNumbersTextCache ? '\n' : ''}${line}`
  lineNumbersTextCount = count
  return lineNumbersTextCache
})
const isInlineDiffPreview = computed(() => isDiffPreview.value && props.diffInline === true)
const reservedHeightStyle = computed(() => {
  const value = Number(props.reservedHeightPx)
  if (!Number.isFinite(value) || value <= 0)
    return undefined

  const height = `${Math.ceil(value)}px`

  if (isLoading.value) {
    return {
      maxHeight: height,
      overflow: 'auto',
    }
  }

  return {
    height,
    minHeight: height,
    maxHeight: height,
    overflow: 'auto',
  }
})

function countDiffSourceLines(source: unknown, loading: boolean) {
  const code = getDisplayCode(source, loading)
  if (!code)
    return 0

  let count = 1
  for (let index = 0; index < code.length; index++) {
    if (code[index] === '\n') {
      count++
    }
    else if (code[index] === '\r') {
      count++
      if (code[index + 1] === '\n')
        index++
    }
  }
  return count
}

const diffPreviewPanes = computed(() => {
  if (!isDiffPreview.value)
    return []

  return buildDiffPreviewPanes({
    code: props.node?.code,
    hideUnchangedRegions: props.diffHideUnchangedRegions,
    inline: isInlineDiffPreview.value,
    language: props.node?.language,
    loading: isLoading.value,
    matchCache: diffMatchCache,
    originalCode: props.node?.originalCode,
    raw: props.node?.raw,
    updatedCode: props.node?.updatedCode,
  })
})

// Streaming commits rebuild the diff panes on every append. Both the line-number
// width and the "has collapsed rows" flag below re-scan all pane lines, so fold
// them into one pass computed next to the panes instead of three O(N) scans per
// commit. Source line counts only need a number, so they are scanned without
// allocating split arrays.
const diffPreviewSummary = computed(() => {
  const panes = diffPreviewPanes.value
  let maxNumberedLine = 1
  let hasCollapsed = false
  for (const pane of panes) {
    for (const line of pane.lines) {
      if (line.kind === 'collapsed')
        hasCollapsed = true
      if (typeof line.number === 'number' && line.number > maxNumberedLine)
        maxNumberedLine = line.number
    }
  }
  return { maxNumberedLine, hasCollapsed }
})

const lineNumberLayoutStyle = computed(() => {
  if (props.showLineNumbers !== true)
    return undefined

  let maximumLineNumber = isDiffPreview.value ? 1 : codeLineCount.value
  if (isDiffPreview.value) {
    maximumLineNumber = Math.max(
      maximumLineNumber,
      countDiffSourceLines(props.node?.originalCode, isLoading.value),
      countDiffSourceLines(props.node?.updatedCode, isLoading.value),
      diffPreviewSummary.value.maxNumberedLine,
    )
  }

  const width = `${Math.max(2, String(maximumLineNumber).length)}ch`
  return {
    '--markstream-pre-line-number-width': width,
    '--markstream-pre-diff-line-number-width': width,
    '--markstream-code-padding-left': 'calc(var(--markstream-pre-line-number-padding-left, 2ch) + var(--markstream-pre-line-number-width, 2ch) + var(--markstream-pre-line-number-padding-right, 1ch) + var(--markstream-pre-line-number-separator-width, 2px) + var(--markstream-pre-line-number-gap-to-code, 1ch))',
  }
})

const hasCollapsedDiffPreview = computed(() => {
  return isDiffPreview.value && diffPreviewSummary.value.hasCollapsed
})

const ariaLabel = computed(() => {
  const lang = normalizedLanguage.value
  return lang ? `Code block: ${lang}` : 'Code block'
})

// ─── Diff row-height sync ────────────────────────────────────────────────────
// Keeps the left and right diff panes in vertical lockstep when content wraps.
// We measure each pane's natural line heights via DOM, then apply a shared
// `min-height` so that line N on both sides always starts at the same Y.

const preRef = ref<HTMLPreElement | null>(null)

const diffLineMetrics = ref<DiffLineMetric[]>([])
let diffLineMetricsRaf: number | null = null
let disposed = false
let diffResizeObserver: ResizeObserver | null = null

function scheduleDiffLineMetricsSync() {
  if (
    disposed
    || typeof window === 'undefined'
    || !isDiffPreview.value
    || isInlineDiffPreview.value
    || !wrapsDiffPreviewLines.value
  ) {
    return
  }

  if (diffLineMetricsRaf != null)
    return

  diffLineMetricsRaf = window.requestAnimationFrame(() => {
    if (!disposed && preRef.value)
      diffLineMetrics.value = measurePreCodeDiffLines(preRef.value, diffLineMetrics.value)
    diffLineMetricsRaf = null
  })
}

function setupDiffResizeObserver(el: HTMLElement | null) {
  diffResizeObserver?.disconnect()
  diffResizeObserver = null

  if (
    !el
    || !isDiffPreview.value
    || isInlineDiffPreview.value
    || !wrapsDiffPreviewLines.value
    || typeof ResizeObserver === 'undefined'
  ) {
    return
  }

  diffResizeObserver = new ResizeObserver(() => {
    scheduleDiffLineMetricsSync()
  })
  diffResizeObserver.observe(el)
}

watch(
  preRef,
  (el) => {
    setupDiffResizeObserver(el)
    scheduleDiffLineMetricsSync()
  },
  { flush: 'post' },
)

watch(
  [isDiffPreview, isInlineDiffPreview, diffPreviewPanes, wrapsDiffPreviewLines],
  () => {
    setupDiffResizeObserver(preRef.value)
    if (!isDiffPreview.value || isInlineDiffPreview.value || !wrapsDiffPreviewLines.value) {
      if (diffLineMetrics.value.length)
        diffLineMetrics.value = []
      return
    }
    scheduleDiffLineMetricsSync()
  },
  { flush: 'post', immediate: true },
)

onBeforeUnmount(() => {
  disposed = true
  if (diffLineMetricsRaf != null) {
    window.cancelAnimationFrame(diffLineMetricsRaf)
    diffLineMetricsRaf = null
  }

  diffResizeObserver?.disconnect()
  diffResizeObserver = null
})

function getDiffLineStyle(index: number, side: 'original' | 'modified') {
  if (!wrapsDiffPreviewLines.value)
    return undefined

  const metric = diffLineMetrics.value[index]
  if (!metric)
    return undefined

  const contentHeight = side === 'original' ? metric.originalHeight : metric.modifiedHeight

  return {
    '--markstream-pre-diff-synced-row-height': `${Math.ceil(metric.rowHeight)}px`,
    '--markstream-pre-diff-content-height': `${Math.ceil(contentHeight)}px`,
  }
}
</script>

<template>
  <pre
    ref="preRef"
    :style="[reservedHeightStyle, lineNumberLayoutStyle]"
    :class="[languageClass, { 'markstream-pre--line-numbers': props.showLineNumbers, 'markstream-pre--diff-preview': isDiffPreview, 'markstream-pre--diff-inline': isInlineDiffPreview, 'markstream-pre--diff-collapsed': hasCollapsedDiffPreview }]"
    :aria-busy="isLoading"
    :aria-label="ariaLabel"
    :data-language="normalizedLanguage"
    :data-markstream-line-numbers="props.showLineNumbers ? '1' : undefined"
    data-markstream-pre="1"
    tabindex="0"
  ><code v-if="isDiffPreview" translate="no" class="markstream-pre__diff-code"><span v-for="pane in diffPreviewPanes" :key="pane.key" class="markstream-pre__diff-pane" :class="pane.className"><span class="markstream-pre__diff-pane-content"><span v-for="(line, index) in pane.lines" :key="line.key" class="markstream-pre__diff-line" :class="[`markstream-pre__diff-line--${line.kind}`, line.metadataKind ? `markstream-pre__diff-line--metadata-${line.metadataKind}` : '', { 'markstream-pre__diff-line--empty': line.empty, 'markstream-pre__diff-line--collapsed-first': line.collapsedFirst === true, 'markstream-pre__diff-line--collapsed-last': line.collapsedLast === true }]" :style="getDiffLineStyle(index, pane.key as 'original' | 'modified')"><span class="markstream-pre__diff-rail" aria-hidden="true" /><span v-if="line.kind === 'collapsed'" class="markstream-pre__diff-collapsed-icon" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.47 5.47a.75.75 0 0 1 1.06 0L8 8.94l3.47-3.47a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 0 1 0-1.06" /></svg></span><span class="markstream-pre__diff-number" aria-hidden="true">{{ line.number }}</span><span class="markstream-pre__diff-content"><span class="markstream-pre__diff-content-inner">{{ line.code }}</span></span></span></span></span></code><template v-else><code v-if="wrapsPlainCodeLines()" translate="no" class="markstream-pre__code markstream-pre__code--wrapped"><span v-for="(line, index) in logicalCodeLines" :key="index" class="markstream-pre__logical-line" :data-line-number="index + 1" v-text="line" /></code><template v-else><span v-if="props.showLineNumbers" class="markstream-pre__line-numbers" aria-hidden="true"><span class="markstream-pre__line-numbers-text" v-text="lineNumbersText" /></span><code translate="no" class="markstream-pre__code" v-text="displayCode" /></template></template></pre>
</template>
