export const VOID_HTML_TAG_NAMES = [
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
] as const

export const INLINE_HTML_TAG_NAMES = [
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'button',
  'cite',
  'code',
  'data',
  'del',
  'dfn',
  'em',
  'font',
  'i',
  'ins',
  'kbd',
  'label',
  'mark',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
] as const

export const BLOCK_HTML_TAG_NAMES = [
  'article',
  'aside',
  'blockquote',
  'details',
  'div',
  'figcaption',
  'figure',
  'footer',
  'header',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
] as const

export const SVG_HTML_TAG_NAMES = [
  'svg',
  'g',
  'path',
] as const

export const EXTENDED_STANDARD_HTML_TAG_NAMES = [
  'address',
  'audio',
  'body',
  'canvas',
  'caption',
  'colgroup',
  'datalist',
  'dd',
  'dialog',
  'dl',
  'dt',
  'fieldset',
  'form',
  'head',
  'hgroup',
  'html',
  'iframe',
  'legend',
  'map',
  'menu',
  'meter',
  'noscript',
  'object',
  'optgroup',
  'option',
  'output',
  'picture',
  'progress',
  'rp',
  'rt',
  'ruby',
  'script',
  'select',
  'style',
  'template',
  'textarea',
  'tfoot',
  'title',
  'video',
] as const

export const DANGEROUS_HTML_ATTR_NAMES = [
  'onclick',
  'onerror',
  'onload',
  'onmouseover',
  'onmouseout',
  'onmousedown',
  'onmouseup',
  'onkeydown',
  'onkeyup',
  'onfocus',
  'onblur',
  'onsubmit',
  'onreset',
  'onchange',
  'onselect',
  'ondblclick',
  'ontouchstart',
  'ontouchend',
  'ontouchmove',
  'ontouchcancel',
  'onwheel',
  'onscroll',
  'oncopy',
  'oncut',
  'onpaste',
  'oninput',
  'oninvalid',
  'onsearch',
  'srcdoc',
  'ping',
] as const

export const URL_HTML_ATTR_NAMES = [
  'action',
  'data',
  'href',
  'src',
  'srcset',
  'poster',
  'xlink:href',
  'formaction',
] as const

export const BLOCKED_HTML_TAG_NAMES = [
  'script',
] as const

export const NON_STRUCTURING_HTML_TAG_NAMES = [
  'pre',
  'script',
  'style',
  'textarea',
  'title',
] as const

export const VOID_HTML_TAGS = new Set<string>(VOID_HTML_TAG_NAMES)
export const STANDARD_BLOCK_HTML_TAGS = new Set<string>(BLOCK_HTML_TAG_NAMES)
export const STANDARD_HTML_TAGS = new Set<string>([
  ...VOID_HTML_TAG_NAMES,
  ...INLINE_HTML_TAG_NAMES,
  ...BLOCK_HTML_TAG_NAMES,
  ...SVG_HTML_TAG_NAMES,
])
export const EXTENDED_STANDARD_HTML_TAGS = new Set<string>([
  ...STANDARD_HTML_TAGS,
  ...EXTENDED_STANDARD_HTML_TAG_NAMES,
])
export const DANGEROUS_HTML_ATTRS = new Set<string>(DANGEROUS_HTML_ATTR_NAMES)
export const URL_HTML_ATTRS = new Set<string>(URL_HTML_ATTR_NAMES)
export const BLOCKED_HTML_TAGS = new Set<string>(BLOCKED_HTML_TAG_NAMES)
export const NON_STRUCTURING_HTML_TAGS = new Set<string>(NON_STRUCTURING_HTML_TAG_NAMES)

export function stripHtmlControlAndWhitespace(value: string) {
  let out = ''
  for (const ch of value) {
    const code = ch.charCodeAt(0)
    if (code <= 0x1F || (code >= 0x7F && code <= 0x9F))
      continue
    if (/\s/u.test(ch))
      continue
    out += ch
  }
  return out
}

