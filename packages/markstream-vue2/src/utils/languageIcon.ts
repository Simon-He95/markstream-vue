import { ref } from 'vue-demi'
import CIcon from '../icon/c.svg?raw'
import CppIcon from '../icon/cpp.svg?raw'
import CsharpIcon from '../icon/csharp.svg?raw'
import CssIcon from '../icon/css.svg?raw'
import GoIcon from '../icon/go.svg?raw'
import HtmlIcon from '../icon/html.svg?raw'
import JavaIcon from '../icon/java.svg?raw'
import JsxReactIcon from '../icon/javascript-react.svg?raw'
import JsIcon from '../icon/javascript.svg?raw'
import JsonIcon from '../icon/json.svg?raw'
import KotlinIcon from '../icon/kotlin.svg?raw'
import MarkdownIcon from '../icon/markdown.svg?raw'
import MermaidIcon from '../icon/mermaid.svg?raw'
import PhpIcon from '../icon/php.svg?raw'
import PythonIcon from '../icon/python.svg?raw'
import RubyIcon from '../icon/ruby.svg?raw'
import RustIcon from '../icon/rust.svg?raw'
import SassIcon from '../icon/sass.svg?raw'
import ShellIcon from '../icon/shell.svg?raw'
import SqlIcon from '../icon/sql.svg?raw'
import SquareCodeIcon from '../icon/square-code.svg?raw'
import SvgIcon from '../icon/svg.svg?raw'
import TextIcon from '../icon/text.svg?raw'
import TsReactIcon from '../icon/typescript-react.svg?raw'
import TsIcon from '../icon/typescript.svg?raw'
import VueIcon from '../icon/vue.svg?raw'
import XmlIcon from '../icon/xml.svg?raw'
import YamlIcon from '../icon/yaml.svg?raw'

export type LanguageIconResolver = (lang: string) => string | undefined | null

type LanguageIconMap = Record<string, string>

let userLanguageIconResolver: LanguageIconResolver | null = null
let extendedLanguageIconMap: LanguageIconMap | null = null
let extendedLanguageIconPromise: Promise<LanguageIconMap | null> | null = null

export const languageIconsRevision = ref(0)

const DEFAULT_LANGUAGE_ICON = SquareCodeIcon

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
  'scss': SassIcon,
  'json': JsonIcon,
  'python': PythonIcon,
  'ruby': RubyIcon,
  'go': GoIcon,
  'java': JavaIcon,
  'kotlin': KotlinIcon,
  'c': CIcon,
  'cpp': CppIcon,
  'cs': CsharpIcon,
  'csharp': CsharpIcon,
  'php': PhpIcon,
  'shell': ShellIcon,
  'powershell': ShellIcon,
  'sql': SqlIcon,
  'yaml': YamlIcon,
  'markdown': MarkdownIcon,
  'xml': XmlIcon,
  'rust': RustIcon,
  'vue': VueIcon,
  'mermaid': MermaidIcon,
  'svg': SvgIcon,
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
  'd': 'dlang',
  'vbnet': 'vb.net',
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

async function loadExtendedLanguageIconMap(): Promise<LanguageIconMap | null> {
  if (extendedLanguageIconMap)
    return extendedLanguageIconMap

  if (!extendedLanguageIconPromise) {
    extendedLanguageIconPromise = import('./languageIconExtended')
      .then((mod) => {
        extendedLanguageIconMap = mod.EXTENDED_LANGUAGE_ICON_MAP
        languageIconsRevision.value++
        return extendedLanguageIconMap
      })
      .catch(() => null)
  }

  return extendedLanguageIconPromise
}

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
    default:
      return canonical
  }
}

export async function preloadExtendedLanguageIcons() {
  await loadExtendedLanguageIconMap()
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

// 映射一些常见语言的显示名称
export const languageMap: Record<string, string> = {
  'js': 'JavaScript',
  'javascript': 'JavaScript',
  'ts': 'TypeScript',
  'typescript': 'TypeScript',
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
