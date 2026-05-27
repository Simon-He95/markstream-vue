import { escapeTagForRegExp, findTagCloseIndexOutsideQuotes } from '../htmlTagUtils'

export interface CustomHtmlSourceFragment {
  raw: string
  inner: string
  end: number
}

export interface CustomHtmlCloseRange {
  start: number
  end: number
}

export function stripTrailingPartialClosingTag(inner: string, tag: string) {
  if (!inner || !tag)
    return inner

  const lastOpen = inner.lastIndexOf('<')
  if (lastOpen !== -1) {
    const trailing = inner.slice(lastOpen).trimStart().toLowerCase()
    const closingTag = `</${tag.toLowerCase()}>`
    if (trailing.length > 1 && closingTag.startsWith(trailing))
      return inner.slice(0, lastOpen).replace(/[\t ]+$/g, '')
  }

  const re = new RegExp(String.raw`[\t ]*<\s*\/\s*${escapeTagForRegExp(tag)}[^>]*$`, 'i')
  return inner.replace(re, '')
}

export function findMatchingCustomCloseTagRange(
  rawHtml: string,
  tag: string,
  startIndex: number,
): CustomHtmlCloseRange | null {
  if (!rawHtml || !tag)
    return null

  const lowerTag = escapeTagForRegExp(tag.toLowerCase())
  const openTagRe = new RegExp(String.raw`^<\s*${lowerTag}(?=\s|>|/)`, 'i')
  const closeTagRe = new RegExp(String.raw`^<\s*\/\s*${lowerTag}(?=\s|>)`, 'i')

  let depth = 0
  let index = Math.max(0, startIndex)

  while (index < rawHtml.length) {
    const lt = rawHtml.indexOf('<', index)
    if (lt === -1)
      break

    const slice = rawHtml.slice(lt)
    if (closeTagRe.test(slice)) {
      const endRel = findTagCloseIndexOutsideQuotes(slice)
      if (endRel === -1)
        return null
      if (depth === 0) {
        return {
          start: lt,
          end: lt + endRel + 1,
        }
      }
      depth--
      index = lt + endRel + 1
      continue
    }

    if (openTagRe.test(slice)) {
      const endRel = findTagCloseIndexOutsideQuotes(slice)
      if (endRel === -1)
        return null
      const raw = slice.slice(0, endRel + 1)
      if (!/\/\s*>$/.test(raw))
        depth++
      index = lt + endRel + 1
      continue
    }

    index = lt + 1
  }

  return null
}

export function readCustomHtmlFragmentAt(
  source: string,
  tag: string,
  openStart: number,
  expectedOpenTag?: string,
): CustomHtmlSourceFragment | null {
  if (!source || !tag)
    return null

  const lowerTag = escapeTagForRegExp(tag.toLowerCase())
  if (openStart < 0)
    return null
  if (expectedOpenTag != null && !source.startsWith(expectedOpenTag, openStart))
    return null

  const openEndRel = findTagCloseIndexOutsideQuotes(source.slice(openStart))
  if (openEndRel === -1)
    return null

  const openEnd = openStart + openEndRel
  const openTag = source.slice(openStart, openEnd + 1)
  if (/\/\s*>$/.test(openTag))
    return { raw: openTag, inner: '', end: openEnd + 1 }

  let depth = 1
  let index = openEnd + 1
  const isOpenAt = (pos: number) => new RegExp(String.raw`^<\s*${lowerTag}(?=\s|>|/)`, 'i').test(source.slice(pos))
  const isCloseAt = (pos: number) => new RegExp(String.raw`^<\s*\/\s*${lowerTag}(?=\s|>)`, 'i').test(source.slice(pos))

  while (index < source.length) {
    const lt = source.indexOf('<', index)
    if (lt === -1) {
      return {
        raw: source.slice(openStart),
        inner: stripTrailingPartialClosingTag(source.slice(openEnd + 1), tag),
        end: source.length,
      }
    }

    if (isCloseAt(lt)) {
      const closeEndRel = findTagCloseIndexOutsideQuotes(source.slice(lt))
      if (closeEndRel === -1) {
        return {
          raw: source.slice(openStart),
          inner: stripTrailingPartialClosingTag(source.slice(openEnd + 1, lt), tag),
          end: source.length,
        }
      }
      const closeEnd = lt + closeEndRel
      depth--
      if (depth === 0) {
        return {
          raw: source.slice(openStart, closeEnd + 1),
          inner: source.slice(openEnd + 1, lt),
          end: closeEnd + 1,
        }
      }
      index = closeEnd + 1
      continue
    }

    if (isOpenAt(lt)) {
      const nestedOpenEndRel = findTagCloseIndexOutsideQuotes(source.slice(lt))
      if (nestedOpenEndRel === -1)
        return null
      const nestedOpenEnd = lt + nestedOpenEndRel
      if (!/\/\s*>$/.test(source.slice(lt, nestedOpenEnd + 1)))
        depth++
      index = nestedOpenEnd + 1
      continue
    }

    index = lt + 1
  }

  return {
    raw: source.slice(openStart),
    inner: stripTrailingPartialClosingTag(source.slice(openEnd + 1), tag),
    end: source.length,
  }
}

export function findNextCustomHtmlBlockFromSource(
  source: string,
  tag: string,
  startIndex: number,
): { raw: string, end: number } | null {
  if (!source || !tag)
    return null

  const lowerTag = escapeTagForRegExp(tag.toLowerCase())
  const openRe = new RegExp(String.raw`<\s*${lowerTag}(?=\s|>|/)`, 'gi')
  openRe.lastIndex = Math.max(0, startIndex || 0)
  const openMatch = openRe.exec(source)
  if (!openMatch || openMatch.index == null)
    return null

  const fragment = readCustomHtmlFragmentAt(source, tag, openMatch.index)
  return fragment ? { raw: fragment.raw, end: fragment.end } : null
}
