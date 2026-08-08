<script setup lang="ts">
import type { Component } from 'vue'
import type { MarkstreamThreadVirtualState } from '../../../src/exports'
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import MarkdownRender, { MarkstreamVirtualTimeline } from '../../../src/exports'
import KatexWorker from '../../../src/workers/katexRenderer.worker?worker&inline'
import { setKaTeXWorker } from '../../../src/workers/katexWorkerClient'
import MermaidWorker from '../../../src/workers/mermaidParser.worker?worker&inline'
import { setMermaidWorker } from '../../../src/workers/mermaidWorkerClient'
import '../../../src/index.css'
import 'katex/dist/katex.min.css'

type ThreadId = 'thread-a' | 'thread-b'

setKaTeXWorker(new KatexWorker())
setMermaidWorker(new MermaidWorker())

type TimelineItem
  = | { kind: 'system-divider', id: string, text: string }
    | { kind: 'user-message', id: string, text: string }
    | { kind: 'assistant-markdown', id: string, content: string, final: boolean, revision?: number }
    | { kind: 'tool-call', id: string, status: 'running' | 'done', label: string }
    | { kind: 'thinking', id: string, content: string }
    | { kind: 'error', id: string, message: string }
    | { kind: 'custom', id: string, component: Component }

declare global {
  interface Window {
    __markstreamVirtualTimelineZero?: {
      read: () => {
        threadId: ThreadId
        scrollTop: number
        scrollHeight: number
        clientHeight: number
        totalHeight: number
        state: unknown
        visibleText: string
        viewportText: string
        restoring: boolean
        codeBlockProbe: Array<{
          height: number
          editorLayerHeight: number
          fallbackHeight: number
          editorHostHeight: number
          enhanced: boolean
          diff: boolean
          fallbackVisible: boolean
          hiddenEditor: boolean
          diffSurfaceVisible: boolean
          textLength: number
        }>
        diffCodeBlockProbe: Array<{
          height: number
          editorLayerHeight: number
          fallbackHeight: number
          editorHostHeight: number
          enhanced: boolean
          diff: boolean
          fallbackVisible: boolean
          hiddenEditor: boolean
          diffSurfaceVisible: boolean
          textLength: number
        }>
      }
      nextFrame: () => Promise<void>
      scrollTo: (offset: number) => Promise<unknown>
      switchThread: (threadId: ThreadId) => Promise<unknown>
      startStreamingLastMessage: () => void
      monitorBottomStreaming: () => Promise<unknown>
      monitorNonBottomStreaming: () => Promise<unknown>
    }
  }
}

const activeThreadId = ref<ThreadId>('thread-a')
const streamingContent = ref('')
const streamingFinal = ref(true)
const streamingRevision = ref(1)
let streamingTimer: number | null = null
const timelineRef = ref<{
  scrollToOffset: (offset: number) => void
  captureThreadState: () => MarkstreamThreadVirtualState
  getTotalHeight: () => number
} | null>(null)

const InspectionPanel = defineComponent({
  name: 'InspectionPanel',
  setup() {
    return () => h('div', { class: 'custom-panel' }, [
      h('strong', 'Custom timeline item'),
      h('span', 'Rendered and measured by the outer timeline virtualizer.'),
    ])
  },
})

