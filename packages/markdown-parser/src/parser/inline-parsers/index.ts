import type { InternalParseOptions, MarkdownToken, ParsedNode, ParseOptions, TextNode } from '../../types'
import { inferLinkifyDemotionContext, isDecodedFromRawPunycode, shouldDemoteFilenameLikeLinkify } from '../linkifyHeuristics'
import { cloneTokenWithMutableChildren } from '../token-copy'
import { parseCheckboxInputToken, parseCheckboxToken } from './checkbox-parser'
import { parseEmojiToken } from './emoji-parser'
import { parseEmphasisToken } from './emphasis-parser'
import { parseFenceToken } from './fence-parser'
import { parseFootnoteRefToken } from './footnote-ref-parser'
import { parseHardbreakToken } from './hardbreak-parser'
import { parseHighlightToken } from './highlight-parser'
import { parseHtmlInlineCodeToken } from './html-inline-code-parser'
import { parseImageToken } from './image-parser'
import { parseInlineCodeToken } from './inline-code-parser'
import { parseInsertToken } from './insert-parser'
import { parseLinkToken } from './link-parser'
import { parseMathInlineToken } from './math-inline-parser'
import { parseReferenceToken } from './reference-parser'
import { parseStrikethroughToken } from './strikethrough-parser'
import { parseStrongToken } from './strong-parser'
import { parseSubscriptToken } from './subscript-parser'
import { parseSuperscriptToken } from './superscript-parser'
import { parseTextToken } from './text-parser'

