export const TEX_BRACE_COMMANDS = [
  'mathbf',
  'boldsymbol',
  'mathbb',
  'mathcal',
  'mathfrak',
  'mathrm',
  'mathit',
  'mathsf',
  'vec',
  'hat',
  'bar',
  'tilde',
  'overline',
  'underline',
  'mathscr',
  'mathnormal',
  'operatorname',
  'mathbf*',
]

export const ESCAPED_TEX_BRACE_COMMANDS = TEX_BRACE_COMMANDS.map(c => c.replace(/[.*+?^${}()|[\\]"\]/g, '\\$&')).join('|')

const TEX_CMD_RE = /\\[a-z]+/i
const PREFIX_CLASS = '(?:\\\\|\\u0008)'
const TEX_CMD_WITH_BRACES_RE = new RegExp(`${PREFIX_CLASS}(?:${ESCAPED_TEX_BRACE_COMMANDS})\\s*\\{[^}]+\\}`, 'i')
// Detect brace-taking TeX commands even when the leading backslash or the
// closing brace/content is missing (e.g. "operatorname{" or "operatorname{span").
// This helps the heuristic treat incomplete but clearly TeX-like fragments
// as math-like instead of plain text.
const TEX_BRACE_CMD_START_RE = new RegExp(`(?:${PREFIX_CLASS})?(?:${ESCAPED_TEX_BRACE_COMMANDS})\s*\{`, 'i')
const TEX_SPECIFIC_RE = /\\(?:text|frac|left|right|times)/
// Match common math operator symbols or named commands.
// Avoid treating the C/C++ increment operator ("++") as a math operator by
// ensuring a lone '+' isn't matched when it's part of a '++' sequence.
// Use a RegExp constructed from a string to avoid issues escaping '/' in a
// regex literal on some platforms/linters.
// eslint-disable-next-line prefer-regex-literals
const OPS_RE = new RegExp('(?<!\\+)\\+(?!\\+)|[=\\-*/^<>]|\\\\times|\\\\pm|\\\\cdot|\\\\le|\\\\ge|\\\\neq')
// Hyphenated multi-word (like "Quasi-Streaming") should not be treated
// as a math operator. But single-letter-variable hyphens (e.g. "x-y") are
// still math; so only ignore hyphens between multi-letter words.
const HYPHENATED_MULTIWORD_RE = /\b[A-Z]{2,}-[A-Z]{2,}\b/i
const FUNC_CALL_RE = /[A-Z]+\s*\([^)]+\)/i
const WORDS_RE = /\b(?:sin|cos|tan|log|ln|exp|sqrt|frac|sum|lim|int|prod)\b/
// Heuristic to detect common date/time patterns like 2025/9/30 21:37:24 and
// avoid classifying them as math merely because they contain '/' or ':'
const DATE_TIME_RE = /\b\d{4}\/\d{1,2}\/\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?\b/
export function isMathLike(s: string) {
  if (!s)
    return false

  // Normalize accidental control characters that may appear if a single
  // backslash sequence was interpreted in a JS string literal (for example
  // '\\b' becoming a backspace U+0008). Convert such control characters
  // back into their two-character escaped forms so our regexes can match
  // TeX commands reliably.
  // eslint-disable-next-line no-control-regex
  const norm = s.replace(/\u0008/g, '\\b')
  const stripped = norm.trim()

  // quick bailouts
  // If the content looks like a timestamp or date, it's not math.
  if (DATE_TIME_RE.test(stripped))
    return false
  if (stripped.includes('**'))
    return false
  if (stripped.length > 2000)
    return true // very long blocks likely math

  if (/[./]\s*\D|\D\s*[./]/.test(s)) {
    return false
  }

  // TeX commands e.g. \frac, \alpha
  const texCmd = TEX_CMD_RE.test(norm)
  const texCmdWithBraces = TEX_CMD_WITH_BRACES_RE.test(norm)
  const texBraceStart = TEX_BRACE_CMD_START_RE.test(norm)

  // Explicit common TeX tokens (keeps compatibility with previous heuristic)
  const texSpecific = TEX_SPECIFIC_RE.test(norm)
  const subscriptPattern = /(?:^|[^\w\\])(?:[A-Z]|\\[A-Z]+)_(?:\{[^}]+\}|[A-Z0-9\\])/i
  const superscriptPattern = /(?:^|[^\w\\])(?:[A-Z]|\\[A-Z]+)\^(?:\{[^}]+\}|[A-Z0-9\\])/i
  const superSub = subscriptPattern.test(norm) || superscriptPattern.test(norm)
  // common math operator symbols or named commands
  // Ignore operator-like hyphens that are clearly word compound separators
  // (e.g. "Quasi-Streaming"). Keep hyphens for math like "x-y".
  const ops = OPS_RE.test(norm) && !HYPHENATED_MULTIWORD_RE.test(norm)
  // function-like patterns: f(x), sin(x)
  const funcCall = FUNC_CALL_RE.test(norm)
  // common math words
  const words = WORDS_RE.test(norm)
  // 纯单个英文字母也渲染成数学公式（常见变量/元素符号）
  // e.g. (w) (x) (y) (z) 或 $H$, $x$ 等
  const pureWord = /^\([a-z]\)$/i.test(stripped) || /^[a-z]$/i.test(stripped)
  // 简单的化学式/下标：如 H_2O, CO_2, CH_3CH_2OH, CH_3COOH
  // 收紧规则：
  // - 区分大小写（化学元素以大写或大写+小写开头）
  // - 下标/上标通常是数字（可选花括号），避免匹配 get_time 之类的普通下划线单词
  const chemicalLike = /^(?:[A-Z][a-z]?(_\{?\d+\}?|\^\{?\d+\}?)?)+$/.test(stripped)

  return texCmd || texCmdWithBraces || texBraceStart || texSpecific || superSub || ops || funcCall || words || pureWord || chemicalLike
}
