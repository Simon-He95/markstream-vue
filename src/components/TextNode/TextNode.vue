<script setup lang="ts">
import { computed, inject, onScopeDispose, ref, useAttrs, watch } from 'vue'
import { useStreamingTextFade } from '../../composables/useStreamingTextFade'

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
const { settledContent, segments, update, finish, settleFinished } = useStreamingTextFade(props.node.content)
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
const streamedDeltaEls = ref<HTMLElement[]>([])
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

function selectionIntersectsDelta() {
  if (!streamedDeltaEls.value.length)
    return false
  const selection = document.getSelection?.()
  if (!selection || selection.isCollapsed)
    return false
  for (let index = 0; index < selection.rangeCount; index++) {
    const range = selection.getRangeAt(index)
    if (streamedDeltaEls.value.some(element => range.intersectsNode(element)))
      return true
  }
  return false
}

function finishSegment(id: number) {
  const selected = selectionIntersectsDelta()
  finish(id, selected)
  if (selected) {
    settleAfterSelection = true
    watchSelectionRelease()
  }
}

function applyStreamingUpdate(normalized: string) {
  const key = streamStateKey.value
  update(normalized, key ? inheritedTextStreamState?.get(key) : undefined, fadeEnabled.value)
  if (key)
    inheritedTextStreamState?.set(key, normalized)
}

watch(
  [() => props.node.content, streamStateKey, fadeEnabled],
  ([next]) => {
    const normalized = String(next ?? '')
    if (selectionIntersectsDelta()) {
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

// Template-bound value: rendered by SSR and never changed on the client, so
// Vue never patches this text node after mount (patching would mutate it and
// collapse a selection). All client updates flow through syncSettledText.
const frozenTemplateContent = ref(settledContent.value)

function handleSelectionChange() {
  if (selectionIntersectsDelta())
    return
  stopWatchingSelectionRelease()
  if (pendingSelectedContent != null) {
    const pending = pendingSelectedContent
    pendingSelectedContent = null
    settleAfterSelection = false
    applyStreamingUpdate(pending)
    settleFinished()
  }
  else if (settleAfterSelection) {
    settleAfterSelection = false
    settleFinished()
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

onScopeDispose(stopWatchingSelectionRelease)
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
      v-for="segment in segments"
      :key="segment.id"
      ref="streamedDeltaEls"
      class="text-node-stream-delta"
      @animationend="finishSegment(segment.id)"
    >
      {{ segment.content }}
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
  animation: text-node-stream-update-fade var(--stream-update-fade-duration, var(--fade-duration, 200ms))
    var(--stream-update-fade-ease, var(--fade-ease, cubic-bezier(0.2, 0, 0.4, 1))) both;
}

@keyframes text-node-stream-update-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .text-node-stream-delta {
    animation-duration: 0s !important;
  }
}
</style>
