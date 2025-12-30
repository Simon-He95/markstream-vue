import CppIcon from '../icon/cpp.svg?raw'
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
import SvgIcon from '../icon/svg.svg?raw'
import TextIcon from '../icon/text.svg?raw'
import TsReactIcon from '../icon/typescript-react.svg?raw'
import TsIcon from '../icon/typescript.svg?raw'
import VueIcon from '../icon/vue.svg?raw'

export type LanguageIconResolver = (lang: string) => string | undefined | null

let userLanguageIconResolver: LanguageIconResolver | null = null

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
  'py': 'python',
  'rb': 'ruby',
  'sh': 'shell',
  'bash': 'shell',
  'zsh': 'shell',
  'shellscript': 'shell',
  'plaintext': 'plain',
  'text': 'plain',
  'c++': 'cpp',
  'md': 'markdown',
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

export function resolveMonacoLanguageId(lang?: string | null): string {
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

export function getLanguageIcon(lang: string): string {
  if (userLanguageIconResolver) {
    const hit = userLanguageIconResolver(lang)
    if (hit != null && hit !== '')
      return hit
  }
  const normalized = normalizeLanguageIdentifier(lang)
  switch (normalized) {
    case 'javascript':
      return JsIcon
    case 'typescript':
      return TsIcon
    case 'jsx':
      return JsxReactIcon
    case 'tsx':
      return TsReactIcon
    case 'html':
      return HtmlIcon
    case 'css':
      return CssIcon
    case 'json':
      return JsonIcon
    case 'python':
      return PythonIcon
    case 'shell':
      return ShellIcon
    case 'markdown':
      return MarkdownIcon
    case 'mermaid':
      return MermaidIcon
    case 'svg':
      return SvgIcon
    case 'vue':
      return VueIcon
    case 'cpp':
      return CppIcon
    case 'plain':
      return TextIcon
    default:
      return SquareCodeIcon
  }
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
  vue: 'Vue',
  html: 'HTML',
  css: 'CSS',
  svg: 'SVG',
  mermaid: 'Mermaid',
}
