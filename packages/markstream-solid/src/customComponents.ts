import type { Component } from 'solid-js'

/**
 * Custom node renderers receive the parsed node plus whatever NodeOutlet
 * spreads (context, language extras). Extra keys stay allowed so language
 * overrides and custom HTML tags can pass through.
 */
export interface MarkstreamSolidNodeProps {
  node: any
  context?: unknown
  ctx?: unknown
  customId?: string
  indexKey?: string | number
  isDark?: boolean
  typewriter?: boolean
  fade?: boolean
  [key: string]: unknown
}

export type MarkstreamSolidComponent = Component<MarkstreamSolidNodeProps>
/** Values stay `Component<any>` so custom tags can use a narrower node props type. */
export type CustomComponentMap = Record<string, Component<any>>

const globalKey = '__global__'
const storeKey = '__MARKSTREAM_SOLID_CUSTOM_COMPONENTS_STORE__'

interface Store {
  scopedComponents: Record<string, CustomComponentMap>
  revision: number
  listeners: Set<() => void>
}

const store: Store = (() => {
  const target = globalThis as typeof globalThis & { [storeKey]?: Store }
  if (target[storeKey])
    return target[storeKey]
  const next: Store = { scopedComponents: {}, revision: 0, listeners: new Set() }
  target[storeKey] = next
  return next
})()

function notify() {
  store.revision += 1
  for (const listener of store.listeners) {
    try {
      listener()
    }
    catch { /* A consumer callback must not break the global registry. */ }
  }
}

export function subscribeCustomComponents(listener: () => void) {
  store.listeners.add(listener)
  return () => store.listeners.delete(listener)
}

export const getCustomComponentsRevision = () => store.revision

export function setCustomComponents(id: string, mapping: CustomComponentMap): void
export function setCustomComponents(mapping: CustomComponentMap): void
export function setCustomComponents(idOrMapping: string | CustomComponentMap, mapping?: CustomComponentMap) {
  store.scopedComponents[typeof idOrMapping === 'string' ? idOrMapping : globalKey]
    = { ...(typeof idOrMapping === 'string' ? mapping : idOrMapping) }
  notify()
}

export function getCustomNodeComponents(customId?: string): CustomComponentMap {
  const global = store.scopedComponents[globalKey] || {}
  return customId ? { ...global, ...(store.scopedComponents[customId] || {}) } : global
}

export function removeCustomComponents(id: string) {
  if (id === globalKey)
    throw new Error('removeCustomComponents: cannot delete the global mapping; call clearGlobalCustomComponents instead.')
  delete store.scopedComponents[id]
  notify()
}

export function clearGlobalCustomComponents() {
  delete store.scopedComponents[globalKey]
  notify()
}
