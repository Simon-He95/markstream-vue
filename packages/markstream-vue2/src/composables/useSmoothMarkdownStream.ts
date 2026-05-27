import type { SmoothMarkdownStreamOptions } from 'markstream-core'
import type { ComputedRef, Ref } from 'vue-demi'
import { createSmoothMarkdownStream } from 'markstream-core'
import { computed, getCurrentScope, onScopeDispose, ref } from 'vue-demi'

export type { SmoothMarkdownStreamOptions }

export interface SmoothMarkdownStreamControllerVue2 {
  source: Ref<string>
  visible: Ref<string>
  done: Ref<boolean>
  final: ComputedRef<boolean>
  caughtUp: ComputedRef<boolean>
  pendingChars: ComputedRef<number>
  enqueue: (chunk: string) => void
  finish: (options?: { flush?: boolean }) => void
  flush: () => void
  reset: (initialMarkdown?: string) => void
  pause: () => void
  resume: () => void
}

export type SmoothMarkdownStreamController = SmoothMarkdownStreamControllerVue2

export function useSmoothMarkdownStream(options: SmoothMarkdownStreamOptions = {}): SmoothMarkdownStreamControllerVue2 {
  const source = ref('')
  const visible = ref('')
  const done = ref(false)

  const controller = createSmoothMarkdownStream(options)
  const sync = () => {
    const snapshot = controller.getSnapshot()
    source.value = snapshot.source
    visible.value = snapshot.visible
    done.value = snapshot.done
  }
  const unsubscribe = controller.subscribe(sync)
  sync()

  const pendingChars = computed(() => Math.max(0, source.value.length - visible.value.length))
  const caughtUp = computed(() => pendingChars.value === 0)
  const final = computed(() => done.value && caughtUp.value)

  if (getCurrentScope()) {
    onScopeDispose(() => {
      unsubscribe()
      controller.destroy()
    })
  }

  return {
    source,
    visible,
    done,
    final,
    caughtUp,
    pendingChars,
    enqueue: chunk => controller.enqueue(chunk),
    finish: options => controller.finish(options),
    flush: () => controller.flush(),
    reset: initialMarkdown => controller.reset(initialMarkdown),
    pause: () => controller.pause(),
    resume: () => controller.resume(),
  }
}
