import type { LanguageIconMap } from '../types'
import CIcon from './svg/c.svg?raw'
import CppIcon from './svg/cpp.svg?raw'
import CsharpIcon from './svg/csharp.svg?raw'
import CssIcon from './svg/css.svg?raw'
import GoIcon from './svg/go.svg?raw'
import HtmlIcon from './svg/html.svg?raw'
import JavaIcon from './svg/java.svg?raw'
import JsIcon from './svg/javascript.svg?raw'
import JsonIcon from './svg/json.svg?raw'
import JsxIcon from './svg/jsx.svg?raw'
import KotlinIcon from './svg/kotlin.svg?raw'
import MarkdownIcon from './svg/markdown.svg?raw'
import MermaidIcon from './svg/mermaid.svg?raw'
import PhpIcon from './svg/php.svg?raw'
import PlainIcon from './svg/plain.svg?raw'
import PowershellIcon from './svg/powershell.svg?raw'
import PythonIcon from './svg/python.svg?raw'
import RubyIcon from './svg/ruby.svg?raw'
import RustIcon from './svg/rust.svg?raw'
import ScssIcon from './svg/scss.svg?raw'
import ShellIcon from './svg/shell.svg?raw'
import SqlIcon from './svg/sql.svg?raw'
import TextIcon from './svg/text.svg?raw'
import TsxIcon from './svg/tsx.svg?raw'
import TsIcon from './svg/typescript.svg?raw'
import VueIcon from './svg/vue.svg?raw'
import XmlIcon from './svg/xml.svg?raw'
import YamlIcon from './svg/yaml.svg?raw'

export const materialCoreMap: LanguageIconMap = {
  '': TextIcon,
  'plain': PlainIcon,
  'text': TextIcon,
  'javascript': JsIcon,
  'typescript': TsIcon,
  'jsx': JsxIcon,
  'tsx': TsxIcon,
  'html': HtmlIcon,
  'css': CssIcon,
  'scss': ScssIcon,
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
  'powershell': PowershellIcon,
  'sql': SqlIcon,
  'yaml': YamlIcon,
  'markdown': MarkdownIcon,
  'xml': XmlIcon,
  'rust': RustIcon,
  'vue': VueIcon,
  'mermaid': MermaidIcon,
}
