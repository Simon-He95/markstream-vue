import React, { createContext, useContext, useMemo, useRef } from 'react'

export interface VisibilityHandle {
  isVisible: () => boolean
  whenVisible: Promise<void>
  destroy: () => void
}

export type RegisterViewportFn = (el: HTMLElement, opts?: { rootMargin?: string, threshold?: number }) => VisibilityHandle

type GetRootFn = () => HTMLElement | null
type EnabledFn = () => boolean

const ViewportPriorityContext = createContext<RegisterViewportFn | null>(null)

function createViewportRegistrar(getRoot: GetRootFn, enabled: EnabledFn): RegisterViewportFn {
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'
  const observers = new Map<string, {
    observer: IntersectionObserver
    root: Element | null
    rootMargin: string
    threshold: number
    targets: Map<Element, { resolve: () => void, state: { current: boolean } }>
  }>()

  const ensureObserver = (rootMargin: string, threshold: number) => {
    if (!isBrowser)
      return null
    if (typeof IntersectionObserver === 'undefined')
      return null

    const root = getRoot() ?? null
    const key = `${rootMargin}::${threshold}`
    const existing = observers.get(key)
    if (existing && existing.root === root)
      return existing

    if (existing) {
      try {
        existing.observer.disconnect()
      }
      catch {}
      observers.delete(key)
    }

    const targets = existing?.targets ?? new Map<Element, { resolve: () => void, state: { current: boolean } }>()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const target = targets.get(entry.target)
        if (!target)
          continue
        const isVisible = entry.isIntersecting || entry.intersectionRatio > 0
        if (!isVisible)
          continue
        target.state.current = true
        try {
          target.resolve()
        }
        catch {}
        try {
          observer.unobserve(entry.target)
        }
        catch {}
        targets.delete(entry.target)
      }
    }, {
      root,
      rootMargin,
      threshold,
    })

    const record = { observer, root, rootMargin, threshold, targets }
    observers.set(key, record)

    for (const element of targets.keys())
      observer.observe(element)

    return record
  }

  const register: RegisterViewportFn = (el, opts) => {
    const state = { current: false }
    let settled = false
    let resolve!: () => void
    const whenVisible = new Promise<void>((res) => {
      resolve = () => {
        if (settled)
          return
        settled = true
        res()
      }
    })
    const destroy = () => {
      for (const record of observers.values()) {
        if (!record.targets.has(el))
          continue
        record.targets.delete(el)
        try {
          record.observer.unobserve(el)
        }
        catch {}
      }
    }

    if (!isBrowser || !enabled()) {
      state.current = true
      resolve()
      return {
        isVisible: () => true,
        whenVisible,
        destroy,
      }
    }

    const rootMargin = opts?.rootMargin ?? '300px'
    const threshold = opts?.threshold ?? 0
    const record = ensureObserver(rootMargin, threshold)
    if (!record) {
      state.current = true
      resolve()
      return {
        isVisible: () => true,
        whenVisible,
        destroy,
      }
    }

    record.targets.set(el, { resolve, state })
    record.observer.observe(el)
    return {
      isVisible: () => state.current,
      whenVisible,
      destroy,
    }
  }

  return register
}

const fallbackRegister = createViewportRegistrar(() => null, () => true)

export interface ViewportPriorityProviderProps {
  getRoot: () => HTMLElement | null
  enabled?: boolean
  children: React.ReactNode
}

export function ViewportPriorityProvider({ getRoot, enabled = true, children }: ViewportPriorityProviderProps) {
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const getRootRef = useRef(getRoot)
  getRootRef.current = getRoot

  const registrar = useMemo(() => {
    return createViewportRegistrar(() => getRootRef.current?.() ?? null, () => enabledRef.current)
  }, [])

  return (
    <ViewportPriorityContext.Provider value={registrar}>
      {children}
    </ViewportPriorityContext.Provider>
  )
}

export function useViewportPriority(): RegisterViewportFn {
  return useContext(ViewportPriorityContext) ?? fallbackRegister
}
