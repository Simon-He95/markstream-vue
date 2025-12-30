import type { ComponentType } from 'react'

export type CustomComponentMap = Record<string, ComponentType<any>>

const GLOBAL_KEY = '__global__'

type Store = {
  scopedComponents: Record<string, CustomComponentMap>
  revision: number
  listeners: Set<() => void>
}

const STORE_KEY = '__MARKSTREAM_REACT_CUSTOM_COMPONENTS_STORE__'
const store: Store = (() => {
  const g = globalThis as any
  if (g[STORE_KEY])
    return g[STORE_KEY] as Store
  const next: Store = {
    scopedComponents: {},
    revision: 0,
    listeners: new Set(),
  }
  g[STORE_KEY] = next
  return next
})()

function bumpRevision() {
  store.revision++
  for (const listener of Array.from(store.listeners)) {
    try {
      listener()
    }
    catch {
      // ignore subscriber errors
    }
  }
}

export function subscribeCustomComponents(listener: () => void) {
  store.listeners.add(listener)
  return () => {
    store.listeners.delete(listener)
  }
}

export function getCustomComponentsRevision() {
  return store.revision
}

export function setCustomComponents(id: string, mapping: CustomComponentMap): void
export function setCustomComponents(mapping: CustomComponentMap): void
export function setCustomComponents(idOrMapping: string | CustomComponentMap, maybeMapping?: CustomComponentMap) {
  if (typeof idOrMapping === 'string')
    store.scopedComponents[idOrMapping] = { ...(maybeMapping || {}) }
  else
    store.scopedComponents[GLOBAL_KEY] = { ...idOrMapping }
  bumpRevision()
}

export function getCustomNodeComponents(customId?: string): CustomComponentMap {
  const globalMapping = store.scopedComponents[GLOBAL_KEY] || {}
  if (!customId)
    return globalMapping

  const scopedMapping = store.scopedComponents[customId] || {}
  if (!globalMapping || Object.keys(globalMapping).length === 0)
    return scopedMapping
  if (!scopedMapping || Object.keys(scopedMapping).length === 0)
    return globalMapping
  return {
    ...globalMapping,
    ...scopedMapping,
  }
}

export function removeCustomComponents(id: string) {
  if (id === GLOBAL_KEY)
    throw new Error('removeCustomComponents: cannot delete global mapping; call clearGlobalCustomComponents instead.')
  delete store.scopedComponents[id]
  bumpRevision()
}

export function clearGlobalCustomComponents() {
  delete store.scopedComponents[GLOBAL_KEY]
  bumpRevision()
}
