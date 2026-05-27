import type { ComputedRef, Ref } from 'vue'

export interface ScrollListenerOptions {
  isClient: boolean
  virtualizationEnabled: ComputedRef<boolean>
  scrollRootElement: Ref<HTMLElement | null>
  resolveScrollContainer: (node?: HTMLElement | null) => HTMLElement | null
  scheduleFocusSync: (options?: { immediate?: boolean }) => void
}

export interface ScrollListener {
  cleanupScrollListener: () => void
  setupScrollListener: () => void
}

export function useScrollListener(
  options: ScrollListenerOptions,
): ScrollListener {
  const {
    isClient,
    virtualizationEnabled,
    scrollRootElement,
    resolveScrollContainer,
    scheduleFocusSync,
  } = options

  let detachScrollHandler: (() => void) | null = null

  function cleanupScrollListener() {
    if (detachScrollHandler) {
      detachScrollHandler()
      detachScrollHandler = null
    }

    scrollRootElement.value = null
  }

  function setupScrollListener() {
    if (!isClient || !virtualizationEnabled.value)
      return

    const root = resolveScrollContainer()

    if (!root || scrollRootElement.value === root)
      return

    cleanupScrollListener()

    const handler = () => scheduleFocusSync()

    root.addEventListener('scroll', handler, { passive: true })
    scrollRootElement.value = root

    detachScrollHandler = () => {
      root.removeEventListener('scroll', handler)
    }
  }

  return {
    cleanupScrollListener,
    setupScrollListener,
  }
}
