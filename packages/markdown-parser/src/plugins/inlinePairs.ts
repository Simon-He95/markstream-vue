import type { MarkdownIt, Token } from '../markdown-it-types'

// Guarded inline pair rules for `~sub~`, `^sup^`, `==mark==` and `++ins++`.
//
// The upstream markdown-it-sub/sup/mark/ins plugins pair the first marker with
// the *next* marker in the paragraph regardless of distance, as long as there
// is no unescaped space in between. That assumption is safe for
// space-delimited languages, but CJK text has no spaces: a Chinese number
// range like `60万~100万元` pairs with a *later* `~` somewhere else in the
// same paragraph, silently swallowing a long chunk as subscript.
//
// These rules keep the upstream pairing behaviour for legitimate short ASCII
// subscript/superscript/highlight/insert spans while refusing pairs whose
// content is CJK (sub/sup) or contains sentence punctuation (mark/ins), or
// that span more than MAX_PAIR_CONTENT_LEN characters.
//
// For sub specifically we also refuse a pair when the open marker directly
// follows an ASCII digit or a Han character (`26~43年`, `第~1章`), mirroring
// the legacy "wave" guard that the previous fix relied on. Sup keeps that
// freedom so `10^23^` (scientific notation) keeps working.

const MAX_PAIR_CONTENT_LEN = 24

