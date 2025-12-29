import type { CustomComponents } from '../types'

// Store mappings per scope id. A special key is kept for the legacy/global mapping.
const GLOBAL_KEY = '__global__'
const scopedCustomComponents: Record<string, Partial<CustomComponents>> = {}

// Overloads for nicer TypeScript API
export function setCustomComponents(id: string, mapping: Partial<CustomComponents>): void
export function setCustomComponents(mapping: Partial<CustomComponents>): void
export function setCustomComponents(
  customIdOrMapping: string | Partial<CustomComponents>,
  maybeMapping?: Partial<CustomComponents>,
): void {
  if (typeof customIdOrMapping === 'string') {
    // scoped API: setCustomComponents('my-id', { ... })
    scopedCustomComponents[customIdOrMapping] = maybeMapping || {}
  }
  else {
    // legacy/global API: setCustomComponents({ ... })
    scopedCustomComponents[GLOBAL_KEY] = customIdOrMapping || {}
  }
}

/**
 * Retrieve custom components for a given scope id.
 * If no id is provided, returns the legacy/global mapping (if any).
 */
export function getCustomNodeComponents(customId?: string) {
  if (!customId)
    return scopedCustomComponents[GLOBAL_KEY] || {}
  return scopedCustomComponents[customId] || scopedCustomComponents[GLOBAL_KEY] || {}
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
  delete scopedCustomComponents[id]
}

/**
 * Clear the legacy/global custom components mapping.
 * Use this when you want to remove the single-argument mapping set by
 * `setCustomComponents(mapping)`.
 */
export function clearGlobalCustomComponents() {
  delete scopedCustomComponents[GLOBAL_KEY]
}
