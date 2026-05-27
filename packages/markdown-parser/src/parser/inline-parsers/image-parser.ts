import type { ImageNode, MarkdownToken } from '../../types'

export function parseImageToken(token: MarkdownToken, loading = false): ImageNode {
  // Some call-sites pass an outer/inline token whose children contain the
  // actual image token (with attrs). Prefer token.attrs when present; when
  // absent, search children for the first child that carries attrs.
  let attrs = token.attrs ?? []
  // If the parent token has no attrs, prefer attrs from the inner child image
  // token. Remember which child provided attrs so we can prefer its content
  // over the parent's `token.content` (the parent may contain the raw
  // markdown string like `![alt](src "title")`).
  let childWithAttrs: MarkdownToken | null = null
  if ((!attrs || attrs.length === 0) && Array.isArray(token.children)) {
    for (const child of token.children) {
      // child.attrs may be null in markdown-it; check and use if populated
      const childAttrs = child.attrs
      if (Array.isArray(childAttrs) && childAttrs.length > 0) {
        attrs = childAttrs
        childWithAttrs = child
        break
      }
    }
  }
  const src = String(attrs.find(attr => attr[0] === 'src')?.[1] ?? '')
  const altAttr = attrs.find(attr => attr[0] === 'alt')?.[1]
  // Prefer a non-empty alt attribute. If attrs were sourced from an inner
  // child token prefer that child's `content` over the parent's `token.content`
  // because the parent may contain the raw markdown instead of the plain alt
  // text.
  let alt = ''
  if (altAttr != null && String(altAttr).length > 0) {
    alt = String(altAttr)
  }
  else if (childWithAttrs?.content != null && String(childWithAttrs.content).length > 0) {
    alt = String(childWithAttrs.content)
  }
  else if (Array.isArray(childWithAttrs?.children) && childWithAttrs.children[0]?.content) {
    // If the inner image token has children (e.g. a text token) prefer that
    // child's content when the child token's own `content` is empty.
    alt = String(childWithAttrs.children[0].content)
  }
  else if (Array.isArray(token.children) && token.children[0]?.content) {
    alt = String(token.children[0].content)
  }
  else if (token.content != null && String(token.content).length > 0) {
    alt = String(token.content)
  }

  const _title = attrs.find(attr => attr[0] === 'title')?.[1] ?? null
  const title = _title === null ? null : String(_title)
  const raw = String(token.content ?? '')

  return {
    type: 'image',
    src,
    alt,
    title,
    raw,
    loading,
  }
}
