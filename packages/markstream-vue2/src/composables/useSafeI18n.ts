function humanizeKey(key: string) {
  const s = key.split('.').pop() || key
  return s
    .replace(/[_-]/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

const defaultMap: Record<string, string> = {
  'common.copy': 'Copy',
  'common.copySuccess': 'Copied',
  'common.decrease': 'Decrease',
  'common.reset': 'Reset',
  'common.increase': 'Increase',
  'common.expand': 'Expand',
  'common.collapse': 'Collapse',
  'common.preview': 'Preview',
  'common.source': 'Source',
  'common.export': 'Export',
  'common.open': 'Open',
  'common.zoomIn': 'Zoom in',
  'common.zoomOut': 'Zoom out',
  'common.resetZoom': 'Reset zoom',
  'image.loadError': 'Image failed to load',
  'image.loading': 'Loading image...',

}

/**
 * Replace the entire default translation map.
 * Consumers can call this to provide their own fallback translations (e.g. Chinese).
 */
export function setDefaultI18nMap(map: Record<keyof typeof defaultMap, string>) {
  Object.assign(defaultMap, map)
}

export function useSafeI18n() {
  // Synchronous fallback in case `vue-i18n` is not installed.
  // Vue 2 build avoids dynamic import; consumers can provide `$vueI18nUse`.
  try {
    // Try to use global installed vue-i18n if available synchronously via composition API
    // This will work when the consumer has set up vue-i18n and the bundler left
    // the runtime entry available. We access it via (global) require-ish path.
    // Keep this non-throwing.
    const possible = (globalThis as any).$vueI18nUse || null
    if (possible && typeof possible === 'function') {
      try {
        const i18n = possible()
        if (i18n && typeof i18n.t === 'function') {
          return { t: (i18n.t as any).bind(i18n) }
        }
      }
      catch {}
    }
  }
  catch {}

  // Fallback synchronous translator
  const fallbackT = (key: string) => defaultMap[key] ?? humanizeKey(key)

  // Vue 2 build: avoid dynamic importing vue-i18n to prevent bundling Vue 3-only builds.
  // Consumers can still register a global `$vueI18nUse` hook to provide translations.

  return { t: fallbackT }
}
