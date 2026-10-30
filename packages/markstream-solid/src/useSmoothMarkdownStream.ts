import type { SmoothMarkdownStreamOptions } from 'markstream-core'
import { createSmoothMarkdownStream } from 'markstream-core'
import { createSignal, onCleanup } from 'solid-js'

export function useSmoothMarkdownStream(options?: SmoothMarkdownStreamOptions) {
  const controller = createSmoothMarkdownStream(options)
  const [snapshot, setSnapshot] = createSignal(controller.getSnapshot())
  const unsubscribe = controller.subscribe(() => setSnapshot(controller.getSnapshot()))
  onCleanup(() => {
    unsubscribe()
    controller.destroy()
  })
  return { ...controller, snapshot, source: () => snapshot().source, visible: () => snapshot().visible, done: () => snapshot().done, final: () => snapshot().final, caughtUp: () => snapshot().caughtUp, pendingChars: () => snapshot().pendingChars }
}
