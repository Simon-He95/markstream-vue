import type { CustomComponents } from '../types'
import { shallowRef } from 'vue'

// Store mappings per scope id. A special key is kept for the legacy/global mapping.
const GLOBAL_KEY = '__global__'
type CustomComponentsStore = {
  scopedCustomComponents: Record<string, Partial<CustomComponents>>
  revision: ReturnType<typeof shallowRef<number>>
}

const STORE_KEY = '__MARKSTREAM_VUE_CUSTOM_COMPONENTS_STORE__'
const store: CustomComponentsStore = (() => {
  const g = globalThis as any
  if (g[STORE_KEY])
    return g[STORE_KEY] as CustomComponentsStore
  const next: CustomComponentsStore = {
    scopedCustomComponents: {},
    revision: shallowRef(0),
  }
  g[STORE_KEY] = next
  return next
})()

// Reactive revision counter so renderers can re-parse when mappings change.
export const customComponentsRevision = store.revision

// Overloads for nicer TypeScript API
export function setCustomComponents(id: string, mapping: Partial<CustomComponents>): void
export function setCustomComponents(mapping: Partial<CustomComponents>): void
export function setCustomComponents(
  customIdOrMapping: string | Partial<CustomComponents>,
  maybeMapping?: Partial<CustomComponents>,
): void {
  if (typeof customIdOrMapping === 'string') {
    // scoped API: setCustomComponents('my-id', { ... })
    store.scopedCustomComponents[customIdOrMapping] = maybeMapping || {}
  }
  else {
    // legacy/global API: setCustomComponents({ ... })
    store.scopedCustomComponents[GLOBAL_KEY] = customIdOrMapping || {}
  }
  customComponentsRevision.value++
}

/**
 * Retrieve custom components for a given scope id.
 * If no id is provided, returns the legacy/global mapping (if any).
 */
export function getCustomNodeComponents(customId?: string) {
  const globalMapping = store.scopedCustomComponents[GLOBAL_KEY] || {}
  if (!customId)
    return globalMapping

  const scopedMapping = store.scopedCustomComponents[customId] || {}
  if (!globalMapping || Object.keys(globalMapping).length === 0)
    return scopedMapping
  if (!scopedMapping || Object.keys(scopedMapping).length === 0)
    return globalMapping
  return {
    ...globalMapping,
    ...scopedMapping,
  }
}

/**
 * Remove a scoped custom components mapping.
 * Use this to clean up mappings for dynamic or temporary renderers.
 */
export function removeCustomComponents(id: string) {
  if (id === GLOBAL_KEY) {
    // Don't allow deleting the internal global key via this function.
    // Use clearGlobalCustomComponents() for explicit global clearing.
    throw new Error('removeCustomComponents: use clearGlobalCustomComponents() to clear the global mapping')
  }
  delete store.scopedCustomComponents[id]
  customComponentsRevision.value++
}

/**
 * Clear the legacy/global custom components mapping.
 * Use this when you want to remove the single-argument mapping set by
 * `setCustomComponents(mapping)`.
 */
export function clearGlobalCustomComponents() {
  delete store.scopedCustomComponents[GLOBAL_KEY]
  customComponentsRevision.value++
}