function makeLargeMarkdown(label: string, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const step = index + 1
    let syntaxBlock: string[]

    if (step % 5 === 1) {
      syntaxBlock = [
        `Inline KaTeX checkpoint: $H_${step} = O_${step} + M_${step}$.`,
        '',
        '$$',
        `\\Delta h_${step} = \\sum_{i=1}^{${step}} \\left(h_i - \\hat{h}_i\\right)`,
        '$$',
      ]
    }
    else if (step % 5 === 2) {
      syntaxBlock = [
        '```mermaid',
        'flowchart TD',
        `  A["${label} section ${step}"] --> B["Measure item height"]`,
        '  B --> C["Import Markdown cache"]',
        '  C --> D["Restore outer anchor"]',
        '```',
      ]
    }
    else if (step % 5 === 3) {
      syntaxBlock = [
        '```diff ts:restore-anchor.ts',
        `-const section${step} = ${JSON.stringify({ step, label: 'estimated' })}`,
        `+const section${step} = ${JSON.stringify({ step, label, restored: true })}`,
        '```',
      ]
    }
    else if (step % 5 === 4) {
      syntaxBlock = [
        '```infographic',
        'infographic list-row-simple-horizontal-arrow',
        'data',
        '  items',
        `    - label: Section ${step}`,
        '      desc: Persisted state loaded',
        '    - label: Height cache',
        '      desc: Ready before paint',
        '    - label: Anchor',
        '      desc: No visible jump',
        '```',
      ]
    }
    else {
      syntaxBlock = [
        '```ts',
        `const section${step} = ${JSON.stringify({ step, label })}`,
        '```',
      ]
    }

    return [
      `## ${label} section ${step}`,
      `This block is part of a long assistant answer. It is intentionally repeated so MarkdownRender can virtualize block nodes while the timeline virtualizer owns the outer item height.`,
      '',
      ...syntaxBlock,
    ].join('\n')
  }).join('\n\n')
}

const threadAStaticItems: TimelineItem[] = [
  { kind: 'system-divider', id: 'a-d-1', text: 'Today' },
  { kind: 'user-message', id: 'a-u-1', text: 'Audit this PR and keep the scroll position stable while tools run.' },
  { kind: 'thinking', id: 'a-t-1', content: 'Inspecting changed files and estimating render cost.' },
  { kind: 'tool-call', id: 'a-tool-1', status: 'running', label: 'Reading GitHub PR' },
  {
    kind: 'assistant-markdown',
    id: 'a-md-1',
    content: makeLargeMarkdown('PR analysis', 28),
    final: true,
    revision: 1,
  },
  { kind: 'tool-call', id: 'a-tool-2', status: 'done', label: 'Search complete' },
  { kind: 'custom', id: 'a-custom-1', component: InspectionPanel },
  { kind: 'error', id: 'a-error-1', message: 'Tool call failed once and was retried.' },
]

const threadBStaticItems: TimelineItem[] = [
  { kind: 'system-divider', id: 'b-d-1', text: 'Yesterday' },
  { kind: 'user-message', id: 'b-u-1', text: 'Summarize the virtual timeline contract.' },
  {
    kind: 'assistant-markdown',
    id: 'b-md-1',
    content: makeLargeMarkdown('Timeline contract', 18),
    final: true,
    revision: 2,
  },
  { kind: 'tool-call', id: 'b-tool-1', status: 'done', label: 'Height cache imported' },
  {
    kind: 'assistant-markdown',
    id: 'b-md-2',
    content: makeLargeMarkdown('Restore notes', 12),
    final: true,
    revision: 1,
  },
]

const streamingItem = computed<TimelineItem>(() => ({
  kind: 'assistant-markdown',
  id: 'a-streaming',
  content: streamingContent.value,
  final: streamingFinal.value,
  revision: streamingRevision.value,
}))

const threadItems = computed<Record<ThreadId, TimelineItem[]>>(() => ({
  'thread-a': [
    ...threadAStaticItems,
    streamingItem.value,
  ],
  'thread-b': threadBStaticItems,
}))

const timelineItems = computed(() => threadItems.value[activeThreadId.value])

const THREAD_STATE_STORAGE_KEY = 'markstream-vue:virtual-timeline-zero:thread-states:v1'

type PersistedThreadStates = Partial<Record<ThreadId, MarkstreamThreadVirtualState>>

function readPersistedThreadStates(): PersistedThreadStates {
  if (typeof window === 'undefined')
    return {}

  try {
    const raw = window.sessionStorage.getItem(THREAD_STATE_STORAGE_KEY)
    if (!raw)
      return {}

    const parsed = JSON.parse(raw) as PersistedThreadStates
    return parsed && typeof parsed === 'object'
      ? parsed
      : {}
  }
  catch {
    return {}
  }
}

