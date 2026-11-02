import { createStreamingTextFade } from 'markstream-core'
import { onScopeDispose, ref, shallowRef } from 'vue'

export function useStreamingTextFade(initialContent: string) {
  const controller = createStreamingTextFade(initialContent)
  const settledContent = ref(initialContent)
  const segments = shallowRef(controller.getSnapshot().segments)
  const completedIds = new Set<number>()
  let cleanupFrame = 0
  function cancelQueuedFinish() {
    if (cleanupFrame)
      cancelAnimationFrame(cleanupFrame)
    cleanupFrame = 0
    completedIds.clear()
  }
  onScopeDispose(cancelQueuedFinish)
  function publish() {
    const state = controller.getSnapshot()
    settledContent.value = state.settledContent
    segments.value = state.segments
  }
  function update(content: string, persistedContent: string | undefined, enabled: boolean) {
    if (!enabled)
      cancelQueuedFinish()
    // Hidden tabs can postpone animationend; keep background updates static
    // rather than accumulating active word nodes until the tab is visible.
    const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden'
    controller.update(content, persistedContent, enabled && visible)
    publish()
  }
  function finish(id: number, defer = false) {
    controller.finish(id, defer)
    publish()
  }
  function queueFinish(id: number, shouldDefer?: () => boolean) {
    completedIds.add(id)
    if (cleanupFrame)
      return
    // Native animationend events arrive separately. Reclaim their word spans in
    // one Vue commit, instead of patching the paragraph after every event.
    cleanupFrame = requestAnimationFrame(() => {
      cleanupFrame = 0
      for (const completedId of completedIds)
        controller.finish(completedId, true)
      completedIds.clear()
      if (!shouldDefer?.())
        controller.settleFinished()
      publish()
    })
  }
  function settleFinished() {
    controller.settleFinished()
    publish()
  }
  function finishAll(defer = false) {
    cancelQueuedFinish()
    controller.finishAll(defer)
    publish()
  }
  return { settledContent, segments, update, finish, queueFinish, finishAll, settleFinished }
}
