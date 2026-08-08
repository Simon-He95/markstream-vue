import CssIcon from '../icon/css.svg?raw'
import HtmlIcon from '../icon/html.svg?raw'
import JsxReactIcon from '../icon/javascript-react.svg?raw'
import JsIcon from '../icon/javascript.svg?raw'
import JsonIcon from '../icon/json.svg?raw'
import MarkdownIcon from '../icon/markdown.svg?raw'
import MermaidIcon from '../icon/mermaid.svg?raw'
import PythonIcon from '../icon/python.svg?raw'
import ShellIcon from '../icon/shell.svg?raw'
import SquareCodeIcon from '../icon/square-code.svg?raw'
import TextIcon from '../icon/text.svg?raw'
import TsReactIcon from '../icon/typescript-react.svg?raw'
import TsIcon from '../icon/typescript.svg?raw'

export type LanguageIconResolver = (lang: string) => string | undefined | null

type LanguageIconMap = Record<string, string>

let userLanguageIconResolver: LanguageIconResolver | null = null
let extendedLanguageIconMap: LanguageIconMap | null = null
let extendedLanguageIconPromise: Promise<LanguageIconMap | null> | null = null
const revisionListeners = new Set<() => void>()

const DEFAULT_LANGUAGE_ICON = SquareCodeIcon

export function setLanguageIconResolver(resolver?: LanguageIconResolver | null) {
  userLanguageIconResolver = resolver ?? null
}

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
  'd2lang': 'd2',
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

const CORE_LANGUAGE_ICON_MAP: LanguageIconMap = {
  '': TextIcon,
  'plain': TextIcon,
  'text': TextIcon,
  'javascript': JsIcon,
  'typescript': TsIcon,
  'jsx': JsxReactIcon,
  'tsx': TsReactIcon,
  'html': HtmlIcon,
  'css': CssIcon,
  'json': JsonIcon,
  'python': PythonIcon,
  'shell': ShellIcon,
  'markdown': MarkdownIcon,
  'mermaid': MermaidIcon,
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
    default:
      return canonical
  }
}

function emitLanguageIconsRevision() {
  for (const listener of revisionListeners) {
    try {
      listener()
    }
    catch {}
  }
}

async function loadExtendedLanguageIconMap(): Promise<LanguageIconMap | null> {
  if (extendedLanguageIconMap)
    return extendedLanguageIconMap

  if (!extendedLanguageIconPromise) {
    extendedLanguageIconPromise = import('./languageIconExtended')
      .then((mod) => {
        extendedLanguageIconMap = mod.EXTENDED_LANGUAGE_ICON_MAP
        emitLanguageIconsRevision()
        return extendedLanguageIconMap
      })
      .catch(() => null)
  }

  return extendedLanguageIconPromise
}

export async function preloadExtendedLanguageIcons() {
  await loadExtendedLanguageIconMap()
}

export function subscribeLanguageIconsRevision(listener: () => void): () => void {
  revisionListeners.add(listener)
  return () => {
    revisionListeners.delete(listener)
  }
}

export function getLanguageIcon(lang: string): string {
  if (userLanguageIconResolver) {
    const hit = userLanguageIconResolver(lang)
    if (hit != null && hit !== '')
      return hit
  }

  const normalized = normalizeLanguageIdentifier(lang)
  const coreIcon = CORE_LANGUAGE_ICON_MAP[normalized]
  if (coreIcon)
    return coreIcon

  const extendedIcon = extendedLanguageIconMap?.[normalized]
  if (extendedIcon)
    return extendedIcon

  void loadExtendedLanguageIconMap()
  return DEFAULT_LANGUAGE_ICON
}

export const languageMap: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  shell: 'Shell',
  plain: 'Text',
  text: 'Text',
  markdown: 'Markdown',
  json: 'JSON',
  python: 'Python',
  cpp: 'C++',
  csharp: 'C#',
  vue: 'Vue',
  html: 'HTML',
  css: 'CSS',
  svg: 'SVG',
  mermaid: 'Mermaid',
  d2: 'D2',
}
