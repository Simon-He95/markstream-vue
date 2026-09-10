import type { SmoothMarkdownStreamOptions } from 'markstream-core'
import { createSmoothMarkdownStream } from 'markstream-core'
import { createSignal, onCleanup } from 'solid-js'

export type { SmoothMarkdownStreamOptions }

export interface SmoothMarkdownStreamControllerSolid {
  source: () => string
  visible: () => string
  done: () => boolean
  caughtUp: () => boolean
  final: () => boolean
  pendingChars: () => number
  enqueue: (chunk: string) => void
  finish: (options?: { flush?: boolean }) => void
  flush: () => void
  reset: (initialMarkdown?: string) => void
  pause: () => void
  resume: () => void
}

export function useSmoothMarkdownStream(options: SmoothMarkdownStreamOptions = {}): SmoothMarkdownStreamControllerSolid {
  const controller = createSmoothMarkdownStream(options)
  const [snapshot, setSnapshot] = createSignal(controller.getSnapshot())
  const unsubscribe = controller.subscribe(() => setSnapshot(controller.getSnapshot()))
  onCleanup(() => {
    unsubscribe()
    controller.destroy()
  })
  return {
    source: () => snapshot().source,
    visible: () => snapshot().visible,
    done: () => snapshot().done,
    caughtUp: () => snapshot().caughtUp,
    final: () => snapshot().final,
    pendingChars: () => snapshot().pendingChars,
    enqueue: chunk => controller.enqueue(chunk),
    finish: options => controller.finish(options),
    flush: () => controller.flush(),
    reset: initialMarkdown => controller.reset(initialMarkdown),
    pause: () => controller.pause(),
    resume: () => controller.resume(),
  }
}
