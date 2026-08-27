import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { MarkstreamViewportPriorityOptions } from '../types/node-renderer-props'
import { computed, inject, provide, ref, watch } from 'vue'

// Injection key for viewport-priority registration
const ViewportPriorityKey = Symbol('ViewportPriority') as InjectionKey<RegisterFn>
const ViewportPriorityOptionsKey = Symbol('ViewportPriorityOptions') as InjectionKey<ComputedRef<MarkstreamViewportPriorityOptions>>
const OffscreenHeavyNodeDeferralKey = Symbol('OffscreenHeavyNodeDeferral') as InjectionKey<ComputedRef<boolean>>
const disabledOffscreenHeavyNodeDeferral = computed(() => false)
export const DEFAULT_VIEWPORT_PRIORITY_ROOT_MARGIN = '400px'

export interface VisibilityHandle {
  isVisible: Ref<boolean>
  whenVisible: Promise<void>
  destroy: () => void
}

export function waitForVisibilityOrAbort(handle: VisibilityHandle | null | undefined, signal: AbortSignal) {
  if (!handle || signal.aborted)
    return Promise.resolve()

  return new Promise<void>((resolve) => {
    const settle = () => {
      signal.removeEventListener('abort', settle)
      resolve()
    }
    signal.addEventListener('abort', settle, { once: true })
    void handle.whenVisible.then(settle)
  })
}

export interface ViewportPriorityRegisterOptions {
  rootMargin?: string
  threshold?: number
  allowIdle?: boolean
}

export interface RegisterFn {
  (el: HTMLElement, opts?: ViewportPriorityRegisterOptions): VisibilityHandle
  refresh?: () => void
}

interface IdleDeadlineLike {
  didTimeout: boolean
  timeRemaining: () => number
}

function warnInvalidViewportPriorityRootMargin(rootMargin: string, error: unknown) {
  if (import.meta.env?.DEV)
    console.warn('[markstream-vue] invalid viewportPriorityOptions rootMargin:', rootMargin, error)
}

export function provideViewportPriorityOptions(options: ComputedRef<MarkstreamViewportPriorityOptions>) {
  provide(ViewportPriorityOptionsKey, options)
}

export function useViewportPriorityOptions() {
  return inject(ViewportPriorityOptionsKey, undefined)
}

export function provideOffscreenHeavyNodeDeferral(enabled: ComputedRef<boolean>) {
  provide(OffscreenHeavyNodeDeferralKey, enabled)
  return enabled
}

export function useOffscreenHeavyNodeDeferral() {
  return inject(OffscreenHeavyNodeDeferralKey, disabledOffscreenHeavyNodeDeferral)
}

/**
 * Provide a shared viewport-priority registrar.
 * Targets resolve immediately when they enter the viewport and otherwise
 * trickle through during browser idle so heavy nodes can prerender offscreen.
 */
