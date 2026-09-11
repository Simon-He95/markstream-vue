const timeouts = new Set<number>()
const rafs = new Set<number>()
const observers = new Set<ResizeObserver>()
const subscriptions = new Set<() => void>()

export function trackedTimeout(handler: () => void, delayMs: number) {
  const id = window.setTimeout(() => {
    timeouts.delete(id)
    handler()
  }, delayMs)
  timeouts.add(id)
  return id
}

export function clearTrackedTimeout(id: number | null) {
  if (id == null)
    return
  window.clearTimeout(id)
  timeouts.delete(id)
}

export function trackedRaf(handler: () => void) {
  const id = window.requestAnimationFrame(() => {
    rafs.delete(id)
    handler()
  })
  rafs.add(id)
  return id
}

export function clearTrackedRaf(id: number | null) {
  if (id == null)
    return
  window.cancelAnimationFrame(id)
  rafs.delete(id)
}

export function trackObserver(observer: ResizeObserver) {
  observers.add(observer)
  return observer
}

export function untrackObserver(observer: ResizeObserver | null) {
  if (!observer)
    return
  observer.disconnect()
  observers.delete(observer)
}

export function trackSubscription(unsubscribe: () => void) {
  subscriptions.add(unsubscribe)
  return () => {
    subscriptions.delete(unsubscribe)
    unsubscribe()
  }
}

export function resourceCounts() {
  return {
    timeouts: timeouts.size,
    rafs: rafs.size,
    observers: observers.size,
    subscriptions: subscriptions.size,
  }
}
