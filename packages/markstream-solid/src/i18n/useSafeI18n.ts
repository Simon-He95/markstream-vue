import { useContext } from 'solid-js'
import { MarkstreamConfigContext } from '../configuration'

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
  'common.minimize': 'Minimize',
  'common.selectCopy': '全选（复制）',
  'common.more': 'More',
  'common.fontSmaller': 'Font size −',
  'common.fontReset': 'Font size reset',
  'common.fontLarger': 'Font size +',
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

export function setDefaultI18nMap(map: Partial<Record<string, string>>) {
  Object.assign(defaultMap, map)
}

export function useSafeI18n() {
  const configuration = useContext(MarkstreamConfigContext)
  return {
    t(key: string) {
      return configuration().defaultI18nMap?.[key] ?? defaultMap[key] ?? humanizeKey(key)
    },
  }
}
