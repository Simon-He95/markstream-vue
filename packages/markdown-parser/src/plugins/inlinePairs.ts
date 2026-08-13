import type { MarkdownIt, Token } from '../markdown-it-types'

// Guarded inline pair rule for `~sub~` only.
//
// The upstream markdown-it-sub plugin pairs the first `~` marker with the
// *next* `~` marker in the paragraph regardless of distance, as long as there
// is no unescaped space in between. That assumption is safe for
// space-delimited languages, but CJK text has no spaces: a Chinese number
// range like `60万~100万元` pairs with a *later* `~` somewhere else in the
// same paragraph, silently swallowing a long chunk as subscript.
//
// This rule keeps the upstream pairing behaviour for legitimate subscripts
// while refusing pairs whose content contains CJK characters (`60万~100万元`
// must never become a subscript) or whose open marker sits between two digits
// (`26~43年`, `1~2~3`, mirroring the legacy "wave" rule).
//
// `^sup^`, `==mark==` and `++ins++` intentionally keep the upstream
// markdown-it-sup/mark/ins plugins: their semantics are unchanged.

const UNESCAPE_RE = /\\([ \\!"#$%&'()*+,./:;<=>?@[\]^_`{|}~-])/g

const DIGIT_RE = /\d/u
const HAN_RE = /\p{Script=Han}/u

interface PairScanState {
  pos: number
  posMax: number
  src: string
  push: (type: string, tag?: string, nesting?: number) => Token
}

// `~` surrounded by digits on both sides reads as a numeric range
// (`26~43年`, `1~2~3`), mirroring the legacy wave rule.
function isDigitRangeBefore(state: PairScanState): boolean {
  return state.pos > 0
    && state.pos + 1 < state.posMax
    && DIGIT_RE.test(state.src[state.pos - 1])
    && DIGIT_RE.test(state.src[state.pos + 1])
}

function createScanPairRule(
  markerChar: string,
  markup: string,
  openType: string,
  closeType: string,
  tag: string,
  opts: { refuseDigitRange?: boolean, refuseHanContent?: boolean } = {},
) {
  const markerCode = markerChar.charCodeAt(0)

  return (state: unknown, silent?: boolean) => {
    const s = state as PairScanState
    const max = s.posMax
    const start = s.pos

    if (s.src.charCodeAt(start) !== markerCode)
      return false
    if (silent)
      return false
    if (opts.refuseDigitRange && isDigitRangeBefore(s))
      return false

    // Scan for the closing marker — same unbounded pairing as upstream.
    let pos = start + 1
    while (pos < max) {
      if (s.src.charCodeAt(pos) === markerCode)
        break
      pos++
    }
    if (pos >= max)
      return false

    const content = s.src.slice(start + 1, pos)
    if (!content)
      return false

    // Keep the upstream "no unescaped space/newline inside" rule.
    if (content.match(/(^|[^\\])(\\\\)*\s/))
      return false

    // Refuse CJK content: `60万~100万元` should never become a subscript.
    if (opts.refuseHanContent && HAN_RE.test(content))
      return false

    const open = s.push(openType, tag, 1)
    open.markup = markup

    const text = s.push('text', '', 0)
    text.content = content.replace(UNESCAPE_RE, '$1')

    const close = s.push(closeType, tag, -1)
    close.markup = markup

    s.pos = pos + 1
    return true
  }
}

export function applyInlinePairs(md: MarkdownIt) {
  // `~sub~` — scan-based rule, same registration point as the upstream plugin
  // (after `emphasis`). `^sup^`/`==mark==`/`++ins++` use the upstream plugins.
  const subRule = createScanPairRule('~', '~', 'sub_open', 'sub_close', 'sub', {
    refuseDigitRange: true,
    refuseHanContent: true,
  })

  md.inline.ruler.after('emphasis', 'sub', subRule)
}