const persistedThreadStates = shallowRef<PersistedThreadStates>(
  readPersistedThreadStates(),
)

const initialThreadState = computed(() => {
  return persistedThreadStates.value[activeThreadId.value] ?? null
})

let persistTimer: number | null = null
let pendingPersistState: MarkstreamThreadVirtualState | null = null

function writePersistedThreadStates() {
  persistTimer = null

  if (typeof window === 'undefined' || !pendingPersistState)
    return

  const state = pendingPersistState
  pendingPersistState = null

  const threadKey = state.threadKey as ThreadId | undefined
  if (!threadKey)
    return

  const next = {
    ...persistedThreadStates.value,
    [threadKey]: state,
  }

  persistedThreadStates.value = next

  try {
    window.sessionStorage.setItem(
      THREAD_STATE_STORAGE_KEY,
      JSON.stringify(next),
    )
  }
  catch {}
}

function persistThreadState(state: MarkstreamThreadVirtualState) {
  pendingPersistState = state

  const threadKey = state.threadKey as ThreadId | undefined
  if (threadKey) {
    persistedThreadStates.value = {
      ...persistedThreadStates.value,
      [threadKey]: state,
    }
  }

  if (typeof window === 'undefined')
    return

  if (persistTimer != null)
    return

  persistTimer = window.setTimeout(writePersistedThreadStates, 80)
}

function flushActiveThreadState() {
  const state = timelineRef.value?.captureThreadState?.()
  if (state)
    persistThreadState(state)

  if (persistTimer != null && typeof window !== 'undefined') {
    window.clearTimeout(persistTimer)
    writePersistedThreadStates()
  }
}

function switchThread(threadId: ThreadId) {
  if (threadId === activeThreadId.value)
    return

  flushActiveThreadState()
  activeThreadId.value = threadId
}

function startStreamingLastMessage() {
  streamingContent.value = ''
  streamingFinal.value = false
  streamingRevision.value += 1

  const chunks = Array.from({ length: 80 }, (_, index) => {
    return [
      `## Streaming section ${index + 1}`,
      '',
      `This is streaming markdown content with inline math $x_${index}=y_${index}$.`,
      '',
      '```ts',
      `const streaming${index} = ${JSON.stringify({ index })}`,
      '```',
    ].join('\n')
  })

  let cursor = 0

  if (streamingTimer != null) {
    window.clearInterval(streamingTimer)
    streamingTimer = null
  }

  streamingTimer = window.setInterval(() => {
    streamingContent.value += `\n\n${chunks[cursor] ?? ''}`
    cursor += 1

    if (cursor >= chunks.length) {
      streamingFinal.value = true

      if (streamingTimer != null) {
        window.clearInterval(streamingTimer)
        streamingTimer = null
      }
    }
  }, 24)
}

function getTimelineRoot() {
  return document.querySelector<HTMLElement>('[data-testid="markstream-virtual-timeline"]')
}

