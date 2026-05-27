function humanizeKey(key: string) {
  const suffix = key.split('.').pop() || key
  return suffix
    .replace(/[_-]/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
    .trim()
}

const defaultMap: Record<string, string> = {
  'common.copy': 'Copy',
  'common.copied': 'Copied',
  'common.decrease': 'Decrease',
  'common.reset': 'Reset',
  'common.increase': 'Increase',
  'common.expand': 'Expand',
  'common.collapse': 'Collapse',
  'common.preview': 'Preview',
  'common.source': 'Source',
  'common.export': 'Export',
  'common.open': 'Open',
  'common.close': 'Close',
  'common.zoomIn': 'Zoom in',
  'common.zoomOut': 'Zoom out',
  'common.resetZoom': 'Reset zoom',
  'artifacts.htmlPreviewTitle': 'HTML Preview',
  'artifacts.svgPreviewTitle': 'SVG Preview',
  'image.preview': 'Preview image',
  'image.loadError': 'Image failed to load',
  'image.loading': 'Loading image...',
}

export function setDefaultI18nMap(map: Record<string, string>) {
  Object.assign(defaultMap, map)
}

export function useSafeI18n() {
  return {
    t(key: string) {
      return defaultMap[key] ?? humanizeKey(key)
    },
  }
}
