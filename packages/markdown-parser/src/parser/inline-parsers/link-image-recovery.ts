import type { MarkdownToken, ParsedNode, TextNode } from '../../types'
import type { InlineParseState } from './inline-parser-state'
import { resolveLinkMarkup } from '../../plugins/linkTokenMetadata'
import { isDecodedFromRawPunycode, shouldDemoteFilenameLikeLinkify } from '../linkifyHeuristics'
import { cloneTokenWithMutableChildren } from '../token-copy'
import { parseEmphasisToken } from './emphasis-parser'
import { parseImageToken } from './image-parser'
import { parseLinkToken } from './link-parser'
import { hasEscapedMarkup, isEscapedVisibleChar, recoverTrailingMarkdownLinkLabel } from './literal-text-helpers'
import { parseStrongToken } from './strong-parser'

const AUTOLINK_PROTOCOL_RE = /^(?:https?:\/\/|mailto:|ftp:\/\/)/i
const AUTOLINK_GENERIC_RE = /:\/\//

export function isLikelyUrl(href?: string) {
  if (!href)
    return false
  return AUTOLINK_PROTOCOL_RE.test(href) || AUTOLINK_GENERIC_RE.test(href)
}

function pushInlineTextContent(state: InlineParseState, content: string, token: MarkdownToken) {
  if (!content)
    return

  const parsed = state.parseInlineTokens([
    { ...token, type: 'text', content, raw: content } as MarkdownToken,
  ], content, state.pPreToken, state.options)

  if (parsed.length === 1 && parsed[0]?.type === 'text') {
    const text = parsed[0] as TextNode
    state.pushText(String(text.content ?? ''), String(text.raw ?? text.content ?? ''))
    return
  }

  for (const node of parsed)
    state.pushParsed(node)
}

export function isMarkdownLinkBeforeLinkifiedUrl(state: InlineParseState, content: string) {
  if (!content.endsWith(']('))
    return false

  return state.tokens[state.index + 1]?.type === 'link_open'
    && state.tokens[state.index + 1]?.markup === 'linkify'
    && state.tokens[state.index + 2]?.type === 'text'
    && state.tokens[state.index + 3]?.type === 'link_close'
    && state.tokens[state.index + 4]?.type === 'text'
    && String(state.tokens[state.index + 4]?.content ?? '').startsWith(')')
}

export function handleLinkOpen(state: InlineParseState, token: MarkdownToken) {
  if (recoverMarkdownImageFromLoadingImageTailLinkOpen(state, token))
    return

  if (shouldTreatLinkOpenAsTextInEscapedOuterImageTail(state)) {
    const { node, nextIndex } = parseLinkToken(state.tokens, state.index, state.parseInlineTokens, state.options)
    const text = String(node.text || node.href || '')
    state.pushText(text, text)
    state.index = nextIndex
    return
  }

  // mirror logic previously in the switch-case for 'link_open'
  state.resetCurrentTextNode()
  // 直接使用 parseLinkToken 来解析链接及其子节点，这能正确处理包含 code_inline 等复杂内容的链接
  const linkStartIndex = state.index
  const { node, nextIndex } = parseLinkToken(state.tokens, state.index, state.parseInlineTokens, state.options)
  state.index = nextIndex

  const linkText = node.text || node.href || ''
  if (
    token.markup === 'linkify'
    && !isDecodedFromRawPunycode(linkText, node.href, state.raw)
    && shouldDemoteFilenameLikeLinkify(linkText, state.options.linkifyDemotionContext)
  ) {
    state.pushText(linkText, linkText)
    return
  }

  const hasSingleTextChild = node.children.length === 1 && node.children[0]?.type === 'text'
  if (node.loading && state.raw && node.text === node.href && hasSingleTextChild) {
    const recoveredLabel = recoverTrailingMarkdownLinkLabel(state.raw, node.href)
    if (recoveredLabel) {
      node.text = recoveredLabel
      node.children = [{ type: 'text', content: recoveredLabel, raw: recoveredLabel }]
      node.raw = String(`[${recoveredLabel}](${node.href}${node.title ? ` "${node.title}"` : ''})`)
    }
  }

  // Respect consumer link validation (e.g. md.set({ validateLink }) so javascript: is not output as link
  if (state.options?.validateLink && !state.options.validateLink(node.href)) {
    state.pushText(node.text, node.text)
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
  if (state.raw && hrefStr) {
    // More robust: locate the first "](" after the link text and see if
    // there's a matching ')' that closes the href. This avoids false
    // positives when other parentheses appear elsewhere in the source.
    const openIdx = state.raw.indexOf('](')
    if (openIdx === -1) {
      // No explicit link start found in raw — be conservative and keep
      // the parser's default loading value.
    }
    else {
      const closeIdx = state.raw.indexOf(')', openIdx + 2)
      if (closeIdx === -1) {
        node.loading = true
      }
      else if (node.loading) {
        // Check that the href inside the parens corresponds to this token
        const inside = state.raw.slice(openIdx + 2, closeIdx)
        if (inside.includes(hrefStr))
          node.loading = false
      }
    }
  }

  if (
    /^file:\/\/\/[a-z]:\//i.test(node.href)
    && recoverMarkdownImageFromTrailingBang(state, node as unknown as MarkdownToken, linkStartIndex - 1)
  ) {
    return
  }

  if (recoverMarkdownLinkFromTrailingText(state, node as unknown as MarkdownToken))
    return

  state.pushParsed(node)
}

function recoverMarkdownImageFromLoadingImageTailLinkOpen(state: InlineParseState, token: MarkdownToken): boolean {
  if (token.markup !== 'linkify')
    return false

  const { node, nextIndex } = parseLinkToken(state.tokens, state.index, state.parseInlineTokens, state.options)
  if (!recoverMarkdownImageFromLoadingImageTailLink(state, node, nextIndex))
    return false

  state.index = nextIndex
  return true
}

function recoverMarkdownLinkFromTrailingText(state: InlineParseState, token: MarkdownToken): boolean {
  if (token.type !== 'link')
    return false

  const previous = state.result[state.result.length - 1] as TextNode | undefined
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
    state.result.pop()
  }

  state.pushParsed({
    ...(token as ParsedNode),
    text: label,
    children: [{ type: 'text', content: label, raw: label }],
    raw: String(`[${label}](${href}${linkToken.title ? ` "${linkToken.title}"` : ''})`),
    markup: resolveLinkMarkup(token),
  } as ParsedNode)
  return true
}