export function provideViewportPriority(
  getRootEl: (target?: HTMLElement | null) => HTMLElement | null | undefined,
  enabled: Ref<boolean> | boolean,
): RegisterFn {
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'
  const enabledRef = typeof enabled === 'boolean' ? ref(enabled) : enabled
  const requestIdle = isBrowser
    ? ((window as any).requestIdleCallback as ((cb: (deadline: IdleDeadlineLike) => void, opts?: { timeout?: number }) => number) | undefined)
    ?? ((cb: (deadline: IdleDeadlineLike) => void) => window.setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 0 }), 16))
    : null
  const cancelIdle = isBrowser
    ? ((window as any).cancelIdleCallback as ((id: number) => void) | undefined)
    ?? ((id: number) => window.clearTimeout(id))
    : null

  interface ObserverConfig {
    root: HTMLElement | null
    rootMargin: string
    threshold: number
  }

  interface TargetState {
    resolve: () => void
    visible: Ref<boolean>
    bucketKey: string
    opts?: ViewportPriorityRegisterOptions
  }

  interface ObserverBucket {
    io: IntersectionObserver
    targets: Map<Element, TargetState>
  }

  const rootIds = new WeakMap<Element, number>()
  let nextRootId = 1
  const observerBuckets = new Map<string, ObserverBucket>()
  const targets = new Map<Element, TargetState>()
  const idleQueue = new Set<Element>()
  let idleJob: number | null = null
  let refreshFrame: number | null = null

  function normalizeConfig(target?: HTMLElement, opts?: ViewportPriorityRegisterOptions): ObserverConfig {
    return {
      root: getRootEl?.(target ?? null) ?? null,
      rootMargin: opts?.rootMargin ?? DEFAULT_VIEWPORT_PRIORITY_ROOT_MARGIN,
      threshold: opts?.threshold ?? 0,
    }
  }

  function getRootId(root: Element | null) {
    if (!root)
      return 'viewport'

    let id = rootIds.get(root)
    if (!id) {
      id = nextRootId++
      rootIds.set(root, id)
    }
    return String(id)
  }

  function getConfigKey(config: ObserverConfig) {
    return [
      getRootId(config.root),
      config.rootMargin,
      config.threshold,
    ].join('\u0000')
  }

  function clearIdleJob() {
    if (idleJob == null)
      return
    try {
      cancelIdle?.(idleJob)
    }
    catch {}
    idleJob = null
  }

  function cleanupObserver(bucketKey?: string) {
    if (bucketKey) {
      const bucket = observerBuckets.get(bucketKey)
      if (bucket && !bucket.targets.size) {
        try {
          bucket.io.disconnect()
        }
        catch {}
        observerBuckets.delete(bucketKey)
      }
    }

    if (!targets.size && !idleQueue.size)
      clearIdleJob()
  }

  function settleTarget(target: Element) {
    const data = targets.get(target)
    if (!data)
      return
    const bucket = observerBuckets.get(data.bucketKey)
    if (!data.visible.value) {
      data.visible.value = true
      try {
        data.resolve()
      }
      catch {}
    }
    try {
      bucket?.io.unobserve(target)
    }
    catch {}
    bucket?.targets.delete(target)
    targets.delete(target)
    idleQueue.delete(target)
    cleanupObserver(data.bucketKey)
  }

  watch(
    enabledRef,
    (enabled) => {
      if (enabled)
        return
      for (const target of Array.from(targets.keys()))
        settleTarget(target)
      clearIdleJob()
    },
    { flush: 'sync' },
  )

  function scheduleIdleDrain() {
    if ((window as any).__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__ === true)
      return
    if (!requestIdle || idleJob != null || !idleQueue.size)
      return
    idleJob = requestIdle(() => {
      idleJob = null
      const next = idleQueue.values().next().value as Element | undefined
      if (!next)
        return
      idleQueue.delete(next)
      settleTarget(next)
      if (idleQueue.size)
        scheduleIdleDrain()
    }, { timeout: 1200 })
  }

  function ensureObserver(target?: HTMLElement, opts?: ViewportPriorityRegisterOptions) {
    if (!isBrowser)
      return null
    // Guard: some browser-like environments (e.g., jsdom) don't provide IO
    if (typeof IntersectionObserver === 'undefined')
      return null

    const nextConfig = normalizeConfig(target, opts)
    const bucketKey = getConfigKey(nextConfig)
    const existing = observerBuckets.get(bucketKey)
    if (existing)
      return { key: bucketKey, bucket: existing }

    let io: IntersectionObserver
    try {
      io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const isVisible = entry.isIntersecting || entry.intersectionRatio > 0
          if (isVisible)
            settleTarget(entry.target)
        }
      }, {
        root: nextConfig.root,
        rootMargin: nextConfig.rootMargin,
        threshold: nextConfig.threshold,
      })
    }
    catch (error) {
      warnInvalidViewportPriorityRootMargin(nextConfig.rootMargin, error)
      return null
    }

    const bucket: ObserverBucket = { io, targets: new Map() }
    observerBuckets.set(bucketKey, bucket)
    return { key: bucketKey, bucket }
  }

  function refreshTargets() {
    if (!isBrowser || !enabledRef.value)
      return

    for (const [target, data] of Array.from(targets.entries())) {
      const observer = ensureObserver(target as HTMLElement, data.opts)
      if (!observer) {
        settleTarget(target)
        continue
      }

      if (observer.key === data.bucketKey)
        continue

      const previousBucketKey = data.bucketKey
      const previousBucket = observerBuckets.get(previousBucketKey)
      try {
        previousBucket?.io.unobserve(target)
      }
      catch {}
      previousBucket?.targets.delete(target)
      data.bucketKey = observer.key
      observer.bucket.targets.set(target, data)
      observer.bucket.io.observe(target)
      cleanupObserver(previousBucketKey)
    }
  }

  function scheduleTargetRefresh() {
    if (!isBrowser || refreshFrame != null)
      return

    refreshFrame = window.requestAnimationFrame(() => {
      refreshFrame = null
      refreshTargets()
    })
  }

  const register: RegisterFn = (el, opts) => {
    const visible = ref(false)
    let settled = false
    let resolve!: () => void
    const whenVisible = new Promise<void>((res) => {
      resolve = () => {
        if (!settled) {
          settled = true
          res()
        }
      }
    })

    const cleanup = () => {
      const data = targets.get(el)
      if (!data) {
        idleQueue.delete(el)
        cleanupObserver()
        return
      }

      const bucket = observerBuckets.get(data.bucketKey)
      try {
        bucket?.io.unobserve(el)
      }
      catch {}
      bucket?.targets.delete(el)
      targets.delete(el)
      idleQueue.delete(el)
      cleanupObserver(data.bucketKey)
    }

    if (!isBrowser || !enabledRef.value) {
      visible.value = true
      resolve()
      return { isVisible: visible, whenVisible, destroy: cleanup }
    }

    const observer = ensureObserver(el, opts)
    if (!observer) {
      visible.value = true
      resolve()
      return { isVisible: visible, whenVisible, destroy: cleanup }
    }

    const data: TargetState = { resolve, visible, bucketKey: observer.key, opts }
    targets.set(el, data)
    observer.bucket.targets.set(el, data)
    observer.bucket.io.observe(el)
    scheduleTargetRefresh()
    if (opts?.allowIdle !== false) {
      idleQueue.add(el)
      scheduleIdleDrain()
    }
    return { isVisible: visible, whenVisible, destroy: cleanup }
  }
  register.refresh = refreshTargets

  provide(ViewportPriorityKey, register)
  return register
}

