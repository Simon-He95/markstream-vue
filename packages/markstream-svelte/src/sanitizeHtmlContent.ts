import type { HtmlPolicy } from 'stream-markdown-parser'
import {
  BLOCKED_HTML_TAGS as BLOCKED_TAGS,
  isHtmlTagBlocked,
  isHtmlTagHardBlocked,
  sanitizeHtmlAttrs,
  VOID_HTML_TAGS as VOID_ELEMENTS,
} from 'stream-markdown-parser'
import { escapeAttr, escapeHtml } from './components/shared/node-helpers'

interface HtmlToken {
  type: 'text' | 'tag_open' | 'tag_close' | 'self_closing'
  tagName?: string
  attrs?: Record<string, string>
  content?: string
}

function sanitizeAttrs(attrs: Record<string, string>, policy: HtmlPolicy, tagName?: string): Record<string, string> {
  return sanitizeHtmlAttrs(attrs, policy, tagName)
}

function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = []
  let pos = 0

  while (pos < html.length) {
    if (html.startsWith('<!--', pos)) {
      const commentEnd = html.indexOf('-->', pos)
      if (commentEnd !== -1) {
        pos = commentEnd + 3
        continue
      }
      break
    }

    const tagStart = html.indexOf('<', pos)
    if (tagStart === -1) {
      if (pos < html.length)
        tokens.push({ type: 'text', content: html.slice(pos) })
      break
    }

    if (tagStart > pos)
      tokens.push({ type: 'text', content: html.slice(pos, tagStart) })

    if (html.startsWith('![CDATA[', tagStart + 1)) {
      const cdataEnd = html.indexOf(']]>', tagStart)
      if (cdataEnd !== -1) {
        tokens.push({ type: 'text', content: html.slice(tagStart, cdataEnd + 3) })
        pos = cdataEnd + 3
        continue
      }
      break
    }

    if (html.startsWith('!', tagStart + 1)) {
      const specialEnd = html.indexOf('>', tagStart)
      if (specialEnd !== -1) {
        pos = specialEnd + 1
        continue
      }
      break
    }

    const tagEnd = html.indexOf('>', tagStart)
    if (tagEnd === -1)
      break

    const tagContent = html.slice(tagStart + 1, tagEnd).trim()
    if (!tagContent) {
      pos = tagEnd + 1
      continue
    }

    const isClosingTag = tagContent.startsWith('/')
    const isSelfClosing = tagContent.endsWith('/')

    if (isClosingTag) {
      const tagName = tagContent.slice(1).trim()
      tokens.push({ type: 'tag_close', tagName })
      pos = tagEnd + 1
      continue
    }

    const spaceIndex = tagContent.indexOf(' ')
    let tagName = ''
    let attrsStr = ''
    if (spaceIndex === -1) {
      tagName = isSelfClosing ? tagContent.slice(0, -1).trim() : tagContent.trim()
    }
    else {
      tagName = tagContent.slice(0, spaceIndex).trim()
      attrsStr = tagContent.slice(spaceIndex + 1)
    }

    const attrs: Record<string, string> = {}
    if (attrsStr) {
      const attrRegex = /([^\s=]+)(?:=(?:"([^"]*)"|'([^']*)'|(\S*)))?/g
      let attrMatch: RegExpExecArray | null
      while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
        const name = attrMatch[1]
        const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? ''
        if (name && !name.endsWith('/'))
          attrs[name] = value
      }
    }

    tokens.push({
      type: isSelfClosing || VOID_ELEMENTS.has(tagName.toLowerCase()) ? 'self_closing' : 'tag_open',
      tagName,
      attrs,
    })

    pos = tagEnd + 1
  }

  return tokens
}

function normalizeTagName(tagName: string | undefined): string {
  return String(tagName ?? '').trim().toLowerCase()
}

function serializeAttrs(attrs: Record<string, string>): string {
  const pairs = Object.entries(attrs)
  if (pairs.length === 0)
    return ''

  return pairs
    .map(([name, value]) => value === '' ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`)
    .join('')
}

function serializeLiteralHtmlTag(token: HtmlToken) {
  const tagName = String(token.tagName ?? '').trim()
  if (!tagName)
    return ''

  if (token.type === 'tag_close')
    return `&lt;/${escapeHtml(tagName)}&gt;`

  const attrs = Object.entries(token.attrs ?? {})
    .map(([name, value]) => value === '' ? ` ${escapeHtml(name)}` : ` ${escapeHtml(name)}="${escapeAttr(value)}"`)
    .join('')

  return token.type === 'self_closing'
    ? `&lt;${escapeHtml(tagName)}${attrs} /&gt;`
    : `&lt;${escapeHtml(tagName)}${attrs}&gt;`
}

export function sanitizeHtmlContent(content: string, policy: HtmlPolicy = 'safe'): string {
  if (!content)
    return ''

  if (policy === 'escape')
    return escapeHtml(content)

  const tokens = tokenizeHtml(content)
  const stack: string[] = []
  const output: string[] = []
  let blockedDepth = 0

  for (const token of tokens) {
    if (token.type === 'text') {
      if (blockedDepth === 0)
        output.push(escapeHtml(token.content ?? ''))
      continue
    }

    const tagName = normalizeTagName(token.tagName)
    if (!tagName)
      continue

    if (BLOCKED_TAGS.has(tagName) || isHtmlTagHardBlocked(tagName, policy)) {
      if (token.type === 'tag_open')
        blockedDepth += 1
      else if (token.type === 'tag_close' && blockedDepth > 0)
        blockedDepth -= 1
      continue
    }

    if (blockedDepth > 0)
      continue

    if (policy === 'safe' && isHtmlTagBlocked(tagName, policy)) {
      output.push(serializeLiteralHtmlTag(token))
      continue
    }

    if (token.type === 'self_closing') {
      output.push(`<${tagName}${serializeAttrs(sanitizeAttrs(token.attrs ?? {}, policy, tagName))}>`)
      continue
    }

    if (token.type === 'tag_open') {
      output.push(`<${tagName}${serializeAttrs(sanitizeAttrs(token.attrs ?? {}, policy, tagName))}>`)
      if (!VOID_ELEMENTS.has(tagName))
        stack.push(tagName)
      continue
    }

    const matchedIndex = stack.lastIndexOf(tagName)
    if (matchedIndex === -1)
      continue

    while (stack.length > matchedIndex + 1) {
      const danglingTag = stack.pop()
      if (danglingTag)
        output.push(`</${danglingTag}>`)
    }

    const closingTag = stack.pop()
    if (closingTag)
      output.push(`</${closingTag}>`)
  }

  while (stack.length > 0) {
    const danglingTag = stack.pop()
    if (danglingTag)
      output.push(`</${danglingTag}>`)
  }

  return output.join('')
}