function recoverMarkdownImageFromLoadingImageTail(state: InlineParseState, token: MarkdownToken): boolean {
  if (token.type !== 'link')
    return false

  const linkToken = token as MarkdownToken & { href?: string, loading?: boolean, title?: string | null }
  const href = String(linkToken.href ?? '')
  if (!href)
    return false

  return recoverMarkdownImageFromLoadingImageTailLink(state, {
    href,
    title: linkToken.title == null || linkToken.title === '' ? null : String(linkToken.title),
    loading: Boolean(linkToken.loading),
  }, state.index + 1)
}

function recoverMarkdownImageFromLoadingImageTailLink(state: InlineParseState, link: { href: string, loading?: boolean, title: string | null }, nextIndex: number): boolean {
  const previous = state.result[state.result.length - 1] as ParsedNode & {
    alt?: string
    loading?: boolean
    raw?: string
    src?: string
  } | undefined
  if (previous?.type !== 'image' || previous.src || !previous.loading || !String(previous.raw ?? '').endsWith(']('))
    return false

  const nextToken = state.tokens[nextIndex]
  const nextContent = String(nextToken?.content ?? '')
  if (nextToken?.type !== 'text' || !nextContent.startsWith(')'))
    return false

  state.result.pop()
  state.currentTextNode = null

  const alt = String(previous.alt ?? '')
  state.pushParsed({
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
  state.ensureWorkingTokens()[nextIndex] = adjustedNext
  return true
}

function recoverMarkdownImageFromTrailingBang(state: InlineParseState, token: MarkdownToken, previousTokenIndex = state.index - 1): boolean {
  if (token.type !== 'link')
    return false

  const previous = state.result[state.result.length - 1] as TextNode | undefined
  const previousToken = state.tokens[previousTokenIndex]
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
    state.currentTextNode = previous
  }
  else {
    state.result.pop()
    state.currentTextNode = null
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

  state.pushParsed({
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
    markup: '',
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

export function recoverOuterImageLinkFromRawText(state: InlineParseState, content: string): boolean {
  const outerStart = content.indexOf('[![')
  if (outerStart === -1)
    return false
  if (typeof state.raw === 'string' && state.tokens.length === 1 && isEscapedVisibleChar(state.raw, outerStart, '['))
    return false

  const before = content.slice(0, outerStart)
  if (before)
    state.pushText(before, before)

  const imageNode = buildLoadingImageNodeFromRaw(content.slice(outerStart + 1))
  state.pushParsed(buildLoadingOuterImageLinkNode(imageNode))
  state.index++
  return true
}

function recoverOuterImageLinkStartFromImageToken(state: InlineParseState, token: MarkdownToken): boolean {
  if (state.options?.final)
    return false

  const previousToken = state.tokens[state.index - 1]
  if (previousToken?.type !== 'text')
    return false

  const previousTokenContent = String(previousToken.content ?? '')
  if (!previousTokenContent.endsWith('['))
    return false
  if (hasEscapedMarkup(previousToken, '\\['))
    return false

  const previous = state.result[state.result.length - 1] as TextNode | undefined
  if (previous?.type === 'text' && previous.content.endsWith('[')) {
    const before = previous.content.slice(0, -1)
    if (before) {
      previous.content = before
      previous.raw = before
      state.currentTextNode = previous
    }
    else {
      state.result.pop()
      state.currentTextNode = null
    }
  }

  const imageNode = parseImageToken(token)
  state.pushParsed(buildLoadingOuterImageLinkNode(imageNode))
  state.index++
  return true
}

function recoverOuterImageLinkFromSyntheticLinkToken(state: InlineParseState, token: MarkdownToken): boolean {
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

  state.pushParsed(buildLoadingOuterImageLinkNode(imageNode))
  return true
}

export function recoverOuterImageLinkMidStateFromText(state: InlineParseState, content: string): boolean {
  if (!content.startsWith(']('))
    return false
  const outerOpenToken = state.tokens[state.index - 2]
  if (outerOpenToken?.type === 'text' && String(outerOpenToken.content ?? '').endsWith('[') && hasEscapedMarkup(outerOpenToken, '\\['))
    return false

  const previous = state.result[state.result.length - 1] as ParsedNode | undefined
  if (previous?.type !== 'image' && previous?.type !== 'link')
    return false

  const previousWithChildren = previous as ParsedNode & { children?: ParsedNode[] }
  const previousLink = previous?.type === 'link'
    && Array.isArray(previousWithChildren.children)
    && previousWithChildren.children.length === 1
    && previousWithChildren.children[0]?.type === 'image'
    ? state.result.pop() as ParsedNode & {
      href?: string
      title?: string | null
      text?: string
      children: ParsedNode[]
      loading?: boolean
    }
    : null

  const imageNode = previousLink
    ? previousLink.children[0] as ParsedNode & { alt?: string, raw?: string }
    : state.result.pop() as ParsedNode & { alt?: string, raw?: string }

  if (!imageNode || imageNode.type !== 'image')
    return false

  const nextToken = state.tokens[state.index + 1]
  let href = String(previousLink?.href ?? '')
  let title: string | null = previousLink?.title == null ? null : String(previousLink.title)
  let loading = true

  if (nextToken?.type === 'link_open') {
    const { node, nextIndex } = parseLinkToken(state.tokens, state.index + 1, state.parseInlineTokens, state.options)
    href = node.href
    title = node.title
    loading = true
    state.index = nextIndex
  }
  else {
    href = content.slice(2)
    if (href.includes('"')) {
      const parts = href.split('"')
      href = String(parts[0] ?? '').trim()
      title = parts[1] == null ? null : String(parts[1]).trim()
    }
    state.index++
  }

  const linkNode = buildLoadingOuterImageLinkNode(imageNode as ParsedNode & { alt?: string, raw?: string }, href, title) as ParsedNode & { loading?: boolean }
  linkNode.loading = loading
  state.pushParsed(linkNode)
  return true
}

function shouldTreatLinkOpenAsTextInEscapedOuterImageTail(state: InlineParseState) {
  const outerOpenToken = state.tokens[state.index - 3]
  return (
    state.tokens[state.index - 2]?.type === 'image'
    && state.tokens[state.index - 1]?.type === 'text'
    && String(state.tokens[state.index - 1].content ?? '') === ']('
    && outerOpenToken?.type === 'text'
    && String(outerOpenToken.content ?? '').endsWith('[')
    && hasEscapedMarkup(outerOpenToken, '\\[')
  )
}

export function handleInlineLinkContent(state: InlineParseState, content: string, _token: MarkdownToken): boolean {
  const linkStart = content.indexOf('[')
  if (linkStart === -1)
    return false

  let textNodeContent = content.slice(0, linkStart)
  const linkEnd = content.indexOf('](', linkStart)
  if (linkEnd !== -1) {
    const textToken = state.tokens[state.index + 2]
    let text = content.slice(linkStart + 1, linkEnd)
    if (text.includes('[')) {
      const secondLinkStart = text.indexOf('[')
      // adjust original linkStart and text
      textNodeContent += content.slice(0, linkStart + secondLinkStart + 1)
      const newLinkStart = linkStart + secondLinkStart + 1
      text = content.slice(newLinkStart + 1, linkEnd)
    }
    const nextToken = state.tokens[state.index + 1]
    if (content.endsWith('](') && nextToken?.type === 'link_open' && textToken) {
      const last = state.tokens[state.index + 4]
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
            state.ensureWorkingTokens()[state.index + 4] = trailingToken
          }
          else {
            index++
          }
        }
        else if (lastContent === '.') {
          index++
        }
      }

      pushInlineTextContent(state, textNodeContent, _token)
      const hrefFromToken = String(textToken.content ?? '')
      if (state.options?.validateLink && !state.options.validateLink(hrefFromToken)) {
        state.pushText(text, text)
      }
      else {
        state.pushParsed({
          type: 'link',
          href: hrefFromToken,
          title: null,
          text,
          children: [{ type: 'text', content: text, raw: text }],
          loading,
          markup: '',
        } as ParsedNode)
      }
      state.index += index
      return true
    }

    const linkContentEnd = content.indexOf(')', linkEnd)
    const href = linkContentEnd !== -1 ? content.slice(linkEnd + 2, linkContentEnd) : ''
    const loading = linkContentEnd === -1
    let emphasisMatch = textNodeContent.match(/\*+$/)
    if (emphasisMatch) {
      textNodeContent = textNodeContent.replace(/\*+$/, '')
    }
    pushInlineTextContent(state, textNodeContent, _token)
    if (!emphasisMatch)
      emphasisMatch = text.match(/^\*+/)
    if (!state.requireClosingStrong && emphasisMatch) {
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
        markup: '',
      })
      if (type === 1) {
        newTokens.push({ type: 'em_close', tag: 'em', nesting: -1 })
        const { node } = parseEmphasisToken(newTokens, 0, state.parseInlineTokens, state.options)
        state.pushParsed(node)
      }
      else if (type === 2) {
        newTokens.push({ type: 'strong_close', tag: 'strong', nesting: -1 })
        const { node } = parseStrongToken(newTokens, 0, state.parseInlineTokens, undefined, state.options)
        state.pushParsed(node)
      }
      else if (type === 3) {
        newTokens.push({ type: 'em_close', tag: 'em', nesting: -1 })
        newTokens.push({ type: 'strong_close', tag: 'strong', nesting: -1 })
        const { node } = parseStrongToken(newTokens, 0, state.parseInlineTokens, undefined, state.options)
        state.pushParsed(node)
      }
      else {
        const { node } = parseEmphasisToken(newTokens, 0, state.parseInlineTokens, state.options)
        state.pushParsed(node)
      }
    }
    else {
      if (state.options?.validateLink && !state.options.validateLink(href)) {
        state.pushText(text, text)
      }
      else {
        state.pushParsed({
          type: 'link',
          href,
          title: null,
          text,
          children: [{ type: 'text', content: text, raw: text }],
          loading,
          markup: '',
        } as ParsedNode)
      }
    }

    const afterText = linkContentEnd !== -1 ? content.slice(linkContentEnd + 1) : ''
    if (afterText) {
      state.dispatchToken({ type: 'text', content: afterText, raw: afterText } as unknown as MarkdownToken)
      state.index--
    }
    state.index++
    return true
  }

  return false
}