/**
 * Child components call this to register an element and await priority.
 * If provider is missing, returns a no-op registrar that resolves immediately.
 */
export function useViewportPriority() {
  const injected = inject<RegisterFn | undefined>(ViewportPriorityKey, undefined)
  if (injected)
    return injected

  interface LocalTargetState {
    resolve: () => void
    visible: Ref<boolean>
    bucketKey: string
  }

  interface LocalObserverBucket {
    io: IntersectionObserver
    targets: Set<Element>
  }

  const localTargets = new WeakMap<Element, LocalTargetState>()
  const localBuckets = new Map<string, LocalObserverBucket>()
  const localIdleQueue = new Set<Element>()
  let localIdleJob: number | null = null
  const requestIdle = typeof window !== 'undefined'
    ? ((window as any).requestIdleCallback as ((cb: (deadline: IdleDeadlineLike) => void, opts?: { timeout?: number }) => number) | undefined)
    ?? ((cb: (deadline: IdleDeadlineLike) => void) => window.setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 0 }), 16))
    : null
  const cancelIdle = typeof window !== 'undefined'
    ? ((window as any).cancelIdleCallback as ((id: number) => void) | undefined)
    ?? ((id: number) => window.clearTimeout(id))
    : null

  const clearLocalIdleJob = () => {
    if (localIdleJob == null)
      return
    try {
      cancelIdle?.(localIdleJob)
    }
    catch {}
    localIdleJob = null
  }

  const getLocalBucketKey = (opts?: ViewportPriorityRegisterOptions) => [
    opts?.rootMargin ?? DEFAULT_VIEWPORT_PRIORITY_ROOT_MARGIN,
    opts?.threshold ?? 0,
  ].join('\u0000')

  const cleanupLocalBucket = (bucketKey?: string) => {
    if (!bucketKey)
      return

    const bucket = localBuckets.get(bucketKey)
    if (!bucket)
      return

    if (bucket.targets.size)
      return

    try {
      bucket.io.disconnect()
    }
    catch {}
    localBuckets.delete(bucketKey)
  }

  const settleLocalTarget = (target: Element) => {
    const data = localTargets.get(target)
    if (!data)
      return
    const bucket = localBuckets.get(data.bucketKey)
    if (!data.visible.value) {
      data.visible.value = true
      try {
        data.resolve()
      }
      catch {}
    }
    try {
      bucket?.io.unobserve(target)
    }
    catch {}
    localTargets.delete(target)
    bucket?.targets.delete(target)
    localIdleQueue.delete(target)
    cleanupLocalBucket(data.bucketKey)
    if (!localIdleQueue.size)
      clearLocalIdleJob()
  }

  const scheduleLocalIdleDrain = () => {
    if ((window as any).__MARKSTREAM_DISABLE_VIEWPORT_PRIORITY_IDLE_DRAIN__ === true)
      return
    if (!requestIdle || localIdleJob != null || !localIdleQueue.size)
      return
    localIdleJob = requestIdle(() => {
      localIdleJob = null
      const next = localIdleQueue.values().next().value as Element | undefined
      if (!next)
        return
      localIdleQueue.delete(next)
      settleLocalTarget(next)
      if (localIdleQueue.size)
        scheduleLocalIdleDrain()
    }, { timeout: 1200 })
  }

  const ensureLocal = (opts?: ViewportPriorityRegisterOptions) => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined')
      return null
    const bucketKey = getLocalBucketKey(opts)
    const existing = localBuckets.get(bucketKey)
    if (existing)
      return { key: bucketKey, bucket: existing }

    const rootMargin = opts?.rootMargin ?? DEFAULT_VIEWPORT_PRIORITY_ROOT_MARGIN
    let io: IntersectionObserver
    try {
      io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          const vis = e.isIntersecting || e.intersectionRatio > 0
          if (vis)
            settleLocalTarget(e.target)
        }
      }, { root: null, rootMargin, threshold: opts?.threshold ?? 0 })
    }
    catch (error) {
      warnInvalidViewportPriorityRootMargin(rootMargin, error)
      return null
    }

    const bucket: LocalObserverBucket = { io, targets: new Set() }
    localBuckets.set(bucketKey, bucket)
    return { key: bucketKey, bucket }
  }

  const register: RegisterFn = (el, opts) => {
    const isVisible = ref(false)
    let settled = false
    let resolve!: () => void
    const whenVisible = new Promise<void>((res) => {
      resolve = () => {
        if (!settled) {
          settled = true
          res()
        }
      }
    })
    const cleanup = () => {
      const data = localTargets.get(el)
      if (!data) {
        localIdleQueue.delete(el)
        if (!localIdleQueue.size)
          clearLocalIdleJob()
        return
      }
      const bucket = localBuckets.get(data.bucketKey)
      try {
        bucket?.io.unobserve(el)
      }
      catch {}
      localTargets.delete(el)
      bucket?.targets.delete(el)
      localIdleQueue.delete(el)
      cleanupLocalBucket(data.bucketKey)
      if (!localIdleQueue.size)
        clearLocalIdleJob()
    }
    const observer = ensureLocal(opts)
    if (!observer) {
      isVisible.value = true
      resolve()
      return { isVisible, whenVisible, destroy: cleanup }
    }
    localTargets.set(el, { resolve, visible: isVisible, bucketKey: observer.key })
    observer.bucket.targets.add(el)
    observer.bucket.io.observe(el)
    if (opts?.allowIdle !== false) {
      localIdleQueue.add(el)
      scheduleLocalIdleDrain()
    }
    return { isVisible, whenVisible, destroy: cleanup }
  }

  return register
}
