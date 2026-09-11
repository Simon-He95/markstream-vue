import { createSignal } from 'solid-js'

const timeouts = new Set<number>()
const rafs = new Set<number>()
const observers = new Set<ResizeObserver>()
const subscriptions = new Set<() => void>()
const [resourceEpoch, setResourceEpoch] = createSignal(0)

function notifyResourceChange() {
  setResourceEpoch(value => value + 1)
}

export const RESOURCE_COVERAGE = {
  timeouts: 'tracked',
  rafs: 'tracked',
  observers: 'tracked',
  subscriptions: 'uncovered',
  workers: 'uncovered',
  codeBlockRuntimes: 'uncovered',
} as const

export type ResourceCoverage = typeof RESOURCE_COVERAGE

export function trackedTimeout(handler: () => void, delayMs: number) {
  const id = window.setTimeout(() => {
    timeouts.delete(id)
    notifyResourceChange()
    handler()
  }, delayMs)
  timeouts.add(id)
  notifyResourceChange()
  return id
}

export function clearTrackedTimeout(id: number | null) {
  if (id == null)
    return
  window.clearTimeout(id)
  if (timeouts.delete(id))
    notifyResourceChange()
}

export function trackedRaf(handler: () => void) {
  const id = window.requestAnimationFrame(() => {
    rafs.delete(id)
    notifyResourceChange()
    handler()
  })
  rafs.add(id)
  notifyResourceChange()
  return id
}

export function clearTrackedRaf(id: number | null) {
  if (id == null)
    return
  window.cancelAnimationFrame(id)
  if (rafs.delete(id))
    notifyResourceChange()
}

export function trackObserver(observer: ResizeObserver) {
  observers.add(observer)
  notifyResourceChange()
  return observer
}

export function untrackObserver(observer: ResizeObserver | null) {
  if (!observer)
    return
  observer.disconnect()
  if (observers.delete(observer))
    notifyResourceChange()
}

export function trackSubscription(unsubscribe: () => void) {
  subscriptions.add(unsubscribe)
  notifyResourceChange()
  return () => {
    subscriptions.delete(unsubscribe)
    notifyResourceChange()
    unsubscribe()
  }
}

export function resourceCounts() {
  resourceEpoch()
  return {
    timeouts: timeouts.size,
    rafs: rafs.size,
    observers: observers.size,
  }
}