const HTML_URL_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  bsol: '\\',
  colon: ':',
  newline: '\n',
  sol: '/',
  tab: '\t',
}

function decodeHtmlUrlEntities(value: string) {
  return value.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]+));?/gi, (match, decimal: string | undefined, hex: string | undefined, named: string | undefined) => {
    const rawCode = decimal ?? hex
    if (rawCode) {
      const code = Number.parseInt(rawCode, decimal ? 10 : 16)
      try {
        return Number.isFinite(code) ? String.fromCodePoint(code) : ''
      }
      catch {
        return ''
      }
    }

    const decoded = HTML_URL_ENTITY_MAP[String(named ?? '').toLowerCase()]
    return decoded ?? match
  })
}

const HREF_URL_PROTOCOLS = new Set([
  'http',
  'https',
  'mailto',
  'tel',
])
const RESOURCE_URL_PROTOCOLS = new Set([
  'http',
  'https',
])

interface HtmlUrlContext {
  tagName?: string
  attrName?: string
}

function getUrlScheme(normalized: string) {
  const match = normalized.match(/^([a-z][a-z0-9+.-]*):/i)
  return match?.[1]?.toLowerCase() ?? ''
}

function getAllowedUrlProtocols(tagName: string, attrName: string) {
  if (attrName === 'href')
    return HREF_URL_PROTOCOLS

  if (attrName === 'xlink:href')
    return HREF_URL_PROTOCOLS

  if (attrName === 'src')
    return RESOURCE_URL_PROTOCOLS

  if (attrName === 'srcset')
    return RESOURCE_URL_PROTOCOLS

  if (attrName === 'poster')
    return RESOURCE_URL_PROTOCOLS

  if (attrName === 'action' || attrName === 'formaction')
    return RESOURCE_URL_PROTOCOLS

  if (attrName === 'data')
    return RESOURCE_URL_PROTOCOLS

  if (tagName === 'a' || tagName === 'area')
    return HREF_URL_PROTOCOLS

  return HREF_URL_PROTOCOLS
}

export function isUnsafeHtmlUrl(value: string, context: HtmlUrlContext = {}) {
  const normalized = stripHtmlControlAndWhitespace(decodeHtmlUrlEntities(value)).toLowerCase()
  const tagName = String(context.tagName ?? '').toLowerCase()
  const attrName = String(context.attrName ?? '').toLowerCase()

  if (!normalized)
    return false

  if (normalized.startsWith('data:')) {
    const isBitmapImageData = /^data:image\/(?:png|gif|jpe?g|webp|avif|bmp);/i.test(normalized)
    if (tagName === 'img' && attrName === 'src')
      return !isBitmapImageData
    return true
  }

  if (/^[\\/]{2}/.test(normalized))
    return true

  if (
    normalized.startsWith('/')
    || normalized.startsWith('./')
    || normalized.startsWith('../')
    || normalized.startsWith('#')
    || normalized.startsWith('?')
  ) {
    return false
  }

  const scheme = getUrlScheme(normalized)
  if (!scheme)
    return false

  return !getAllowedUrlProtocols(tagName, attrName).has(scheme)
}

export function shouldOpenLinkInNewTab(href: string | null | undefined) {
  const value = decodeHtmlUrlEntities(String(href ?? '')).trim()
  if (!value)
    return false

  if (
    value.startsWith('#')
    || value.startsWith('/')
    || value.startsWith('./')
    || value.startsWith('../')
    || value.startsWith('?')
  ) {
    return false
  }

  const scheme = getUrlScheme(stripHtmlControlAndWhitespace(value).toLowerCase())
  return scheme === 'http' || scheme === 'https'
}

function sanitizeUrlAttr(value: unknown, context: HtmlUrlContext = {}) {
  const url = String(value ?? '').trim()
  if (!url)
    return ''
  return isUnsafeHtmlUrl(url, context) ? '' : url
}

export function sanitizeImageSrc(value: unknown) {
  return sanitizeUrlAttr(value, { tagName: 'img', attrName: 'src' })
}
