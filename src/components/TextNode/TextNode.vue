<script setup lang="ts">
import { resolveStreamingTextUpdate } from 'markstream-core'
import { computed, inject, onScopeDispose, ref, useAttrs, watch } from 'vue'

const props = defineProps<{
  node: {
    type: 'text'
    content: string
    raw: string
    center?: boolean
  }
}>()
defineEmits(['copy'])
const attrs = useAttrs()
const inheritedFade = inject<{ value?: boolean } | undefined>('markstreamFade', undefined)
const inheritedTextStreamState = inject<Map<string, string> | undefined>('markstreamTextStreamState', undefined)
const inheritedStreamVersion = inject<{ value?: number } | undefined>('markstreamStreamVersion', undefined)
const explicitFade = computed<boolean | undefined>(() => {
  const raw = attrs.fade
  if (raw === '' || raw === true || raw === 'true')
    return true
  if (raw === false || raw === 'false')
    return false
  return undefined
})
const fadeEnabled = computed(() => {
  if (typeof explicitFade.value === 'boolean')
    return explicitFade.value
  if (typeof inheritedFade?.value === 'boolean')
    return inheritedFade.value
  return true
})
const streamStateKey = computed(() => {
  const raw = attrs['index-key'] ?? attrs.indexKey
  if (raw == null || raw === '')
    return ''
  return String(raw)
})
const settledContent = ref(props.node.content)
const streamedDelta = ref('')
const streamFadeVersion = ref(0)
// Template-bound value: rendered by SSR and never changed on the client, so
// Vue never patches this text node after mount (patching would mutate it and
// collapse a selection). All client updates flow through syncSettledText.
const frozenTemplateContent = ref(props.node.content)
let stopStreamVersionWatch: (() => void) | undefined

// Selection-safe settled-text rendering. Browsers collapse a Selection
// anchored inside a text node as soon as that node is mutated (nodeValue/
// data) OR replaced (verified in Chromium). The settle path used to merge
// the delta into the settled text, which re-rendered it with a NEW Text
// node — the streaming-selection bug (same class as VectoJS KNOWN_ISSUES:110).
// The settled node is therefore written ONCE and never touched again: each
// delta settle appends the increment as a NEW sibling text node, so existing
// nodes keep their identity and content forever.
//
// Coalesce appended increments unless doing so would disturb a selection.
const settledTextEl = ref<HTMLElement | null>(null)
const settledAppendsEl = ref<HTMLElement | null>(null)
const streamedDeltaEl = ref<HTMLElement | null>(null)
let frozenSettledText = ''
let settledTextNode: Text | null = null
let pendingSelectedContent: string | null = null
let settleAfterSelection = false
let watchedSelectionDocument: Document | undefined

const SETTLED_APPENDS_COALESCE_THRESHOLD = 4

function selectionTouches(element: Element) {
  const selection = document.getSelection?.()
  if (!selection || selection.rangeCount === 0)
    return false
  const { anchorNode, focusNode } = selection
  return (anchorNode != null && element.contains(anchorNode))
    || (focusNode != null && element.contains(focusNode))
}

function activeSelectionIntersects(element: Element) {
  const selection = document.getSelection?.()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
    return false
  for (let index = 0; index < selection.rangeCount; index++) {
    if (selection.getRangeAt(index).intersectsNode(element))
      return true
  }
  return false
}

function coalesceSettledAppends(appendsEl: HTMLElement) {
  if (appendsEl.childNodes.length <= SETTLED_APPENDS_COALESCE_THRESHOLD)
    return
  if (selectionTouches(appendsEl))
    return
  let merged = ''
  for (let index = 0; index < appendsEl.childNodes.length; index++)
    merged += appendsEl.childNodes[index]?.textContent ?? ''
  appendsEl.textContent = merged
}

function syncSettledText() {
  const el = settledTextEl.value
  if (!el)
    return
  const text = String(settledContent.value ?? '')
  const appendsEl = settledAppendsEl.value

  if (!settledTextNode) {
    // Adopt the existing text node (including one rendered by SSR) instead
    // of rewriting it.
    settledTextNode = el.firstChild as Text | null
    frozenSettledText = settledTextNode?.data ?? ''
  }

  if (!text.startsWith(frozenSettledText)) {
    // Non-prefix replacement (message changed): rebuild everything. Any
    // selection anchored in the old content is gone with the content itself.
    el.textContent = text
    settledTextNode = el.firstChild as Text | null
    if (appendsEl)
      appendsEl.textContent = ''
    frozenSettledText = text
    return
  }

  if (!settledTextNode && text) {
    // First content write — this node is now frozen forever.
    el.textContent = text
    settledTextNode = el.firstChild as Text | null
    frozenSettledText = text
    return
  }

  if (text.length > frozenSettledText.length && appendsEl) {
    // Growth: never touch the frozen node — append a new sibling text node.
    appendsEl.appendChild(document.createTextNode(text.slice(frozenSettledText.length)))
    frozenSettledText = text
    coalesceSettledAppends(appendsEl)
  }
}