// Precompiled regexes used frequently in inline parsing
const STRIKETHROUGH_RE = /[^~]*~{2,}[^~]+/
const HAS_STRONG_RE = /\*\*/
const INLINE_REPARSE_MARKER_RE = /[[_*^~]/
const ESCAPED_PUNCTUATION_RE = /\\([\\()[\]`$|*_\-!])/g
const ESCAPABLE_PUNCTUATION = new Set(['\\', '(', ')', '[', ']', '`', '$', '|', '*', '_', '-', '!'])
const WHITESPACE_RE = /\s/u
const ASCII_PUNCTUATION_RE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/
const ASCII_OPENING_PUNCTUATION_RE = /^[([{]$/u
const UNICODE_PUNCTUATION_RE = /\p{P}/u
const CJK_OPENING_PUNCTUATION_RE = /^[《「『【〔〖〘〚〈（［｛“‘﹁﹃﹙﹛﹝]$/u
const CJK_CLOSING_PUNCTUATION_RE = /^[》」』】〕〗〙〛〉）］｝”’﹂﹄﹚﹜﹞]$/u

// Helper: detect likely URLs/hrefs (autolinks). Extracted so the
// detection logic is easy to tweak and test.
const AUTOLINK_PROTOCOL_RE = /^(?:https?:\/\/|mailto:|ftp:\/\/)/i
const AUTOLINK_GENERIC_RE = /:\/\//
const INLINE_TEXT_MARKER_BACKSLASH = 1
const INLINE_TEXT_MARKER_ASTERISK = 2
const INLINE_TEXT_MARKER_UNDERSCORE = 4
const INLINE_TEXT_MARKER_TILDE = 8
const INLINE_TEXT_MARKER_BACKTICK = 16
const INLINE_TEXT_MARKER_OPEN_BRACKET = 32
const INLINE_TEXT_MARKER_CLOSE_BRACKET = 64
const INLINE_TEXT_MARKER_BANG = 128
const INLINE_TEXT_MARKER_DOLLAR = 256
const INLINE_TEXT_MARKER_PIPE = 512
const INLINE_TEXT_MARKER_OPEN_PAREN = 1024
const INLINE_CANDIDATE_MARKERS = INLINE_TEXT_MARKER_ASTERISK
  | INLINE_TEXT_MARKER_UNDERSCORE
  | INLINE_TEXT_MARKER_TILDE
  | INLINE_TEXT_MARKER_BACKTICK
  | INLINE_TEXT_MARKER_OPEN_BRACKET
  | INLINE_TEXT_MARKER_BANG
  | INLINE_TEXT_MARKER_DOLLAR
  | INLINE_TEXT_MARKER_PIPE
  | INLINE_TEXT_MARKER_OPEN_PAREN

function getInlineTextMarkerFlags(content: string) {
  let flags = 0
  for (let index = 0; index < content.length; index++) {
    switch (content.charCodeAt(index)) {
      case 33:
        flags |= INLINE_TEXT_MARKER_BANG
        break
      case 36:
        flags |= INLINE_TEXT_MARKER_DOLLAR
        break
      case 40:
        flags |= INLINE_TEXT_MARKER_OPEN_PAREN
        break
      case 42:
        flags |= INLINE_TEXT_MARKER_ASTERISK
        break
      case 91:
        flags |= INLINE_TEXT_MARKER_OPEN_BRACKET
        break
      case 92:
        flags |= INLINE_TEXT_MARKER_BACKSLASH
        break
      case 93:
        flags |= INLINE_TEXT_MARKER_CLOSE_BRACKET
        break
      case 95:
        flags |= INLINE_TEXT_MARKER_UNDERSCORE
        break
      case 96:
        flags |= INLINE_TEXT_MARKER_BACKTICK
        break
      case 124:
        flags |= INLINE_TEXT_MARKER_PIPE
        break
      case 126:
        flags |= INLINE_TEXT_MARKER_TILDE
        break
    }
  }
  return flags
}

function countUnescapedAsterisks(str: string): number {
  let count = 0
  let i = 0
  while (i < str.length) {
    if (str[i] === '\\' && i + 1 < str.length && str[i + 1] === '*') {
      i += 2 // skip escaped asterisk
      continue
    }
    if (str[i] === '*')
      count++
    i++
  }
  return count
}

function findNextUnescapedAsterisk(rawContent: string | undefined, startContentIndex = 0): number {
  if (!rawContent)
    return -1

  let contentIndex = 0

  for (let rawIndex = 0; rawIndex < rawContent.length; rawIndex++) {
    const char = rawContent[rawIndex]
    const nextChar = rawContent[rawIndex + 1]

    if (char === '\\' && nextChar && ESCAPABLE_PUNCTUATION.has(nextChar)) {
      if (nextChar === '*' && contentIndex >= startContentIndex) {
        contentIndex++
        rawIndex++
        continue
      }

      contentIndex++
      rawIndex++
      continue
    }

    if (char === '*' && contentIndex >= startContentIndex)
      return contentIndex

    contentIndex++
  }

  return -1
}

function isWhitespaceChar(ch?: string) {
  return !!ch && WHITESPACE_RE.test(ch)
}

function isPunctuationChar(ch?: string) {
  return !!ch && (ASCII_PUNCTUATION_RE.test(ch) || UNICODE_PUNCTUATION_RE.test(ch))
}

function getPreviousCodePoint(content: string, index: number) {
  if (index <= 0)
    return undefined

  const previousIndex = index - 1
  const codePoint = content.charCodeAt(previousIndex)
  const codePointIndex = codePoint >= 0xDC00 && codePoint <= 0xDFFF ? previousIndex - 1 : previousIndex
  const value = content.codePointAt(codePointIndex)
  return value === undefined ? undefined : String.fromCodePoint(value)
}

function getNextCodePoint(content: string, index: number) {
  const value = content.codePointAt(index)
  return value === undefined ? undefined : String.fromCodePoint(value)
}

function isCjkOpeningPunctuation(ch?: string, previous?: string) {
  return !!ch
    && !!previous
    && /^\p{Script=Han}$/u.test(previous)
    && CJK_OPENING_PUNCTUATION_RE.test(ch)
}

function isCjkClosingPunctuation(ch?: string, next?: string) {
  return !!ch
    && !!next
    && /^\p{Script=Han}$/u.test(next)
    && CJK_CLOSING_PUNCTUATION_RE.test(ch)
}

function allowsPunctuationAsOpener(ch?: string, previous?: string) {
  return isCjkOpeningPunctuation(ch, previous)
    || (!!previous && isPunctuationChar(previous) && !!ch && ASCII_OPENING_PUNCTUATION_RE.test(ch))
}

function isEmphasisOpenDelimiter(content: string, index: number) {
  const prev = getPreviousCodePoint(content, index)
  const next = getNextCodePoint(content, index + 1)

  if (!next || isWhitespaceChar(next))
    return false

  if (!isPunctuationChar(next))
    return true
  if (allowsPunctuationAsOpener(next, prev))
    return true
  return !prev || isWhitespaceChar(prev)
}

function isEmphasisCloseDelimiter(content: string, index: number) {
  const prev = getPreviousCodePoint(content, index)
  const next = getNextCodePoint(content, index + 1)

  if (!prev || isWhitespaceChar(prev))
    return false

  return !(isPunctuationChar(prev) && !isCjkClosingPunctuation(prev, next) && !!next && !isWhitespaceChar(next) && !isPunctuationChar(next))
}

function findNextUnescapedEmphasisClose(
  rawContent: string | undefined,
  content: string,
  startContentIndex = 0,
) {
  let searchIndex = startContentIndex
  let sawInvalidClose = false

  while (searchIndex < content.length) {
    const closeIndex = rawContent
      ? findNextUnescapedAsterisk(rawContent, searchIndex)
      : content.indexOf('*', searchIndex)

    if (closeIndex === -1)
      break

    if (isEmphasisCloseDelimiter(content, closeIndex))
      return { index: closeIndex, sawInvalidClose }

    sawInvalidClose = true
    searchIndex = closeIndex + 1
  }

  return { index: -1, sawInvalidClose }
}

function isStrongOpenDelimiter(content: string, index: number) {
  const prev = getPreviousCodePoint(content, index)
  const next = getNextCodePoint(content, index + 2)

  if (!next || isWhitespaceChar(next))
    return false

  if (!isPunctuationChar(next))
    return true
  if (allowsPunctuationAsOpener(next, prev))
    return true
  return !prev || isWhitespaceChar(prev)
}

function isStrongCloseDelimiter(content: string, index: number) {
  const prev = getPreviousCodePoint(content, index)
  const next = getNextCodePoint(content, index + 2)

  if (!prev || isWhitespaceChar(prev))
    return false

  return !(isPunctuationChar(prev) && !isCjkClosingPunctuation(prev, next) && !!next && !isWhitespaceChar(next) && !isPunctuationChar(next))
}

function findNextStrongClose(content: string, startContentIndex = 0) {
  let searchIndex = startContentIndex
  let sawInvalidClose = false

  while (searchIndex < content.length) {
    const closeIndex = content.indexOf('**', searchIndex)
    if (closeIndex === -1)
      break

    if (isStrongCloseDelimiter(content, closeIndex))
      return { index: closeIndex, sawInvalidClose }

    sawInvalidClose = true
    searchIndex = closeIndex + 2
  }

  return { index: -1, sawInvalidClose }
}

function decodeVisibleTextFromRaw(rawText: string) {
  let output = ''
  let index = 0

  while (index < rawText.length) {
    if (rawText[index] !== '\\') {
      output += rawText[index]
      index++
      continue
    }

    let slashCount = 0
    while (index + slashCount < rawText.length && rawText[index + slashCount] === '\\')
      slashCount++

    const nextChar = rawText[index + slashCount]
    output += '\\'.repeat(Math.floor(slashCount / 2))

    if (slashCount % 2 === 1) {
      if (nextChar && ESCAPABLE_PUNCTUATION.has(nextChar)) {
        output += nextChar
        index += slashCount + 1
        continue
      }

      output += '\\'
    }

    index += slashCount
  }

  return output
}

function getRawIndexForVisibleIndex(rawText: string, visibleIndex: number) {
  let outputIndex = 0

  for (let rawIndex = 0; rawIndex < rawText.length; rawIndex++) {
    const char = rawText[rawIndex]
    const nextChar = rawText[rawIndex + 1]

    if (char === '\\' && nextChar && ESCAPABLE_PUNCTUATION.has(nextChar)) {
      if (outputIndex === visibleIndex)
        return rawIndex + 1
      outputIndex++
      rawIndex++
      continue
    }

    if (outputIndex === visibleIndex)
      return rawIndex

    outputIndex++
  }

  return -1
}

function isEscapedVisibleChar(rawText: string, visibleIndex: number, expectedChar?: string) {
  const rawIndex = getRawIndexForVisibleIndex(rawText, visibleIndex)
  if (rawIndex === -1)
    return false
  if (expectedChar && rawText[rawIndex] !== expectedChar)
    return false

  let slashCount = 0
  for (let i = rawIndex - 1; i >= 0 && rawText[i] === '\\'; i--)
    slashCount++

  return slashCount % 2 === 1
}

const WORD_CHAR_RE = /[\p{L}\p{N}]/u
const WORD_ONLY_RE = /^[\p{L}\p{N}]+$/u

function isWordChar(ch?: string) {
  if (!ch)
    return false
  return WORD_CHAR_RE.test(ch)
}

function isWordOnly(text: string) {
  if (!text)
    return false
  return WORD_ONLY_RE.test(text)
}

function getAsteriskRunInfo(content: string, start: number) {
  let end = start
  while (end < content.length && content[end] === '*')
    end++
  const prev = getPreviousCodePoint(content, start)
  const next = getNextCodePoint(content, end)
  return {
    len: end - start,
    prev,
    next,
    intraword: isWordChar(prev) && isWordChar(next),
  }
}

function findLiteralIntrawordAsteriskRunPairEnd(content: string) {
  const runs: Array<{ start: number, end: number }> = []

  for (let index = 0; index < content.length;) {
    if (content[index] !== '*') {
      index++
      continue
    }

    const info = getAsteriskRunInfo(content, index)
    const end = index + info.len
    if (info.len >= 2 && info.intraword)
      runs.push({ start: index, end })
    index = end
  }

  for (let index = 0; index < runs.length - 1; index++) {
    const current = runs[index]
    const next = runs[index + 1]
    const inner = content.slice(current.end, next.start)
    if (!isWordOnly(inner))
      return next.end
  }

  return -1
}

function isTripleAsteriskInnerText(text: string) {
  return !!text && text.trim() === text && /^[\p{L}\p{N}\s]+$/u.test(text)
}

function findTripleAsteriskClose(content: string, start: number) {
  let searchIndex = start

  while (searchIndex < content.length) {
    const index = content.indexOf('***', searchIndex)
    if (index === -1)
      return -1

    const info = getAsteriskRunInfo(content, index)
    if (info.len >= 3)
      return index

    searchIndex = index + info.len
  }

  return -1
}

export function isLikelyUrl(href?: string) {
  if (!href)
    return false
  return AUTOLINK_PROTOCOL_RE.test(href) || AUTOLINK_GENERIC_RE.test(href)
}

function recoverTrailingMarkdownLinkLabel(raw?: string, href?: string) {
  if (!raw || !href)
    return null

  const match = raw.match(/\[([^\]\n]+)\]\(([^)]*)$/)
  if (!match)
    return null

  return match[2] === href ? match[1] : null
}

function hasInvalidStrongCandidate(content: string) {
  const visibleContent = decodeVisibleTextFromRaw(content)
  let index = visibleContent.indexOf('**')
  while (index !== -1) {
    if (!isEscapedVisibleChar(content, index, '*')
      && !isEscapedVisibleChar(content, index + 1, '*')
      && !isStrongOpenDelimiter(visibleContent, index)) {
      return true
    }
    index = visibleContent.indexOf('**', index + 2)
  }
  return false
}

function getRawPrefixForVisibleText(raw: string, content: string) {
  if (!content)
    return ''

  const rawIndex = getRawIndexForVisibleIndex(raw, content.length - 1)
  if (rawIndex === -1)
    return null

  const prefix = raw.slice(0, rawIndex + 1)
  return decodeVisibleTextFromRaw(prefix) === content ? prefix : null
}

function getRawSuffixForVisibleText(raw: string, content: string) {
  if (!content)
    return ''

  const directIndex = raw.lastIndexOf(content)
  if (directIndex !== -1) {
    const suffix = raw.slice(directIndex)
    if (decodeVisibleTextFromRaw(suffix) === content)
      return suffix
  }

  for (let index = raw.length - 1; index >= 0; index--) {
    const suffix = raw.slice(index)
    if (decodeVisibleTextFromRaw(suffix) === content)
      return suffix
  }
  return null
}

function repairCollapsedStrongTokens(tokens: MarkdownToken[], raw?: string) {
  if (!raw || tokens.length < 3)
    return null
  if (!tokens.some(token => token.type === 'strong_open') || !tokens.some(token => token.type === 'strong_close'))
    return null
  if (tokens.length !== 5
    || tokens[0]?.type !== 'text'
    || tokens[1]?.type !== 'strong_open'
    || tokens[2]?.type !== 'text'
    || tokens[3]?.type !== 'strong_close'
    || tokens[4]?.type !== 'text') {
    return null
  }

  const previous = tokens[0]
  const previousContent = String(previous.content ?? '')
  const previousRaw = getRawPrefixForVisibleText(raw, previousContent)
  if (!previousRaw || !hasInvalidStrongCandidate(previousRaw))
    return null

  return [{
    ...tokens[0],
    type: 'text',
    content: raw,
    raw,
  } as MarkdownToken]
}

function repairStrongAroundInlineLink(tokens: MarkdownToken[], raw?: string) {
  if (!raw || tokens.length < 3)
    return null
  const first = tokens[0]
  const last = tokens[tokens.length - 1]
  if (first?.type !== 'text' || last?.type !== 'text')
    return null

  const prefix = String(first.content ?? '')
  const suffix = String(last.content ?? '')
  if (!prefix.endsWith('**') || !suffix.startsWith('**'))
    return null

  const previous = getPreviousCodePoint(prefix, prefix.length - 2)
  const canOpen = !previous || isWhitespaceChar(previous) || isPunctuationChar(previous)

  const rawPrefix = getRawPrefixForVisibleText(raw, prefix)
  const rawSuffix = getRawSuffixForVisibleText(raw, suffix)
  if (!rawPrefix || !rawSuffix)
    return null
  const hasEscapedMarker = isEscapedVisibleChar(rawPrefix, prefix.length - 2, '*')
    || isEscapedVisibleChar(rawPrefix, prefix.length - 1, '*')
    || isEscapedVisibleChar(rawSuffix, 0, '*')
    || isEscapedVisibleChar(rawSuffix, 1, '*')

  const nextAfterClose = getNextCodePoint(suffix, 2)
  const canClose = !nextAfterClose || isWhitespaceChar(nextAfterClose) || isPunctuationChar(nextAfterClose)

  const middle = tokens.slice(1, -1)
  const isSyntheticLink = middle.length === 1 && middle[0]?.type === 'link'
  if (!isSyntheticLink)
    return null

  const innerTokens = middle.map((token) => {
    if (token.type !== 'link' || token.content != null)
      return token

    const linkToken = token as MarkdownToken & { href?: unknown, text?: unknown }
    return {
      ...token,
      content: String(token.raw ?? `[${linkToken.text ?? ''}](${linkToken.href ?? ''})`),
    }
  })

  if (!canOpen || !canClose || hasEscapedMarker) {
    const literalTokens: MarkdownToken[] = []
    if (prefix)
      literalTokens.push({ ...first, type: 'text_special', content: prefix, raw: prefix })
    literalTokens.push(...innerTokens)
    if (suffix)
      literalTokens.push({ ...last, type: 'text_special', content: suffix, raw: suffix })
    return literalTokens
  }

  const normalized: MarkdownToken[] = []
  const textBefore = prefix.slice(0, -2)
  const textAfter = suffix.slice(2)
  if (textBefore)
    normalized.push({ ...first, content: textBefore, raw: textBefore })
  normalized.push({ type: 'strong_open', tag: 'strong', content: '', markup: '**', nesting: 1 } as MarkdownToken)
  normalized.push(...innerTokens)
  normalized.push({ type: 'strong_close', tag: 'strong', content: '', markup: '**', nesting: -1 } as MarkdownToken)
  if (textAfter)
    normalized.push({ ...last, content: textAfter, raw: textAfter })
  return normalized
}

// Process inline tokens (for text inside paragraphs, headings, etc.)
export function parseInlineTokens(
  tokens: MarkdownToken[],
  raw?: string,
  pPreToken?: MarkdownToken,
  options?: ParseOptions,
): ParsedNode[] {
  if (!tokens || tokens.length === 0)
    return []

  const repairedTokens = repairStrongAroundInlineLink(tokens, raw) ?? repairCollapsedStrongTokens(tokens, raw)
  if (repairedTokens)
    return parseInlineTokens(repairedTokens, raw, pPreToken, options)

  const inheritedContext = (options as InternalParseOptions | undefined)?.__linkifyDemotionContext
  const inferredContext = inferLinkifyDemotionContext(raw)
  const linkifyDemotionContext = {
    filename: inheritedContext?.filename || inferredContext.filename,
    explicitFilename: inheritedContext?.explicitFilename || inferredContext.explicitFilename,
    marketTicker: inheritedContext?.marketTicker || inferredContext.marketTicker,
  }
  if (linkifyDemotionContext.filename || linkifyDemotionContext.explicitFilename || linkifyDemotionContext.marketTicker) {
    options = {
      ...options,
      __linkifyDemotionContext: linkifyDemotionContext,
    } as InternalParseOptions
  }

  const internalOptions = options as InternalParseOptions | undefined
  const result: ParsedNode[] = []
  let currentTextNode: TextNode | null = null

  let i = 0
  // Default to strict matching for strong unless caller explicitly sets false
  const requireClosingStrong = options?.requireClosingStrong
  const originalTokens = tokens

  function ensureWorkingTokens() {
    if (tokens === originalTokens)
      tokens = tokens.slice()
    return tokens
  }

  // Helpers to manage text node merging and pushing parsed nodes
  function resetCurrentTextNode() {
    currentTextNode = null
  }

  function handleEmphasisAndStrikethrough(content: string, token: MarkdownToken): boolean {
    const rawSource = tokens.length === 1 ? raw : String(token.content ?? '')
    const markerCandidates: Array<{ type: 'strong' | 'emphasis' | 'strikethrough', index: number }> = []
    const literalIntrawordRunPairEnd = findLiteralIntrawordAsteriskRunPairEnd(content)
    if (literalIntrawordRunPairEnd !== -1) {
      pushText(content.slice(0, literalIntrawordRunPairEnd), content.slice(0, literalIntrawordRunPairEnd))
      const afterContent = content.slice(literalIntrawordRunPairEnd)
      if (afterContent) {
        handleToken({ type: 'text', content: afterContent, raw: afterContent } as unknown as MarkdownToken)
        i--
      }
      i++
      return true
    }

    if (STRIKETHROUGH_RE.test(content)) {
      const idx = content.indexOf('~~')
      if (idx !== -1)
        markerCandidates.push({ type: 'strikethrough', index: idx })
    }

    if (HAS_STRONG_RE.test(content)) {
      const idx = content.indexOf('**')
      if (idx !== -1)
        markerCandidates.push({ type: 'strong', index: idx })
    }

    if (/[^*]*\*[^*]+/.test(content)) {
      const idx = rawSource
        ? findNextUnescapedAsterisk(rawSource, 0)
        : content.indexOf('*')
      if (rawSource && idx === -1)
        return false
      if (idx !== -1)
        markerCandidates.push({ type: 'emphasis', index: idx })
    }

    markerCandidates.sort((a, b) => {
      if (a.index !== b.index)
        return a.index - b.index

      if (a.type === b.type)
        return 0

      // Prefer `**` over `*` when both point at the same run.
      if (a.type === 'strong')
        return -1
      if (b.type === 'strong')
        return 1
      return 0
    })

    const nextMarker = markerCandidates[0]
    if (!nextMarker)
      return false

    // strikethrough (~~)
    if (nextMarker.type === 'strikethrough') {
      const idx = nextMarker.index
      const beforeText = idx > -1 ? content.slice(0, idx) : ''
      if (beforeText)
        pushText(beforeText, beforeText)

      if (idx === -1) {
        i++
        return true
      }

      const closeIdx = content.indexOf('~~', idx + 2)
      const inner = closeIdx === -1 ? content.slice(idx + 2) : content.slice(idx + 2, closeIdx)
      const after = closeIdx === -1 ? '' : content.slice(closeIdx + 2)

      const { node } = parseStrikethroughToken([
        { type: 's_open', tag: 's', content: '', markup: '~~', info: '', meta: null },
        { type: 'text', tag: '', content: inner, markup: '', info: '', meta: null },
        { type: 's_close', tag: 's', content: '', markup: '~~', info: '', meta: null },
      ], 0, options)

      resetCurrentTextNode()
      pushNode(node)

      if (after) {
        handleToken({
          type: 'text',
          content: after,
          raw: after,
        })
        i--
      }

      i++
      return true
    }

    // strong (**)
    // Note: markdown-it may sometimes leave `**...**` as a plain text token
    // (e.g. when wrapping inline HTML like `<font>...</font>`). In that case,
    // we still want to recognize and parse the first strong pair.
    if (nextMarker.type === 'strong') {
      const openIdx = nextMarker.index
      const beforeText = openIdx > -1 ? content.slice(0, openIdx) : ''
      if (beforeText) {
        pushText(beforeText, beforeText)
      }

      if (openIdx === -1) {
        i++
        return true
      }

      // Check if the leading ** are from escaped asterisks
      // by checking if the raw markdown has \* at the corresponding position
      if (raw && openIdx === 0) {
        // Find where this content would start in raw
        // We need to check if the position in raw has \*
        let rawHasEscapedAsteriskAtStart = false
        let asteriskCount = 0
        // Count how many asterisks are at the start of content
        while (asteriskCount < content.length && content[asteriskCount] === '*') {
          asteriskCount++
        }
        // Check if raw has \* at the beginning (accounting for escaped backslashes)
        if (raw.startsWith('\\*')) {
          rawHasEscapedAsteriskAtStart = true
        }

        // If raw starts with escaped asterisks, don't parse as strong
        if (rawHasEscapedAsteriskAtStart) {
          // Check if all asterisks in content prefix are escaped in raw
          let escapedCount = 0
          let j = 0
          while (j < raw.length && escapedCount < asteriskCount) {
            if (raw[j] === '\\' && j + 1 < raw.length && raw[j + 1] === '*') {
              escapedCount += 1
              j += 2
            }
            else if (raw[j] === '*') {
              // Found unescaped asterisk, stop checking
              break
            }
            else {
              j++
            }
          }
          // If all leading asterisks in content are escaped in raw, treat as text
          if (escapedCount >= 2) {
            pushText(content, content)
            i++
            return true
          }
        }
      }

      // Fallback check: count asterisks in content vs unescaped asterisks in raw
      // This handles cases like `需方：\*\*\*\*\*\*有限公司`
      if (raw) {
        const contentAsteriskCount = (content.match(/\*/g) || []).length
        const rawAsteriskCount = countUnescapedAsterisks(raw)
        if (contentAsteriskCount > rawAsteriskCount) {
          pushText(content.slice(beforeText.length), content.slice(beforeText.length))
          i++
          return true
        }
      }

      const runInfo = getAsteriskRunInfo(content, openIdx)
      if (runInfo.len >= 3) {
        const closeIndex = findTripleAsteriskClose(content, openIdx + runInfo.len)
        if (closeIndex !== -1) {
          const inner = content.slice(openIdx + runInfo.len, closeIndex)
          if (isTripleAsteriskInnerText(inner)) {
            const { node } = parseStrongToken([
              { type: 'strong_open', tag: 'strong', content: '', markup: '**', info: '', meta: null },
              { type: 'em_open', tag: 'em', content: '', markup: '*', info: '', meta: null },
              { type: 'text', tag: '', content: inner, markup: '', info: '', meta: null },
              { type: 'em_close', tag: 'em', content: '', markup: '*', info: '', meta: null },
              { type: 'strong_close', tag: 'strong', content: '', markup: '**', info: '', meta: null },
            ], 0, raw, options)

            resetCurrentTextNode()
            pushNode(node)

            const afterContent = content.slice(closeIndex + 3)
            if (afterContent) {
              handleToken({ type: 'text', content: afterContent, raw: afterContent } as unknown as MarkdownToken)
              i--
            }

            i++
            return true
          }
        }
      }
      if (!isStrongOpenDelimiter(content, openIdx)) {
        const literalRun = content.slice(openIdx, openIdx + runInfo.len)
        pushText(literalRun, literalRun)
        const afterContent = content.slice(openIdx + runInfo.len)
        if (afterContent) {
          handleToken({ type: 'text', content: afterContent, raw: afterContent } as unknown as MarkdownToken)
          i--
        }
        i++
        return true
      }

      const close = findNextStrongClose(content, openIdx + 2)
      let inner = ''
      let after = ''
      if (close.index !== -1) {
        inner = content.slice(openIdx + 2, close.index)
        after = content.slice(close.index + 2)
        const closeIdx = close.index
        const closeRunInfo = getAsteriskRunInfo(content, closeIdx)
        if (
          runInfo.intraword
          && closeRunInfo.intraword
          && !isWordOnly(inner)
        ) {
          pushText(content.slice(beforeText.length), content.slice(beforeText.length))
          i++
          return true
        }
        if (!inner && runInfo.len >= 4 && runInfo.intraword) {
          pushText(content.slice(beforeText.length), content.slice(beforeText.length))
          i++
          return true
        }
      }
      else {
        // no closing pair found: decide behavior based on strict option
        if (requireClosingStrong || close.sawInvalidClose) {
          pushText(content.slice(beforeText.length), content.slice(beforeText.length))
          i++
          return true
        }
        if (runInfo.intraword) {
          pushText(content.slice(beforeText.length), content.slice(beforeText.length))
          i++
          return true
        }
        // 非严格模式（原行为）：mid-state, take rest as inner
        inner = content.slice(openIdx + 2)
        after = ''
      }

      // Special case: if the matched strong is empty (e.g., `****`) and the
      // remaining content is also just asterisks, treat the entire thing as text
      // to avoid creating empty strong nodes from escaped asterisks.
      if (!inner && /^\*+$/.test(after)) {
        // The entire content is just asterisks, treat as text
        pushText(content, content)
        i++
        return true
      }

      const { node } = parseStrongToken([
        { type: 'strong_open', tag: 'strong', content: '', markup: '**', info: '', meta: null },
        { type: 'text', tag: '', content: inner, markup: '', info: '', meta: null },
        { type: 'strong_close', tag: 'strong', content: '', markup: '**', info: '', meta: null },
      ], 0, raw, options)

      resetCurrentTextNode()
      pushNode(node)

      if (after) {
        handleToken({
          type: 'text',
          content: after,
          raw: after,
        })
        i--
      }

      i++
      return true
    }

    // emphasis (*)
    if (nextMarker.type === 'emphasis') {
      let idx = nextMarker.index
      if (idx === -1)
        idx = 0
      const _text = content.slice(0, idx)
      if (_text) {
        pushText(_text, _text)
      }
      if (!isEmphasisOpenDelimiter(content, idx)) {
        pushText(content[idx], content[idx])
        const afterContent = content.slice(idx + 1)
        if (afterContent) {
          handleToken({ type: 'text', content: afterContent, raw: afterContent } as unknown as MarkdownToken)
          i--
        }
        i++
        return true
      }
      const runInfo = getAsteriskRunInfo(content, idx)
      const close = findNextUnescapedEmphasisClose(rawSource, content, idx + 1)
      const closeIndex = close.index
      const nextInlineToken = tokens[i + 1]
      if (
        options?.final
        && nextInlineToken?.type === 'em_open'
        && closeIndex !== -1
        && content.slice(idx + 1, closeIndex).trim() !== content.slice(idx + 1, closeIndex)
      ) {
        pushText(content.slice(idx), content.slice(idx))
        i++
        return true
      }
      if (closeIndex === -1 && (close.sawInvalidClose || options?.final || runInfo.intraword || !isWordChar(content[idx + 1]))) {
        pushText(content.slice(idx), content.slice(idx))
        i++
        return true
      }
      const emphasisContent = closeIndex > -1
        ? content.slice(idx + 1, closeIndex)
        : content.slice(idx + 1)
      const { node } = parseEmphasisToken([
        { type: 'em_open', tag: 'em', content: '', markup: '*', info: '', meta: null },
        { type: 'text', tag: '', content: emphasisContent, markup: '', info: '', meta: null },
        { type: 'em_close', tag: 'em', content: '', markup: '*', info: '', meta: null },
      ], 0, options)

      resetCurrentTextNode()
      pushNode(node)

      if (closeIndex !== -1 && closeIndex < content.length - 1) {
        const afterContent = content.slice(closeIndex + 1)
        if (afterContent) {
          handleToken({ type: 'text', content: afterContent, raw: afterContent } as unknown as MarkdownToken)
          i--
        }
      }
      i++
      return true
    }

    return false
  }

  function handleInlineCodeContent(content: string, _token: MarkdownToken): boolean {
    // Need at least one backtick to consider inline code
    if (!content.includes('`'))
      return false

    const findFirstUnescapedBacktick = (src: string) => {
      for (let idx = 0; idx < src.length; idx++) {
        if (src[idx] !== '`')
          continue
        let slashCount = 0
        for (let j = idx - 1; j >= 0 && src[j] === '\\'; j--)
          slashCount++
        if (slashCount % 2 === 0)
          return idx
      }
      return -1
    }

    const codeStart = findFirstUnescapedBacktick(content)
    if (codeStart === -1)
      return false
    // Determine the length of the opening backtick run (supports ``code``)
    let runLen = 1
    for (let k = codeStart + 1; k < content.length && content[k] === '`'; k++)
      runLen++

    // Find a matching closing run of the same length
    const closingSeq = '`'.repeat(runLen)
    const searchFrom = codeStart + runLen
    const codeEnd = content.indexOf(closingSeq, searchFrom)

    // If no matching closing run is found within this token stream, treat as mid-state.
    if (codeEnd === -1) {
      // Mid-state handling: for single backtick, emit an inline_code node so
      // editors can style it while typing; for multi-backtick runs, keep it as
      // plain text to avoid over-eager code spans.
      if (runLen === 1) {
        // beforeText 可能包含 strong/emphasis，需要递归处理
        const beforeText = content.slice(0, codeStart)
        const codeContent = content.slice(codeStart + 1)
        if (beforeText) {
          const handled = handleEmphasisAndStrikethrough(beforeText, _token)
          if (!handled)
            pushText(beforeText, beforeText)
          else
            i--
        }

        pushParsed({ type: 'inline_code', code: codeContent, raw: String(codeContent) } as ParsedNode)
        i++
        return true
      }

      // For `` or longer mid-states, treat as text fallback (non-recursive)
      let merged = content
      for (let j = i + 1; j < tokens.length; j++)
        merged += String((tokens[j].content ?? '') + (tokens[j].markup ?? ''))
      i = tokens.length - 1
      pushText(merged, merged)
      i++
      return true
    }

    // Close the current text node and handle the text before the code span
    resetCurrentTextNode()
    const beforeText = content.slice(0, codeStart)
    const codeContent = content.slice(codeStart + runLen, codeEnd)
    const after = content.slice(codeEnd + runLen)

    if (beforeText) {
      // Try to parse emphasis/strong inside the pre-code fragment, without
      // advancing the outer token index `i` permanently.
      const handled = handleEmphasisAndStrikethrough(beforeText, _token)
      if (!handled)
        pushText(beforeText, beforeText)
      else
        i--
    }

    pushParsed({
      type: 'inline_code',
      code: codeContent,
      raw: String(codeContent ?? ''),
    } as ParsedNode)

    if (after) {
      handleToken({ type: 'text', content: after, raw: after } as unknown as MarkdownToken)
      i--
    }
    i++
    return true
  }

  function tryReparseCollapsedInlineText(rawContent: string): ParsedNode[] | null {
    const md = internalOptions?.__markdownIt
    if (!md)
      return null
    if (tokens.length <= 1 || !tokens.some(token => token?.type === 'math_inline'))
      return null
    if (!INLINE_REPARSE_MARKER_RE.test(rawContent))
      return null

    const reparsed = md.parseInline(rawContent, { __markstreamFinal: !!options?.final }) as unknown as MarkdownToken[]
    if (!Array.isArray(reparsed) || reparsed.length === 0)
      return null

    const inlineToken = reparsed.find(token => token?.type === 'inline')
    const children = (inlineToken?.children ?? [])
      .filter(child => !(child?.type === 'text' && String(child.content ?? '') === ''))

    if (!children.length)
      return null
    if (!children.some(child => child?.type !== 'text'))
      return null
    if (children.length === 1 && children[0]?.type === 'text' && String(children[0].content ?? '') === rawContent)
      return null

    const reparsedNodes = parseInlineTokens(children, rawContent, pPreToken, options)
    return reparsedNodes.length ? reparsedNodes : null
  }

  function pushParsed(node: ParsedNode) {
    // ensure the ongoing text node is closed when pushing non-text nodes
    resetCurrentTextNode()
    result.push(node)
  }

  function pushToken(token: MarkdownToken) {
    // push a raw token into result as a ParsedNode (best effort cast)
    resetCurrentTextNode()
    const node = cloneTokenWithMutableChildren(token) as unknown as ParsedNode
    result.push(node)
  }

  // backward-compatible alias used by existing call sites that pass parsed nodes
  function pushNode(node: ParsedNode) {
    pushParsed(node)
  }

  function pushText(content: string, raw?: string) {
    if (currentTextNode) {
      currentTextNode.content += content
      currentTextNode.raw += raw ?? content
    }
    else {
      currentTextNode = {
        type: 'text',
        content: String(content ?? ''),
        raw: String(raw ?? content ?? ''),
      } as TextNode
      result.push(currentTextNode)
    }
  }

  function pushInlineTextContent(content: string, token: MarkdownToken) {
    if (!content)
      return

    const parsed = parseInlineTokens([
      { ...token, type: 'text', content, raw: content } as MarkdownToken,
    ], content, pPreToken, options)

    if (parsed.length === 1 && parsed[0]?.type === 'text') {
      const text = parsed[0] as TextNode
      pushText(String(text.content ?? ''), String(text.raw ?? text.content ?? ''))
      return
    }

    for (const node of parsed)
      pushNode(node)
  }

  function hasEscapedMarkup(token: MarkdownToken, escapedPrefix: string) {
    return String(token.markup ?? '').startsWith(escapedPrefix)
  }

  function stripTrailingLoadingParenMathOpener(token: MarkdownToken) {
    if (!currentTextNode || token.loading !== true || token.markup !== '\\(\\)')
      return

    const previousToken = tokens[i - 1]
    if (!previousToken || previousToken.type !== 'text' || !hasEscapedMarkup(previousToken, '\\('))
      return

    if (!currentTextNode.content.endsWith('('))
      return

    currentTextNode.content = currentTextNode.content.slice(0, -1)
    if (currentTextNode.raw.endsWith('('))
      currentTextNode.raw = currentTextNode.raw.slice(0, -1)

    if (!currentTextNode.content && result[result.length - 1] === currentTextNode) {
      result.pop()
      currentTextNode = null
    }
  }

  function isMarkdownLinkBeforeLinkifiedUrl(content: string) {
    if (!content.endsWith(']('))
      return false

    return tokens[i + 1]?.type === 'link_open'
      && tokens[i + 1]?.markup === 'linkify'
      && tokens[i + 2]?.type === 'text'
      && tokens[i + 3]?.type === 'link_close'
      && tokens[i + 4]?.type === 'text'
      && String(tokens[i + 4]?.content ?? '').startsWith(')')
  }

  function stripTrailingMidStateMarker(content: string, token: MarkdownToken, markerFlags = getInlineTextMarkerFlags(content)) {
    let nextContent = content
    const rawTokenContent = String(token.content ?? '')

    if ((markerFlags & INLINE_TEXT_MARKER_BACKSLASH) !== 0 && nextContent.endsWith('\\') && !hasEscapedMarkup(token, '\\\\') && !rawTokenContent.endsWith('\\\\'))
      nextContent = nextContent.slice(0, -1)

    if ((markerFlags & INLINE_TEXT_MARKER_OPEN_PAREN) !== 0 && nextContent.endsWith('(') && !hasEscapedMarkup(token, '\\(') && !rawTokenContent.endsWith('\\('))
      nextContent = nextContent.slice(0, -1)

    if ((markerFlags & INLINE_TEXT_MARKER_ASTERISK) !== 0 && /\*+$/.test(nextContent) && !hasEscapedMarkup(token, '\\*') && !rawTokenContent.endsWith('\\*'))
      nextContent = nextContent.replace(/\*+$/, '')

    return nextContent
  }

  while (i < tokens.length) {
    const token = tokens[i] as MarkdownToken
    handleToken(token)
  }

  function handleToken(token: MarkdownToken) {
    switch (token.type) {
      case 'text': {
        handleTextToken(token)
        break
      }

      case 'softbreak':
        if (currentTextNode) {
          // Append newline to the current text node
          currentTextNode.content += '\n'
          currentTextNode.raw += '\n' // Assuming raw should also reflect the newline
        }
        else {
          currentTextNode = {
            type: 'text',
            content: '\n',
            raw: '\n',
          }
          result.push(currentTextNode)
        }
        // Don't create a node for softbreak itself, just modify text
        i++
        break

      case 'code_inline':
        pushNode(parseInlineCodeToken(token))
        i++
        break
      case 'html_inline': {
        const [node, index] = parseHtmlInlineCodeToken(
          token,
          tokens,
          i,
          parseInlineTokens,
          raw,
          pPreToken,
          options,
        )
        pushNode(node)
        i = index
        break
      }

      case 'link_open': {
        handleLinkOpen(token)
        break
      }

      case 'image':
        if (!recoverOuterImageLinkStartFromImageToken(token)) {
          resetCurrentTextNode()
          pushNode(parseImageToken(token))
          i++
        }
        break

      case 'strong_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseStrongToken(tokens, i, token.content, options)
        pushNode(node)
        i = nextIndex
        break
      }

      case 'em_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseEmphasisToken(tokens, i, options)
        pushNode(node)
        i = nextIndex
        break
      }

      case 's_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseStrikethroughToken(tokens, i, options)
        pushNode(node)
        i = nextIndex
        break
      }

      case 'mark_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseHighlightToken(tokens, i, options)
        pushNode(node)
        i = nextIndex
        break
      }

      case 'ins_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseInsertToken(tokens, i, options)
        pushNode(node)
        i = nextIndex
        break
      }

      case 'sub_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseSubscriptToken(tokens, i, options)
        pushNode(node)
        i = nextIndex
        break
      }

      case 'sup_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseSuperscriptToken(tokens, i, options)
        pushNode(node)
        i = nextIndex
        break
      }

      case 'sub':
        resetCurrentTextNode()
        pushNode({
          type: 'subscript',
          children: [
            {
              type: 'text',
              content: String(token.content ?? ''),
              raw: String(token.content ?? ''),
            },
          ],
          raw: `~${String(token.content ?? '')}~`,
        })
        i++
        break

      case 'sup':
        resetCurrentTextNode()
        pushNode({
          type: 'superscript',
          children: [
            {
              type: 'text',
              content: String(token.content ?? ''),
              raw: String(token.content ?? ''),
            },
          ],
          raw: `^${String(token.content ?? '')}^`,
        })
        i++
        break

      case 'emoji': {
        resetCurrentTextNode()
        const preToken = tokens[i - 1]
        if (preToken?.type === 'text' && /\|:-+/.test(String(preToken.content ?? ''))) {
          // 处理表格中的 emoji，跳过
          pushText('', '')
        }
        else {
          pushNode(parseEmojiToken(token))
        }
        i++
        break
      }
      case 'checkbox':
        resetCurrentTextNode()
        pushNode(parseCheckboxToken(token))
        i++
        break
      case 'checkbox_input':
        resetCurrentTextNode()
        pushNode(parseCheckboxInputToken(token))
        i++
        break
      case 'footnote_ref':
        resetCurrentTextNode()
        pushNode(parseFootnoteRefToken(token))
        i++
        break

      case 'footnote_anchor':{
        // Emit a footnote_anchor node so NodeRenderer can render a backlink
        // element (e.g. a small "↩" that scrolls back to the reference).
        resetCurrentTextNode()

        const meta = (token.meta ?? {}) as Record<string, unknown>
        const id = String(meta.label ?? token.content ?? '')
        pushParsed({
          type: 'footnote_anchor',
          id,
          raw: String(token.content ?? ''),
        } as ParsedNode)

        i++
        break
      }

      case 'hardbreak':
        resetCurrentTextNode()
        pushNode(parseHardbreakToken())
        i++
        break

      case 'fence': {
        resetCurrentTextNode()
        // Handle fenced code blocks with language specifications
        pushNode(parseFenceToken(tokens[i]))
        i++
        break
      }

      case 'math_inline': {
        stripTrailingLoadingParenMathOpener(token)
        resetCurrentTextNode()
        // 可能遇到 math_inline text math_inline 的特殊情况，需要合并成一个
        if (!token.content && token.markup === '$' && tokens[i + 1]?.type === 'text' && tokens[i + 2]?.type === 'math_inline') {
          pushNode(parseMathInlineToken({
            ...token,
            content: tokens[i + 1].content,
          }))
          i += 2
        }
        else {
          pushNode(parseMathInlineToken(token))
        }
        i++
        break
      }

      case 'reference': {
        handleReference(token)
        break
      }

      case 'text_special':{
        // treat as plain text (merge into adjacent text nodes)
        pushText(String(token.content ?? ''), String(token.content ?? ''))
        i++
        break
      }

      default: {
        // Skip unknown token types, ensure text merging stops.
        // Synthetic 'link' tokens (from fixLinkTokens) must respect validateLink.
        const syntheticLink = token as MarkdownToken & { href?: unknown, text?: unknown }
        if (token.type === 'link' && syntheticLink.href != null && options?.validateLink && !options.validateLink(String(syntheticLink.href))) {
          resetCurrentTextNode()
          const displayText = String(syntheticLink.text ?? '')
          pushText(displayText, displayText)
          i++
        }
        else if (recoverOuterImageLinkFromSyntheticLinkToken(token)) {
          i++
        }
        else if (recoverMarkdownImageFromLoadingImageTail(token)) {
          i++
        }
        else if (recoverMarkdownImageFromTrailingBang(token)) {
          i++
        }
        else if (recoverMarkdownLinkFromTrailingText(token)) {
          i++
        }
        else {
          pushToken(token)
          i++
        }
        break
      }
    }
  }

  function commitTextNode(
    content: string,
    token: MarkdownToken,
    preToken?: MarkdownToken,
    nextToken?: MarkdownToken,
    markerFlags = getInlineTextMarkerFlags(content),
  ) {
    const textNode = parseTextToken({ ...token, content })

    if (currentTextNode) {
      // Merge with the previous text node
      currentTextNode.content += stripTrailingMidStateMarker(textNode.content, token, markerFlags)
      currentTextNode.raw += textNode.raw
      return
    }

    const maybeMath = preToken?.tag === 'br' && tokens[i - 2]?.content === '['
    if (!nextToken)
      textNode.content = stripTrailingMidStateMarker(textNode.content, token, markerFlags)

    currentTextNode = textNode
    currentTextNode.center = maybeMath
    result.push(currentTextNode)
  }

  function handleTextToken(token: MarkdownToken) {
    // 合并连续的 text 节点
    const rawContent = String(token.content ?? '')
    const rawMarkerFlags = getInlineTextMarkerFlags(rawContent)
    const rawHasBackslash = (rawMarkerFlags & INLINE_TEXT_MARKER_BACKSLASH) !== 0
    const rawSource = tokens.length === 1 && rawHasBackslash && typeof raw === 'string'
      ? String(raw)
      : ''
    let content = rawSource
      ? decodeVisibleTextFromRaw(rawSource)
      : rawHasBackslash
        ? rawContent.replace(ESCAPED_PUNCTUATION_RE, '$1')
        : rawContent
    const markerFlags = content === rawContent
      ? rawMarkerFlags
      : getInlineTextMarkerFlags(content)

    if (token.content === '<' || (content === '1' && tokens[i - 1]?.tag === 'br')) {
      i++
      return
    }

    // math 公式 $ 只出现一个并且在末尾，优化掉
    const dollarIndex = (markerFlags & INLINE_TEXT_MARKER_DOLLAR) !== 0
      ? content.indexOf('$')
      : -1
    if (dollarIndex !== -1 && dollarIndex === content.lastIndexOf('$') && content.endsWith('$'))
      content = content.slice(0, -1)

    // 处理 undefined 结尾的问题
    if (content.endsWith('undefined') && !raw?.endsWith('undefined')) {
      content = content.slice(0, -9)
    }
    let trailingTextStart = result.length
    let trailingTextContent = ''
    for (let index = result.length - 1; index >= 0; index--) {
      const item = result[index]
      if (item.type !== 'text')
        break
      trailingTextStart = index
      trailingTextContent = String(item.content ?? '') + trailingTextContent
    }
    if (trailingTextStart < result.length) {
      // Some mid-state token streams resend the full trailing text chunk. Only
      // replace the existing text tail when the incoming token clearly starts
      // with that exact tail; otherwise keep the previous text nodes so later
      // inline parsing (for example an opening backtick) cannot accidentally
      // drop the already-rendered sibling text.
      if (content.startsWith(trailingTextContent)) {
        currentTextNode = null
        result.length = trailingTextStart
      }
      else {
        currentTextNode = result[result.length - 1] as TextNode
      }
    }

    const nextToken = tokens[i + 1]
    if (
      ((content === '`' || content === '|' || content === '$') && !hasEscapedMarkup(token, `\\${content}`))
      || (/^\*+$/.test(content) && !hasEscapedMarkup(token, '\\*'))
    ) {
      i++
      return
    }
    if (!nextToken && (markerFlags & INLINE_TEXT_MARKER_OPEN_PAREN) !== 0 && /[^\]]\s*\(\s*$/.test(content))
      content = content.replace(/\(\s*$/, '')
    if (!content) {
      i++
      return
    }

    if (
      (markerFlags & (INLINE_TEXT_MARKER_OPEN_BRACKET | INLINE_TEXT_MARKER_BANG)) === (INLINE_TEXT_MARKER_OPEN_BRACKET | INLINE_TEXT_MARKER_BANG)
      && recoverOuterImageLinkFromRawText(content)
    ) {
      return
    }

    if (
      (markerFlags & (INLINE_TEXT_MARKER_CLOSE_BRACKET | INLINE_TEXT_MARKER_OPEN_PAREN)) === (INLINE_TEXT_MARKER_CLOSE_BRACKET | INLINE_TEXT_MARKER_OPEN_PAREN)
      && recoverOuterImageLinkMidStateFromText(content)
    ) {
      return
    }

    const hasInlineCandidates = (markerFlags & INLINE_CANDIDATE_MARKERS) !== 0
    if (!hasInlineCandidates) {
      commitTextNode(content, token, tokens[i - 1], nextToken, markerFlags)
      i++
      return
    }

    if ((markerFlags & INLINE_TEXT_MARKER_OPEN_BRACKET) !== 0 && handleCheckboxLike(content))
      return
    const preToken = tokens[i - 1]
    if (
      ((markerFlags & INLINE_TEXT_MARKER_OPEN_BRACKET) !== 0 && content === '[' && !nextToken?.markup?.includes('*') && !hasEscapedMarkup(token, '\\['))
      || ((markerFlags & INLINE_TEXT_MARKER_CLOSE_BRACKET) !== 0 && content === ']' && !preToken?.markup?.includes('*') && !hasEscapedMarkup(token, '\\]'))
    ) {
      i++
      return
    }
    // Use raw token content for inline-code fallback parsing so backslashes
    // inside code spans are preserved (e.g. `\\(...\\)`).
    if ((markerFlags & INLINE_TEXT_MARKER_BACKTICK) !== 0 && handleInlineCodeContent(rawContent, token))
      return

    if (
      (markerFlags & (INLINE_TEXT_MARKER_BANG | INLINE_TEXT_MARKER_OPEN_BRACKET)) === (INLINE_TEXT_MARKER_BANG | INLINE_TEXT_MARKER_OPEN_BRACKET)
      && handleInlineImageContent(content)
    ) {
      return
    }

    // Avoid synthesizing links from raw text only when the next token is
    // already a structured link_open. This prevents duplicates while still
    // allowing fallback for later tricky links in the same inline run.
    if (
      (markerFlags & INLINE_TEXT_MARKER_OPEN_BRACKET) !== 0
      && (tokens[i + 1]?.type !== 'link_open' || isMarkdownLinkBeforeLinkifiedUrl(content))
      && handleInlineLinkContent(content, token)
    ) {
      return
    }

    const reparsedNodes = tryReparseCollapsedInlineText(rawContent)
    if (reparsedNodes) {
      resetCurrentTextNode()
      for (const node of reparsedNodes)
        pushNode(node)
      i++
      return
    }

    if (handleEmphasisAndStrikethrough(content, token))
      return

    // Emit remaining text token
    commitTextNode(content, token, preToken, nextToken, markerFlags)
    i++
  }

  function handleLinkOpen(token: MarkdownToken) {
    if (recoverMarkdownImageFromLoadingImageTailLinkOpen(token))
      return

    if (shouldTreatLinkOpenAsTextInEscapedOuterImageTail()) {
      const { node, nextIndex } = parseLinkToken(tokens, i, options)
      const text = String(node.text || node.href || '')
      pushText(text, text)
      i = nextIndex
      return
    }

    // mirror logic previously in the switch-case for 'link_open'
    resetCurrentTextNode()
    // 直接使用 parseLinkToken 来解析链接及其子节点，这能正确处理包含 code_inline 等复杂内容的链接
    const { node, nextIndex } = parseLinkToken(tokens, i, options)
    i = nextIndex

    const linkText = node.text || node.href || ''
    if (
      token.markup === 'linkify'
      && !isDecodedFromRawPunycode(linkText, node.href, raw)
      && shouldDemoteFilenameLikeLinkify(linkText, internalOptions?.__linkifyDemotionContext)
    ) {
      pushText(linkText, linkText)
      return
    }

    const hasSingleTextChild = node.children.length === 1 && node.children[0]?.type === 'text'
    if (node.loading && raw && node.text === node.href && hasSingleTextChild) {
      const recoveredLabel = recoverTrailingMarkdownLinkLabel(raw, node.href)
      if (recoveredLabel) {
        node.text = recoveredLabel
        node.children = [{ type: 'text', content: recoveredLabel, raw: recoveredLabel }]
        node.raw = String(`[${recoveredLabel}](${node.href}${node.title ? ` "${node.title}"` : ''})`)
      }
    }

    // Respect consumer link validation (e.g. md.set({ validateLink }) so javascript: is not output as link
    if (options?.validateLink && !options.validateLink(node.href)) {
      pushText(node.text, node.text)
      return
    }

    // Determine loading state conservatively: if the link token parser
    // marked it as loading already, keep it; otherwise compute from raw
    // and href as a fallback so unclosed links remain marked as loading.
    const hrefAttr = token.attrs?.find(([name]) => name === 'href')?.[1]
    const hrefStr = String(hrefAttr ?? '')
    // Only override the link parser's default loading state when we
    // actually have an href to check against the raw source. If the
    // tokenizer emitted a link_open without an href (partial tokenizers
    // may do this), prefer the parseLinkToken's initial loading value
    // (which defaults to true for mid-state links).
    if (raw && hrefStr) {
      // More robust: locate the first "](" after the link text and see if
      // there's a matching ')' that closes the href. This avoids false
      // positives when other parentheses appear elsewhere in the source.
      const openIdx = raw.indexOf('](')
      if (openIdx === -1) {
        // No explicit link start found in raw — be conservative and keep
        // the parser's default loading value.
      }
      else {
        const closeIdx = raw.indexOf(')', openIdx + 2)
        if (closeIdx === -1) {
          node.loading = true
        }
        else if (node.loading) {
          // Check that the href inside the parens corresponds to this token
          const inside = raw.slice(openIdx + 2, closeIdx)
          if (inside.includes(hrefStr))
            node.loading = false
        }
      }
    }

    if (recoverMarkdownLinkFromTrailingText(node as unknown as MarkdownToken))
      return

    pushParsed(node)
  }

  function recoverMarkdownImageFromLoadingImageTailLinkOpen(token: MarkdownToken): boolean {
    if (token.markup !== 'linkify')
      return false

    const { node, nextIndex } = parseLinkToken(tokens, i, options)
    if (!recoverMarkdownImageFromLoadingImageTailLink(node, nextIndex))
      return false

    i = nextIndex
    return true
  }

  function handleReference(token: MarkdownToken) {
    resetCurrentTextNode()
    pushNode(parseReferenceToken(token))
    i++
  }

  function recoverMarkdownLinkFromTrailingText(token: MarkdownToken): boolean {
    if (token.type !== 'link')
      return false

    const previous = result[result.length - 1] as TextNode | undefined
    if (!previous || previous.type !== 'text')
      return false

    const previousContent = String(previous.content ?? '')
    const match = previousContent.match(/^([^[]*)\[([^\]\n]+)\]\($/)
    if (!match)
      return false

    const linkToken = token as MarkdownToken & { href?: string, text?: string, title?: string | null }
    const href = String(linkToken.href ?? '')
    const linkText = String(linkToken.text ?? '')
    const label = String(match[2] ?? '')
    const visibleHref = href.replace(/^(?:https?:\/\/|mailto:|ftp:\/\/)/i, '')

    if (!href || !(linkText === href || linkText === visibleHref || isLikelyUrl(linkText)))
      return false

    const before = String(match[1] ?? '')
    if (before) {
      previous.content = before
      previous.raw = before
    }
    else {
      result.pop()
    }

    pushParsed({
      ...(token as ParsedNode),
      text: label,
      children: [{ type: 'text', content: label, raw: label }],
      raw: String(`[${label}](${href}${linkToken.title ? ` "${linkToken.title}"` : ''})`),
    } as ParsedNode)
    return true
  }

  function recoverMarkdownImageFromLoadingImageTail(token: MarkdownToken): boolean {
    if (token.type !== 'link')
      return false

    const linkToken = token as MarkdownToken & { href?: string, loading?: boolean, title?: string | null }
    const href = String(linkToken.href ?? '')
    if (!href)
      return false

    return recoverMarkdownImageFromLoadingImageTailLink({
      href,
      title: linkToken.title == null || linkToken.title === '' ? null : String(linkToken.title),
      loading: Boolean(linkToken.loading),
    }, i + 1)
  }

  function recoverMarkdownImageFromLoadingImageTailLink(
    link: { href: string, loading?: boolean, title: string | null },
    nextIndex: number,
  ): boolean {
    const previous = result[result.length - 1] as ParsedNode & {
      alt?: string
      loading?: boolean
      raw?: string
      src?: string
    } | undefined
    if (previous?.type !== 'image' || previous.src || !previous.loading || !String(previous.raw ?? '').endsWith(']('))
      return false

    const nextToken = tokens[nextIndex]
    const nextContent = String(nextToken?.content ?? '')
    if (nextToken?.type !== 'text' || !nextContent.startsWith(')'))
      return false

    result.pop()
    currentTextNode = null

    const alt = String(previous.alt ?? '')
    pushParsed({
      type: 'image',
      src: link.href,
      alt,
      title: link.title,
      raw: String(`![${alt}](${link.href}${link.title ? ` "${link.title}"` : ''})`),
      loading: Boolean(link.loading),
    } as ParsedNode)

    const trailing = nextContent.slice(1)
    const adjustedNext = cloneTokenWithMutableChildren(nextToken)
    adjustedNext.content = trailing
    adjustedNext.raw = trailing
    ensureWorkingTokens()[nextIndex] = adjustedNext
    return true
  }

  function recoverMarkdownImageFromTrailingBang(token: MarkdownToken): boolean {
    if (token.type !== 'link')
      return false

    const previous = result[result.length - 1] as TextNode | undefined
    const previousToken = tokens[i - 1]
    if (!previous || previous.type !== 'text' || previousToken?.type !== 'text')
      return false

    const previousContent = String(previous.content ?? '')
    const previousTokenContent = String(previousToken.content ?? '')
    if (!previousContent.endsWith('!') || !previousTokenContent.endsWith('!'))
      return false
    if (hasEscapedMarkup(previousToken, '\\!'))
      return false

    const before = previousContent.slice(0, -1)
    if (before) {
      previous.content = before
      previous.raw = before
      currentTextNode = previous
    }
    else {
      result.pop()
      currentTextNode = null
    }

    const linkToken = token as MarkdownToken & {
      href?: string
      loading?: boolean
      text?: string
      title?: string | null
      children?: Array<{ type?: string, content?: string, raw?: string }>
    }
    const alt = String(
      linkToken.text
      ?? linkToken.children?.map(child => String(child?.content ?? child?.raw ?? '')).join('')
      ?? '',
    )
    const href = String(linkToken.href ?? '')
    const title = linkToken.title == null || linkToken.title === '' ? null : String(linkToken.title)

    pushParsed({
      type: 'image',
      src: href,
      alt,
      title,
      raw: String(`![${alt}](${href}${title ? ` "${title}"` : ''})`),
      loading: Boolean(linkToken.loading),
    } as ParsedNode)
    return true
  }

  function buildLoadingOuterImageLinkNode(
    imageNode: ParsedNode & { alt?: string, raw?: string },
    href = '',
    title: string | null = null,
  ): ParsedNode {
    const text = String(imageNode.alt ?? imageNode.raw ?? '')

    return {
      type: 'link',
      href,
      title,
      text,
      children: [imageNode as ParsedNode],
      raw: String(`[${text}](${href}${title ? ` "${title}"` : ''})`),
      loading: true,
    } as ParsedNode
  }

  function buildLoadingImageNodeFromRaw(raw: string): ParsedNode {
    const normalizedRaw = raw.startsWith('![') ? raw : `![${raw}`
    const innerRaw = normalizedRaw.slice(2)
    const closeIdx = innerRaw.indexOf('](')
    const alt = closeIdx === -1 ? innerRaw.replace(/\]$/, '') : innerRaw.slice(0, closeIdx)

    return {
      type: 'image',
      src: '',
      alt,
      title: null,
      raw: normalizedRaw,
      loading: true,
    } as ParsedNode
  }

  function recoverOuterImageLinkFromRawText(content: string): boolean {
    const outerStart = content.indexOf('[![')
    if (outerStart === -1)
      return false
    if (typeof raw === 'string' && tokens.length === 1 && isEscapedVisibleChar(raw, outerStart, '['))
      return false

    const before = content.slice(0, outerStart)
    if (before)
      pushText(before, before)

    const imageNode = buildLoadingImageNodeFromRaw(content.slice(outerStart + 1))
    pushParsed(buildLoadingOuterImageLinkNode(imageNode))
    i++
    return true
  }

  function recoverOuterImageLinkStartFromImageToken(token: MarkdownToken): boolean {
    if (options?.final)
      return false

    const previousToken = tokens[i - 1]
    if (previousToken?.type !== 'text')
      return false

    const previousTokenContent = String(previousToken.content ?? '')
    if (!previousTokenContent.endsWith('['))
      return false
    if (hasEscapedMarkup(previousToken, '\\['))
      return false

    const previous = result[result.length - 1] as TextNode | undefined
    if (previous?.type === 'text' && previous.content.endsWith('[')) {
      const before = previous.content.slice(0, -1)
      if (before) {
        previous.content = before
        previous.raw = before
        currentTextNode = previous
      }
      else {
        result.pop()
        currentTextNode = null
      }
    }

    const imageNode = parseImageToken(token)
    pushParsed(buildLoadingOuterImageLinkNode(imageNode))
    i++
    return true
  }

  function recoverOuterImageLinkFromSyntheticLinkToken(token: MarkdownToken): boolean {
    if (token.type !== 'link')
      return false

    const linkToken = token as MarkdownToken & {
      href?: string
      text?: string
      title?: string | null
      raw?: string
    }
    const raw = String(linkToken.raw ?? '')
    const text = String(linkToken.text ?? '')
    if (!raw.startsWith('[![') && !text.startsWith('!['))
      return false

    const imageTitle = linkToken.title == null || linkToken.title === '' ? null : String(linkToken.title)
    const imageNode = {
      type: 'image',
      src: String(linkToken.href ?? ''),
      alt: text.replace(/^!\[/, '').replace(/\]$/, ''),
      title: imageTitle,
      raw: raw.startsWith('[![') ? raw.slice(1) : raw,
      loading: true,
    } as ParsedNode & { alt?: string, raw?: string }

    pushParsed(buildLoadingOuterImageLinkNode(imageNode))
    return true
  }

  function recoverOuterImageLinkMidStateFromText(content: string): boolean {
    if (!content.startsWith(']('))
      return false
    const outerOpenToken = tokens[i - 2]
    if (outerOpenToken?.type === 'text' && String(outerOpenToken.content ?? '').endsWith('[') && hasEscapedMarkup(outerOpenToken, '\\['))
      return false

    const previous = result[result.length - 1] as ParsedNode | undefined
    if (previous?.type !== 'image' && previous?.type !== 'link')
      return false

    const previousWithChildren = previous as ParsedNode & { children?: ParsedNode[] }
    const previousLink = previous?.type === 'link'
      && Array.isArray(previousWithChildren.children)
      && previousWithChildren.children.length === 1
      && previousWithChildren.children[0]?.type === 'image'
      ? result.pop() as ParsedNode & {
        href?: string
        title?: string | null
        text?: string
        children: ParsedNode[]
        loading?: boolean
      }
      : null

    const imageNode = previousLink
      ? previousLink.children[0] as ParsedNode & { alt?: string, raw?: string }
      : result.pop() as ParsedNode & { alt?: string, raw?: string }

    if (!imageNode || imageNode.type !== 'image')
      return false

    const nextToken = tokens[i + 1]
    let href = String(previousLink?.href ?? '')
    let title: string | null = previousLink?.title == null ? null : String(previousLink.title)
    let loading = true

    if (nextToken?.type === 'link_open') {
      const { node, nextIndex } = parseLinkToken(tokens, i + 1, options)
      href = node.href
      title = node.title
      loading = true
      i = nextIndex
    }
    else {
      href = content.slice(2)
      if (href.includes('"')) {
        const parts = href.split('"')
        href = String(parts[0] ?? '').trim()
        title = parts[1] == null ? null : String(parts[1]).trim()
      }
      i++
    }

    const linkNode = buildLoadingOuterImageLinkNode(imageNode as ParsedNode & { alt?: string, raw?: string }, href, title) as ParsedNode & { loading?: boolean }
    linkNode.loading = loading
    pushParsed(linkNode)
    return true
  }

  function shouldTreatLinkOpenAsTextInEscapedOuterImageTail() {
    const outerOpenToken = tokens[i - 3]
    return (
      tokens[i - 2]?.type === 'image'
      && tokens[i - 1]?.type === 'text'
      && String(tokens[i - 1].content ?? '') === ']('
      && outerOpenToken?.type === 'text'
      && String(outerOpenToken.content ?? '').endsWith('[')
      && hasEscapedMarkup(outerOpenToken, '\\[')
    )
  }

  function handleInlineLinkContent(content: string, _token: MarkdownToken): boolean {
    const linkStart = content.indexOf('[')
    if (linkStart === -1)
      return false

    let textNodeContent = content.slice(0, linkStart)
    const linkEnd = content.indexOf('](', linkStart)
    if (linkEnd !== -1) {
      const textToken = tokens[i + 2]
      let text = content.slice(linkStart + 1, linkEnd)
      if (text.includes('[')) {
        const secondLinkStart = text.indexOf('[')
        // adjust original linkStart and text
        textNodeContent += content.slice(0, linkStart + secondLinkStart + 1)
        const newLinkStart = linkStart + secondLinkStart + 1
        text = content.slice(newLinkStart + 1, linkEnd)
      }
      const nextToken = tokens[i + 1]
      if (content.endsWith('](') && nextToken?.type === 'link_open' && textToken) {
        const last = tokens[i + 4]
        let index = 4
        let loading = true
        if (last?.type === 'text') {
          const lastContent = String(last.content ?? '')
          if (lastContent.startsWith(')')) {
            loading = false
            const trailingAfterClose = lastContent.slice(1)
            if (trailingAfterClose) {
              const trailingToken = cloneTokenWithMutableChildren(last)
              trailingToken.content = trailingAfterClose
              trailingToken.raw = trailingAfterClose
              ensureWorkingTokens()[i + 4] = trailingToken
            }
            else {
              index++
            }
          }
          else if (lastContent === '.') {
            index++
          }
        }

        pushInlineTextContent(textNodeContent, _token)
        const hrefFromToken = String(textToken.content ?? '')
        if (options?.validateLink && !options.validateLink(hrefFromToken)) {
          pushText(text, text)
        }
        else {
          pushParsed({
            type: 'link',
            href: hrefFromToken,
            title: null,
            text,
            children: [{ type: 'text', content: text, raw: text }],
            loading,
          } as ParsedNode)
        }
        i += index
        return true
      }

      const linkContentEnd = content.indexOf(')', linkEnd)
      const href = linkContentEnd !== -1 ? content.slice(linkEnd + 2, linkContentEnd) : ''
      const loading = linkContentEnd === -1
      let emphasisMatch = textNodeContent.match(/\*+$/)
      if (emphasisMatch) {
        textNodeContent = textNodeContent.replace(/\*+$/, '')
      }
      pushInlineTextContent(textNodeContent, _token)
      if (!emphasisMatch)
        emphasisMatch = text.match(/^\*+/)
      if (!requireClosingStrong && emphasisMatch) {
        const type = emphasisMatch[0].length
        text = text.replace(/^\*+/, '').replace(/\*+$/, '')
        const newTokens = []
        if (type === 1) {
          newTokens.push({ type: 'em_open', tag: 'em', nesting: 1 })
        }
        else if (type === 2) {
          newTokens.push({ type: 'strong_open', tag: 'strong', nesting: 1 })
        }
        else if (type === 3) {
          newTokens.push({ type: 'strong_open', tag: 'strong', nesting: 1 })
          newTokens.push({ type: 'em_open', tag: 'em', nesting: 1 })
        }
        newTokens.push({
          type: 'link',
          href,
          title: null,
          text,
          children: [{ type: 'text', content: text, raw: text }],
          loading,
        })
        if (type === 1) {
          newTokens.push({ type: 'em_close', tag: 'em', nesting: -1 })
          const { node } = parseEmphasisToken(newTokens, 0, options)
          pushNode(node)
        }
        else if (type === 2) {
          newTokens.push({ type: 'strong_close', tag: 'strong', nesting: -1 })
          const { node } = parseStrongToken(newTokens, 0, undefined, options)
          pushNode(node)
        }
        else if (type === 3) {
          newTokens.push({ type: 'em_close', tag: 'em', nesting: -1 })
          newTokens.push({ type: 'strong_close', tag: 'strong', nesting: -1 })
          const { node } = parseStrongToken(newTokens, 0, undefined, options)
          pushNode(node)
        }
        else {
          const { node } = parseEmphasisToken(newTokens, 0, options)
          pushNode(node)
        }
      }
      else {
        if (options?.validateLink && !options.validateLink(href)) {
          pushText(text, text)
        }
        else {
          pushParsed({
            type: 'link',
            href,
            title: null,
            text,
            children: [{ type: 'text', content: text, raw: text }],
            loading,
          } as ParsedNode)
        }
      }

      const afterText = linkContentEnd !== -1 ? content.slice(linkContentEnd + 1) : ''
      if (afterText) {
        handleToken({ type: 'text', content: afterText, raw: afterText } as unknown as MarkdownToken)
        i--
      }
      i++
      return true
    }

    return false
  }

  function handleInlineImageContent(content: string): boolean {
    const imageStart = content.indexOf('![')
    if (imageStart === -1)
      return false

    const textNodeContent = content.slice(0, imageStart)
    if (textNodeContent && !currentTextNode) {
      currentTextNode = {
        type: 'text',
        content: textNodeContent,
        raw: textNodeContent,
      }
    }
    else if (textNodeContent && currentTextNode) {
      currentTextNode.content += textNodeContent
    }
    if (currentTextNode) {
      result.push(currentTextNode)
      currentTextNode = null
    }
    pushParsed(buildLoadingImageNodeFromRaw(content.slice(imageStart)))
    i++
    return true
  }

  function handleCheckboxLike(content: string): boolean {
    // Detect checkbox-like syntax at the start of a list item e.g. [x] or [ ]
    if (!(content?.startsWith('[') && pPreToken?.type === 'list_item_open'))
      return false

    const _content = content.slice(1)
    const w = _content.match(/[^\s\]]/)
    if (w === null) {
      i++
      return true
    }
    // If the first non-space/']' char is x/X treat as a checkbox input
    if (w && /x/i.test(w[0])) {
      const checked = w[0] === 'x' || w[0] === 'X'
      pushParsed({
        type: 'checkbox_input',
        checked,
        raw: checked ? '[x]' : '[ ]',
      } as ParsedNode)
      i++
      return true
    }

    return false
  }

  return result
}
