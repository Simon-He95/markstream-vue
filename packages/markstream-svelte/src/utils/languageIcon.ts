export type LanguageIconResolver = (lang: string) => string | undefined | null

const DEFAULT_ICON = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
  <path d="M8 11l-3 3l3 3" />
  <path d="M16 11l3 3l-3 3" />
  <path d="M13 9l-2 10" />
</svg>`

const MERMAID_ICON = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="3" y="4" width="7" height="5" rx="1.5" />
  <rect x="14" y="4" width="7" height="5" rx="1.5" />
  <rect x="8.5" y="15" width="7" height="5" rx="1.5" />
  <path d="M10 6.5h4" />
  <path d="M12 9v2.5" />
  <path d="M12 11.5l-3.5 3.5" />
  <path d="M12 11.5l3.5 3.5" />
</svg>`

const HTML_ICON = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M8 7l-4 5l4 5" />
  <path d="M16 7l4 5l-4 5" />
  <path d="M14 4l-4 16" />
</svg>`

const MARKDOWN_ICON = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="3" y="4" width="18" height="16" rx="2" />
  <path d="M7 15V9l3 3l3-3v6" />
  <path d="M16 9v6" />
  <path d="M14 13l2 2l2-2" />
</svg>`

const JSON_ICON = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M9 4c-2 0-3 1.5-3 3.5v2c0 1.1-.4 1.8-1.5 2.5C5.6 12.7 6 13.4 6 14.5v2C6 18.5 7 20 9 20" />
  <path d="M15 4c2 0 3 1.5 3 3.5v2c0 1.1.4 1.8 1.5 2.5c-1.1.7-1.5 1.4-1.5 2.5v2c0 2-1 3.5-3 3.5" />
</svg>`

const TEXT_ICON = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M5 6h14" />
  <path d="M12 6v12" />
  <path d="M8 18h8" />
</svg>`

const LANGUAGE_ALIAS_MAP: Record<string, string> = {
  '': '',
  'cjs': 'javascript',
  'c++': 'cpp',
  'c#': 'csharp',
  'd2lang': 'd2',
  'golang': 'go',
  'js': 'javascript',
  'jsx': 'jsx',
  'kt': 'kotlin',
  'md': 'markdown',
  'mjs': 'javascript',
  'objective-c': 'objectivec',
  'objective-c++': 'objectivecpp',
  'plaintext': 'plain',
  'rb': 'ruby',
  'rs': 'rust',
  'py': 'python',
  'bash': 'shell',
  'bat': 'shell',
  'batch': 'shell',
  'ps1': 'powershell',
  'sh': 'shell',
  'shellscript': 'shell',
  'text': 'plain',
  'ts': 'typescript',
  'tsx': 'tsx',
  'yml': 'yaml',
  'zsh': 'shell',
}

const LANGUAGE_LABEL_MAP: Record<string, string> = {
  '': 'Text',
  'css': 'CSS',
  'c': 'C',
  'cpp': 'C++',
  'csharp': 'C#',
  'd2': 'D2',
  'go': 'Go',
  'html': 'HTML',
  'java': 'Java',
  'javascript': 'JavaScript',
  'json': 'JSON',
  'jsx': 'JSX',
  'markdown': 'Markdown',
  'mermaid': 'Mermaid',
  'php': 'PHP',
  'plain': 'Text',
  'plaintext': 'Text',
  'python': 'Python',
  'ruby': 'Ruby',
  'rust': 'Rust',
  'shell': 'Shell',
  'sql': 'SQL',
  'svg': 'SVG',
  'tsx': 'TSX',
  'typescript': 'TypeScript',
  'vue': 'Vue',
  'yaml': 'YAML',
}

const LANGUAGE_ICON_MAP: Record<string, string> = {
  '': TEXT_ICON,
  'html': HTML_ICON,
  'javascript': DEFAULT_ICON,
  'json': JSON_ICON,
  'jsx': DEFAULT_ICON,
  'markdown': MARKDOWN_ICON,
  'mermaid': MERMAID_ICON,
  'plain': TEXT_ICON,
  'python': DEFAULT_ICON,
  'shell': DEFAULT_ICON,
  'svg': HTML_ICON,
  'tsx': DEFAULT_ICON,
  'typescript': DEFAULT_ICON,
}

let userLanguageIconResolver: LanguageIconResolver | null = null

const LANGUAGE_PREFIX_CANDIDATES = Array.from(new Set([
  ...Object.keys(LANGUAGE_ALIAS_MAP),
  ...Object.keys(LANGUAGE_LABEL_MAP),
  ...Object.keys(LANGUAGE_ICON_MAP),
  'bash',
  'c',
  'cpp',
  'csharp',
  'diff',
  'go',
  'java',
  'php',
  'ruby',
  'rust',
  'sql',
  'yaml',
  'zsh',
]))

function extractLanguageToken(lang?: string | null) {
  if (!lang)
    return ''
  const trimmed = lang.trim()
  if (!trimmed)
    return ''
  const [firstToken] = trimmed.split(/\s+/)
  const [base] = firstToken.split(':')
  return base.toLowerCase()
}

export function normalizeLanguageIdentifier(lang?: string | null): string {
  const token = extractLanguageToken(lang)
  return LANGUAGE_ALIAS_MAP[token] ?? token
}

export function resolveMonacoLanguageId(lang?: string | null): string {
  const canonical = normalizeLanguageIdentifier(lang)
  if (!canonical)
    return 'plaintext'
  if (canonical === 'plain')
    return 'plaintext'
  if (canonical === 'jsx')
    return 'javascript'
  if (canonical === 'tsx')
    return 'typescript'
  return canonical
}

export function isLikelyIncompleteLanguageIdentifier(lang?: string | null): boolean {
  const token = extractLanguageToken(lang)
  if (!token)
    return false
  if (LANGUAGE_PREFIX_CANDIDATES.includes(token))
    return false
  return LANGUAGE_PREFIX_CANDIDATES.some(candidate => candidate.startsWith(token))
}

export function setLanguageIconResolver(resolver?: LanguageIconResolver | null) {
  userLanguageIconResolver = resolver ?? null
}

export function getLanguageIcon(lang: string): string {
  if (userLanguageIconResolver) {
    const hit = userLanguageIconResolver(lang)
    if (hit != null && hit !== '')
      return hit
  }
  const normalized = normalizeLanguageIdentifier(lang)
  return LANGUAGE_ICON_MAP[normalized] || DEFAULT_ICON
}

export const languageMap = LANGUAGE_LABEL_MAP