function isProbeElementVisible(el: HTMLElement) {
  if (el.closest('.code-editor-container.is-hidden'))
    return false

  let current: HTMLElement | null = el
  while (current) {
    const style = window.getComputedStyle(current)
    if (
      style.display === 'none'
      || style.visibility === 'hidden'
      || Number.parseFloat(style.opacity || '1') <= 0.01
    ) {
      return false
    }

    current = current.parentElement
  }

  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function hasVisibleDiffSurface(block: HTMLElement) {
  return Array.from(block.querySelectorAll<HTMLElement>('.stream-diffs-shell, .stream-diffs-surface'))
    .some(isProbeElementVisible)
}

function readCodeBlockProbe(root: HTMLElement | null) {
  return Array.from(root?.querySelectorAll<HTMLElement>('[data-markstream-code-block="1"]') ?? [])
    .map((block) => {
      const rect = block.getBoundingClientRect()
      const editorLayer = block.querySelector<HTMLElement>('.code-editor-layer')
      const fallback = block.querySelector<HTMLElement>('pre.code-pre-fallback')
      const editorHost = block.querySelector<HTMLElement>('.code-editor-container')

      const fallbackVisible = Boolean(fallback && isProbeElementVisible(fallback))

      return {
        height: rect.height,
        editorLayerHeight: editorLayer?.getBoundingClientRect().height ?? 0,
        fallbackHeight: fallback?.getBoundingClientRect().height ?? 0,
        editorHostHeight: editorHost?.getBoundingClientRect().height ?? 0,
        enhanced: block.dataset.markstreamEnhanced === 'true',
        diff: block.classList.contains('is-diff'),
        fallbackVisible,
        hiddenEditor: Boolean(block.querySelector('.code-editor-container.is-hidden')),
        diffSurfaceVisible: hasVisibleDiffSurface(block),
        textLength: block.textContent?.length ?? 0,
      }
    })
}

function readViewportText(root: HTMLElement | null) {
  if (!root)
    return ''

  const rootRect = root.getBoundingClientRect()
  return Array.from(root.querySelectorAll<HTMLElement>('[data-markstream-item-key]'))
    .filter((el) => {
      const rect = el.getBoundingClientRect()
      return rect.bottom >= rootRect.top && rect.top <= rootRect.bottom
    })
    .map(el => el.textContent ?? '')
    .join('\n')
}

function readSnapshot() {
  const root = getTimelineRoot()
  const codeBlockProbe = readCodeBlockProbe(root ?? null)

  return {
    threadId: activeThreadId.value,
    scrollTop: root?.scrollTop ?? 0,
    scrollHeight: root?.scrollHeight ?? 0,
    clientHeight: root?.clientHeight ?? 0,
    totalHeight: timelineRef.value?.getTotalHeight?.() ?? 0,
    state: timelineRef.value?.captureThreadState?.() ?? null,
    visibleText: root?.textContent ?? '',
    viewportText: readViewportText(root ?? null),
    restoring: root?.classList.contains('is-restoring-thread') ?? false,
    codeBlockProbe,
    diffCodeBlockProbe: codeBlockProbe.filter(probe => probe.diff),
  }
}

function readDistanceFromBottom(snapshot: ReturnType<typeof readSnapshot>) {
  return Math.max(0, snapshot.scrollHeight - snapshot.scrollTop - snapshot.clientHeight)
}

async function nextFrame() {
  await nextTick()
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
      return
    }

    setTimeout(resolve, 0)
  })
}

let previousScrollRestoration: ScrollRestoration | undefined

