import {
  BLOCKED_HTML_TAGS,
  DANGEROUS_HTML_ATTRS,
  EXTENDED_STANDARD_HTML_TAGS,
  isUnsafeHtmlUrl,
  URL_HTML_ATTRS,
  VOID_HTML_TAGS,
} from './htmlTags'

export type HtmlPolicy = 'escape' | 'safe' | 'trusted'
export type HtmlPropValue = string | number | boolean

export interface HtmlToken {
  type: 'text' | 'tag_open' | 'tag_close' | 'self_closing'
  tagName?: string
  attrs?: Record<string, string>
  content?: string
}

const SAFE_BLOCKED_HTML_TAGS = new Set<string>([
  ...BLOCKED_HTML_TAGS,
  'base',
  'button',
  'datalist',
  'dialog',
  'embed',
  'fieldset',
  'form',
  'iframe',
  'input',
  'legend',
  'link',
  'meta',
  'object',
  'optgroup',
  'option',
  'output',
  'param',
  'select',
  'style',
  'template',
  'textarea',
  'title',
])

export const SAFE_ALLOWED_HTML_TAGS = new Set<string>([
  'a',
  'abbr',
  'b',
  'blockquote',
  'br',
  'caption',
  'code',
  'col',
  'colgroup',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'ins',
  'kbd',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
])

const CUSTOM_TAG_REGEX = /<([a-z][a-z0-9-]*)\b[^>]*>/gi

