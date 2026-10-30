import type { PreCodeThemeInput } from './preCodeThemeName'
import { preCodeThemeLooksDark, resolvePreCodeThemeName } from './preCodeThemeName'

interface PreCodeThemePalette {
  builtin: boolean
  dark: boolean
  diffAddedLine: string
  diffAddedNumber: string
  diffRemovedLine: string
  diffRemovedNumber: string
  background: string
  foreground: string
  lineNumber: string
  name: string
}

export function resolvePreCodeThemePalette(input: PreCodeThemeInput): PreCodeThemePalette {
  const name = resolvePreCodeThemeName(input)
  const dark = name === 'vitesse-dark'
    || (name !== 'vitesse-light' && preCodeThemeLooksDark(name, input.isDark === true))

  if (name !== 'vitesse-dark' && name !== 'vitesse-light') {
    const background = dark
      ? 'var(--markstream-code-theme-bg, #121212)'
      : 'var(--markstream-code-theme-bg, #ffffff)'
    const foreground = dark
      ? 'var(--markstream-code-theme-fg, #dbd7caee)'
      : 'var(--markstream-code-theme-fg, #393a34)'
    const lineNumber = dark
      ? 'var(--markstream-code-theme-line-number, #dedcd550)'
      : 'var(--markstream-code-theme-line-number, #393a3450)'
    return {
      builtin: false,
      dark,
      name,
      background,
      diffAddedLine: `color-mix(in lab, ${background} ${dark ? '80%' : '88%'}, ${dark ? '#4d9375' : '#1e754f'})`,
      diffAddedNumber: `color-mix(in lab, ${background} ${dark ? '85%' : '91%'}, ${dark ? '#4d9375' : '#1e754f'})`,
      diffRemovedLine: `color-mix(in lab, ${background} ${dark ? '80%' : '88%'}, ${dark ? '#cb7676' : '#ab5959'})`,
      diffRemovedNumber: `color-mix(in lab, ${background} ${dark ? '85%' : '91%'}, ${dark ? '#cb7676' : '#ab5959'})`,
      foreground,
      lineNumber,
    }
  }

  return dark
    ? {
        builtin: true,
        dark: true,
        name,
        background: '#121212',
        diffAddedLine: 'color-mix(in lab, #121212 80%, #4d9375)',
        diffAddedNumber: 'color-mix(in lab, #121212 85%, #4d9375)',
        diffRemovedLine: 'color-mix(in lab, #121212 80%, #cb7676)',
        diffRemovedNumber: 'color-mix(in lab, #121212 85%, #cb7676)',
        foreground: '#dbd7caee',
        lineNumber: '#dedcd550',
      }
    : {
        builtin: true,
        dark: false,
        name,
        background: '#ffffff',
        diffAddedLine: 'color-mix(in lab, #ffffff 88%, #1e754f)',
        diffAddedNumber: 'color-mix(in lab, #ffffff 91%, #1e754f)',
        diffRemovedLine: 'color-mix(in lab, #ffffff 88%, #ab5959)',
        diffRemovedNumber: 'color-mix(in lab, #ffffff 91%, #ab5959)',
        foreground: '#393a34',
        lineNumber: '#393a3450',
      }
}
