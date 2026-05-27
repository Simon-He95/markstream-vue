import type { ComputedRef, Ref } from 'vue'

export interface FocusSyncSchedulerOptions {
  isClient: boolean
  containerRef: Ref<HTMLElement | undefined>
  virtualizationEnabled: ComputedRef<boolean>
  requestFrame: typeof window.requestAnimationFrame | null
  cancelFrame: typeof window.cancelAnimationFrame | null
  syncFocusToScroll: (force?: boolean) => void
}

export interface FocusSyncScheduler {
  cancelScheduledFocusSync: () => void
  scheduleFocusSync: (options?: { immediate?: boolean }) => void
}

type PendingFocusSync = {
  id: number | ReturnType<typeof setTimeout>
  viaTimeout: boolean
} | null

export function useFocusSyncScheduler(
  options: FocusSyncSchedulerOptions,
): FocusSyncScheduler {
  const {
    isClient,
    containerRef,
    virtualizationEnabled,
    requestFrame,
    cancelFrame,
    syncFocusToScroll,
  } = options

  let pendingFocusSync: PendingFocusSync = null

  function getOwnerWindow() {
    return containerRef.value?.ownerDocument?.defaultView
      ?? (typeof window !== 'undefined' ? window : null)
  }

  function cancelScheduledFocusSync() {
    if (!pendingFocusSync)
      return

    const win = getOwnerWindow()

    if (pendingFocusSync.viaTimeout) {
      if (win)
        win.clearTimeout(pendingFocusSync.id as number)
      else
        clearTimeout(pendingFocusSync.id as ReturnType<typeof setTimeout>)
    }
    else {
      cancelFrame?.(pendingFocusSync.id as number)
    }

    pendingFocusSync = null
  }

  function scheduleFocusSync(scheduleOptions: { immediate?: boolean } = {}) {
    if (!virtualizationEnabled.value)
      return

    if (!isClient) {
      syncFocusToScroll(true)
      return
    }

    if (scheduleOptions.immediate) {
      cancelScheduledFocusSync()
      syncFocusToScroll(true)
      return
    }

    if (pendingFocusSync)
      return

    const run = () => {
      pendingFocusSync = null
      syncFocusToScroll()
    }

    if (requestFrame) {
      pendingFocusSync = {
        id: requestFrame(run),
        viaTimeout: false,
      }
      return
    }

    const win = getOwnerWindow()
    const timeoutId = win
      ? win.setTimeout(run, 16)
      : setTimeout(run, 16)

    pendingFocusSync = {
      id: timeoutId,
      viaTimeout: true,
    }
  }

  return {
    cancelScheduledFocusSync,
    scheduleFocusSync,
  }
}