export function handleInlineImageContent(state: InlineParseState, content: string): boolean {
  const imageStart = content.indexOf('![')
  if (imageStart === -1)
    return false

  const textNodeContent = content.slice(0, imageStart)
  if (textNodeContent && !state.currentTextNode) {
    state.currentTextNode = {
      type: 'text',
      content: textNodeContent,
      raw: textNodeContent,
    }
  }
  else if (textNodeContent && state.currentTextNode) {
    state.currentTextNode.content += textNodeContent
  }
  if (state.currentTextNode) {
    state.result.push(state.currentTextNode)
    state.currentTextNode = null
  }
  state.pushParsed(buildLoadingImageNodeFromRaw(content.slice(imageStart)))
  state.index++
  return true
}

export function handleImageToken(state: InlineParseState, token: MarkdownToken) {
  if (!recoverOuterImageLinkStartFromImageToken(state, token)) {
    state.resetCurrentTextNode()
    state.pushParsed(parseImageToken(token))
    state.index++
  }
}

export function handleFallbackToken(state: InlineParseState, token: MarkdownToken) {
  const syntheticLink = token as MarkdownToken & { href?: unknown, text?: unknown }
  if (token.type === 'link' && syntheticLink.href != null && state.options.validateLink && !state.options.validateLink(String(syntheticLink.href))) {
    state.resetCurrentTextNode()
    const displayText = String(syntheticLink.text ?? '')
    state.pushText(displayText, displayText)
    state.index++
  }
  else if (recoverOuterImageLinkFromSyntheticLinkToken(state, token)) {
    state.index++
  }
  else if (recoverMarkdownImageFromLoadingImageTail(state, token)) {
    state.index++
  }
  else if (recoverMarkdownImageFromTrailingBang(state, token)) {
    state.index++
  }
  else if (recoverMarkdownLinkFromTrailingText(state, token)) {
    state.index++
  }
  else {
    state.pushToken(token)
    state.index++
  }
}
