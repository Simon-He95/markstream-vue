import AdaIcon from '../icon/ada.svg?raw'
import ApplescriptIcon from '../icon/apple.svg?raw'
import AssemblyIcon from '../icon/assembly.svg?raw'
import CIcon from '../icon/c.svg?raw'
import ClojureIcon from '../icon/clojure.svg?raw'
import CobolIcon from '../icon/cobol.svg?raw'
import CppIcon from '../icon/cpp.svg?raw'
import CrystalIcon from '../icon/crystal.svg?raw'
import CsharpIcon from '../icon/csharp.svg?raw'
import CssIcon from '../icon/css.svg?raw'
import DartIcon from '../icon/dart.svg?raw'
import DlangIcon from '../icon/dlang.svg?raw'
import DockerIcon from '../icon/docker.svg?raw'
import ElixirIcon from '../icon/elixir.svg?raw'
import ErlangIcon from '../icon/erlang.svg?raw'
import FortranIcon from '../icon/fortran.svg?raw'
import GoIcon from '../icon/go.svg?raw'
import GroovyIcon from '../icon/groovy.svg?raw'
import HaskellIcon from '../icon/haskell.svg?raw'
import HtmlIcon from '../icon/html.svg?raw'
import JavaIcon from '../icon/java.svg?raw'
import JsxReactIcon from '../icon/javascript-react.svg?raw'
import JsIcon from '../icon/javascript.svg?raw'
import JsonIcon from '../icon/json.svg?raw'
import JuliaIcon from '../icon/julia.svg?raw'
import KotlinIcon from '../icon/kotlin.svg?raw'
import LispIcon from '../icon/lisp.svg?raw'
import LuaIcon from '../icon/lua.svg?raw'
import MarkdownIcon from '../icon/markdown.svg?raw'
import MatlabIcon from '../icon/matlab.svg?raw'
import MermaidIcon from '../icon/mermaid.svg?raw'
import NimIcon from '../icon/nim.svg?raw'
import ObjectivecIcon from '../icon/objectivec.svg?raw'
import ObjectivecppIcon from '../icon/objectivecpp.svg?raw'
import OcamlIcon from '../icon/ocaml.svg?raw'
import PerlIcon from '../icon/perl.svg?raw'
import PhpIcon from '../icon/php.svg?raw'
import PrologIcon from '../icon/prolog.svg?raw'
import PythonIcon from '../icon/python.svg?raw'
import RIcon from '../icon/r.svg?raw'
import RubyIcon from '../icon/ruby.svg?raw'
import RustIcon from '../icon/rust.svg?raw'
import SassIcon from '../icon/sass.svg?raw'
import ScalaIcon from '../icon/scala.svg?raw'
import ShellIcon from '../icon/shell.svg?raw'
import SolidityIcon from '../icon/solidity.svg?raw'
import SqlIcon from '../icon/sql.svg?raw'
import SquareCodeIcon from '../icon/square-code.svg?raw'
import SvgIcon from '../icon/svg.svg?raw'
import SwiftIcon from '../icon/swift.svg?raw'
import TerraformIcon from '../icon/terraform.svg?raw'
import TextIcon from '../icon/text.svg?raw'
import TsReactIcon from '../icon/typescript-react.svg?raw'
import TsIcon from '../icon/typescript.svg?raw'
import VbnetIcon from '../icon/vbnet.svg?raw'
import VueIcon from '../icon/vue.svg?raw'
import XmlIcon from '../icon/xml.svg?raw'
import YamlIcon from '../icon/yaml.svg?raw'

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
  'c++': 'cpp',
  'c#': 'csharp',
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
    case 'js':
      return JsIcon
    case 'typescript':
    case 'ts':
      return TsIcon
    case 'jsx':
      return JsxReactIcon
    case 'tsx':
      return TsReactIcon
    case 'html':
      return HtmlIcon
    case 'css':
      return CssIcon
    case 'scss':
      return SassIcon
    case 'json':
      return JsonIcon
    case 'python':
    case 'py':
      return PythonIcon
    case 'ruby':
    case 'rb':
      return RubyIcon
    case 'go':
    case 'golang':
      return GoIcon
    case 'r':
      return RIcon
    case 'java':
      return JavaIcon
    case 'kotlin':
    case 'kt':
      return KotlinIcon
    case 'c':
      return CIcon
    case 'cpp':
    case 'c++':
      return CppIcon
    case 'cs':
    case 'csharp':
      return CsharpIcon
    case 'php':
      return PhpIcon
    case 'scala':
      return ScalaIcon
    case 'shell':
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'powershell':
    case 'ps1':
    case 'bat':
    case 'batch':
    case 'shellscript':
      return ShellIcon
    case 'sql':
      return SqlIcon
    case 'yaml':
    case 'yml':
      return YamlIcon
    case 'markdown':
    case 'md':
      return MarkdownIcon
    case 'xml':
      return XmlIcon
    case 'rust':
    case 'rs':
      return RustIcon
    case 'swift':
      return SwiftIcon
    case 'perl':
      return PerlIcon
    case 'lua':
      return LuaIcon
    case 'haskell':
      return HaskellIcon
    case 'erlang':
      return ErlangIcon
    case 'clojure':
      return ClojureIcon
    case 'vue':
      return VueIcon
    case 'svg':
      return SvgIcon
    case 'mermaid':
      return MermaidIcon
    case 'dart':
      return DartIcon
    case 'assembly':
      return AssemblyIcon
    case 'dockerfile':
      return DockerIcon
    case 'fortran':
      return FortranIcon
    case 'lisp':
      return LispIcon
    case 'ocaml':
      return OcamlIcon
    case 'prolog':
      return PrologIcon
    case 'groovy':
      return GroovyIcon
    case 'matlab':
      return MatlabIcon
    case 'cobol':
      return CobolIcon
    case 'ada':
      return AdaIcon
    case 'julia':
      return JuliaIcon
    case 'elixir':
      return ElixirIcon
    case 'vb.net':
      return VbnetIcon
    case 'nim':
      return NimIcon
    case 'crystal':
      return CrystalIcon
    case 'd':
      return DlangIcon
    case 'applescript':
      return ApplescriptIcon
    case 'solidity':
      return SolidityIcon
    case 'objectivec':
      return ObjectivecIcon
    case 'objectivecpp':
      return ObjectivecppIcon
    case 'terraform':
      return TerraformIcon
    case 'plain':
    case 'text':
    case '':
      return TextIcon
    default:
      return SquareCodeIcon
  }
}

// 映射一些常见语言的显示名称
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
  'php': 'PHP',
  'sh': 'Shell',
  'bash': 'Bash',
  'sql': 'SQL',
  'yaml': 'YAML',
  'md': 'Markdown',
  '': 'Plain Text',
  'plain': 'Plain Text',
}