function hasOwn(obj: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function getString(value: unknown): string {
  return typeof value === 'string'
    ? value
    : value == null
      ? ''
      : String(value)
}

function isSafeAttrName(value: string): boolean {
  return /^[^\s"'<>`=]+$/.test(value) && !/^on/i.test(value)
}

function escapeHtml(value: unknown): string {
  return getString(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value).replace(/`/g, '&#96;')
}

function normalizeTagName(tagName: string | undefined): string {
  return String(tagName ?? '').trim().toLowerCase()
}

export function isHtmlTagBlocked(tagName: string | undefined, policy: HtmlPolicy = 'safe') {
  const normalized = normalizeTagName(tagName)
  if (!normalized)
    return false
  if (policy === 'escape')
    return true
  if (policy === 'trusted')
    return BLOCKED_HTML_TAGS.has(normalized)
  return !SAFE_ALLOWED_HTML_TAGS.has(normalized)
}

export function isHtmlTagHardBlocked(tagName: string | undefined, policy: HtmlPolicy = 'safe') {
  const normalized = normalizeTagName(tagName)
  if (!normalized)
    return false
  if (policy === 'escape')
    return true
  if (policy === 'trusted')
    return BLOCKED_HTML_TAGS.has(normalized)
  return SAFE_BLOCKED_HTML_TAGS.has(normalized)
}

function serializeAttrs(attrs: Record<string, string>): string {
  const pairs = Object.entries(attrs)
  if (pairs.length === 0)
    return ''

  return pairs
    .map(([name, value]) => value === '' ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`)
    .join('')
}

function isUnsafeSrcset(value: string, tagName?: string) {
  const candidates = value
    .split(',')
    .map(candidate => candidate.trim())
    .filter(Boolean)

  if (candidates.length === 0)
    return false

  return candidates.some((candidate) => {
    const url = candidate.split(/\s+/, 1)[0] ?? ''
    return !url || isUnsafeHtmlUrl(url, { tagName, attrName: 'srcset' })
  })
}

function shouldDropHtmlAttr(lowerKey: string, value: string, policy: HtmlPolicy, tagName?: string) {
  if (DANGEROUS_HTML_ATTRS.has(lowerKey))
    return true
  if (policy === 'safe' && lowerKey === 'style')
    return true
  if (lowerKey === 'srcset')
    return isUnsafeSrcset(value, tagName)
  if (URL_HTML_ATTRS.has(lowerKey) && value && isUnsafeHtmlUrl(value, { tagName, attrName: lowerKey }))
    return true
  return false
}

function findHtmlAttrName(attrs: Record<string, string>, attrName: string) {
  const normalized = attrName.toLowerCase()
  return Object.keys(attrs).find(key => key.toLowerCase() === normalized)
}

function hardenAnchorAttrs(clean: Record<string, string>, policy: HtmlPolicy, tagName?: string, hadHref = false) {
  if (policy !== 'safe' || normalizeTagName(tagName) !== 'a')
    return clean

  const hrefKey = findHtmlAttrName(clean, 'href')
  if (hadHref && (!hrefKey || !clean[hrefKey])) {
    const targetKey = findHtmlAttrName(clean, 'target')
    const relKey = findHtmlAttrName(clean, 'rel')
    if (targetKey)
      delete clean[targetKey]
    if (relKey)
      delete clean[relKey]
    return clean
  }

  const targetKey = findHtmlAttrName(clean, 'target')
  const target = targetKey ? String(clean[targetKey]).trim() : ''
  if (target.toLowerCase() !== '_blank')
    return clean

  const relKey = findHtmlAttrName(clean, 'rel')
  const relTokens = new Set(
    String(relKey ? clean[relKey] : '')
      .split(/\s+/)
      .map(token => token.trim())
      .filter(Boolean)
      .filter(token => token.toLowerCase() !== 'opener'),
  )
  relTokens.add('noopener')
  relTokens.add('noreferrer')
  if (relKey && relKey !== 'rel')
    delete clean[relKey]
  clean.rel = Array.from(relTokens).join(' ')
  return clean
}

function sanitizeHtmlContentAttrs(attrs: Record<string, string>, policy: HtmlPolicy = 'safe', tagName?: string) {
  const clean: Record<string, string> = {}

  for (const [key, value] of Object.entries(attrs)) {
    const safeName = key.trim()
    const lowerKey = safeName.toLowerCase()
    if (!safeName || !isSafeAttrName(safeName))
      continue
    if (shouldDropHtmlAttr(lowerKey, value, policy, tagName))
      continue
    clean[safeName] = value
  }

  return hardenAnchorAttrs(clean, policy, tagName, Boolean(findHtmlAttrName(attrs, 'href')))
}

export function isCustomHtmlComponentTag(
  tagName: string,
  customComponents: Record<string, unknown>,
) {
  const lowerTag = tagName.toLowerCase()
  if (EXTENDED_STANDARD_HTML_TAGS.has(lowerTag))
    return false
  return hasOwn(customComponents, lowerTag) || hasOwn(customComponents, tagName)
}

export function sanitizeHtmlAttrs(attrs: Record<string, string>, policy: HtmlPolicy = 'safe', tagName?: string) {
  const clean: Record<string, string> = {}
  for (const [key, value] of Object.entries(attrs)) {
    const safeName = key.trim()
    const lowerKey = safeName.toLowerCase()
    if (!safeName || !isSafeAttrName(safeName))
      continue
    if (shouldDropHtmlAttr(lowerKey, value, policy, tagName))
      continue
    clean[safeName] = value
  }
  return hardenAnchorAttrs(clean, policy, tagName, Boolean(findHtmlAttrName(attrs, 'href')))
}

export function tokenAttrsToRecord(attrs?: Array<[string, string | null]> | null) {
  const record: Record<string, string> = {}
  if (!Array.isArray(attrs) || attrs.length === 0)
    return record

  for (const [key, value] of attrs) {
    if (!key)
      continue
    record[String(key)] = value == null ? '' : String(value)
  }

  return record
}

export function sanitizeHtmlTokenAttrs(
  attrs?: Array<[string, string | null]> | null,
  policy: HtmlPolicy = 'safe',
  tagName?: string,
) {
  const sanitized = sanitizeHtmlAttrs(tokenAttrsToRecord(attrs), policy, tagName)
  const pairs = Object.entries(sanitized).map(([key, value]) => [key, value] as [string, string])
  return pairs.length > 0 ? pairs : undefined
}

export function convertHtmlPropValue(value: string, key: string): HtmlPropValue {
  const lowerKey = key.toLowerCase()

  if (['checked', 'disabled', 'readonly', 'required', 'autofocus', 'multiple', 'hidden'].includes(lowerKey))
    return value === 'true' || value === '' || value === key

  if (['value', 'min', 'max', 'step', 'width', 'height', 'size', 'maxlength'].includes(lowerKey)) {
    const num = Number(value)
    if (value !== '' && !Number.isNaN(num))
      return num
  }

  return value
}

export function convertHtmlAttrsToProps(attrs: Record<string, string>) {
  const result: Record<string, HtmlPropValue> = {}
  for (const [key, value] of Object.entries(attrs))
    result[key] = convertHtmlPropValue(value, key)
  return result
}

function isMeaningfulText(text: string) {
  return text.trim().length > 0
}

export function tokenizeHtml(html: string): HtmlToken[] {
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
      if (pos < html.length) {
        const remainingText = html.slice(pos)
        if (isMeaningfulText(remainingText))
          tokens.push({ type: 'text', content: remainingText })
      }
      break
    }

    if (tagStart > pos) {
      const textContent = html.slice(pos, tagStart)
      if (isMeaningfulText(textContent))
        tokens.push({ type: 'text', content: textContent })
    }

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
    const isClosingTag = tagContent.startsWith('/')
    const isSelfClosing = tagContent.endsWith('/')

    if (isClosingTag) {
      const tagName = tagContent.slice(1).trim()
      tokens.push({ type: 'tag_close', tagName })
    }
    else {
      const spaceIndex = tagContent.indexOf(' ')
      let tagName: string
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
        type: isSelfClosing || VOID_HTML_TAGS.has(tagName.toLowerCase()) ? 'self_closing' : 'tag_open',
        tagName,
        attrs,
      })
    }

    pos = tagEnd + 1
  }

  return tokens
}

