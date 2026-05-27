import { isUnsafeHtmlUrl } from './htmlTags'

const DISALLOWED_STYLE_PATTERNS = [/javascript:/i, /vbscript:/i, /data:text\/html/i, /expression\s*\(/i, /@import/i]
const SVG_NS = 'http://www.w3.org/2000/svg'
const FOREIGN_OBJECT_IGNORED_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta'])
const ALLOWED_SVG_TAGS = new Set([
  'svg',
  'style',
  'g',
  'a',
  'defs',
  'marker',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'title',
  'desc',
  'use',
  'image',
  'lineargradient',
  'radialgradient',
  'stop',
  'clippath',
  'mask',
  'pattern',
])
const URL_LIKE_SVG_ATTRS = new Set([
  'href',
  'xlink:href',
  'src',
  'srcdoc',
  'action',
  'data',
  'formaction',
  'poster',
])
const URL_REFERENCE_SVG_ATTRS = new Set([
  'clip-path',
  'fill',
  'filter',
  'marker-end',
  'marker-mid',
  'marker-start',
  'mask',
  'stroke',
])
const RENDERABLE_SVG_TAGS = new Set([
  'circle',
  'ellipse',
  'image',
  'line',
  'path',
  'polygon',
  'polyline',
  'rect',
  'text',
  'tspan',
  'use',
])

function hasSafeSvgHref(node: Element) {
  const href = node.getAttribute('href') || node.getAttribute('xlink:href')
  return href?.startsWith('#') === true
}

function hasImageSource(node: Element) {
  return Boolean(node.getAttribute('href') || node.getAttribute('xlink:href') || node.getAttribute('src'))
}

function isRenderableSvgNode(node: Element) {
  const tag = node.nodeName.toLowerCase()

  if (tag === 'use')
    return hasSafeSvgHref(node)

  if (tag === 'image')
    return hasImageSource(node)

  if (tag === 'text' || tag === 'tspan')
    return Boolean(node.textContent?.trim())

  return RENDERABLE_SVG_TAGS.has(tag)
}

function neutralizeScriptProtocols(raw: string) {
  return raw
    .replace(/(["'])\s*javascript:/gi, '$1#')
    .replace(/\bjavascript:/gi, '#')
    .replace(/(["'])\s*vbscript:/gi, '$1#')
    .replace(/\bvbscript:/gi, '#')
    .replace(/\bdata:text\/html/gi, '#')
}

function sanitizeSvgUrl(tagName: string, attrName: string, value: string | null | undefined) {
  const tag = tagName.toLowerCase()
  const attr = attrName.toLowerCase()
  const url = String(value ?? '').trim()
  if (!url)
    return ''

  if ((tag === 'use' || tag === 'marker' || tag === 'clippath' || tag === 'mask') && (attr === 'href' || attr === 'xlink:href'))
    return url.startsWith('#') ? url : ''

  if (tag === 'a' && (attr === 'href' || attr === 'xlink:href'))
    return isUnsafeHtmlUrl(url, { tagName: 'a', attrName: 'href' }) ? '' : url

  if (tag === 'image' && (attr === 'href' || attr === 'xlink:href' || attr === 'src'))
    return isUnsafeHtmlUrl(url, { tagName: 'img', attrName: 'src' }) ? '' : url

  if (attr === 'href' || attr === 'xlink:href')
    return url.startsWith('#') ? url : ''

  return isUnsafeHtmlUrl(url, { tagName: tag, attrName: attr }) ? '' : url
}

function readCssUrl(value: string, start: number) {
  let pos = start + 4
  while (pos < value.length && /\s/.test(value[pos] ?? ''))
    pos++

  const quote = value[pos]
  if (quote === '"' || quote === '\'') {
    const urlStart = pos + 1
    const urlEnd = value.indexOf(quote, urlStart)
    if (urlEnd === -1)
      return { next: value.length, url: '' }
    pos = urlEnd + 1
    while (pos < value.length && /\s/.test(value[pos] ?? ''))
      pos++
    return {
      next: pos < value.length && value[pos] === ')' ? pos + 1 : pos,
      url: value.slice(urlStart, urlEnd),
    }
  }

  const urlStart = pos
  while (pos < value.length && value[pos] !== ')')
    pos++
  return {
    next: pos < value.length ? pos + 1 : pos,
    url: value.slice(urlStart, pos),
  }
}

function decodeCssEscapes(input: string) {
  return input.replace(/\\([0-9a-f]{1,6}\s?|.)/gi, (_match, body: string) => {
    const hex = body.trim()
    if (/^[0-9a-f]+$/i.test(hex)) {
      const code = Number.parseInt(hex, 16)
      try {
        return Number.isFinite(code) ? String.fromCodePoint(code) : ''
      }
      catch {
        return ''
      }
    }
    return String(body).trim()
  })
}

function hasUnsafeCssUrl(value: string) {
  const decoded = decodeCssEscapes(value)
  const lower = decoded.toLowerCase()
  let pos = 0
  while (pos < lower.length) {
    const start = lower.indexOf('url(', pos)
    if (start === -1)
      return false
    const cssUrl = readCssUrl(decoded, start)
    pos = Math.max(cssUrl.next, start + 4)
    const rawUrl = cssUrl.url.trim()
    if (!rawUrl.startsWith('#'))
      return true
  }
  return false
}

function hasUnsafeStyle(value: string) {
  const decoded = decodeCssEscapes(value)
  return DISALLOWED_STYLE_PATTERNS.some(re => re.test(decoded)) || hasUnsafeCssUrl(decoded)
}

function hardenSvgAnchorAttrs(node: Element) {
  if (node.tagName.toLowerCase() !== 'a')
    return

  const target = node.getAttribute('target')?.trim().toLowerCase()
  if (target !== '_blank')
    return

  const relTokens = new Set(
    String(node.getAttribute('rel') ?? '')
      .split(/\s+/)
      .map(token => token.trim())
      .filter(Boolean)
      .filter(token => token.toLowerCase() !== 'opener'),
  )
  relTokens.add('noopener')
  relTokens.add('noreferrer')
  node.setAttribute('rel', Array.from(relTokens).join(' '))
}

function parseSvgNumber(value: string | null | undefined) {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function collectForeignObjectText(node: Node, parts: string[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    if (text)
      parts.push(text)
    return
  }

  if (node.nodeType !== Node.ELEMENT_NODE)
    return

  const element = node as Element
  const tag = element.tagName.toLowerCase()
  if (FOREIGN_OBJECT_IGNORED_TAGS.has(tag))
    return

  if (tag === 'br') {
    parts.push('\n')
    return
  }

  for (const child of Array.from(element.childNodes))
    collectForeignObjectText(child, parts)
}

function replaceForeignObjectLabels(svgEl: SVGElement) {
  for (const node of Array.from(svgEl.querySelectorAll<Element>('foreignObject'))) {
    const parts: string[] = []
    collectForeignObjectText(node, parts)
    const lines = parts
      .join('')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
    if (!lines.length) {
      node.remove()
      continue
    }

    const width = parseSvgNumber(node.getAttribute('width'))
    const height = parseSvgNumber(node.getAttribute('height'))
    const x = parseSvgNumber(node.getAttribute('x'))
    const y = parseSvgNumber(node.getAttribute('y'))
    const text = svgEl.ownerDocument.createElementNS(SVG_NS, 'text')
    text.setAttribute('x', String(x + width / 2))
    text.setAttribute('y', String(y + height / 2))
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('dominant-baseline', 'central')

    const label = node.querySelector('.nodeLabel')
    if (label?.getAttribute('class'))
      text.setAttribute('class', label.getAttribute('class')!)

    if (lines.length === 1) {
      text.textContent = lines[0]!
    }
    else {
      const firstDy = -0.6 * (lines.length - 1)
      for (const [index, line] of lines.entries()) {
        const tspan = svgEl.ownerDocument.createElementNS(SVG_NS, 'tspan')
        tspan.setAttribute('x', String(x + width / 2))
        tspan.setAttribute('dy', index === 0 ? `${firstDy}em` : '1.2em')
        tspan.textContent = line
        text.appendChild(tspan)
      }
    }

    node.parentNode?.replaceChild(text, node)
  }
}

function scrubSvgElement(svgEl: SVGElement) {
  replaceForeignObjectLabels(svgEl)

  const nodes = [svgEl, ...Array.from(svgEl.querySelectorAll<Element>('*'))]
  for (const node of nodes) {
    const tag = node.tagName.toLowerCase()
    if (!ALLOWED_SVG_TAGS.has(tag)) {
      node.remove()
      continue
    }

    if (tag === 'style') {
      if (hasUnsafeStyle(node.textContent ?? '')) {
        node.remove()
        continue
      }
    }

    const attrs = Array.from(node.attributes)
    for (const attr of attrs) {
      const name = attr.name.toLowerCase()
      if (/^on/i.test(name)) {
        node.removeAttribute(attr.name)
        continue
      }

      if (name === 'style' && attr.value) {
        if (hasUnsafeStyle(attr.value)) {
          node.removeAttribute(attr.name)
          continue
        }
      }

      if (name === 'srcdoc') {
        node.removeAttribute(attr.name)
        continue
      }

      if (URL_LIKE_SVG_ATTRS.has(name) && attr.value) {
        const safe = sanitizeSvgUrl(tag, name, attr.value)
        if (!safe) {
          node.removeAttribute(attr.name)
          continue
        }
        if (safe !== attr.value)
          node.setAttribute(attr.name, safe)
        continue
      }

      if (URL_REFERENCE_SVG_ATTRS.has(name) && attr.value && hasUnsafeCssUrl(attr.value)) {
        node.removeAttribute(attr.name)
        continue
      }

      if (attr.value) {
        const neutralized = neutralizeScriptProtocols(attr.value)
        if (neutralized !== attr.value)
          node.setAttribute(attr.name, neutralized)
      }
    }

    hardenSvgAnchorAttrs(node)
  }
}

/**
 * Sanitizes Mermaid SVG with DOMParser and returns a detached SVG element.
 * Returns null in non-DOM runtimes such as plain Node.js.
 */
export function toSafeSvgElement<TElement = unknown>(svg: string | null | undefined): TElement | null {
  if (typeof DOMParser === 'undefined')
    return null
  if (!svg)
    return null
  try {
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const svgEl = parsed.documentElement
    if (!svgEl || svgEl.nodeName.toLowerCase() !== 'svg')
      return null
    const svgElement = svgEl as unknown as SVGElement
    scrubSvgElement(svgElement)
    if (isBrokenMermaidSvgElement(svgElement))
      return null
    return svgElement as unknown as TElement
  }
  catch {
    return null
  }
}

/**
 * Sanitizes Mermaid SVG with DOMParser.
 * Returns null in non-DOM runtimes such as plain Node.js.
 */
export function sanitizeMermaidSvg(svg: string | null | undefined): string | null {
  return toSafeSvgElement<SVGElement>(svg)?.outerHTML ?? null
}

/**
 * Sanitizes Mermaid SVG with DOMParser.
 * Returns an empty string in non-DOM runtimes such as plain Node.js.
 */
export function toSafeMermaidSvgMarkup(svg: string | null | undefined) {
  return sanitizeMermaidSvg(svg) ?? ''
}

export function isBrokenMermaidSvg(svg: string | null | undefined) {
  if (!svg)
    return true
  if (typeof DOMParser === 'undefined')
    return true

  try {
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const svgEl = parsed.documentElement
    if (!svgEl || svgEl.nodeName.toLowerCase() !== 'svg')
      return true

    return isBrokenMermaidSvgElement(svgEl)
  }
  catch {
    return true
  }
}

function isBrokenMermaidSvgElement(svgEl: Element) {
  const viewBox = svgEl.getAttribute('viewBox')
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/)
    if (parts.length === 4) {
      const width = Number.parseFloat(parts[2] || '')
      const height = Number.parseFloat(parts[3] || '')
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
        return true
    }
  }

  const nodes = [svgEl, ...Array.from(svgEl.querySelectorAll('*'))]
  let hasRenderableNode = false
  for (const node of nodes) {
    if (isRenderableSvgNode(node))
      hasRenderableNode = true
    for (const attr of Array.from(node.attributes)) {
      if (/\bNaN\b/i.test(attr.value))
        return true
      if (attr.name === 'style' && /max-width:\s*0(?:px)?/i.test(attr.value))
        return true
    }
  }

  return !hasRenderableNode
}
