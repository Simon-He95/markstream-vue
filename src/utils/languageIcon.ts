import { shallowRef } from 'vue'
import { materialIconTheme } from '../icon-themes/material'
import {
  _setRevisionBumper,
  getThemeFallback,
  preloadActiveThemeExtended,
  registerIconTheme,
  resolveFromTheme,
} from '../icon-themes/registry'

export type LanguageIconResolver = (lang: string) => string | undefined | null

let userLanguageIconResolver: LanguageIconResolver | null = null

// Bump this ref when the async icon table is loaded so computed icon bindings can refresh.
export const languageIconsRevision = shallowRef(0)

// Wire the registry to bump our revision ref
_setRevisionBumper(() => {
  languageIconsRevision.value++
})

// ── Default theme: Material Icon Theme ─────────────────────────────────

registerIconTheme(materialIconTheme)

// ── Language alias normalization ────────────────────────────────────────

const LANGUAGE_ALIAS_MAP: Record<string, string> = {
  '': '',
  'javascript': 'javascript',
  'js': 'javascript',
  'mjs': 'javascript',
  'cjs': 'javascript',
  'typescript': 'typescript',
  'ts': 'typescript',
  'jsx': 'jsx',
  'tsx': 'tsx',
  'golang': 'go',
  'py': 'python',
  'rb': 'ruby',
  'sh': 'shell',
  'bash': 'shell',
  'zsh': 'shell',
  'shellscript': 'shell',
  'bat': 'shell',
  'batch': 'shell',
  'ps1': 'powershell',
  'plaintext': 'plain',
  'text': 'plain',
  'txt': 'plain',
  'c++': 'cpp',
  'c#': 'csharp',
  'cs': 'csharp',
  'objective-c': 'objectivec',
  'objective-c++': 'objectivecpp',
  'yml': 'yaml',
  'md': 'markdown',
  'rs': 'rust',
  'kt': 'kotlin',
}

function extractLanguageToken(lang?: string | null): string {
  if (!lang)
    return ''
  const trimmed = lang.trim()
  if (!trimmed)
    return ''
  const [firstToken] = trimmed.split(/\s+/)
  const [base] = firstToken.split(':')
  return base.toLowerCase()
}

// ── Public API ──────────────────────────────────────────────────────────

export function setLanguageIconResolver(resolver?: LanguageIconResolver | null) {
  userLanguageIconResolver = resolver ?? null
}

export function normalizeLanguageIdentifier(lang?: string | null): string {
  const token = extractLanguageToken(lang)
  return LANGUAGE_ALIAS_MAP[token] ?? token
}

export function resolveLanguageId(lang?: string | null): string {
  const canonical = normalizeLanguageIdentifier(lang)
  if (!canonical)
    return 'plaintext'
  switch (canonical) {
    case 'plain':
      return 'plaintext'
    case 'jsx':
      return 'javascript'
    case 'tsx':
      return 'typescript'
    case 'objectivec':
      return 'objective-c'
    case 'objectivecpp':
      return 'objective-cpp'
    default:
      return canonical
  }
}

export async function preloadExtendedLanguageIcons() {
  await preloadActiveThemeExtended()
}

export function getLanguageIcon(lang: string): string {
  // 1. User custom resolver is process-global (backward compat).
  if (userLanguageIconResolver) {
    const hit = userLanguageIconResolver(lang)
    if (hit != null && hit !== '')
      return hit
  }

  // 2. Active theme resolution
  const normalized = normalizeLanguageIdentifier(lang)
  const themeHit = resolveFromTheme(normalized)
  if (themeHit)
    return themeHit

  // 3. Fallback from active theme
  return getThemeFallback()
}

export const languageMap: Record<string, string> = {
  'js': 'JavaScript',
  'javascript': 'JavaScript',
  'ts': 'TypeScript',
  'jsx': 'JSX',
  'tsx': 'TSX',
  'html': 'HTML',
  'css': 'CSS',
  'scss': 'SCSS',
  'json': 'JSON',
  'py': 'Python',
  'python': 'Python',
  'rb': 'Ruby',
  'go': 'Go',
  'java': 'Java',
  'c': 'C',
  'cpp': 'C++',
  'cs': 'C#',
  'csharp': 'C#',
  'php': 'PHP',
  'sh': 'Shell',
  'bash': 'Bash',
  'sql': 'SQL',
  'yaml': 'YAML',
  'md': 'Markdown',
  'd2': 'D2',
  'd2lang': 'D2',
  '': 'Plain Text',
  'plain': 'Plain Text',
}