watch([settledContent, settledTextEl, settledAppendsEl], syncSettledText, { immediate: true })

function getRenderedContent() {
  return settledContent.value + streamedDelta.value
}

function stopWatchingStreamVersion() {
  stopStreamVersionWatch?.()
  stopStreamVersionWatch = undefined
}

function settleStreamedDelta() {
  if (streamedDeltaEl.value && activeSelectionIntersects(streamedDeltaEl.value)) {
    settleAfterSelection = true
    watchSelectionRelease()
    return
  }
  settleAfterSelection = false
  if (!streamedDelta.value)
    return
  settledContent.value = getRenderedContent()
  streamedDelta.value = ''
}

function ensureStreamVersionWatch() {
  if (stopStreamVersionWatch || !inheritedStreamVersion)
    return
  // One persistent watcher for the component's whole lifecycle instead of a
  // create-per-delta + destroy-on-settle watcher. Streaming commits bump the
  // version once per commit, and this fires to settle whichever delta is
  // active at that moment; the old approach churned a new `flush: 'sync'`
  // watcher on every commit that appended a delta.
  stopStreamVersionWatch = watch(
    () => inheritedStreamVersion.value,
    () => {
      if (streamedDelta.value)
        settleStreamedDelta()
    },
    { flush: 'sync' },
  )
}

function applyStreamingUpdate(normalized: string) {
  const key = streamStateKey.value
  const result = resolveStreamingTextUpdate({
    nextContent: normalized,
    persistedContent: key ? inheritedTextStreamState?.get(key) : undefined,
    currentState: { settledContent: settledContent.value, streamedDelta: streamedDelta.value },
    typewriterEnabled: fadeEnabled.value,
  })

  settledContent.value = result.settledContent
  streamedDelta.value = result.streamedDelta
  if (result.appended) {
    streamFadeVersion.value += 1
    ensureStreamVersionWatch()
  }
  else if (!streamedDelta.value) {
    stopWatchingStreamVersion()
  }

  if (key)
    inheritedTextStreamState?.set(key, normalized)
}

watch(
  [() => props.node.content, streamStateKey, fadeEnabled],
  ([next]) => {
    const normalized = String(next ?? '')
    if (streamedDeltaEl.value && activeSelectionIntersects(streamedDeltaEl.value)) {
      pendingSelectedContent = normalized
      watchSelectionRelease()
      return
    }
    pendingSelectedContent = null
    settleAfterSelection = false
    applyStreamingUpdate(normalized)
  },
  { immediate: true },
)

function handleSelectionChange() {
  if (streamedDeltaEl.value && activeSelectionIntersects(streamedDeltaEl.value))
    return
  stopWatchingSelectionRelease()
  if (pendingSelectedContent != null) {
    const pending = pendingSelectedContent
    pendingSelectedContent = null
    settleAfterSelection = false
    applyStreamingUpdate(pending)
  }
  else if (settleAfterSelection) {
    settleStreamedDelta()
  }
}

function watchSelectionRelease() {
  if (watchedSelectionDocument)
    return
  watchedSelectionDocument = document
  watchedSelectionDocument.addEventListener('selectionchange', handleSelectionChange)
}

function stopWatchingSelectionRelease() {
  watchedSelectionDocument?.removeEventListener('selectionchange', handleSelectionChange)
  watchedSelectionDocument = undefined
}

onScopeDispose(() => {
  stopWatchingStreamVersion()
  stopWatchingSelectionRelease()
})

const streamedDeltaClass = computed(() => (
  streamFadeVersion.value % 2 === 0
    ? 'text-node-stream-delta--a'
    : 'text-node-stream-delta--b'
))
</script>

<template>
  <span
    :class="[node.center ? 'text-node-center' : '']"
    class="text-node"
  >
    <span
      v-show="settledContent !== ''"
      ref="settledTextEl"
    >{{ frozenTemplateContent }}</span>
    <span
      v-show="settledContent !== ''"
      ref="settledAppendsEl"
    />
    <span
      v-if="streamedDelta"
      ref="streamedDeltaEl"
      class="text-node-stream-delta" :class="[streamedDeltaClass]"
      @animationend="settleStreamedDelta"
    >
      {{ streamedDelta }}
    </span>
  </span>
</template>

<style scoped>
.text-node {
  display: inline;
  font-weight: inherit;
  vertical-align: baseline;
}
.text-node-center {
  display: inline-flex;
  justify-content: center;
  width: 100%;
}
.text-node-stream-delta {
  animation-duration: var(--stream-update-fade-duration, var(--fade-duration, 280ms));
  animation-timing-function: var(--stream-update-fade-ease, var(--fade-ease, cubic-bezier(0.33, 0, 0.67, 1)));
  animation-fill-mode: both;
}
.text-node-stream-delta--a {
  animation-name: text-node-stream-update-fade-a;
}
.text-node-stream-delta--b {
  animation-name: text-node-stream-update-fade-b;
}

@keyframes text-node-stream-update-fade-a {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes text-node-stream-update-fade-b {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .text-node-stream-delta {
    animation: none !important;
  }
}
</style>
