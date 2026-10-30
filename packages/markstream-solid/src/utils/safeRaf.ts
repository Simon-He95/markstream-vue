// Safe requestAnimationFrame / cancel wrapper to avoid ReferenceError in SSR
export function safeRaf(cb: FrameRequestCallback) {
  try {
    if (typeof globalThis !== 'undefined' && typeof (globalThis as any).requestAnimationFrame === 'function')
      return (globalThis as any).requestAnimationFrame(cb)
  }
  catch {}
  // Fallback to setTimeout when RAF isn't available (SSR or older envs)
  return (globalThis as any).setTimeout(cb as any, 0) as unknown as number
}

export function safeCancelRaf(id: number | null) {
  try {
    if (id == null)
      return
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
