import { createEffect, onCleanup } from 'solid-js'
import { clearTrackedRaf, trackedRaf, trackObserver, untrackObserver } from './resourceTracker'

export const STICKY_BOTTOM_THRESHOLD_PX = 24

export function createChatAutoScroll(getContainer: () => HTMLElement | null) {
  let frame: number | null = null
  let stickToBottom = true
  let resizeObserver: ResizeObserver | null = null
  let container: HTMLElement | null = null

  const syncStickToBottom = () => {
    const element = getContainer()
    if (!element)
      return
    const distanceFromBottom = element.scrollHeight - element.clientHeight - element.scrollTop
    stickToBottom = distanceFromBottom <= STICKY_BOTTOM_THRESHOLD_PX
  }

  const scheduleScrollToBottom = () => {
    if (typeof window === 'undefined')
      return
    if (frame != null)
      return

    frame = trackedRaf(() => {
      frame = null
      const element = getContainer()
      if (!element)
        return
      element.scrollTop = element.scrollHeight
      syncStickToBottom()
    })
  }

  const onContentChange = () => {
    if (!stickToBottom)
      return
    scheduleScrollToBottom()
  }

  const detach = () => {
    container?.removeEventListener('scroll', syncStickToBottom)
    untrackObserver(resizeObserver)
    resizeObserver = null
    clearTrackedRaf(frame)
    frame = null
    container = null
  }

  const attach = () => {
    detach()
    container = getContainer()
    if (!container)
      return

    syncStickToBottom()
    container.addEventListener('scroll', syncStickToBottom, { passive: true })

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = trackObserver(new ResizeObserver(() => {
        if (stickToBottom)
          scheduleScrollToBottom()
      }))
      resizeObserver.observe(container)
      const shell = container.querySelector('.chatbot-renderer-shell') as HTMLElement | null
      if (shell)
        resizeObserver.observe(shell)
    }

    if (stickToBottom)
      scheduleScrollToBottom()
  }

  return {
    attach,
    detach,
    onContentChange,
    isSticky: () => stickToBottom,
    syncStickToBottom,
    scheduleScrollToBottom,
  }
}

export function useChatAutoScroll(
  getContainer: () => HTMLElement | null | undefined,
  contentKey: () => string,
) {
  const controller = createChatAutoScroll(() => getContainer() ?? null)

  createEffect(() => {
    getContainer()
    controller.attach()
    onCleanup(() => controller.detach())
  })

  createEffect(() => {
    contentKey()
    controller.onContentChange()
  })

  return controller
}