onMounted(() => {
  if ('scrollRestoration' in window.history) {
    previousScrollRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
  }

  window.addEventListener('pagehide', flushActiveThreadState)
  window.addEventListener('beforeunload', flushActiveThreadState)

  window.__markstreamVirtualTimelineZero = {
    read: readSnapshot,
    nextFrame,
    async scrollTo(offset: number) {
      timelineRef.value?.scrollToOffset(offset)
      await nextFrame()
      return readSnapshot()
    },
    async switchThread(threadId: ThreadId) {
      switchThread(threadId)
      await nextFrame()
      await nextFrame()
      return readSnapshot()
    },
    startStreamingLastMessage,
    async monitorBottomStreaming() {
      for (let i = 0; i < 80; i++) {
        timelineRef.value?.scrollToOffset(timelineRef.value.getTotalHeight())
        await nextFrame()

        const snapshot = readSnapshot()
        const distanceFromBottom = readDistanceFromBottom(snapshot)
        if (!snapshot.restoring && distanceFromBottom <= 2)
          break
      }

      const before = readSnapshot()
      startStreamingLastMessage()

      const samples: ReturnType<typeof readSnapshot>[] = []
      for (let i = 0; i < 180; i++) {
        await nextFrame()
        samples.push(readSnapshot())
      }

      const visibleSamples = samples.filter(sample => !sample.restoring)
      const maxDistanceFromBottom = visibleSamples.length
        ? Math.max(...visibleSamples.map(readDistanceFromBottom))
        : Number.POSITIVE_INFINITY

      return {
        before,
        samples,
        visibleSamples,
        visibleSampleCount: visibleSamples.length,
        maxDistanceFromBottom,
        blankFrames: visibleSamples.filter(s => !s.viewportText.trim()).length,
      }
    },
    async monitorNonBottomStreaming() {
      const targetOffset = 1600
      let before = readSnapshot()

      for (let i = 0; i < 80; i++) {
        timelineRef.value?.scrollToOffset(targetOffset)
        await nextFrame()
        before = readSnapshot()

        if (!before.restoring && Math.abs(before.scrollTop - targetOffset) <= 2 && before.viewportText.trim())
          break
      }

      startStreamingLastMessage()

      const samples: ReturnType<typeof readSnapshot>[] = []
      for (let i = 0; i < 180; i++) {
        await nextFrame()
        samples.push(readSnapshot())
      }

      const visibleSamples = samples.filter(sample => !sample.restoring)
      const scrollTops = visibleSamples.map(s => s.scrollTop)
      const scrollTopRange = scrollTops.length
        ? Math.max(...scrollTops) - Math.min(...scrollTops)
        : Number.POSITIVE_INFINITY

      return {
        before,
        samples,
        visibleSamples,
        visibleSampleCount: visibleSamples.length,
        scrollTopRange,
        firstVisibleTextStable: visibleSamples.length > 0
          && before.viewportText.trim().length > 0
          && visibleSamples.every(
            s => s.viewportText.slice(0, 120) === before.viewportText.slice(0, 120),
          ),
      }
    },
  }
})

onBeforeUnmount(() => {
  flushActiveThreadState()

  if (
    previousScrollRestoration
    && typeof window !== 'undefined'
    && 'scrollRestoration' in window.history
  ) {
    window.history.scrollRestoration = previousScrollRestoration
  }

  window.removeEventListener('pagehide', flushActiveThreadState)
  window.removeEventListener('beforeunload', flushActiveThreadState)

  if (streamingTimer != null) {
    window.clearInterval(streamingTimer)
    streamingTimer = null
  }

  if (persistTimer != null) {
    window.clearTimeout(persistTimer)
    persistTimer = null
  }

  delete window.__markstreamVirtualTimelineZero
})
</script>

<template>
  <main class="virtual-timeline-zero">
    <header class="lab-header">
      <div>
        <strong>markstream-vue virtual timeline zero config</strong>
        <span>Mixed timeline item virtualization with Markdown node virtualization inside assistant items.</span>
      </div>
      <div class="thread-tabs">
        <button
          :class="{ active: activeThreadId === 'thread-a' }"
          @click="switchThread('thread-a')"
        >
          Thread A
        </button>
        <button
          :class="{ active: activeThreadId === 'thread-b' }"
          @click="switchThread('thread-b')"
        >
          Thread B
        </button>
      </div>
    </header>

    <MarkstreamVirtualTimeline
      ref="timelineRef"
      class="timeline-surface"
      :items="timelineItems"
      :thread-key="activeThreadId"
      :initial-thread-state="initialThreadState"
      :overscan="4"
      stick-to-bottom="auto"
      @thread-state-change="persistThreadState"
    >
      <template #restore-loading="{ threadKey }">
        <div class="timeline-restore-loading">
          <span class="timeline-restore-loading__spinner" />
          <span>Restoring {{ threadKey }}…</span>
        </div>
      </template>

      <template #default="{ item, measureRef, markdownProps }">
        <div
          v-if="item.kind === 'system-divider'"
          :ref="measureRef"
          class="divider-row"
        >
          {{ item.text }}
        </div>

        <article
          v-else-if="item.kind === 'user-message'"
          :ref="measureRef"
          class="bubble user-bubble"
        >
          {{ item.text }}
        </article>

        <article
          v-else-if="item.kind === 'thinking'"
          :ref="measureRef"
          class="status-row thinking-row"
        >
          {{ item.content }}
        </article>

        <article
          v-else-if="item.kind === 'tool-call'"
          :ref="measureRef"
          class="status-row tool-row"
        >
          <span>{{ item.status }}</span>
          {{ item.label }}
        </article>

        <article
          v-else-if="item.kind === 'assistant-markdown'"
          :ref="measureRef"
          class="assistant-markdown-bubble"
        >
          <MarkdownRender
            v-bind="markdownProps"
            class="assistant-markdown"
          />
        </article>

        <component
          :is="item.component"
          v-else-if="item.kind === 'custom'"
          :ref="measureRef"
        />

        <article
          v-else-if="item.kind === 'error'"
          :ref="measureRef"
          class="status-row error-row"
        >
          {{ item.message }}
        </article>
      </template>
    </MarkstreamVirtualTimeline>
  </main>
