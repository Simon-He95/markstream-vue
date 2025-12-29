import type { HtmlBlockNode, MarkdownToken } from '../../types'

// Common void tags that don't require a closing tag
const VOID_TAGS = new Set([
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
])

// Cache for dynamic closing-tag regexes per tag name
const CLOSE_TAG_RE_CACHE = new Map<string, RegExp>()

export function parseHtmlBlock(token: MarkdownToken): HtmlBlockNode {
  const raw = String(token.content ?? '')

  // Non-element html blocks (comments, doctypes, processing instructions) are non-closable
  if (/^\s*<!--/.test(raw) || /^\s*<!/.test(raw) || /^\s*<\?/.test(raw)) {
    return {
      type: 'html_block',
      content: raw,
      raw,
      tag: '',
      loading: false,
    }
  }

  // Extract first tag name (lowercased) like div, p, section, etc.
  const tagMatch = raw.match(/^\s*<([A-Z][\w:-]*)/i)
  const tag = (tagMatch?.[1] || '').toLowerCase()

  // Handle unknown or malformed tag gracefully
  if (!tag) {
    return {
      type: 'html_block',
      content: raw,
      raw,
      tag: '',
      loading: false,
    }
  }

  // Self-closing first tag like <img ... />
  const selfClosing = /^\s*<[^>]*\/\s*>/.test(raw)
  const isVoid = VOID_TAGS.has(tag)

  // Already closed somewhere in the block (case-insensitive)
  let closeRe = CLOSE_TAG_RE_CACHE.get(tag)
  if (!closeRe) {
    // Require a complete closing tag. In streaming mode, a partial prefix like
    // `</tag` should NOT finalize the block.
    closeRe = new RegExp(`<\\s*\\/\\s*${tag}\\s*>`, 'i')
    CLOSE_TAG_RE_CACHE.set(tag, closeRe)
  }
  const hasClosing = closeRe.test(raw)

  const loading = !(isVoid || selfClosing || hasClosing)

  const content = loading
    ? `${raw.replace(/<[^>]*$/, '')}\n</${tag}>`
    : raw

  return {
    type: 'html_block',
    content,
    raw,
    tag,
    loading,
  }
}
