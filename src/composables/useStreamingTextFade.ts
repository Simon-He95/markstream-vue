import { createStreamingTextFade } from 'markstream-core'
import { ref, shallowRef } from 'vue'

export function useStreamingTextFade(initialContent: string) {
  const controller = createStreamingTextFade(initialContent)
  const settledContent = ref(initialContent)
  const segments = shallowRef(controller.getSnapshot().segments)
  function publish() {
    const state = controller.getSnapshot()
    settledContent.value = state.settledContent
    segments.value = state.segments
  }
  function update(content: string, persistedContent: string | undefined, enabled: boolean) {
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
  function settleFinished() {
    controller.settleFinished()
    publish()
  }
  function finishAll(defer = false) {
    controller.finishAll(defer)
    publish()
  }
  return { settledContent, segments, update, finish, finishAll, settleFinished }
}
