import type { MarkdownIt } from '../../markdown-it-types'

const CODE_SPACE = 0x20
const CODE_LINE_FEED = 0x0A
const CODE_CLOSE_PAREN = 0x29
const CODE_OPEN_PAREN = 0x28
const CODE_DOUBLE_QUOTE = 0x22
const CODE_SINGLE_QUOTE = 0x27
const CODE_DELETE = 0x7F

interface LinkDestinationResult {
  ok: boolean
  pos: number
  str: string
}

interface LinkTitleResult {
  ok: boolean
  pos: number
  str: string
}

interface MarkdownItInlineHelpers {
  parseLinkDestination?: (src: string, start: number, max: number) => LinkDestinationResult
  parseLinkTitle?: (src: string, start: number, max: number) => LinkTitleResult
}

interface ResolvedInlineHelpers {
  parseLinkDestination: (src: string, start: number, max: number) => LinkDestinationResult
  parseLinkTitle: (src: string, start: number, max: number) => LinkTitleResult
}

/**
 * `valid`: markdown-it accepts this `(...)` as the target of `![label]` or
 * `[label]`. `invalid`: no continuation can turn it into one (`![a](b c)`).
 * `pending`: the text stops mid-target; more input may still complete it.
 */
export type InlineTargetKind = 'invalid' | 'pending' | 'valid'

function skipTargetSpaces(src: string, pos: number, max: number) {
  let next = pos
  while (next < max) {
    const code = src.charCodeAt(next)
    if (code !== CODE_SPACE && code !== CODE_LINE_FEED)
      break
    next++
  }
  return next
}

function resolveHelpers(md: MarkdownIt | undefined): ResolvedInlineHelpers | null {
  const helpers = md?.helpers as MarkdownItInlineHelpers | undefined
  const parseLinkDestination = helpers?.parseLinkDestination
  const parseLinkTitle = helpers?.parseLinkTitle
  if (typeof parseLinkDestination !== 'function' || typeof parseLinkTitle !== 'function')
    return null
  return { parseLinkDestination, parseLinkTitle }
}

/**
 * Classifies the `(...)` that follows a label, mirroring markdown-it's inline
 * image rule: optional spaces, a destination, an optional title, then `)`.
 * Recovery uses this to tell a placeholder that will resolve from one that
 * never can (`![a](b c)`).
 */
export function classifyInlineTarget(
  md: MarkdownIt | undefined,
  src: string,
  openParen: number,
  max: number,
): InlineTargetKind {
  const helpers = resolveHelpers(md)
  if (!helpers)
    return 'pending'

  const destinationStart = skipTargetSpaces(src, openParen + 1, max)
  if (destinationStart >= max)
    return 'pending'

  const destination = helpers.parseLinkDestination(src, destinationStart, max)
  if (!destination.ok) {
    const code = src.charCodeAt(destinationStart)
    // `![a]()` is an image with an empty destination.
    if (code === CODE_CLOSE_PAREN)
      return 'valid'
    // A control character can never start a destination, so this can't be fixed
    // by more input. An unbalanced `(` or a `<` destination without `>` can be.
    if (code < 0x20 || code === CODE_DELETE)
      return 'invalid'
    return 'pending'
  }

  const afterDestination = skipTargetSpaces(src, destination.pos, max)
  if (afterDestination >= max)
    return 'pending'
  if (src.charCodeAt(afterDestination) === CODE_CLOSE_PAREN)
    return 'valid'

  const code = src.charCodeAt(afterDestination)
  if (code !== CODE_DOUBLE_QUOTE && code !== CODE_SINGLE_QUOTE && code !== CODE_OPEN_PAREN)
    return 'invalid'

  const title = helpers.parseLinkTitle(src, afterDestination, max)
  if (!title.ok)
    return 'pending'
  const afterTitle = skipTargetSpaces(src, title.pos, max)
  if (afterTitle >= max)
    return 'pending'
  return src.charCodeAt(afterTitle) === CODE_CLOSE_PAREN ? 'valid' : 'invalid'
}

/**
 * Whether the `(...)` target at `openParen` can never become an inline image or
 * link, whatever follows it. A target that is merely unfinished (`![a](b`) is
 * not impossible: it keeps its placeholder, which is what a cut-off stream needs.
 */
export function isImpossibleInlineTarget(
  md: MarkdownIt | undefined,
  src: string,
  openParen: number,
  max: number,
) {
  return classifyInlineTarget(md, src, openParen, max) === 'invalid'
}
