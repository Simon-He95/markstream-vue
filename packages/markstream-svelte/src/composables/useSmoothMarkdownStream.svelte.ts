import type { SmoothMarkdownStreamOptions } from 'markstream-core'
import { createSmoothMarkdownStream } from 'markstream-core'
import { onDestroy } from 'svelte'

export type { SmoothMarkdownStreamOptions }

export interface SmoothMarkdownStreamControllerSvelte {
  source: string
  visible: string
  done: boolean
  caughtUp: boolean
  final: boolean
  pendingChars: number
  enqueue: (chunk: string) => void
  finish: (options?: { flush?: boolean }) => void
  flush: () => void
  reset: (initialMarkdown?: string) => void
  pause: () => void
  resume: () => void
}

export function useSmoothMarkdownStream(optionsOrGetter: SmoothMarkdownStreamOptions | (() => SmoothMarkdownStreamOptions) = {}): SmoothMarkdownStreamControllerSvelte {
  const options = typeof optionsOrGetter === 'function' ? optionsOrGetter() : optionsOrGetter
  let source = $state('')
  let visible = $state('')
  let done = $state(false)
  let pendingChars = $state(0)
  let caughtUp = $state(false)
  let final = $state(false)

  const controller = createSmoothMarkdownStream(options)
  const sync = () => {
    const snapshot = controller.getSnapshot()
    source = snapshot.source
    visible = snapshot.visible
    done = snapshot.done
    pendingChars = snapshot.pendingChars
    caughtUp = snapshot.caughtUp
    final = snapshot.final
  }
  const unsubscribe = controller.subscribe(sync)
  sync()

  onDestroy(() => {
    unsubscribe()
    controller.destroy()
  })

  return {
    get source() { return source },
    get visible() { return visible },
    get done() { return done },
    get caughtUp() { return caughtUp },
    get final() { return final },
    get pendingChars() { return pendingChars },
    enqueue: chunk => controller.enqueue(chunk),
    finish: opts => controller.finish(opts),
    flush: () => controller.flush(),
    reset: initialMarkdown => controller.reset(initialMarkdown),
    pause: () => controller.pause(),
    resume: () => controller.resume(),
  }
}