function tokenizeHtmlPreservingText(html: string): HtmlToken[] {
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
      type: isSelfClosing || VOID_HTML_TAGS.has(tagName.toLowerCase()) ? 'self_closing' : 'tag_open',
      tagName,
      attrs,
    })

    pos = tagEnd + 1
  }

  return tokens
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

export function hasCustomHtmlComponents(
  content: string,
  customComponents: Record<string, unknown>,
) {
  if (!content || !content.includes('<'))
    return false
  if (!customComponents || Object.keys(customComponents).length === 0)
    return false
  CUSTOM_TAG_REGEX.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = CUSTOM_TAG_REGEX.exec(content)) !== null) {
    if (isCustomHtmlComponentTag(match[1], customComponents))
      return true
  }
  return false
}

export function sanitizeHtmlContent(content: string, policy: HtmlPolicy = 'safe'): string {
  if (!content)
    return ''

  if (policy === 'escape')
    return escapeHtml(content)

  const tokens = tokenizeHtmlPreservingText(content)
  const stack: string[] = []
  const output: string[] = []
  const blockedStack: string[] = []

  for (const token of tokens) {
    if (token.type === 'text') {
      if (blockedStack.length === 0)
        output.push(escapeHtml(token.content ?? ''))
      continue
    }

    const tagName = normalizeTagName(token.tagName)
    if (!tagName)
      continue

    if (isHtmlTagHardBlocked(tagName, policy)) {
      if (token.type === 'tag_open')
        blockedStack.push(tagName)
      else if (token.type === 'tag_close' && blockedStack[blockedStack.length - 1] === tagName)
        blockedStack.pop()
      continue
    }

    if (blockedStack.length > 0)
      continue

    if (policy === 'safe' && isHtmlTagBlocked(tagName, policy)) {
      output.push(serializeLiteralHtmlTag(token))
      continue
    }

    if (token.type === 'self_closing') {
      output.push(`<${tagName}${serializeAttrs(sanitizeHtmlContentAttrs(token.attrs ?? {}, policy, tagName))}>`)
      continue
    }

    if (token.type === 'tag_open') {
      output.push(`<${tagName}${serializeAttrs(sanitizeHtmlContentAttrs(token.attrs ?? {}, policy, tagName))}>`)
      if (!VOID_HTML_TAGS.has(tagName))
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
