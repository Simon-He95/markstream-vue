import type { Ref } from 'vue'
import { getCurrentScope, onMounted, onScopeDispose, ref, watch } from 'vue'

export interface StickToBottomOptions {
  threshold?: number
}

export interface StickToBottomController {
  bottomPinned: Ref<boolean>
  scheduleScrollToBottom: () => void
  scrollToBottom: () => void
}

const TOUCH_UNPIN_THRESHOLD_PX = 6

export function useStickToBottom(
  scrollRoot: Ref<HTMLElement | null>,
  contentRoot: Ref<HTMLElement | null>,
  options: StickToBottomOptions = {},
): StickToBottomController {
  const bottomPinned = ref(true)
  const threshold = Math.max(0, options.threshold ?? 64)
  let frame = 0
  let resizeObserver: ResizeObserver | null = null
  let touchY: number | null = null
  let scrollbarDragging = false
  let stopRootListeners: (() => void) | null = null

  function distanceFromBottom(root: HTMLElement) {
    return root.scrollHeight - root.clientHeight - root.scrollTop
  }

  function isNearBottom(root: HTMLElement) {
    return distanceFromBottom(root) <= threshold
  }

  function scrollToBottom() {
    const root = scrollRoot.value
    if (!root)
      return
    root.scrollTo({ top: root.scrollHeight, behavior: 'auto' })
  }

  function scheduleScrollToBottom() {
    if (!bottomPinned.value || frame || typeof requestAnimationFrame === 'undefined')
      return
    frame = requestAnimationFrame(() => {
      frame = 0
      if (bottomPinned.value)
        scrollToBottom()
    })
  }

  function unpin() {
    bottomPinned.value = false
  }

  function onScroll() {
    const root = scrollRoot.value
    if (!root)
      return
    if (isNearBottom(root)) {
      bottomPinned.value = true
      return
    }
    if (scrollbarDragging) {
      unpin()
      return
    }
    if (!bottomPinned.value)
      return
    scheduleScrollToBottom()
  }

  function onWheel(event: WheelEvent) {
    if (event.deltaY < 0 && (scrollRoot.value?.scrollTop ?? 0) > 0)
      unpin()
  }

  function onKeydown(event: KeyboardEvent) {
    const target = event.target
    if (event.defaultPrevented || (target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')))
      return
    if (event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'Home')
      unpin()
  }

  function onTouchStart(event: TouchEvent) {
    touchY = event.touches[0]?.clientY ?? null
  }

  function onTouchMove(event: TouchEvent) {
    const nextY = event.touches[0]?.clientY ?? null
    if (touchY != null && nextY != null && nextY - touchY >= TOUCH_UNPIN_THRESHOLD_PX)
      unpin()
  }

  function onTouchEnd() {
    touchY = null
  }

  function onPointerDown(event: PointerEvent) {
    const root = scrollRoot.value
    if (!root)
      return
    const scrollbarWidth = Math.max(12, root.offsetWidth - root.clientWidth)
    const rect = root.getBoundingClientRect()
    const inScrollbar = getComputedStyle(root).direction === 'rtl'
      ? event.clientX <= rect.left + scrollbarWidth
      : event.clientX >= rect.right - scrollbarWidth
    if (inScrollbar)
      scrollbarDragging = true
  }

  function onPointerUp() {
    scrollbarDragging = false
  }

  function attachRoot(root: HTMLElement | null) {
    stopRootListeners?.()
    stopRootListeners = null
    if (!root)
      return

    root.addEventListener('scroll', onScroll, { passive: true })
    root.addEventListener('wheel', onWheel, { passive: true })
    root.addEventListener('keydown', onKeydown)
    root.addEventListener('touchstart', onTouchStart, { passive: true })
    root.addEventListener('touchmove', onTouchMove, { passive: true })
    root.addEventListener('touchend', onTouchEnd, { passive: true })
    root.addEventListener('pointerdown', onPointerDown, { passive: true })
    window.addEventListener('pointerup', onPointerUp, { passive: true })

    stopRootListeners = () => {
      root.removeEventListener('scroll', onScroll)
      root.removeEventListener('wheel', onWheel)
      root.removeEventListener('keydown', onKeydown)
      root.removeEventListener('touchstart', onTouchStart)
      root.removeEventListener('touchmove', onTouchMove)
      root.removeEventListener('touchend', onTouchEnd)
      root.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }

  function observeContent(content: HTMLElement | null) {
    resizeObserver?.disconnect()
    resizeObserver = null
    if (!content || typeof ResizeObserver === 'undefined')
      return
    resizeObserver = new ResizeObserver(scheduleScrollToBottom)
    resizeObserver.observe(content)
  }

  function cleanup() {
    if (frame && typeof cancelAnimationFrame !== 'undefined')
      cancelAnimationFrame(frame)
    frame = 0
    resizeObserver?.disconnect()
    resizeObserver = null
    stopRootListeners?.()
    stopRootListeners = null
  }

  onMounted(() => {
    attachRoot(scrollRoot.value)
    observeContent(contentRoot.value)
    scheduleScrollToBottom()
  })

  const stopRootWatch = watch(scrollRoot, attachRoot)
  const stopContentWatch = watch(contentRoot, observeContent)

  if (getCurrentScope()) {
    onScopeDispose(() => {
      stopRootWatch()
      stopContentWatch()
      cleanup()
    })
  }

  return {
    bottomPinned,
    scheduleScrollToBottom,
    scrollToBottom,
  }
}
