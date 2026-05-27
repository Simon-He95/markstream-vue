import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { CustomComponents } from '../types'
import { normalizeCustomHtmlTagName } from 'stream-markdown-parser'
import { computed, inject, shallowRef } from 'vue'

// Store mappings per scope id. A special key is kept for the legacy/global mapping.
const GLOBAL_KEY = '__global__'
interface CustomComponentsStore {
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

export const MARKSTREAM_CUSTOM_COMPONENTS_KEY: InjectionKey<Ref<Partial<CustomComponents>>> = Symbol('markstreamCustomComponents')

export const RESERVED_NODE_COMPONENT_KEYS = new Set([
  'text',
  'paragraph',
  'heading',
  'code_block',
  'list',
  'list_item',
  'blockquote',
  'table',
  'table_row',
  'table_cell',
  'definition_list',
  'definition_item',
  'footnote',
  'footnote_reference',
  'footnote_anchor',
  'admonition',
  'hardbreak',
  'link',
  'image',
  'thematic_break',
  'math_inline',
  'math_block',
  'strong',
  'emphasis',
  'strikethrough',
  'highlight',
  'insert',
  'subscript',
  'superscript',
  'emoji',
  'checkbox',
  'checkbox_input',
  'inline_code',
  'html_inline',
  'html_block',
  'reference',
  'mermaid',
  'infographic',
  'd2',
  'vmr_container',
])

export function isReservedNodeComponentKey(key: string) {
  return RESERVED_NODE_COMPONENT_KEYS.has(String(key).trim().toLowerCase())
}

function toKebabCaseComponentName(key: string) {
  return key
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
}

export function normalizeCustomComponentMapping(mapping: Partial<CustomComponents> = {}) {
  const normalized: Partial<CustomComponents> = {}

  for (const [key, component] of Object.entries(mapping)) {
    if (component == null)
      continue

    normalized[key] = component

    for (const normalizedKey of new Set([
      normalizeCustomHtmlTagName(key),
      normalizeCustomHtmlTagName(toKebabCaseComponentName(key)),
    ])) {
      if (
        normalizedKey
        && !isReservedNodeComponentKey(normalizedKey)
        && !Object.prototype.hasOwnProperty.call(normalized, normalizedKey)
      ) {
        normalized[normalizedKey] = component
      }
    }
  }

  return normalized
}

export function createCustomComponentsRef(mapping: Partial<CustomComponents> = {}) {
  return shallowRef(normalizeCustomComponentMapping(mapping))
}

// Overloads for nicer TypeScript API
export function setCustomComponents(id: string, mapping: Partial<CustomComponents>): void
export function setCustomComponents(mapping: Partial<CustomComponents>): void
export function setCustomComponents(
  customIdOrMapping: string | Partial<CustomComponents>,
  maybeMapping?: Partial<CustomComponents>,
): void {
  if (typeof customIdOrMapping === 'string') {
    // scoped API: setCustomComponents('my-id', { ... })
    store.scopedCustomComponents[customIdOrMapping] = normalizeCustomComponentMapping(maybeMapping || {})
  }
  else {
    // legacy/global API: setCustomComponents({ ... })
    store.scopedCustomComponents[GLOBAL_KEY] = normalizeCustomComponentMapping(customIdOrMapping || {})
  }
  customComponentsRevision.value++
}

/**
 * Retrieve custom components for a given scope id.
 * If no id is provided, returns the legacy/global mapping (if any).
 */
export function getCustomNodeComponents(customId?: string) {
  const globalMapping = normalizeCustomComponentMapping(store.scopedCustomComponents[GLOBAL_KEY] || {})
  if (!customId)
    return globalMapping

  const scopedMapping = normalizeCustomComponentMapping(store.scopedCustomComponents[customId] || {})
  if (!globalMapping || Object.keys(globalMapping).length === 0)
    return scopedMapping
  if (!scopedMapping || Object.keys(scopedMapping).length === 0)
    return globalMapping
  return {
    ...globalMapping,
    ...scopedMapping,
  }
}

function getGlobalCustomNodeComponents() {
  return store.scopedCustomComponents[GLOBAL_KEY] || {}
}

function getScopedOnlyCustomNodeComponents(customId?: string) {
  return customId ? store.scopedCustomComponents[customId] || {} : {}
}

export function mergeCustomNodeComponents(
  customId?: string,
  appScopedMapping: Partial<CustomComponents> = {},
): Partial<CustomComponents> {
  void customComponentsRevision.value

  return {
    ...normalizeCustomComponentMapping(getGlobalCustomNodeComponents()),
    ...normalizeCustomComponentMapping(appScopedMapping),
    ...normalizeCustomComponentMapping(getScopedOnlyCustomNodeComponents(customId)),
  }
}

export function useCustomNodeComponents(customId?: () => string | undefined): ComputedRef<Partial<CustomComponents>> {
  const appScopedMapping = inject(MARKSTREAM_CUSTOM_COMPONENTS_KEY, null)

  return computed(() => {
    void customComponentsRevision.value
    return mergeCustomNodeComponents(customId?.(), appScopedMapping?.value ?? {})
  })
}

export function useAppCustomNodeComponents(): ComputedRef<Partial<CustomComponents>> {
  const appScopedMapping = inject(MARKSTREAM_CUSTOM_COMPONENTS_KEY, null)

  return computed(() => appScopedMapping?.value ?? {})
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
