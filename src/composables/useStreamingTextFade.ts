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
    controller.update(content, persistedContent, enabled)
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
  return { settledContent, segments, update, finish, settleFinished }
}