</template>

<style scoped>
.virtual-timeline-zero {
  min-height: 100vh;
  padding: 20px;
  background: #f8fafc;
  color: #111827;
}

.lab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  max-width: 1040px;
  margin: 0 auto 16px;
}

.lab-header div:first-child {
  display: grid;
  gap: 4px;
}

.lab-header strong {
  font-size: 16px;
}

.lab-header span {
  color: #475569;
  font-size: 13px;
}

.thread-tabs {
  display: inline-flex;
  gap: 6px;
  padding: 4px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
}

.thread-tabs button {
  min-width: 86px;
  padding: 7px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #334155;
  cursor: pointer;
}

.thread-tabs button.active {
  background: #0f172a;
  color: #fff;
}

:global(.virtual-timeline-zero .timeline-surface.markstream-virtual-timeline) {
  height: calc(100vh - 104px);
  max-width: 1040px;
  margin: 0 auto;
  padding: 10px 18px;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  background: #fff;
}

.timeline-restore-loading {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: rgb(255 255 255 / 92%);
  color: #334155;
  font-size: 13px;
  box-shadow: 0 10px 32px rgb(15 23 42 / 10%);
}

.timeline-restore-loading__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgb(148 163 184 / 35%);
  border-top-color: #334155;
  border-radius: 999px;
  animation: timeline-restore-spin 0.8s linear infinite;
}

@keyframes timeline-restore-spin {
  to {
    transform: rotate(360deg);
  }
}

.divider-row {
  padding: 12px 0;
  color: #64748b;
  font-size: 12px;
  text-align: center;
}

.bubble,
.status-row,
.custom-panel {
  max-width: min(760px, 88%);
  margin: 10px 0;
  padding: 12px 14px;
  border-radius: 8px;
  line-height: 1.55;
}

.user-bubble {
  margin-left: auto;
  background: #dcfce7;
  color: #14532d;
}

.assistant-markdown-bubble {
  max-width: 860px;
  margin: 10px 0;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
}

.assistant-markdown {
  margin: 0;
}

.status-row {
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1e3a8a;
}

.thinking-row {
  border-color: #ddd6fe;
  background: #f5f3ff;
  color: #4c1d95;
}

.tool-row span {
  display: inline-block;
  margin-right: 8px;
  color: #475569;
  font-size: 12px;
  text-transform: uppercase;
}

.error-row {
  border-color: #fecaca;
  background: #fef2f2;
  color: #991b1b;
}

.custom-panel {
  display: grid;
  gap: 4px;
  border: 1px solid #fed7aa;
  background: #fff7ed;
  color: #7c2d12;
}

.custom-panel span {
  font-size: 13px;
}

@media (max-width: 760px) {
  .virtual-timeline-zero {
    padding: 12px;
  }

  .lab-header {
    align-items: stretch;
    flex-direction: column;
  }

  .thread-tabs {
    align-self: flex-start;
  }

  :global(.virtual-timeline-zero .timeline-surface.markstream-virtual-timeline) {
    height: calc(100vh - 142px);
    padding: 8px 10px;
  }

  .bubble,
  .status-row,
  .custom-panel,
  .assistant-markdown-bubble {
    max-width: 100%;
  }
}
</style>
