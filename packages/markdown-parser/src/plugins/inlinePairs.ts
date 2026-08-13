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
// while refusing accidental numeric-range cross-pairings:
//
// - the open marker sits between two digits (`26~43年`, `1~2~3`), mirroring
//   the legacy "wave" rule, or
// - the paired content crosses CJK sentence punctuation (`60万~100万元，...`)
//   or chains into another digit-led range (`...工作26~43年`). The guards
//   look at the marker's surrounding structure, so explicit Chinese
//   subscripts with digits (`变量~第2项~`, `H~2号~O`, `x~版本2~`) still
//   pair.
//
// `^sup^`, `==mark==` and `++ins++` intentionally keep the upstream
// markdown-it-sup/mark/ins plugins: their semantics are unchanged.

const UNESCAPE_RE = /\\([ \\!"#$%&'()*+,./:;<=>?@[\]^_`{|}~-])/g

const DIGIT_RE = /\d/u
// CJK sentence punctuation marks a structural boundary: a subscript whose
// content crosses one is an accidental range cross-pairing.
const CJK_SENTENCE_PUNCT_RE = /[，。；、！？：]/u

interface PairScanState {
  pos: number
  posMax: number
  src: string
  push: (type: string, tag?: string, nesting?: number) => Token
  md: {
    inline: {
      skipToken: (state: PairScanState) => number
    }
  }
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
  opts: { refuseDigitRange?: boolean } = {},
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

    // Scan for the closing marker with the same token-aware skipping as
    // upstream markdown-it-sub: escaped characters (`\~`) and inline tokens
    // (code spans) are skipped instead of treated as closers.
    s.pos = start + 1
    let found = false
    while (s.pos < max) {
      if (s.src.charCodeAt(s.pos) === markerCode) {
        found = true
        break
      }
      s.md.inline.skipToken(s)
    }
    if (!found || start + 1 === s.pos) {
      s.pos = start
      return false
    }

    const content = s.src.slice(start + 1, s.pos)
    if (!content) {
      s.pos = start
      return false
    }

    // Keep the upstream "no unescaped space/newline inside" rule.
    if (content.match(/(^|[^\\])(\\\\)*\s/)) {
      s.pos = start
      return false
    }

    // Accidental cross-pairing guards, based on the marker's surrounding
    // structure rather than the content's character class:
    //
    // 1. content crossing CJK sentence punctuation (`60万~100万元，...~`)
    //    is a range cross-pairing — a real subscript never spans it;
    // 2. content ending with a digit while the close marker is directly
    //    followed by another digit (`...工作26~43年`) means the close
    //    marker is itself a range separator chained after the content.
    //
    // Explicit Chinese subscripts with digits (`变量~第2项~`, `H~2号~O`,
    // `x~版本2~`) still pair.
    const closeNext = s.src[s.pos + 1]
    if (CJK_SENTENCE_PUNCT_RE.test(content)) {
      s.pos = start
      return false
    }
    if (
      DIGIT_RE.test(content[content.length - 1])
      && closeNext !== undefined
      && DIGIT_RE.test(closeNext)
    ) {
      s.pos = start
      return false
    }

    const open = s.push(openType, tag, 1)
    open.markup = markup

    const text = s.push('text', '', 0)
    text.content = content.replace(UNESCAPE_RE, '$1')

    const close = s.push(closeType, tag, -1)
    close.markup = markup

    s.pos = s.pos + 1
    return true
  }
}

export function applyInlinePairs(md: MarkdownIt) {
  // `~sub~` — scan-based rule, same registration point as the upstream plugin
  // (after `emphasis`). `^sup^`/`==mark==`/`++ins++` use the upstream plugins.
  const subRule = createScanPairRule('~', '~', 'sub_open', 'sub_close', 'sub', {
    refuseDigitRange: true,
  })

  md.inline.ruler.after('emphasis', 'sub', subRule)
}
