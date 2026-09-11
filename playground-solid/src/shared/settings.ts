export const THEMES = [
  'andromeeda',
  'aurora-x',
  'ayu-dark',
  'catppuccin-frappe',
  'catppuccin-latte',
  'catppuccin-macchiato',
  'catppuccin-mocha',
  'dark-plus',
  'dracula',
  'dracula-soft',
  'everforest-dark',
  'everforest-light',
  'github-dark',
  'github-dark-default',
  'github-dark-dimmed',
  'github-dark-high-contrast',
  'github-light',
  'github-light-default',
  'github-light-high-contrast',
  'gruvbox-dark-hard',
  'gruvbox-dark-medium',
  'gruvbox-dark-soft',
  'gruvbox-light-hard',
  'gruvbox-light-medium',
  'gruvbox-light-soft',
  'houston',
  'kanagawa-dragon',
  'kanagawa-lotus',
  'kanagawa-wave',
  'laserwave',
  'light-plus',
  'material-theme',
  'material-theme-darker',
  'material-theme-lighter',
  'material-theme-ocean',
  'material-theme-palenight',
  'min-dark',
  'min-light',
  'monokai',
  'night-owl',
  'nord',
  'one-dark-pro',
  'one-light',
  'plastic',
  'poimandres',
  'red',
  'rose-pine',
  'rose-pine-dawn',
  'rose-pine-moon',
  'slack-dark',
  'slack-ochin',
  'snazzy-light',
  'solarized-dark',
  'solarized-light',
  'synthwave-84',
  'tokyo-night',
  'vesper',
  'vitesse-black',
  'vitesse-dark',
  'vitesse-light',
] as const

export const STREAM_DELAY_MIN_KEY = 'vmr-settings-stream-delay-min'
export const STREAM_DELAY_MAX_KEY = 'vmr-settings-stream-delay-max'
export const STREAM_CHUNK_MIN_KEY = 'vmr-settings-stream-chunk-size-min'
export const STREAM_CHUNK_MAX_KEY = 'vmr-settings-stream-chunk-size-max'
export const STREAM_BURSTINESS_KEY = 'vmr-settings-stream-burstiness'
export const STREAM_TRANSPORT_MODE_KEY = 'vmr-settings-stream-transport-mode'
export const STREAM_SLICE_MODE_KEY = 'vmr-settings-stream-slice-mode'
export const THEME_KEYS = ['vmr-settings-selected-theme', 'vmv-settings-selected-theme'] as const
export const DARK_MODE_KEY = 'vueuse-color-scheme'

export function formatThemeName(theme: string) {
  return theme
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function readNumber(key: string, fallback: number) {
  if (typeof window === 'undefined')
    return fallback
  const raw = window.localStorage.getItem(key)
  if (!raw)
    return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function readThemeFromStorage(fallback: string) {
  if (typeof window === 'undefined')
    return fallback
  for (const key of THEME_KEYS) {
    const raw = window.localStorage.getItem(key)
    if (raw && raw.trim())
      return raw
  }
  return fallback
}

export function readString(key: string, fallback: string) {
  if (typeof window === 'undefined')
    return fallback
  const raw = window.localStorage.getItem(key)
  if (!raw || !raw.trim())
    return fallback
  return raw
}

export function normalizePath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '')
  return normalized || '/'
}
