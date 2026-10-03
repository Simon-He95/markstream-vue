// Safe requestAnimationFrame / cancel wrapper to avoid ReferenceError in SSR

// Ids produced by the setTimeout fallback live in the timer space, not the
// animation-frame space, so `safeCancelRaf` has to know which one it is
// holding: cancelling a timer id with `cancelAnimationFrame` (or the other way
// round) silently leaves the callback armed.
const timerFallbackIds = new Set<number>()

export function safeRaf(cb: FrameRequestCallback) {
  try {
    if (typeof globalThis !== 'undefined' && typeof (globalThis as any).requestAnimationFrame === 'function')
      return (globalThis as any).requestAnimationFrame(cb)
  }
  catch {}
  // Fallback to setTimeout when RAF isn't available (SSR or older envs)
  const id = (globalThis as any).setTimeout(cb as any, 0) as unknown as number
  timerFallbackIds.add(id)
  return id
}

export function safeCancelRaf(id: number | null) {
  try {
    if (id == null)
      return
    if (timerFallbackIds.delete(id)) {
      ;(globalThis as any).clearTimeout(id)
      return
    }
    if (typeof globalThis !== 'undefined' && typeof (globalThis as any).cancelAnimationFrame === 'function') {
      (globalThis as any).cancelAnimationFrame(id)
      return
    }
  }
  catch {}
  try {
    ;(globalThis as any).clearTimeout(id)
  }
  catch {}
}
