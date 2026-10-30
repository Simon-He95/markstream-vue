export interface PreCodeThemeInput {
  isDark?: boolean
  theme?: string | { dark: string, light: string }
  darkTheme?: string
  lightTheme?: string
  themes?: readonly string[]
}

export function resolvePreCodeThemeName(input: PreCodeThemeInput): string {
  const variant = input.isDark ? 'dark' : 'light'
  if (input.theme !== undefined)
    return typeof input.theme === 'string' ? input.theme : input.theme[variant]
  return (input.isDark ? input.darkTheme ?? input.themes?.[0] : input.lightTheme ?? input.themes?.[1])
    ?? `vitesse-${variant}`
}

export function preCodeThemeLooksDark(themeName: string, isDark = false) {
  const name = themeName.toLowerCase()
  if (!name)
    return isDark
  return /dark|night|moon|black|dracula|mocha|frappe|macchiato|ocean|poimandres|monokai|laserwave|tokyo|rose-pine|material-theme/.test(name)
    && !/light|latte|dawn|lotus/.test(name)
}