const UNESCAPE_RE = /\\([ \\!"#$%&'()*+,./:;<=>?@[\]^_`{|}~-])/g

const HAN_OR_DIGIT_RE = /[\p{Script=Han}0-9]/u
const HAN_RE = /\p{Script=Han}/u
// Sentence punctuation used to reject accidental mark/ins pairings in CJK
// text (e.g. `价格==5元，其他==6元` must stay plain text).
const SENTENCE_PUNCT_RE = /[，。、；：？！,.;:!?（）()]/u

interface PairScanState {
  pos: number
  posMax: number
  src: string
  push: (type: string, tag?: string, nesting?: number) => Token
}

function isHanOrDigitBefore(state: PairScanState): boolean {
  return state.pos > 0 && HAN_OR_DIGIT_RE.test(state.src[state.pos - 1])
}

function createScanPairRule(
  markerChar: string,
  markup: string,
  openType: string,
  closeType: string,
  tag: string,
  opts: { refuseAfterHanOrDigit?: boolean } = {},
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
    if (opts.refuseAfterHanOrDigit && isHanOrDigitBefore(s))
      return false

    // Scan for a closing marker within a bounded distance.
    let pos = start + 1
    while (pos < max) {
      if (s.src.charCodeAt(pos) === markerCode)
        break
      if (pos - start > MAX_PAIR_CONTENT_LEN)
        return false
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
    if (HAN_RE.test(content))
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

// Delimiter-based rules for `==mark==` / `++ins++`, copied from
// markdown-it-mark / markdown-it-ins so that nested inline markup inside the
// pair keeps working, but with a guard in postProcess that refuses pairings
// whose content is too long or contains sentence punctuation.

interface DelimiterPluginState {
  tokens: Token[]
}

interface PairDelimiter {
  marker: number
  token: number
  end: number
}

function createDelimiterPairPlugin(
  markerCode: number,
  markup: string,
  openType: string,
  closeType: string,
  tag: string,
) {
  const markerChar = String.fromCharCode(markerCode)

  const tokenize = (state: unknown, silent?: boolean) => {
    const s = state as unknown as {
      pos: number
      src: string
      push: (type: string, content: string, nesting?: number) => Token
      delimiters: Array<{
        marker: number
        length: number
        jump: number
        token: number
        end: number
        open: boolean
        close: boolean
      }>
      scanDelims: (pos: number, last?: boolean) => { length: number, can_open: boolean, can_close: boolean }
      tokens: Token[]
    }
    const start = s.pos

    if (silent)
      return false

    if (s.src.charCodeAt(start) !== markerCode)
      return false

    const scanned = s.scanDelims(s.pos, true)
    let len = scanned.length
    const ch = markerChar

    if (len < 2)
      return false

    if (len % 2) {
      const token = s.push('text', '', 0)
      token.content = ch
      len--
    }

    for (let i = 0; i < len; i += 2) {
      const token = s.push('text', '', 0)
      token.content = ch + ch

      if (!scanned.can_open && !scanned.can_close)
        continue

      s.delimiters.push({
        marker: markerCode,
        length: 0, // disable "rule of 3" length checks meant for emphasis
        jump: i / 2, // 1 delimiter = 2 characters
        token: s.tokens.length - 1,
        end: -1,
        open: scanned.can_open,
        close: scanned.can_close,
      })
    }

    s.pos += scanned.length

    return true
  }

  const isPairLegal = (state: unknown, startDelim: PairDelimiter, endDelim: PairDelimiter) => {
    const s = state as DelimiterPluginState

    // Collect the content between the open and close marker tokens.
    let content = ''
    for (let i = startDelim.token + 1; i < endDelim.token; i++) {
      const t = s.tokens[i]
      content += t.content ?? ''
      if (t.type === 'softbreak' || t.type === 'hardbreak')
        return false
    }

    if (!content)
      return false
    if (content.length > MAX_PAIR_CONTENT_LEN)
      return false
    if (SENTENCE_PUNCT_RE.test(content))
      return false
    return true
  }

  const postProcess = (state: unknown, delimiters: PairDelimiter[]) => {
    const s = state as DelimiterPluginState
    const loneMarkers: number[] = []
    const max = delimiters.length

    for (let i = 0; i < max; i++) {
      const startDelim = delimiters[i]

      if (startDelim.marker !== markerCode)
        continue

      if (startDelim.end === -1)
        continue

      const endDelim = delimiters[startDelim.end]

      // Guard: refuse pairings that span too far / contain sentence
      // punctuation / contain line breaks.
      if (!isPairLegal(state, startDelim, endDelim))
        continue

      let token = s.tokens[startDelim.token]
      token.type = openType
      token.tag = tag
      token.nesting = 1
      token.markup = markup
      token.content = ''

      token = s.tokens[endDelim.token]
      token.type = closeType
      token.tag = tag
      token.nesting = -1
      token.markup = markup
      token.content = ''

      if (s.tokens[endDelim.token - 1].type === 'text'
        && s.tokens[endDelim.token - 1].content === markerChar) {
        loneMarkers.push(endDelim.token - 1)
      }
    }

    // If a marker sequence has an odd number of characters, it's split
    // like this: `~~~~~` -> `~` + `~~` + `~~`, leaving one marker at the
    // start of the sequence. Move those markers after subsequent close tags.
    while (loneMarkers.length) {
      const i = loneMarkers.pop()!
      let j = i + 1

      while (j < s.tokens.length && s.tokens[j].type === closeType)
        j++

      j--

      if (i !== j) {
        const token = s.tokens[j]
        s.tokens[j] = s.tokens[i]
        s.tokens[i] = token
      }
    }
  }

  return {
    tokenize,
    postProcess,
  }
}

export function applyInlinePairs(md: MarkdownIt) {
  // `~sub~` / `^sup^` — scan-based rules, same registration points as the
  // upstream plugins (after `emphasis`).
  const subRule = createScanPairRule('~', '~', 'sub_open', 'sub_close', 'sub', {
    refuseAfterHanOrDigit: true,
  })
  const supRule = createScanPairRule('^', '^', 'sup_open', 'sup_close', 'sup')

  md.inline.ruler.after('emphasis', 'sub', subRule)
  md.inline.ruler.after('emphasis', 'sup', supRule)

  // `==mark==` / `++ins++` — delimiter-based rules, same registration points
  // as the upstream plugins (before `emphasis` in both ruler and ruler2).
  const mark = createDelimiterPairPlugin(0x3D, '==', 'mark_open', 'mark_close', 'mark')
  const ins = createDelimiterPairPlugin(0x2B, '++', 'ins_open', 'ins_close', 'ins')

  md.inline.ruler.before('emphasis', 'mark', mark.tokenize)
  md.inline.ruler.before('emphasis', 'ins', ins.tokenize)

  md.inline.ruler2.before('emphasis', 'mark', (state: unknown) => {
    const s = state as unknown as {
      delimiters: PairDelimiter[]
      tokens_meta?: Array<{ delimiters?: PairDelimiter[] } | null>
    }
    mark.postProcess(state, s.delimiters)

    const max = (s.tokens_meta || []).length
    for (let curr = 0; curr < max; curr++) {
      const metaDelimiters = s.tokens_meta?.[curr]?.delimiters
      if (metaDelimiters)
        mark.postProcess(state, metaDelimiters)
    }
  })

  md.inline.ruler2.before('emphasis', 'ins', (state: unknown) => {
    const s = state as unknown as {
      delimiters: PairDelimiter[]
      tokens_meta?: Array<{ delimiters?: PairDelimiter[] } | null>
    }
    ins.postProcess(state, s.delimiters)

    const max = (s.tokens_meta || []).length
    for (let curr = 0; curr < max; curr++) {
      const metaDelimiters = s.tokens_meta?.[curr]?.delimiters
      if (metaDelimiters)
        ins.postProcess(state, metaDelimiters)
    }
  })
}
