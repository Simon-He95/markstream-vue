<script setup lang="ts">
import type { PreCodeNodeProps } from '../../types/component-props'
import type { DiffLineMetric } from './preCodeDiffMetrics'
import { buildDiffPreviewPanes, createDiffMatchCache } from 'markstream-core'

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
const logicalCodeLines = computed(() => {
  const code = displayCode.value
  const lines = code.split(/(?<=\n)|(?<=\r)(?!\n)/)
  if (/(?:\r\n|\n|\r)$/.test(code))
    lines.push('')
  return lines
})

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

function splitDiffSource(source: unknown) {
  const code = getDisplayCode(source, isLoading.value)
  if (!code)
    return []
  return code.split(/\r\n|\n|\r/)
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

const lineNumberLayoutStyle = computed(() => {
  if (props.showLineNumbers !== true)
    return undefined

  let maximumLineNumber = isDiffPreview.value ? 1 : codeLineCount.value
  if (isDiffPreview.value) {
    maximumLineNumber = Math.max(
      maximumLineNumber,
      splitDiffSource(props.node?.originalCode).length,
      splitDiffSource(props.node?.updatedCode).length,
    )
    for (const pane of diffPreviewPanes.value) {
      for (const line of pane.lines) {
        if (typeof line.number === 'number')
          maximumLineNumber = Math.max(maximumLineNumber, line.number)
      }
    }
  }

  const width = `${Math.max(2, String(maximumLineNumber).length)}ch`
  return {
    '--markstream-pre-line-number-width': width,
    '--markstream-pre-diff-line-number-width': width,
    '--markstream-code-padding-left': 'calc(var(--markstream-pre-line-number-padding-left, 2ch) + var(--markstream-pre-line-number-width, 2ch) + var(--markstream-pre-line-number-padding-right, 1ch) + var(--markstream-pre-line-number-separator-width, 2px) + var(--markstream-pre-line-number-gap-to-code, 1ch))',
  }
})

const hasCollapsedDiffPreview = computed(() => {
  return diffPreviewPanes.value.some(pane => pane.lines.some(line => line.kind === 'collapsed'))
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
let diffMetricsModule: Promise<typeof import('./preCodeDiffMetrics')> | null = null
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

  const module = diffMetricsModule ??= import('./preCodeDiffMetrics')
  diffLineMetricsRaf = window.requestAnimationFrame(() => {
    void module.then(({ measurePreCodeDiffLines }) => {
      if (!disposed && preRef.value)
        diffLineMetrics.value = measurePreCodeDiffLines(preRef.value, diffLineMetrics.value)
    }, () => {
      diffMetricsModule = null
    }).finally(() => {
      diffLineMetricsRaf = null
    })
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

<style>
/* Minimal, safe defaults to reduce flicker during frequent text updates */
.markstream-vue pre[class^='language-'],
.markstream-vue pre[class*=' language-'] {
  /* Ensure code layout is stable */
  white-space: pre;
  overflow: auto;
  tab-size: var(--markstream-code-tab-size, 4);
  font-variant-ligatures: none;
  /* Isolate painting/layout to this block to avoid ancestor reflow jank */
  contain: content;
  /* Hint GPU compositing on WebKit/Blink to reduce paint flashing */
  backface-visibility: hidden;
  transform: translateZ(0);
  -webkit-font-smoothing: antialiased;
}
.markstream-vue pre[class^='language-'] > code,
.markstream-vue pre[class*=' language-'] > code {
  display: block;
}

.markstream-vue pre[data-markstream-pre='1']:not(.markstream-pre--diff-preview) {
  background: var(--markstream-code-fallback-bg, var(--markstream-code-theme-bg, var(--code-bg)));
  color: var(--markstream-code-fallback-fg, var(--markstream-code-theme-fg, var(--code-fg)));
}

.markstream-vue pre.markstream-pre--line-numbers {
  position: relative;
}

.markstream-vue pre.code-pre-fallback[data-markstream-code-loading='1'] {
  --markstream-pre-line-number-top: var(--markstream-code-padding-y, 8px);
  --markstream-pre-line-number-left: 0px;
  --markstream-pre-line-number-width: 2ch;
  --markstream-pre-line-number-padding-left: 2ch;
  --markstream-pre-line-number-padding-right: 1ch;
  --markstream-pre-line-number-separator-width: 2px;
  --markstream-code-padding-left: calc(2ch + 2ch + 1ch + 2px + 1ch);
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: var(--markstream-code-padding-y, 8px) var(--markstream-code-padding-x, 1ch);
  padding-left: var(--markstream-code-padding-left);
  overflow: auto;
  border: 0;
  border-radius: 0;
  background: var(--markstream-code-fallback-bg, var(--markstream-code-theme-bg, var(--code-bg)));
  color: var(--markstream-code-fallback-fg, var(--markstream-code-theme-fg, var(--code-fg)));
  font-family: var(--markstream-code-font-family, \"SF Mono\", Monaco, Consolas, \"Ubuntu Mono\", \"Liberation Mono\", \"Courier New\", monospace);
  font-size: var(--vscode-editor-font-size, 12px);
  line-height: var(--vscode-editor-line-height, 18px);
}

.markstream-vue pre.markstream-pre--line-numbers > .markstream-pre__line-numbers {
  position: absolute;
  top: var(--markstream-pre-line-number-top, 0);
  left: var(--markstream-pre-line-number-left, 0);
  box-sizing: content-box;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  width: var(--markstream-pre-line-number-width, 2ch);
  min-width: var(--markstream-pre-line-number-width, 2ch);
  padding-left: var(--markstream-pre-line-number-padding-left, 2ch);
  padding-right: var(--markstream-pre-line-number-padding-right, 1ch);
  border-right: var(--markstream-pre-line-number-separator-width, 2px) solid transparent;
  color: var(--code-line-number);
  font: inherit;
  font-variant-numeric: tabular-nums;
  line-height: inherit;
  pointer-events: none;
  user-select: none;
}

.markstream-vue pre.markstream-pre--line-numbers:not(.markstream-pre--diff-preview):not(.code-pre-fallback) > .markstream-pre__code {
  box-sizing: border-box;
  min-width: 100%;
  padding-left: var(--markstream-code-padding-left, 52px);
  padding-right: var(--markstream-code-padding-x, 12px);
}

.markstream-vue pre.markstream-pre--line-numbers > .markstream-pre__code--wrapped {
  white-space: pre-wrap;
}

.markstream-vue pre.markstream-pre--line-numbers > .markstream-pre__code--wrapped > .markstream-pre__logical-line {
  position: relative;
  display: block;
  min-height: 1lh;
}

.markstream-vue pre.markstream-pre--line-numbers > .markstream-pre__code--wrapped > .markstream-pre__logical-line::before {
  position: absolute;
  left: calc(-1 * var(--markstream-code-padding-left, 52px));
  box-sizing: content-box;
  width: var(--markstream-pre-line-number-width, 2ch);
  padding-left: var(--markstream-pre-line-number-padding-left, 2ch);
  color: var(--code-line-number);
  font: inherit;
  font-variant-numeric: tabular-nums;
  line-height: inherit;
  text-align: right;
  white-space: pre;
  content: attr(data-line-number);
  pointer-events: none;
  user-select: none;
}

.markstream-vue pre.markstream-pre--line-numbers > .markstream-pre__line-numbers > .markstream-pre__line-number {
  display: block;
  min-height: 1lh;
}

.markstream-vue pre.markstream-pre--line-numbers > .markstream-pre__line-numbers > .markstream-pre__line-numbers-text {
  display: block;
  min-height: 1lh;
  text-align: right;
  white-space: pre;
}

.markstream-vue pre.markstream-pre--diff-preview {
  box-sizing: border-box;
  /* The diff rows manage their own number-column padding, so the pre itself
     must not add another left padding. `!important` so the loading-placeholder
     rule (`pre[data-markstream-code-loading='1']`) cannot double-count it. */
  padding-left: 0 !important;
  padding-right: 0 !important;
  width: 100%;

  --markstream-pre-diff-gutter-marker-width: 4px;
  --markstream-pre-diff-gutter-gap: 1ch;
  --markstream-pre-diff-code-gap: 1ch;
  --markstream-pre-diff-code-padding: 0px;
  --markstream-diff-added-fg: var(--diff-added-fg, #2f8f68);
  --markstream-diff-removed-fg: var(--diff-removed-fg, #c24141);
  --markstream-diff-added-line-fill: var(--diff-added-bg, rgb(47 143 104 / 12%));
  --markstream-diff-removed-line-fill: var(--diff-removed-bg, rgb(194 65 65 / 12%));
  --markstream-diff-added-gutter: linear-gradient(
    90deg,
    var(--markstream-diff-added-fg) 0 var(--markstream-pre-diff-gutter-marker-width),
    transparent var(--markstream-pre-diff-gutter-marker-width) 100%
  );
  --markstream-diff-removed-gutter: linear-gradient(
    90deg,
    var(--markstream-diff-removed-fg) 0 var(--markstream-pre-diff-gutter-marker-width),
    transparent var(--markstream-pre-diff-gutter-marker-width) 100%
  );
  --markstream-pre-diff-line-number-width: 2ch;
  --markstream-pre-diff-line-number-padding-left: 2ch;
  --markstream-pre-diff-line-number-padding-right: 1ch;
  --markstream-pre-diff-line-number-separator-width: 2px;
  --markstream-pre-diff-pane-min-width: 225px;
  --markstream-pre-diff-line-number-box-width: calc(
    var(--markstream-pre-diff-line-number-padding-left)
    + var(--markstream-pre-diff-line-number-width)
    + var(--markstream-pre-diff-line-number-padding-right)
    + var(--markstream-pre-diff-line-number-separator-width)
  );
  --markstream-pre-diff-line-number-bg: var(--markstream-diff-line-number-bg, transparent);
  --markstream-pre-diff-line-number-gap-to-code: var(--markstream-pre-diff-code-gap);
  --markstream-pre-diff-line-number-left: 0px;
  --markstream-pre-diff-line-number-align: var(--markstream-diff-line-number-align, right);
  --markstream-pre-diff-code-fill-left: calc(
    var(--markstream-pre-diff-line-number-left)
    + var(--markstream-pre-diff-line-number-box-width)
  );
  --markstream-pre-diff-code-left: calc(
    var(--markstream-pre-diff-code-fill-left)
    + var(--markstream-pre-diff-line-number-gap-to-code)
    + var(--markstream-pre-diff-code-padding)
  );
}

.markstream-vue pre.markstream-pre--diff-preview::-webkit-scrollbar {
  width: 12px;
  height: 12px;
}

.markstream-vue pre.code-pre-fallback.markstream-pre--diff-preview.markstream-pre--diff-inline:not(.is-wrap) {
  scrollbar-width: none;
}

.markstream-vue pre.code-pre-fallback.markstream-pre--diff-preview.markstream-pre--diff-inline:not(.is-wrap)::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.markstream-vue pre.is-wrap {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: normal;
}

.markstream-vue pre.markstream-pre--diff-preview.markstream-pre--diff-inline {
  --markstream-pre-diff-line-number-gap-to-code: var(--markstream-pre-diff-code-gap);
  --markstream-pre-diff-line-number-left: 0px;
}

.markstream-vue pre.markstream-pre--diff-preview > .markstream-pre__diff-code {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  font: inherit;
  line-height: inherit;
  min-width: 100%;
  width: 100%;
}

.markstream-vue pre.markstream-pre--diff-preview.is-wrap > .markstream-pre__diff-code {
  grid-template-columns: minmax(var(--markstream-pre-diff-pane-min-width, 225px), 1fr) minmax(var(--markstream-pre-diff-pane-min-width, 225px), 1fr);
}

.markstream-vue pre.markstream-pre--diff-preview.markstream-pre--diff-inline > .markstream-pre__diff-code {
  grid-template-columns: minmax(0, 1fr);
}

.markstream-vue pre.markstream-pre--diff-preview.markstream-pre--diff-inline:not(.is-wrap) > .markstream-pre__diff-code {
  grid-template-columns: minmax(100%, max-content);
  width: 100%;
  min-width: max-content;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-pane {
  min-width: 0;
  overflow: hidden;
}

.markstream-vue pre.markstream-pre--diff-preview:not(.is-wrap):not(.markstream-pre--diff-inline) .markstream-pre__diff-pane {
  overflow-x: auto;
  overflow-y: hidden;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-pane-content {
  display: block;
  min-width: 100%;
}

.markstream-vue pre.markstream-pre--diff-preview:not(.is-wrap):not(.markstream-pre--diff-inline) .markstream-pre__diff-pane-content {
  width: max-content;
}

.markstream-vue pre.markstream-pre--diff-preview.markstream-pre--diff-inline:not(.is-wrap) .markstream-pre__diff-pane {
  min-width: max-content;
  width: 100%;
  overflow: visible;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-pane--modified {
  --markstream-pre-diff-line-number-gap-to-code: var(--markstream-pre-diff-code-gap);
  --markstream-pre-diff-line-number-left: 0px;
  /* The finalized highlight surface separates its split columns with a clean
     background gap (pierre's 1ch line paddings plus background-colored column
     borders), not a colored 1px divider line. Keep the pre fallback visually
     identical: drop the divider so the middle between the two columns reads
     as a 2ch white gap. */
  box-shadow: none;
}

/* Match the finalized highlight surface's 2ch white split divider: pierre's
   split lines carry 1ch inline padding on each side of the code content. The
   left pane mirrors the text's 1ch right padding toward the seam; the right
   pane already spaces its text 1ch past the line-number gutter
   (`--markstream-pre-diff-line-number-gap-to-code`), so no extra left padding
   is added there — adding one would push the right column's content one `ch`
   away from the line numbers compared with the highlight surface. */
.markstream-vue pre.markstream-pre--diff-preview:not(.markstream-pre--diff-inline) .markstream-pre__diff-pane--original .markstream-pre__diff-line:not(.markstream-pre__diff-line--collapsed) .markstream-pre__diff-content {
  padding-right: 1ch;
}

/* Split view: the collapsed "N unmodified lines" pill must read as ONE
   continuous pill spanning both columns (pierre's split separators meet at the
   middle divider). The left pane extends its pill flush to its right edge and
   the right pane starts flush at its own left edge, so the two halves abut
   exactly at the column seam; the inner corners are squared so there is no
   notch where they meet. */
.markstream-vue pre.markstream-pre--diff-preview:not(.markstream-pre--diff-inline) .markstream-pre__diff-pane--original .markstream-pre__diff-line--collapsed::before {
  right: 0px;
  border-top-right-radius: 0px;
  border-bottom-right-radius: 0px;
}

.markstream-vue pre.markstream-pre--diff-preview:not(.markstream-pre--diff-inline) .markstream-pre__diff-pane--modified .markstream-pre__diff-line--collapsed::before {
  left: 0px;
  border-top-left-radius: 0px;
  border-bottom-left-radius: 0px;
}

/* The modified (right) pane's collapsed row is only the empty half of the
   continuous pill — the finalized surface renders the "N unmodified lines"
   widget once on the original side. Hide the duplicated chevron/icon so the
   right half stays clean (matches the highlight surface). */
.markstream-vue pre.markstream-pre--diff-preview:not(.markstream-pre--diff-inline) .markstream-pre__diff-pane--modified .markstream-pre__diff-line--collapsed > .markstream-pre__diff-collapsed-icon {
  display: none;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line {
  position: relative;
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-width: 100%;
  min-height: var(
    --markstream-pre-diff-synced-row-height,
    var(--markstream-pre-diff-line-height, 18px)
  );
  padding-left: var(--markstream-pre-diff-code-left);
  line-height: var(--markstream-pre-diff-line-height, 18px);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line::before {
  content: '';
  position: absolute;
  left: var(--markstream-pre-diff-code-fill-left);
  right: 0;
  top: 0;
  height: var(
    --markstream-pre-diff-synced-row-height,
    var(--markstream-pre-diff-line-height, 18px)
  );
  z-index: 0;
  pointer-events: none;
  border-radius: 0;
  background: transparent;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line::after {
  content: '';
  position: absolute;
  left: var(--markstream-pre-diff-line-number-left);
  top: 0;
  width: var(--markstream-pre-diff-line-number-box-width);
  height: var(
    --markstream-pre-diff-synced-row-height,
    var(--markstream-pre-diff-line-height, 18px)
  );
  z-index: 0;
  pointer-events: none;
  background: var(--markstream-pre-diff-line-number-bg);
  box-shadow: none;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-rail {
  position: absolute;
  z-index: 2;
  top: 0;
  left: 0;
  height: var(
    --markstream-pre-diff-synced-row-height,
    var(--markstream-pre-diff-line-height, 18px)
  );
  width: var(--markstream-pre-diff-gutter-marker-width, 4px);
  min-width: var(--markstream-pre-diff-gutter-marker-width, 4px);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-number {
  position: absolute;
  z-index: 1;
  top: 0;
  left: var(--markstream-pre-diff-line-number-left);
  width: var(--markstream-pre-diff-line-number-width);
  min-width: var(--markstream-pre-diff-line-number-width);
  height: var(
    --markstream-pre-diff-synced-row-height,
    var(--markstream-pre-diff-line-height, 18px)
  );
  box-sizing: content-box;
  background: var(--markstream-pre-diff-line-number-bg);
  box-shadow: none;
  padding-left: var(--markstream-pre-diff-line-number-padding-left, 2ch);
  padding-right: var(--markstream-pre-diff-line-number-padding-right, 1ch);
  border-right: var(--markstream-pre-diff-line-number-separator-width, 2px) solid var(--markstream-diff-editor-bg, var(--code-bg));
  color: var(--code-line-number);
  font-variant-numeric: tabular-nums;
  line-height: var(--markstream-pre-diff-line-height, 18px);
  text-align: var(--markstream-pre-diff-line-number-align, right);
  user-select: none;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--added > .markstream-pre__diff-number {
  background: var(--markstream-diff-added-number-fill, var(--markstream-diff-added-line-fill, transparent));
  color: var(--markstream-diff-added-fg, var(--code-line-number));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--removed > .markstream-pre__diff-number {
  background: var(--markstream-diff-removed-number-fill, var(--markstream-diff-removed-line-fill, transparent));
  color: var(--markstream-diff-removed-fg, var(--code-line-number));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-content {
  position: relative;
  z-index: 1;
  display: block;
  width: max-content;
  min-width: 100%;
  line-height: var(--markstream-pre-diff-line-height, 18px);
  white-space: inherit;
  overflow-wrap: normal;
  word-break: normal;
  line-break: auto;
}

.markstream-vue pre.markstream-pre--diff-preview.is-wrap .markstream-pre__diff-content {
  box-sizing: border-box;
  width: auto;
  min-width: 0;
  padding-right: 1ch;
  overflow-wrap: anywhere;
  word-break: normal;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-content-inner {
  white-space: inherit;
  overflow-wrap: inherit;
  word-break: inherit;
  line-break: inherit;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--hunk {
  color: var(--markstream-diff-unchanged-fg, var(--code-line-number));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--hunk::before {
  background: var(--markstream-diff-unchanged-bg, transparent);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--spacer::before {
  background-image: linear-gradient(
    -45deg,
    color-mix(in srgb, currentColor 20%, transparent) 12.5%,
    transparent 12.5%,
    transparent 50%,
    color-mix(in srgb, currentColor 20%, transparent) 50%,
    color-mix(in srgb, currentColor 20%, transparent) 62.5%,
    transparent 62.5%,
    transparent 100%
  );
  background-size: 10px 10px;
  opacity: 0.38;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--metadata {
  color: var(--markstream-diff-metadata-fg, var(--code-line-number));
  background: var(--markstream-diff-metadata-bg, var(--code-bg));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--metadata::after,
.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--metadata > .markstream-pre__diff-rail,
.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--metadata > .markstream-pre__diff-number {
  display: none;
}

.markstream-vue pre.markstream-pre--diff-preview.markstream-pre--diff-inline .markstream-pre__diff-line--metadata + .markstream-pre__diff-line--metadata {
  margin-top: calc(-1 * var(--markstream-pre-diff-line-height, 18px));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--spacer::after,
.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--spacer > .markstream-pre__diff-rail,
.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--spacer > .markstream-pre__diff-number,
.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--spacer > .markstream-pre__diff-content {
  display: none;
}

.markstream-vue pre.markstream-pre--diff-preview.markstream-pre--diff-collapsed:not(.code-pre-fallback) {
  height: auto !important;
  min-height: 0 !important;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--collapsed {
  /* The finalized highlight surface renders its "N unmodified lines" widget as a
     32px pill separated from the surrounding diff rows by an 8px gap on each
     side (pierre's `line-info` separator with its 8px `--diffs-gap-fallback`).
     The first/last collapsed rows drop the outer gap (pierre's
     `data-separator-first/last` rules): a terminal row reuses the pre's own
     8px bottom padding so the pill sits at the bottom of the pre. */
  min-height: calc(
    var(--markstream-pre-diff-collapsed-row-height, 32px)
    + var(--markstream-pre-diff-collapsed-row-gap-top, var(--markstream-pre-diff-collapsed-row-gap, 8px))
    + var(--markstream-pre-diff-collapsed-row-gap-bottom, var(--markstream-pre-diff-collapsed-row-gap, 8px))
  );
  padding:
    var(--markstream-pre-diff-collapsed-row-gap-top, var(--markstream-pre-diff-collapsed-row-gap, 8px))
    0
    var(--markstream-pre-diff-collapsed-row-gap-bottom, var(--markstream-pre-diff-collapsed-row-gap, 8px));
  /* Match the finalized separator's text: pierre paints "N unmodified lines" in
     its header/sans-serif font in the muted `--diffs-fg-number` gray
     (`color-mix(in lab, fg 65%, bg)`), not the code's monospace foreground. */
  color: color-mix(
    in lab,
    var(--markstream-code-theme-fg, var(--markstream-code-fallback-fg, var(--markstream-pre-resolved-theme-fg, var(--code-fg, #000)))) 65%,
    var(--markstream-code-theme-bg, var(--markstream-code-fallback-bg, var(--markstream-pre-resolved-theme-bg, var(--code-bg, #fff))))
  );
  font-family: var(
    --markstream-pre-diff-header-font,
    system-ui,
    -apple-system,
    'Segoe UI',
    Roboto,
    'Helvetica Neue',
    'Noto Sans',
    'Liberation Sans',
    Arial,
    sans-serif
  );
  line-height: var(--markstream-pre-diff-collapsed-row-height, 32px);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--collapsed::before {
  top: var(--markstream-pre-diff-collapsed-row-gap-top, var(--markstream-pre-diff-collapsed-row-gap, 8px));
  left: 8px;
  right: 8px;
  height: var(--markstream-pre-diff-collapsed-row-height, 32px);
  border-radius: 6px;
  background: var(--markstream-diff-unchanged-bg, rgb(0 0 0 / 4%));
}

/* First collapsed region: flush against the top diff rows (pierre's
   `data-separator-first` clears the leading margin). */
.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--collapsed-first {
  --markstream-pre-diff-collapsed-row-gap-top: 0px;
}

/* Terminal collapsed region: the pill sits at the bottom of the pre and the
   pre's own 8px bottom padding provides the gap (pierre's
   `data-separator-last` clears the trailing margin). */
.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--collapsed-last {
  --markstream-pre-diff-collapsed-row-gap-bottom: 0px;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--collapsed::after,
.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--collapsed > .markstream-pre__diff-rail,
.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--collapsed > .markstream-pre__diff-number {
  display: none;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--collapsed > .markstream-pre__diff-content {
  width: 100%;
  min-width: 0;
  /* Match the finalized separator's text offset: pierre's `line-info` pill
     sits 8px from the code-area left (`padding-inline: 8px`), the text
     follows a 34px expand-button column, and the content itself carries
     `padding: 0 1ch` (8px + 34px + 1ch). */
  padding-left: calc(8px + 34px + 1ch);
  line-height: var(--markstream-pre-diff-collapsed-row-height, 32px);
}

/* Mirror pierre's `diffs-icon-expand` chevron occupying the 34px column left
   of the "N unmodified lines" text, so the fallback pill matches the
   finalized separator (same color, same position, non-interactive). */
.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--collapsed > .markstream-pre__diff-collapsed-icon {
  position: absolute;
  left: 8px;
  top: var(--markstream-pre-diff-collapsed-row-gap-top, var(--markstream-pre-diff-collapsed-row-gap, 8px));
  width: 34px;
  height: var(--markstream-pre-diff-collapsed-row-height, 32px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: inherit;
  pointer-events: none;

  & svg {
    fill: currentColor;
    flex: none;
  }
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--added::before {
  background: var(--markstream-diff-added-line-fill, transparent);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--removed::before {
  background: var(--markstream-diff-removed-line-fill, transparent);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--added > .markstream-pre__diff-rail {
  background: var(--markstream-diff-added-gutter, currentColor);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--removed > .markstream-pre__diff-rail {
  background: var(--markstream-diff-removed-gutter, currentColor);
}

/* Keyboard accessibility: visible focus when scroll container is focused */
.markstream-vue pre[class^='language-']:focus,
.markstream-vue pre[class*=' language-']:focus {
  outline: var(--ms-focus-ring-width) solid var(--focus-ring);
  outline-offset: var(--ms-focus-ring-offset);
}
</style>
